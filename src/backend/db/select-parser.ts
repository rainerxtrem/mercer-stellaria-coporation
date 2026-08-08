/**
 * Parser for PostgREST `select=` strings, e.g.
 *   "*, clients!matters_client_id_fkey(id, name), decisions:disciplinary_decisions(*)"
 */

export type SelectNode =
  | { kind: "star" }
  | { kind: "column"; name: string; alias?: string; cast?: string }
  | {
      kind: "embed";
      relation: string;
      alias?: string;
      hint?: string;
      inner: boolean;
      children: SelectNode[];
    };

export function parseSelect(input: string): SelectNode[] {
  const nodes: SelectNode[] = [];
  for (const part of splitTopLevel(input)) {
    nodes.push(parseItem(part));
  }
  return nodes;
}

function parseItem(item: string): SelectNode {
  const open = indexOfTopLevel(item, "(");
  if (open === -1) return parseColumn(item);

  if (!item.endsWith(")")) {
    throw new Error(`Malformed select item: ${item}`);
  }
  const head = item.slice(0, open).trim();
  const body = item.slice(open + 1, -1);

  let alias: string | undefined;
  let target = head;
  const colon = target.indexOf(":");
  if (colon !== -1) {
    alias = target.slice(0, colon).trim();
    target = target.slice(colon + 1).trim();
  }

  let inner = false;
  let hint: string | undefined;
  const modifiers = target.split("!");
  const relation = modifiers.shift()!.trim();
  for (const modifier of modifiers) {
    const value = modifier.trim();
    if (value === "inner") inner = true;
    else if (value === "left") inner = false;
    else hint = value;
  }

  return {
    kind: "embed",
    relation,
    alias,
    hint,
    inner,
    children: body.trim() ? parseSelect(body) : [{ kind: "star" }],
  };
}

function parseColumn(item: string): SelectNode {
  const value = item.trim();
  if (value === "*") return { kind: "star" };

  let alias: string | undefined;
  let rest = value;
  const colon = rest.indexOf(":");
  if (colon !== -1) {
    alias = rest.slice(0, colon).trim();
    rest = rest.slice(colon + 1).trim();
  }

  let cast: string | undefined;
  const castAt = rest.indexOf("::");
  if (castAt !== -1) {
    cast = rest.slice(castAt + 2).trim();
    rest = rest.slice(0, castAt).trim();
  }

  if (!rest) throw new Error(`Malformed select item: ${item}`);
  return { kind: "column", name: rest, alias, cast };
}

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

function indexOfTopLevel(input: string, char: string): number {
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === char && depth === 0) return i;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return -1;
}
