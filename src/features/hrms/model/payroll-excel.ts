/**
 * Excel «Зарплаты» — шаблон ведомости и его загрузка, как в HRMS
 * (`udevs-hrms-reports`, methods/get-salary-excel-template.js и
 * import-salary-excel.js; кнопки — udevs_hrms_admin, modules/Finance/Salary).
 *
 * Формат файла тот же: строка 5 — скрытые ключи колонок (`__user_guid`,
 * `__base_salary`, `income:<вид>`, `deduction:<вид>`), с 6-й — сотрудники.
 * Загрузка читает только ключи, поэтому подписи можно переводить.
 *
 * Как в HRMS (ADR-0018, дополнение от 2026-10-28): оклад и старую формулу
 * опозданий считает шаблон — в выбранном режиме (дневной / часовой), но по
 * дням утверждённых табелей (`model/timesheet-salary`), а не по живой
 * посещаемости; пишет их загрузка. Штрафы по политикам пишет «Утвердить»,
 * в шаблоне они только читаются (`__auto_attendance_penalty`).
 * - Период ведомости — месяц или неделя пн–вс, тот, что открыт в сводной
 *   (в HRMS — так же, `salary-excel-common.js:36-55`). Он записан в файл
 *   (`__period:<с>:<по>`), и загрузка отказывает файлу другого периода.
 */
import ExcelJS from "exceljs";
import type { SalaryPiece } from "./payroll";
import type { PayUnit } from "./timesheet-days";

const ddmm = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

/* ---------- шаблон ---------- */

export type PayTypeColumn = { id: string; name: string };

export type TemplateLabels = {
  sheet: string;
  title: string;
  period: string;
  index: string;
  guid: string;
  employee: string;
  accrualType: string;
  payUnit: string;
  salaryGroup: string;
  rate: string;
  norm: string;
  worked: string;
  accruals: string;
  salary: string;
  deductions: string;
  accrued: string;
  deducted: string;
  net: string;
  total: string;
  daily: string;
  hourly: string;
  unit: Record<PayUnit, string>;
  /** Примечание к пустому окладу. */
  noTimesheet: string;
};

export type TemplateEmployee = {
  id: string;
  name: string;
  /** Оклад периода по кускам; пусто — нет утверждённого табеля. */
  pieces: SalaryPiece[];
  /** Штрафы по политикам, записанные «Утвердить», — в колонку `auto`, только чтение. */
  fines: number;
  /** Старая формула опозданий — при `legacy`, в колонку вида удержаний табеля, её читает загрузка. */
  lateness: number;
};

export type TemplateInput = {
  period: { from: string; to: string };
  labels: TemplateLabels;
  employees: TemplateEmployee[];
  /** Виды без «Оклада»: он своей колонкой. */
  accruals: PayTypeColumn[];
  deductions: PayTypeColumn[];
  /** Вид удержаний табеля: штрафы (только чтение) или, при `legacy`, старая формула опозданий. */
  autoDeductionId: string;
  /** Политик штрафов в периоде нет — колонка вида удержаний несёт старую формулу и загружается. */
  legacy: boolean;
};

/** Ключи строки 5: по ним загрузка находит колонки. */
export const META = { guid: "__user_guid", salary: "__base_salary", auto: "__auto_attendance_penalty", period: "__period:" } as const;
const META_ROW = 5;
const DATA_ROW = 6;

const NAVY = "FF213A6A";
const GREEN = "FF2A6A37";
const RED = "FF7A2723";

const letter = (column: number) => {
  let rest = column;
  let out = "";
  while (rest > 0) {
    out = String.fromCharCode(65 + ((rest - 1) % 26)) + out;
    rest = Math.floor((rest - 1) / 26);
  }
  return out;
};

