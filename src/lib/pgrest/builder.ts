/* eslint-disable @typescript-eslint/no-explicit-any --
   Rows are intentionally untyped: the application accesses them structurally,
   the way it did against the generated database types. */
/**
 * PostgREST-compatible fluent query builder.
 *
 * Runs unchanged in the browser and on the server: it only records the intent
 * of a chain into a `RequestSpec` and hands it to an executor (HTTP transport
 * in the browser, direct SQL compilation on the server).
 */
import {
  FILTER_OPERATORS,
  type Condition,
  type FilterOperator,
  type OrderTerm,
  type QueryResult,
  type QuerySpec,
  type RequestSpec,
  type RpcSpec,
  type SpecExecutor,
} from "./types";

type AnyRecord = Record<string, any>;

function parseOrFilter(input: string): Condition {
  // Grammar accepted: `col.op.value` joined by commas, e.g.
  // `opens_at.is.null,opens_at.lte.2026-01-01`.
  const conditions: Condition[] = [];
  for (const raw of splitTopLevel(input)) {
    const first = raw.indexOf(".");
    const second = raw.indexOf(".", first + 1);
    if (first < 1 || second < 0) {
      throw new Error(`Unsupported or() filter segment: ${raw}`);
    }
    const column = raw.slice(0, first);
    const operator = raw.slice(first + 1, second);
    const value = raw.slice(second + 1);
    let negate = false;
    let op = operator;
    if (op.startsWith("not.")) {
      negate = true;
      op = op.slice(4);
    }
    if (!FILTER_OPERATORS.includes(op as FilterOperator)) {
      throw new Error(`Unsupported or() filter operator: ${operator}`);
    }
    conditions.push({
      type: "op",
      column,
      operator: op as FilterOperator,
      value: decodeFilterValue(op as FilterOperator, value),
      negate,
    });
  }
  if (conditions.length === 0) throw new Error("Empty or() filter");
  return { type: "or", conditions };
}

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

function decodeFilterValue(operator: FilterOperator, raw: string): unknown {
  if (operator === "is") {
    if (raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw;
  }
  if (operator === "in" || operator === "cs" || operator === "cd" || operator === "ov") {
    if (raw.startsWith("(") && raw.endsWith(")")) {
      const inner = raw.slice(1, -1).trim();
      if (!inner) return [];
      return splitTopLevel(inner).map(stripQuotes);
    }
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const inner = raw.slice(1, -1).trim();
      if (!inner) return [];
      return splitTopLevel(inner).map(stripQuotes);
    }
  }
  return raw;
}

function stripQuotes(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

class FilterBuilder<TData = any[]> implements PromiseLike<QueryResult<TData>> {
  constructor(
    protected spec: RequestSpec,
    protected executor: SpecExecutor,
  ) {}

  protected push(condition: Condition): this {
    this.spec.conditions.push(condition);
    return this;
  }

  protected op(column: string, operator: FilterOperator, value: unknown, negate = false): this {
    return this.push({ type: "op", column, operator, value, negate });
  }

  eq(column: string, value: unknown) {
    return this.op(column, "eq", value);
  }
  neq(column: string, value: unknown) {
    return this.op(column, "neq", value);
  }
  gt(column: string, value: unknown) {
    return this.op(column, "gt", value);
  }
  gte(column: string, value: unknown) {
    return this.op(column, "gte", value);
  }
  lt(column: string, value: unknown) {
    return this.op(column, "lt", value);
  }
  lte(column: string, value: unknown) {
    return this.op(column, "lte", value);
  }
  like(column: string, pattern: string) {
    return this.op(column, "like", pattern.replace(/\*/g, "%"));
  }
  ilike(column: string, pattern: string) {
    return this.op(column, "ilike", pattern.replace(/\*/g, "%"));
  }
  is(column: string, value: null | boolean) {
    return this.op(column, "is", value);
  }
  in(column: string, values: readonly unknown[]) {
    return this.op(column, "in", [...values]);
  }
  contains(column: string, value: unknown) {
    return this.op(column, "cs", value);
  }
  containedBy(column: string, value: unknown) {
    return this.op(column, "cd", value);
  }
  overlaps(column: string, value: unknown) {
    return this.op(column, "ov", value);
  }

  not(column: string, operator: string, value: unknown) {
    const op = operator as FilterOperator;
    if (!FILTER_OPERATORS.includes(op)) {
      throw new Error(`Unsupported not() operator: ${operator}`);
    }
    const decoded = typeof value === "string" ? decodeFilterValue(op, value) : value;
    return this.op(column, op, decoded, true);
  }

  filter(column: string, operator: string, value: unknown) {
    let op = operator;
    let negate = false;
    if (op.startsWith("not.")) {
      negate = true;
      op = op.slice(4);
    }
    if (!FILTER_OPERATORS.includes(op as FilterOperator)) {
      throw new Error(`Unsupported filter() operator: ${operator}`);
    }
    const decoded =
      typeof value === "string" ? decodeFilterValue(op as FilterOperator, value) : value;
    return this.op(column, op as FilterOperator, decoded, negate);
  }

  match(query: AnyRecord) {
    for (const [column, value] of Object.entries(query)) this.op(column, "eq", value);
    return this;
  }

  or(filters: string) {
    return this.push(parseOrFilter(filters));
  }

  order(
    column: string,
    options: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string } = {},
  ) {
    const term: OrderTerm = {
      column,
      ascending: options.ascending !== false,
      nullsFirst: options.nullsFirst,
      referencedTable: options.referencedTable,
    };
    this.spec.order.push(term);
    return this;
  }

  limit(count: number) {
    this.spec.limit = count;
    return this;
  }

  range(from: number, to: number) {
    this.spec.range = { from, to };
    return this;
  }

  single() {
    this.spec.single = "one";
    return this as unknown as FilterBuilder<any>;
  }

  maybeSingle() {
    this.spec.single = "maybe";
    return this as unknown as FilterBuilder<any>;
  }

  returns<U>() {
    return this as unknown as FilterBuilder<U>;
  }

  overrideTypes<U>() {
    return this as unknown as FilterBuilder<U>;
  }

  /** Compatibility no-op: cancellation is handled by the transport layer. */
  abortSignal(_signal: AbortSignal) {
    return this;
  }

  async then<TResult1 = QueryResult<TData>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<TData>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.executor(this.spec).then(
      (result) => (onfulfilled ? onfulfilled(result as QueryResult<TData>) : (result as TResult1)),
      onrejected ?? undefined,
    ) as Promise<TResult1 | TResult2>;
  }
}

