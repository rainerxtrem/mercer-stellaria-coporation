/**
 * Compiles a `RequestSpec` into parameterised SQL.
 *
 * Every value is passed as a bind parameter; every identifier is validated
 * against a strict pattern and quoted, so a spec can never inject SQL.
 * Rows are projected through `to_jsonb()` so the JSON produced here is
 * byte-identical to what PostgREST returned before the migration (ISO-8601
 * timestamps, nested objects/arrays for embedded resources).
 */
import type {
  Condition,
  FilterOperator,
  QuerySpec,
  RequestSpec,
  RpcSpec,
} from "@/lib/pgrest/types";
import type { Catalog, ForeignKeyMeta, TableMeta } from "./introspect";
import { tableKey } from "./introspect";
import { parseSelect, type SelectNode } from "./select-parser";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const CAST_TYPE = /^[A-Za-z_][A-Za-z0-9_ ]*(\[\])?$/;

export class CompileError extends Error {
  code: string;
  constructor(message: string, code = "PGRST100") {
    super(message);
    this.code = code;
  }
}

function quoteIdent(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new CompileError(`Invalid identifier: ${value}`, "42601");
  }
  return `"${value}"`;
}

function quoteRelation(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

class ParamBag {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

export type CompiledQuery = {
  text: string;
  params: unknown[];
  countText?: string;
  countParams?: unknown[];
  /** Result rows are unwrapped from this column. */
  rowColumn: string;
  /** RPC returning a bare scalar: unwrap the single value instead of a row list. */
  scalar: boolean;
};

const ROW_COLUMN = "__pgrest_row";

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const COMPARISON_SQL: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  ilike: "ILIKE",
  cs: "@>",
  cd: "<@",
  ov: "&&",
};

type ConditionContext = {
  qualifier: string | null;
  params: ParamBag;
};

function renderColumnRef(column: string, qualifier: string | null): string {
  // Supports json/jsonb paths such as `metadata->>size` used by PostgREST.
  const arrowMatch = column.match(/^([A-Za-z_][A-Za-z0-9_$]*)((?:->>?[A-Za-z0-9_]+)*)$/);
  if (!arrowMatch) throw new CompileError(`Invalid column reference: ${column}`, "42601");
  const base = quoteIdent(arrowMatch[1]);
  const prefix = qualifier ? `${qualifier}.` : "";
  let ref = `${prefix}${base}`;
  const path = arrowMatch[2];
  if (path) {
    for (const [, operator, key] of path.matchAll(/(->>|->)([A-Za-z0-9_]+)/g)) {
      ref += `${operator}'${key.replace(/'/g, "''")}'`;
    }
  }
  return ref;
}

function renderCondition(condition: Condition, ctx: ConditionContext): string {
  if (condition.type === "or") {
    const parts = condition.conditions.map((c) => renderCondition(c, ctx));
    return `(${parts.join(" OR ")})`;
  }

  const ref = renderColumnRef(condition.column, ctx.qualifier);
  const { operator, value } = condition;
  let sql: string;

  if (operator === "is") {
    if (value === null) sql = `${ref} IS NULL`;
    else if (value === true) sql = `${ref} IS TRUE`;
    else if (value === false) sql = `${ref} IS FALSE`;
    else throw new CompileError(`Unsupported is() value: ${String(value)}`, "22023");
  } else if (operator === "in") {
    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0) {
      sql = "FALSE";
    } else {
      sql = `${ref} = ANY(${ctx.params.add(list)})`;
    }
  } else {
    const sqlOperator = COMPARISON_SQL[operator as FilterOperator];
    if (!sqlOperator) throw new CompileError(`Unsupported operator: ${operator}`, "22023");
    sql = `${ref} ${sqlOperator} ${ctx.params.add(value)}`;
  }

  return condition.negate ? `NOT (${sql})` : sql;
}

function renderWhere(conditions: Condition[], ctx: ConditionContext): string {
  const relevant = conditions.filter((c) => !isEmbeddedCondition(c));
  if (relevant.length === 0) return "";
  return ` WHERE ${relevant.map((c) => renderCondition(c, ctx)).join(" AND ")}`;
}

function isEmbeddedCondition(condition: Condition): boolean {
  if (condition.type === "or") return condition.conditions.some(isEmbeddedCondition);
  return condition.column.includes(".") && !condition.column.includes("->");
}

// ---------------------------------------------------------------------------
// Embedded resources
// ---------------------------------------------------------------------------

