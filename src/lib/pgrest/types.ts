/**
 * Wire format shared by the browser query builder and the server-side compiler.
 *
 * The application keeps using the PostgREST-style fluent API it was written
 * against; the builder turns every chain into one of these specs, which the
 * server compiles to parameterised SQL and executes against PostgreSQL with the
 * caller's RLS context applied.
 */

export type FilterOperator =
  "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in" | "cs" | "cd" | "ov";

export const FILTER_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "cs",
  "cd",
  "ov",
];

export type Condition =
  | { type: "op"; column: string; operator: FilterOperator; value: unknown; negate?: boolean }
  | { type: "or"; conditions: Condition[] };

export type OrderTerm = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
  referencedTable?: string;
};

export type QuerySpec = {
  kind: "query";
  schema: string;
  table: string;
  method: "select" | "insert" | "update" | "delete" | "upsert";
  /** Raw PostgREST select string, e.g. `"*, firms(name)"`. */
  select: string | null;
  values?: unknown;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  defaultToNull?: boolean;
  conditions: Condition[];
  order: OrderTerm[];
  limit?: number;
  range?: { from: number; to: number };
  count?: "exact";
  head?: boolean;
  /** `single()` rejects unless exactly one row; `maybe` allows zero. */
  single?: "one" | "maybe";
};

export type RpcSpec = {
  kind: "rpc";
  schema: string;
  fn: string;
  args: Record<string, unknown>;
  select: string | null;
  conditions: Condition[];
  order: OrderTerm[];
  limit?: number;
  range?: { from: number; to: number };
  count?: "exact";
  head?: boolean;
  single?: "one" | "maybe";
};

export type RequestSpec = QuerySpec | RpcSpec;

export type PostgrestErrorShape = {
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
};

export type PostgrestResponse<T = unknown> = {
  data: T | null;
  error: PostgrestErrorShape | null;
  count: number | null;
  status: number;
  statusText: string;
};

/**
 * Result seen by application code. `data` stays deliberately loose: the
 * codebase was written against generated row types and relies on structural
 * access. List queries expose `any[]` so array callbacks keep a contextual
 * type; `single()` / `maybeSingle()` narrow it to a single value.
 */
export type QueryResult<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
  TData = any[],
> = {
  data: TData;
  error: PostgrestErrorShape | null;
  count: number | null;
  status: number;
  statusText: string;
};

export type SpecExecutor = (spec: RequestSpec) => Promise<PostgrestResponse>;
