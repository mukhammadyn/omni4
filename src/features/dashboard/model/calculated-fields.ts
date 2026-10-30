import { toField, type Field } from "@/features/table";
import type { Item } from "@/features/item";
import { numericField } from "./builder-fields";
export type CalculatedField = { slug: string; label: string; expression: string };
/** Small arithmetic grammar only. No eval, function calls, property access or chained formulas. */
export function compileCalculation(expression: string, fields: Field[]) {
  if (expression.length > 500) throw new Error("Formula is too long");
  const tokens = expression.match(/\[[A-Za-z_][\w]*\]|(?:\d+(?:\.\d*)?|\.\d+)|[()+*/-]|\S/g) ?? [];
  if (!tokens.length || tokens.length > 128) throw new Error("Invalid formula");
  const allowed = new Set(fields.filter(numericField).map((field) => field.slug));
  let at = 0, depth = 0;
  type Node = (row: Item) => number;
  function atom(): Node {
    if (++depth > 24) throw new Error("Formula nesting limit");
    const token = tokens[at++]; let node: Node;
    if (token === "(") { node = sum(); if (tokens[at++] !== ")") throw new Error("Missing closing bracket"); }
    else if (token === "-" || token === "+") { const next = atom(); node = token === "-" ? (row) => -next(row) : next; }
    else if (token?.startsWith("[")) { const key = token.slice(1, -1); if (!allowed.has(key)) throw new Error("Unknown or non-numeric field: " + key); node = (row) => { const v = row[key]; return typeof v === "number" ? v : typeof v === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(v) ? Number(v) : NaN; }; }
    else if (token && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) { const value = Number(token); node = () => value; }
    else throw new Error("Use numeric [fields], + - * / and brackets only");
    depth--; return node;
  }
  function product(): Node { let left = atom(); while (tokens[at] === "*" || tokens[at] === "/") { const op = tokens[at++], a = left, b = atom(); left = (row) => op === "*" ? a(row) * b(row) : a(row) / b(row); } return left; }
  function sum(): Node { let left = product(); while (tokens[at] === "+" || tokens[at] === "-") { const op = tokens[at++], a = left, b = product(); left = (row) => op === "+" ? a(row) + b(row) : a(row) - b(row); } return left; }
  const evaluate = sum(); if (at !== tokens.length) throw new Error("Unexpected formula token");
  return (row: Item) => { const n = evaluate(row); return Number.isFinite(n) ? n : null; };
}
export function parseCalculatedFields(value: unknown): CalculatedField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 16).flatMap((f) => {
    if (!f || typeof f !== "object" || typeof f.slug !== "string" || !/^calc_[a-zA-Z0-9_]+$/.test(f.slug) || seen.has(f.slug) || typeof f.label !== "string" || typeof f.expression !== "string" || f.expression.length > 500) return [];
    seen.add(f.slug); return [{ slug: f.slug, label: f.label.slice(0, 200), expression: f.expression }];
  });
}
export function calculatedProjection(base: Field[], definitions: CalculatedField[] = []) {
  const calculations = definitions.flatMap((definition) => {
    if (base.some((field) => field.slug === definition.slug)) return [];
    try { return [{ definition, evaluate: compileCalculation(definition.expression, base) }]; } catch { return []; }
  });
  return {
    fields: [...base, ...calculations.map(({ definition }) => toField({ id: definition.slug, slug: definition.slug, label: definition.label, type: "NUMBER" }))],
    rows: (rows: Item[]) => rows.map((row) => ({ ...row, ...Object.fromEntries(calculations.map(({ definition, evaluate }) => [definition.slug, evaluate(row)])) })),
  };
}