type Relationship = {
  target: TableMeta;
  /** Pairs of [parent column, child column]. */
  join: Array<[string, string]>;
  toMany: boolean;
};

function resolveRelationship(
  catalog: Catalog,
  parent: TableMeta,
  relation: string,
  hint: string | undefined,
): Relationship {
  const target = catalog.tables.get(tableKey(parent.schema, relation));
  if (!target) {
    throw new CompileError(`Unknown embedded relation: ${relation}`, "PGRST200");
  }

  const matchesHint = (fk: ForeignKeyMeta) =>
    !hint || fk.name === hint || fk.columns.includes(hint) || fk.refColumns.includes(hint);

  const forward = catalog.foreignKeys.filter(
    (fk) =>
      fk.schema === parent.schema &&
      fk.table === parent.name &&
      fk.refSchema === target.schema &&
      fk.refTable === target.name &&
      matchesHint(fk),
  );
  const backward = catalog.foreignKeys.filter(
    (fk) =>
      fk.schema === target.schema &&
      fk.table === target.name &&
      fk.refSchema === parent.schema &&
      fk.refTable === parent.name &&
      matchesHint(fk),
  );

  const candidates = [...forward, ...backward];
  if (candidates.length === 0) {
    throw new CompileError(
      `Could not find a relationship between '${parent.name}' and '${relation}'`,
      "PGRST200",
    );
  }
  if (candidates.length > 1) {
    throw new CompileError(
      `Ambiguous relationship between '${parent.name}' and '${relation}'; disambiguate with '${relation}!<constraint>'`,
      "PGRST201",
    );
  }

  const fk = candidates[0];
  if (forward.length === 1) {
    // parent holds the foreign key -> at most one related row
    return {
      target,
      join: fk.columns.map((col, i) => [col, fk.refColumns[i]] as [string, string]),
      toMany: false,
    };
  }

  // target holds the foreign key -> many related rows, unless the FK is unique
  const isUnique = target.uniqueSets.some(
    (set) => set.length === fk.columns.length && set.every((c) => fk.columns.includes(c)),
  );
  return {
    target,
    join: fk.columns.map((col, i) => [fk.refColumns[i], col] as [string, string]),
    toMany: !isUnique,
  };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

type ProjectionContext = {
  catalog: Catalog;
  params: ParamBag;
  conditions: Condition[];
  aliasCounter: { value: number };
};

function nextAlias(ctx: ProjectionContext): string {
  return `t${ctx.aliasCounter.value++}`;
}

function embeddedConditionsFor(conditions: Condition[], prefix: string): Condition[] {
  const out: Condition[] = [];
  for (const condition of conditions) {
    if (condition.type === "or") continue;
    if (!condition.column.startsWith(`${prefix}.`)) continue;
    out.push({ ...condition, column: condition.column.slice(prefix.length + 1) });
  }
  return out;
}

function buildProjection(
  nodes: SelectNode[],
  table: TableMeta,
  alias: string,
  ctx: ProjectionContext,
  /** Extra WHERE fragments the caller must apply (from `!inner` embeds). */
  innerJoinFilters: string[],
): string {
  const items: string[] = [];
  const quotedAlias = quoteIdent(alias);

  for (const node of nodes) {
    if (node.kind === "star") {
      items.push(`${quotedAlias}.*`);
      continue;
    }

    if (node.kind === "column") {
      let expression = renderColumnRef(node.name, quotedAlias);
      if (node.cast) {
        if (!CAST_TYPE.test(node.cast))
          throw new CompileError(`Invalid cast: ${node.cast}`, "42601");
        expression = `(${expression})::${node.cast}`;
      }
      const output = node.alias ?? node.name;
      items.push(`${expression} AS ${quoteIdent(output)}`);
      continue;
    }

    const outputName = node.alias ?? node.relation;
    const relationship = resolveRelationship(ctx.catalog, table, node.relation, node.hint);
    const childAlias = nextAlias(ctx);
    const quotedChildAlias = quoteIdent(childAlias);

    const joinClauses = relationship.join.map(
      ([parentCol, childCol]) =>
        `${quotedChildAlias}.${quoteIdent(childCol)} = ${quotedAlias}.${quoteIdent(parentCol)}`,
    );

    const childFilters = embeddedConditionsFor(ctx.conditions, outputName).concat(
      outputName === node.relation ? [] : embeddedConditionsFor(ctx.conditions, node.relation),
    );
    const childConditionSql = childFilters.map((condition) =>
      renderCondition(condition, { qualifier: quotedChildAlias, params: ctx.params }),
    );

    const childInnerFilters: string[] = [];
    const childProjection = buildProjection(
      node.children,
      relationship.target,
      childAlias,
      { ...ctx, conditions: [] },
      childInnerFilters,
    );

    const where = [...joinClauses, ...childConditionSql, ...childInnerFilters].join(" AND ");
    const childFrom = `${quoteRelation(relationship.target.schema, relationship.target.name)} AS ${quotedChildAlias}`;
    const innerQuery = `SELECT ${childProjection} FROM ${childFrom} WHERE ${where}`;

    const expression = relationship.toMany
      ? `(SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM (${innerQuery}) AS e)`
      : `(SELECT to_jsonb(e) FROM (${innerQuery} LIMIT 1) AS e)`;

    items.push(`${expression} AS ${quoteIdent(outputName)}`);

    if (node.inner) {
      innerJoinFilters.push(`EXISTS (SELECT 1 FROM ${childFrom} WHERE ${where})`);
    }
  }

  return items.length > 0 ? items.join(", ") : `${quotedAlias}.*`;
}

// ---------------------------------------------------------------------------
// ORDER BY / LIMIT
// ---------------------------------------------------------------------------

function renderOrder(spec: QuerySpec | RpcSpec, qualifier: string | null): string {
  const terms = spec.order.filter((term) => !term.referencedTable);
  if (terms.length === 0) return "";
  const rendered = terms.map((term) => {
    const ref = renderColumnRef(term.column, qualifier);
    const direction = term.ascending ? "ASC" : "DESC";
    const nulls =
      term.nullsFirst === undefined ? "" : term.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
    return `${ref} ${direction}${nulls}`;
  });
  return ` ORDER BY ${rendered.join(", ")}`;
}

function renderLimitOffset(spec: QuerySpec | RpcSpec, params: ParamBag): string {
  let sql = "";
  if (spec.range) {
    const count = spec.range.to - spec.range.from + 1;
    sql += ` LIMIT ${params.add(Math.max(count, 0))} OFFSET ${params.add(spec.range.from)}`;
  } else if (spec.limit !== undefined) {
    sql += ` LIMIT ${params.add(spec.limit)}`;
  }
  return sql;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function normaliseRows(values: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(values) ? values : [values];
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new CompileError(
        "Insert/update payload must be an object or an array of objects",
        "22023",
      );
    }
  }
  return rows as Record<string, unknown>[];
}