class SelectBuilder<TData = any[]> extends FilterBuilder<TData> {
  select(columns = "*", options: { count?: "exact"; head?: boolean } = {}) {
    this.spec.select = columns;
    if (options.count) this.spec.count = options.count;
    if (options.head) this.spec.head = true;
    return this;
  }
}

class MutationBuilder<TData = any[]> extends FilterBuilder<TData> {
  select(columns = "*") {
    this.spec.select = columns;
    return this;
  }
}

function newQuerySpec(schema: string, table: string, method: QuerySpec["method"]): QuerySpec {
  return {
    kind: "query",
    schema,
    table,
    method,
    select: null,
    conditions: [],
    order: [],
  };
}

export class TableBuilder {
  constructor(
    private schema: string,
    private table: string,
    private executor: SpecExecutor,
  ) {}

  select(columns = "*", options: { count?: "exact"; head?: boolean } = {}) {
    const spec = newQuerySpec(this.schema, this.table, "select");
    spec.select = columns;
    if (options.count) spec.count = options.count;
    if (options.head) spec.head = true;
    return new SelectBuilder<any[]>(spec, this.executor);
  }

  insert(values: unknown, options: { count?: "exact"; defaultToNull?: boolean } = {}) {
    const spec = newQuerySpec(this.schema, this.table, "insert");
    spec.values = values;
    if (options.count) spec.count = options.count;
    spec.defaultToNull = options.defaultToNull;
    return new MutationBuilder<any[]>(spec, this.executor);
  }

  upsert(
    values: unknown,
    options: {
      onConflict?: string;
      ignoreDuplicates?: boolean;
      count?: "exact";
      defaultToNull?: boolean;
    } = {},
  ) {
    const spec = newQuerySpec(this.schema, this.table, "upsert");
    spec.values = values;
    spec.onConflict = options.onConflict;
    spec.ignoreDuplicates = options.ignoreDuplicates;
    if (options.count) spec.count = options.count;
    spec.defaultToNull = options.defaultToNull;
    return new MutationBuilder<any[]>(spec, this.executor);
  }

  update(values: AnyRecord, options: { count?: "exact" } = {}) {
    const spec = newQuerySpec(this.schema, this.table, "update");
    spec.values = values;
    if (options.count) spec.count = options.count;
    return new MutationBuilder<any[]>(spec, this.executor);
  }

  delete(options: { count?: "exact" } = {}) {
    const spec = newQuerySpec(this.schema, this.table, "delete");
    if (options.count) spec.count = options.count;
    return new MutationBuilder<any[]>(spec, this.executor);
  }
}

export function createRpcBuilder(
  schema: string,
  fn: string,
  args: Record<string, unknown>,
  options: { count?: "exact"; head?: boolean },
  executor: SpecExecutor,
) {
  const spec: RpcSpec = {
    kind: "rpc",
    schema,
    fn,
    args,
    select: null,
    conditions: [],
    order: [],
    count: options.count,
    head: options.head,
  };
  return new SelectBuilder<any>(spec, executor);
}

export { FilterBuilder, SelectBuilder, MutationBuilder };