const fill = (cell: ExcelJS.Cell, argb: string) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
};
const border = { style: "thin" as const, color: { argb: "FFB8C2D3" } };
const borders = (sheet: ExcelJS.Worksheet, row: number, columns: number) => {
  for (let column = 1; column <= columns; column += 1) {
    sheet.getCell(row, column).border = { top: border, left: border, bottom: border, right: border };
  }
};
const header = (cell: ExcelJS.Cell, value: string, color: string, size = 12) => {
  cell.value = value;
  cell.font = { bold: true, size, color: { argb: "FFFFFFFF" } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  fill(cell, color);
};
/**
 * Формула со значением: файл открывается с цифрами и без пересчёта. Ноль —
 * строкой, как в HRMS: числовой 0 exceljs не пишет, и клетка открывалась пустой.
 */
const formula = (expression: string, result?: number): ExcelJS.CellValue =>
  result === undefined ? { formula: expression } : ({ formula: expression, result: result === 0 ? "0" : result } as ExcelJS.CellValue);

/** Ведомость за месяц — раскладка и оформление шаблона HRMS. */
export async function buildTemplate(input: TemplateInput): Promise<ArrayBuffer> {
  const { labels, employees, accruals, deductions } = input;
  const book = new ExcelJS.Workbook();
  book.creator = "omni4";
  const sheet = book.addWorksheet(labels.sheet, { views: [{ state: "frozen", ySplit: 5 }] });

  const col = { accrualType: 4, payUnit: 5, rate: 6, norm: 7, worked: 8, salary: 9 };
  const accrualsFrom = col.salary + 1;
  const deductionsFrom = accrualsFrom + accruals.length;
  const accruedCol = deductionsFrom + deductions.length;
  const deductedCol = accruedCol + 1;
  const netCol = accruedCol + 2;
  const last = netCol;
  const lateCol = deductions.findIndex((type) => type.id === input.autoDeductionId);
  // Штрафы — только для чтения; старая формула (нет политик) — обычное удержание, его пишет загрузка.
  const autoCol = input.legacy ? -1 : lateCol;

  [6, 40, 34, 18, 16, 20, 20, 20].forEach((width, i) => (sheet.getColumn(i + 1).width = width));
  for (let column = col.salary; column <= last; column += 1) sheet.getColumn(column).width = 18;

  sheet.mergeCells(1, 1, 1, last);
  const title = sheet.getCell(1, 1);
  title.value = labels.title;
  title.font = { bold: true, size: 21, color: { argb: "FF1F3562" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 38;
  sheet.mergeCells(2, 1, 2, last);
  const period = sheet.getCell(2, 1);
  period.value = labels.period;
  period.font = { bold: true, size: 15, color: { argb: "FF42526E" } };
  period.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(2).height = 28;

  const tall = (column: number, value: string, color: string, size = 12) => {
    sheet.mergeCells(3, column, 4, column);
    header(sheet.getCell(3, column), value, color, size);
  };
  [labels.index, labels.guid, labels.employee, labels.accrualType, labels.payUnit].forEach((value, i) => tall(i + 1, value, NAVY));
  sheet.mergeCells(3, col.rate, 3, col.worked);
  header(sheet.getCell(3, col.rate), labels.salaryGroup, NAVY);
  [labels.rate, labels.norm, labels.worked].forEach((value, i) => header(sheet.getCell(4, col.rate + i), value, NAVY, 11));
  sheet.mergeCells(3, col.salary, 3, deductionsFrom - 1);
  header(sheet.getCell(3, col.salary), labels.accruals, GREEN);
  header(sheet.getCell(4, col.salary), labels.salary, GREEN, 11);
  accruals.forEach((type, i) => header(sheet.getCell(4, accrualsFrom + i), type.name, GREEN, 11));
  if (deductions.length) {
    sheet.mergeCells(3, deductionsFrom, 3, accruedCol - 1);
    header(sheet.getCell(3, deductionsFrom), labels.deductions, RED);
    deductions.forEach((type, i) => header(sheet.getCell(4, deductionsFrom + i), type.name, RED, 11));
  }
  tall(accruedCol, labels.accrued, GREEN);
  tall(deductedCol, labels.deducted, RED);
  tall(netCol, labels.net, NAVY);
  borders(sheet, 3, last);
  borders(sheet, 4, last);
  sheet.getRow(3).height = 34;
  sheet.getRow(4).height = 34;

  const meta = ["__index", META.guid, "__employee_name", "__accrual_type", "__pay_unit", "__salary_rate", "__norm", "__worked", META.salary];
  meta.forEach((key, i) => (sheet.getCell(META_ROW, i + 1).value = key));
  accruals.forEach((type, i) => (sheet.getCell(META_ROW, accrualsFrom + i).value = `income:${type.id}`));
  deductions.forEach((type, i) => (sheet.getCell(META_ROW, deductionsFrom + i).value = i === autoCol ? META.auto : `deduction:${type.id}`));
  sheet.getCell(META_ROW, accruedCol).value = "__total_accrued";
  sheet.getCell(META_ROW, deductedCol).value = "__total_deducted";
  sheet.getCell(META_ROW, netCol).value = "__net_payable";
  sheet.getCell(META_ROW, last + 1).value = `${META.period}${input.period.from}:${input.period.to}`;
  sheet.getRow(META_ROW).hidden = true;

  const hourlyRows: boolean[] = [];
  employees.forEach((employee, index) => {
    const r = DATA_ROW + index;
    const { pieces } = employee;
    // Общее для всех кусков — в клетку; разное — пусто, куски в примечании.
    const same = <T,>(get: (piece: SalaryPiece) => T) =>
      pieces.length > 0 && pieces.every((piece) => get(piece) === get(pieces[0]!)) ? get(pieces[0]!) : undefined;
    const mode = same((piece) => piece.mode);
    const unit = same((piece) => piece.unit);
    const one = pieces.length === 1 ? pieces[0] : undefined;
    hourlyRows.push(mode === "hourly" || unit === "hour");

    sheet.getCell(r, 1).value = index + 1;
    sheet.getCell(r, 2).value = employee.id;
    sheet.getCell(r, 3).value = employee.name;
    sheet.getCell(r, col.accrualType).value = mode ? labels[mode] : null;
    sheet.getCell(r, col.payUnit).value = unit ? labels.unit[unit] : null;
    sheet.getCell(r, col.rate).value = same((piece) => piece.rate) ?? null;
    sheet.getCell(r, col.norm).value = one?.norm ?? null;
    sheet.getCell(r, col.worked).value = one?.worked ?? null;
    sheet.getCell(r, col.salary).value = pieces.length ? pieces.reduce((sum, piece) => sum + piece.amount, 0) : null;
    for (let column = accrualsFrom; column < accruedCol; column += 1) sheet.getCell(r, column).value = 0;
    if (lateCol >= 0) sheet.getCell(r, deductionsFrom + lateCol).value = input.legacy ? employee.lateness : employee.fines;
    sheet.getCell(r, accruedCol).value = formula(`SUM(${letter(col.salary)}${r}:${letter(deductionsFrom - 1)}${r})`);
    sheet.getCell(r, deductedCol).value = formula(deductions.length ? `SUM(${letter(deductionsFrom)}${r}:${letter(accruedCol - 1)}${r})` : "0");
    sheet.getCell(r, netCol).value = formula(`${letter(accruedCol)}${r}-${letter(deductedCol)}${r}`);

    const salary = sheet.getCell(r, col.salary);
    if (!pieces.length) {
      fill(salary, "FFFFEB3B");
      salary.note = labels.noTimesheet;
    } else if (pieces.length > 1) {
      salary.note = pieces
        .map((p) => `${ddmm(p.from)}–${ddmm(p.to)} · ${p.rate.toLocaleString()} / ${labels.unit[p.unit]} · ${labels[p.mode]} · ${p.worked} / ${p.norm} · ${p.amount.toLocaleString()}`)
        .join("\n");
    }
    borders(sheet, r, last);
    if (index % 2 === 0) {
      for (let column = 1; column <= last; column += 1) {
        if (column === col.salary && !pieces.length) continue;
        fill(sheet.getCell(r, column), "FFF8FAFC");
      }
    }
  });

  const end = Math.max(DATA_ROW, DATA_ROW + employees.length - 1);
  const total = end + 1;
  // Ставки, нормы и отработанное разных единиц не складываются — итог с оклада.
  sheet.mergeCells(total, 1, total, col.worked);
  const label = sheet.getCell(total, 1);
  label.value = labels.total;
  label.font = { bold: true, size: 12, color: { argb: "FF1F3562" } };
  label.alignment = { horizontal: "right", vertical: "middle" };
  fill(label, "FFE5ECF7");
  for (let column = col.salary; column <= last; column += 1) {
    const cell = sheet.getCell(total, column);
    cell.value = employees.length ? formula(`SUM(${letter(column)}${DATA_ROW}:${letter(column)}${end})`) : 0;
    cell.font = { bold: true, color: { argb: "FF2B3D63" } };
    fill(cell, "FFE5ECF7");
  }
  borders(sheet, total, last);
  sheet.getRow(total).height = 30;

  for (let r = DATA_ROW; r <= total; r += 1) {
    const hours = hourlyRows[r - DATA_ROW] ?? false;
    for (let column = col.rate; column <= last; column += 1) {
      const cell = sheet.getCell(r, column);
      cell.numFmt = hours && (column === col.norm || column === col.worked) ? "#,##0.00" : "#,##0";
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    sheet.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle" };
  }

  return book.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/* ---------- загрузка ---------- */

export type ImportType = { id: string; kind: "accrual" | "deduction" };

export type ImportRecord = { employeeId: string; typeId: string; kind: "accrual" | "deduction"; amount: number };

export type ImportResult = {
  /** Период файла; нет — файл старый или из HRMS, сверять не с чем. */
  period?: { from: string; to: string } | undefined;
  records: ImportRecord[];
  skipped: { invalidEmployee: number; negative: number; unknownType: number };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cellText = (value: ExcelJS.CellValue): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if ("text" in value && typeof value.text === "string") return value.text.trim();
  if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
  return "";
};

/** «1 250 000,5» и формулы с результатом → число; пусто — 0. */
export const cellNumber = (value: ExcelJS.CellValue): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value && typeof value === "object" && "result" in value) return cellNumber(value.result as ExcelJS.CellValue);
  const parsed = Number(cellText(value).replace(/[\s\u00a0]/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export class TemplateError extends Error {}

/**
 * Файл → строки начислений, правила `importSalaryExcel` HRMS: по строке на
 * сотрудника × вид с суммой больше нуля; «Оклад» — видом `salaryTypeId`, если
 * его нет среди колонок видов. Штрафы (`__auto_…`) не читаются — их пишет
 * «Утвердить». Есть ли такие сотрудники, проверяет вызывающий (`unknownEmployee`).
 */
export async function parseImport(
  file: ArrayBuffer,
  { types, salaryTypeId }: { types: ReadonlyMap<string, ImportType>; salaryTypeId: string },
): Promise<ImportResult> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(file);
  const sheet = book.worksheets[0];
  if (!sheet) throw new TemplateError("no sheet");

  let guidCol = 0;
  let salaryCol = 0;
  const columns: { column: number; typeId: string }[] = [];
  let period: ImportResult["period"];
  const meta = sheet.getRow(META_ROW);
  let unknownType = 0;
  for (let column = 1; column <= Math.max(meta.cellCount, sheet.columnCount); column += 1) {
    const key = cellText(meta.getCell(column).value);
    const dates = key.startsWith(META.period) ? /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(key.slice(META.period.length)) : null;
    if (key === META.guid) guidCol = column;
    else if (key === META.salary) salaryCol = column;
    else if (dates) period = { from: dates[1]!, to: dates[2]! };
    else {
      const id = /^(?:income|deduction):(.+)$/.exec(key)?.[1]?.trim();
      if (!id || !UUID.test(id)) continue;
      if (types.has(id)) columns.push({ column, typeId: id });
      else unknownType += 1;
    }
  }
  if (!guidCol) throw new TemplateError("no guid column");
  if (salaryCol && salaryTypeId && types.has(salaryTypeId) && !columns.some((c) => c.typeId === salaryTypeId)) {
    columns.push({ column: salaryCol, typeId: salaryTypeId });
  }
  if (!columns.length) throw new TemplateError("no pay type columns");

  const result: ImportResult = { period, records: [], skipped: { invalidEmployee: 0, negative: 0, unknownType } };
  for (let r = DATA_ROW; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const employeeId = cellText(row.getCell(guidCol).value);
    if (!employeeId) continue;
    const amounts = columns.map(({ column, typeId }) => ({ typeId, amount: cellNumber(row.getCell(column).value) }));
    if (!UUID.test(employeeId)) {
      // Итог и чужие строки — без счёта; с суммами — ошибка в guid.
      if (amounts.some((a) => a.amount > 0) && !/итого|total|jami/i.test(cellText(row.getCell(1).value))) result.skipped.invalidEmployee += 1;
      continue;
    }
    for (const { typeId, amount } of amounts) {
      if (amount < 0) result.skipped.negative += 1;
      if (amount <= 0) continue;
      result.records.push({ employeeId, typeId, kind: types.get(typeId)!.kind, amount: Math.round(amount * 100) / 100 });
    }
  }
  return result;
}