function isJsonColumn(udtName?: string): boolean {
  return udtName === "json" || udtName === "jsonb";
}

function encodeJsonValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return JSON.stringify("");
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify(value);
    }
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return JSON.stringify(value);
}

function encodeValue(value: unknown, udtName?: string): unknown {
  if (value === undefined) return null;
  if (isJsonColumn(udtName)) return encodeJsonValue(value);
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Compilation entry points
// ---------------------------------------------------------------------------

export function compile(spec: RequestSpec, catalog: Catalog): CompiledQuery {
  return spec.kind === "rpc" ? compileRpc(spec, catalog) : compileQuery(spec, catalog);
}

function requireTable(catalog: Catalog, schema: string, table: string): TableMeta {
  const meta = catalog.tables.get(tableKey(schema, table));
  if (!meta) throw new CompileError(`Unknown relation: ${schema}.${table}`, "42P01");
  return meta;
}

function compileQuery(spec: QuerySpec, catalog: Catalog): CompiledQuery {
  const table = requireTable(catalog, spec.schema, spec.table);
  const params = new ParamBag();

  if (spec.method === "select") {
    return compileSelect(spec, table, catalog, params);
  }
  return compileMutation(spec, table, catalog, params);
}

function buildSelectBody(
  spec: QuerySpec,
  table: TableMeta,
  catalog: Catalog,
  params: ParamBag,
  source: string,
  alias: string,
): { body: string; countBody: string } {
  const nodes = parseSelect(spec.select ?? "*");
  const projectionCtx: ProjectionContext = {
    catalog,
    params,
    conditions: spec.conditions,
    aliasCounter: { value: 1 },
  };
  const innerFilters: string[] = [];
  const projection = buildProjection(nodes, table, alias, projectionCtx, innerFilters);

  const quotedAlias = quoteIdent(alias);
  let where = renderWhere(spec.conditions, { qualifier: quotedAlias, params });
  if (innerFilters.length > 0) {
    where = where
      ? `${where} AND ${innerFilters.join(" AND ")}`
      : ` WHERE ${innerFilters.join(" AND ")}`;
  }

  const from = ` FROM ${source} AS ${quotedAlias}`;
  const countBody = `SELECT 1${from}${where}`;
  const body = `SELECT ${projection}${from}${where}${renderOrder(spec, quotedAlias)}${renderLimitOffset(spec, params)}`;
  return { body, countBody };
}

function compileSelect(
  spec: QuerySpec,
  table: TableMeta,
  catalog: Catalog,
  params: ParamBag,
): CompiledQuery {
  const source = quoteRelation(spec.schema, spec.table);
  const { body } = buildSelectBody(spec, table, catalog, params, source, "t0");

  const compiled: CompiledQuery = spec.head
    ? { text: "SELECT 1 WHERE FALSE", params: [], rowColumn: ROW_COLUMN, scalar: false }
    : {
        text: `SELECT to_jsonb(sub) AS ${quoteIdent(ROW_COLUMN)} FROM (${body}) AS sub`,
        params: params.values,
        rowColumn: ROW_COLUMN,
        scalar: false,
      };

  if (spec.count === "exact") {
    // The count query gets its own parameter bag so it never reuses the
    // limit/offset placeholders of the main query.
    const countParams = new ParamBag();
    const countOnly = buildSelectBody(
      { ...spec, limit: undefined, range: undefined, order: [] },
      table,
      catalog,
      countParams,
      source,
      "t0",
    ).countBody;
    compiled.countText = `SELECT count(*)::bigint AS c FROM (${countOnly}) AS cnt`;
    compiled.countParams = countParams.values;
  }

  return compiled;
}

/**
 * Columns a mutation must return for its projection to work.
 *
 * `RETURNING *` would require SELECT on every column, which breaks on tables
 * exposing only a subset through column-level grants (as PostgREST also does,
 * it only returns what was asked for).
 */
function collectReturningColumns(
  nodes: SelectNode[],
  table: TableMeta,
  catalog: Catalog,
): string[] | null {
  const columns = new Set<string>();

  for (const node of nodes) {
    if (node.kind === "star") return null;
    if (node.kind === "column") {
      const base = node.name.split("->")[0];
      columns.add(base);
      continue;
    }
    const relationship = resolveRelationship(catalog, table, node.relation, node.hint);
    for (const [parentColumn] of relationship.join) columns.add(parentColumn);
  }

  return [...columns];
}

function compileMutation(
  spec: QuerySpec,
  table: TableMeta,
  catalog: Catalog,
  params: ParamBag,
): CompiledQuery {
  const relation = quoteRelation(spec.schema, spec.table);
  let mutation: string;

  if (spec.method === "insert" || spec.method === "upsert") {
    const rows = normaliseRows(spec.values);
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (columns.length === 0) throw new CompileError("Nothing to insert", "22023");
    const quotedColumns = columns.map(quoteIdent).join(", ");
    const tuples = rows
      .map(
        (row) =>
          `(${columns
            .map((column) =>
              column in row && row[column] !== undefined
                ? params.add(encodeValue(row[column], table.columns.get(column)?.udtName))
                : spec.defaultToNull === false
                  ? "DEFAULT"
                  : params.add(null),
            )
            .join(", ")})`,
      )
      .join(", ");

    mutation = `INSERT INTO ${relation} (${quotedColumns}) VALUES ${tuples}`;

    if (spec.method === "upsert") {
      const conflictColumns = (spec.onConflict
        ?.split(",")
        .map((c) => c.trim())
        .filter(Boolean) ?? table.primaryKey) as string[];
      if (conflictColumns.length === 0) {
        throw new CompileError(`No conflict target available for ${spec.table}`, "42P10");
      }
      const target = `(${conflictColumns.map(quoteIdent).join(", ")})`;
      if (spec.ignoreDuplicates) {
        mutation += ` ON CONFLICT ${target} DO NOTHING`;
      } else {
        const updates = columns
          .filter((column) => !conflictColumns.includes(column))
          .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
        mutation += updates.length
          ? ` ON CONFLICT ${target} DO UPDATE SET ${updates.join(", ")}`
          : ` ON CONFLICT ${target} DO NOTHING`;
      }
    }
  } else if (spec.method === "update") {
    const [row] = normaliseRows(spec.values);
    const assignments = Object.entries(row)
      .filter(([, value]) => value !== undefined)
      .map(([column, value]) =>
        `${quoteIdent(column)} = ${params.add(encodeValue(value, table.columns.get(column)?.udtName))}`,
      );
    if (assignments.length === 0) throw new CompileError("Nothing to update", "22023");
    mutation = `UPDATE ${relation} SET ${assignments.join(", ")}${renderWhere(spec.conditions, {
      qualifier: null,
      params,
    })}`;
  } else {
    mutation = `DELETE FROM ${relation}${renderWhere(spec.conditions, { qualifier: null, params })}`;
  }

  if (!spec.select) {
    return {
      text: mutation,
      params: params.values,
      rowColumn: ROW_COLUMN,
      scalar: false,
    };
  }

  const nodes = parseSelect(spec.select);
  const projectionCtx: ProjectionContext = {
    catalog,
    params,
    conditions: [],
    aliasCounter: { value: 1 },
  };
  const projection = buildProjection(nodes, table, "t0", projectionCtx, []);
  const returningColumns = collectReturningColumns(nodes, table, catalog);
  const returning = returningColumns ? returningColumns.map(quoteIdent).join(", ") : "*";
  const text =
    `WITH mutated AS (${mutation} RETURNING ${returning}) ` +
    `SELECT to_jsonb(sub) AS ${quoteIdent(ROW_COLUMN)} ` +
    `FROM (SELECT ${projection} FROM mutated AS ${quoteIdent("t0")}) AS sub`;

  return { text, params: params.values, rowColumn: ROW_COLUMN, scalar: false };
}

function compileRpc(spec: RpcSpec, catalog: Catalog): CompiledQuery {
  const overloads = catalog.functions.get(tableKey(spec.schema, spec.fn));
  if (!overloads || overloads.length === 0) {
    throw new CompileError(`Unknown function: ${spec.schema}.${spec.fn}`, "42883");
  }
  const meta = overloads[0];
  const params = new ParamBag();

  const args = Object.entries(spec.args ?? {}).map(
    ([name, value]) => `${quoteIdent(name)} => ${params.add(encodeValue(value))}`,
  );
  const call = `${quoteRelation(spec.schema, spec.fn)}(${args.join(", ")})`;

  const returnsRows = meta.returnsSet || meta.returnTypeKind === "c" || meta.returnTypeKind === "p";

  if (!returnsRows) {
    // Scalar function: PostgREST returns the bare value.
    return {
      text: `SELECT ${call} AS ${quoteIdent(ROW_COLUMN)}`,
      params: params.values,
      rowColumn: ROW_COLUMN,
      scalar: true,
    };
  }

  const alias = quoteIdent("t0");
  const where = renderWhere(spec.conditions, { qualifier: alias, params });
  const projection =
    spec.select && spec.select !== "*" ? renderRpcProjection(spec.select, alias) : `${alias}.*`;
  const body =
    `SELECT ${projection} FROM ${call} AS ${alias}${where}` +
    `${renderOrder(spec, alias)}${renderLimitOffset(spec, params)}`;

  const compiled: CompiledQuery = {
    text: `SELECT to_jsonb(sub) AS ${quoteIdent(ROW_COLUMN)} FROM (${body}) AS sub`,
    params: params.values,
    rowColumn: ROW_COLUMN,
    scalar: false,
  };

  if (spec.count === "exact") {
    const countParams = new ParamBag();
    const countArgs = Object.entries(spec.args ?? {}).map(
      ([name, value]) => `${quoteIdent(name)} => ${countParams.add(encodeValue(value))}`,
    );
    const countCall = `${quoteRelation(spec.schema, spec.fn)}(${countArgs.join(", ")})`;
    const countWhere = renderWhere(spec.conditions, { qualifier: alias, params: countParams });
    compiled.countText = `SELECT count(*)::bigint AS c FROM ${countCall} AS ${alias}${countWhere}`;
    compiled.countParams = countParams.values;
  }

  return compiled;
}

function renderRpcProjection(select: string, alias: string): string {
  const nodes = parseSelect(select);
  const items = nodes.map((node) => {
    if (node.kind === "star") return `${alias}.*`;
    if (node.kind === "column") {
      const expression = renderColumnRef(node.name, alias);
      return `${expression} AS ${quoteIdent(node.alias ?? node.name)}`;
    }
    throw new CompileError("Embedded resources are not supported on function results", "PGRST200");
  });
  return items.join(", ");
}
