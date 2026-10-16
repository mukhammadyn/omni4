/**
 * Сводная «Начислений» по месяцу — `pvData` прототипа (payroll.html):
 * сотрудник × вид, начисления слева, удержания справа, итоги строки
 * и подвал. Колонки — только виды, что встретились в месяце.
 */

export type PayLine = {
  employeeId: string;
  employee: string;
  photo: string;
  dept: string;
  typeId: string;
  typeName: string;
  typeOrder: number;
  kind: "accrual" | "deduction";
  amount: number;
};

export type PayColumn = { id: string; name: string };

export type PayRow = {
  id: string;
  name: string;
  photo: string;
  dept: string;
  /** Сумма по виду. Удержания — положительным числом. */
  cells: Record<string, number>;
  accrued: number;
  deducted: number;
};

export type PayPivot = {
  accruals: PayColumn[];
  deductions: PayColumn[];
  rows: PayRow[];
  /** Итог по виду и три итога справа. */
  total: { cells: Record<string, number>; accrued: number; deducted: number };
};

export function buildPayPivot(lines: PayLine[], hideEmpty: boolean): PayPivot {
  const types = new Map<string, PayLine>();
  const rows = new Map<string, PayRow>();
  const total = { cells: {} as Record<string, number>, accrued: 0, deducted: 0 };
  for (const line of lines) {
    if (!types.has(line.typeId)) types.set(line.typeId, line);
    let row = rows.get(line.employeeId);
    if (!row) {
      row = { id: line.employeeId, name: line.employee, photo: line.photo, dept: line.dept, cells: {}, accrued: 0, deducted: 0 };
      rows.set(line.employeeId, row);
    }
    row.cells[line.typeId] = (row.cells[line.typeId] ?? 0) + line.amount;
    total.cells[line.typeId] = (total.cells[line.typeId] ?? 0) + line.amount;
    const side = line.kind === "deduction" ? "deducted" : "accrued";
    row[side] += line.amount;
    total[side] += line.amount;
  }
  const columns = (kind: PayLine["kind"]) =>
    [...types.values()]
      .filter((type) => type.kind === kind)
      .sort((a, b) => a.typeOrder - b.typeOrder || a.typeName.localeCompare(b.typeName))
      .map((type) => ({ id: type.typeId, name: type.typeName }));
  return {
    accruals: columns("accrual"),
    deductions: columns("deduction"),
    rows: [...rows.values()]
      .filter((row) => !hideEmpty || row.accrued || row.deducted)
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    total,
  };
}

/** `cmp` прототипа: 1 250 000 → «1.3M», 720 000 → «720k». */
export function compactSum(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const short = (n: number) => String(+n.toFixed(1));
  if (abs >= 1e6) return `${sign}${short(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${short(abs / 1e3)}k`;
  return `${sign}${Math.round(abs)}`;
}
