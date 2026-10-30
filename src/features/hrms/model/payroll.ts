/**
 * Сводная «Начислений» по месяцу — `pvData` прототипа (payroll.html):
 * сотрудник × вид, начисления слева, удержания справа, итоги строки
 * и подвал. Колонки — только виды, что встретились в месяце.
 */
import type { PayUnit } from "./timesheet-days";

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

/** Режим расчёта оклада — выбирают при «Утвердить» табеля (ADR-0018). */
export type CalcMode = "daily" | "hourly";

/** Кусок оклада — строка «Зарплаты» утверждённого табеля: период с одной ставкой. */
export type SalaryPiece = {
  from: string;
  to: string;
  rate: number;
  unit: PayUnit;
  mode: CalcMode;
  norm: number;
  worked: number;
  amount: number;
};

/** Строка «Зарплаты» утверждённого табеля (`source = timesheet`): оклад или удержание. */
export type TimesheetPayLine = SalaryPiece & { employeeId: string; kind: "accrual" | "deduction" };

/**
 * Оклад кусками и сумма удержаний табелей по сотруднику за период ведомости.
 * Берутся только строки, целиком лежащие в периоде: месячный табель в недельную
 * ведомость не попадает, обе части недели на стыке месяцев — попадают.
 */
export function timesheetPay(lines: readonly TimesheetPayLine[], { from, to }: { from: string; to: string }) {
  const pay = new Map<string, { pieces: SalaryPiece[]; fines: number }>();
  for (const { employeeId, kind, ...piece } of lines) {
    if (piece.from < from || piece.to > to) continue;
    const own = pay.get(employeeId) ?? { pieces: [], fines: 0 };
    pay.set(employeeId, own);
    if (kind === "deduction") own.fines += piece.amount;
    else own.pieces.push(piece);
  }
  for (const own of pay.values()) own.pieces.sort((a, b) => (a.from < b.from ? -1 : 1));
  return pay;
}
