import type { DbClient } from "./pool";
import { getPool } from "./pool";

export type ColumnMeta = { name: string; udtName: string; isGenerated: boolean };

export type TableMeta = {
  schema: string;
  name: string;
  columns: Map<string, ColumnMeta>;
  primaryKey: string[];
  uniqueSets: string[][];
};

export type ForeignKeyMeta = {
  name: string;
  schema: string;
  table: string;
  columns: string[];
  refSchema: string;
  refTable: string;
  refColumns: string[];
};

export type FunctionMeta = {
  schema: string;
  name: string;
  returnsSet: boolean;
  /** `c` composite, `p` pseudo (record/table), otherwise a scalar type category. */
  returnTypeKind: string;
  returnsVoid: boolean;
};

export type Catalog = {
  tables: Map<string, TableMeta>;
  foreignKeys: ForeignKeyMeta[];
  functions: Map<string, FunctionMeta[]>;
};

const INTROSPECTED_SCHEMAS = ["public", "storage", "auth"];

let catalogPromise: Promise<Catalog> | undefined;

export function resetCatalog() {
  catalogPromise = undefined;
}

export function getCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog().catch((error) => {
      catalogPromise = undefined;
      throw error;
    });
  }
  return catalogPromise;
}

export function tableKey(schema: string, table: string) {
  return `${schema}.${table}`;
}

async function loadCatalog(): Promise<Catalog> {
  const pool = getPool();
  const client = (await pool.connect()) as DbClient;
  try {
    const columns = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      udt_name: string;
      is_generated: string;
    }>(
      `SELECT table_schema, table_name, column_name, udt_name, is_generated
         FROM information_schema.columns
        WHERE table_schema = ANY($1)
        ORDER BY table_schema, table_name, ordinal_position`,
      [INTROSPECTED_SCHEMAS],
    );
    const tables = new Map<string, TableMeta>();
    for (const row of columns.rows) {
      const key = tableKey(row.table_schema, row.table_name);
      let meta = tables.get(key);
      if (!meta) {
        meta = {
          schema: row.table_schema,
          name: row.table_name,
          columns: new Map(),
          primaryKey: [],
          uniqueSets: [],
        };
        tables.set(key, meta);
      }
      meta.columns.set(row.column_name, {
        name: row.column_name,
        udtName: row.udt_name,
        isGenerated: row.is_generated === "ALWAYS",
      });
    }

    const constraints = await client.query<{
      contype: string;
      conname: string;
      nsp: string;
      rel: string;
      cols: string[];
      refnsp: string | null;
      refrel: string | null;
      refcols: string[] | null;
    }>(
      `SELECT con.contype::text AS contype,
              con.conname       AS conname,
              ns.nspname        AS nsp,
              cl.relname        AS rel,
              (SELECT array_agg(a.attname::text ORDER BY k.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols,
              fns.nspname       AS refnsp,
              fcl.relname       AS refrel,
              (SELECT array_agg(a.attname::text ORDER BY k.ord)
                 FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS refcols
         FROM pg_constraint con
         JOIN pg_class cl      ON cl.oid = con.conrelid
         JOIN pg_namespace ns  ON ns.oid = cl.relnamespace
         LEFT JOIN pg_class fcl     ON fcl.oid = con.confrelid
         LEFT JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
        WHERE con.contype IN ('f', 'p', 'u')
          AND ns.nspname = ANY($1)`,
      [INTROSPECTED_SCHEMAS],
    );

    const foreignKeys: ForeignKeyMeta[] = [];
    for (const row of constraints.rows) {
      const meta = tables.get(tableKey(row.nsp, row.rel));
      if (row.contype === "p" && meta) meta.primaryKey = row.cols ?? [];
      if (row.contype === "u" && meta) meta.uniqueSets.push(row.cols ?? []);
      if (row.contype === "f" && row.refnsp && row.refrel) {
        foreignKeys.push({
          name: row.conname,
          schema: row.nsp,
          table: row.rel,
          columns: row.cols ?? [],
          refSchema: row.refnsp,
          refTable: row.refrel,
          refColumns: row.refcols ?? [],
        });
      }
    }

    // Primary keys are implicit unique sets too.
    for (const meta of tables.values()) {
      if (meta.primaryKey.length > 0) meta.uniqueSets.push(meta.primaryKey);
    }

    const routines = await client.query<{
      nsp: string;
      proname: string;
      proretset: boolean;
      typtype: string;
      returns_void: boolean;
    }>(
      `SELECT n.nspname AS nsp,
              p.proname AS proname,
              p.proretset AS proretset,
              t.typtype::text AS typtype,
              (p.prorettype = 'void'::regtype) AS returns_void
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_type t      ON t.oid = p.prorettype
        WHERE n.nspname = ANY($1)
          AND p.prokind = 'f'`,
      [INTROSPECTED_SCHEMAS],
    );

    const functions = new Map<string, FunctionMeta[]>();
    for (const row of routines.rows) {
      const key = tableKey(row.nsp, row.proname);
      const list = functions.get(key) ?? [];
      list.push({
        schema: row.nsp,
        name: row.proname,
        returnsSet: row.proretset,
        returnTypeKind: row.typtype,
        returnsVoid: row.returns_void,
      });
      functions.set(key, list);
    }

    return { tables, foreignKeys, functions };
  } finally {
    client.release();
  }
}
