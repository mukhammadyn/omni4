/**
 * Excel «Зарплаты» — шаблон ведомости и его загрузка, как в HRMS
 * (`udevs-hrms-reports`, methods/get-salary-excel-template.js и
 * import-salary-excel.js; кнопки — udevs_hrms_admin, modules/Finance/Salary).
 *
 * Формат файла тот же: строка 5 — скрытые ключи колонок (`__user_guid`,
 * `__base_salary`, `income:<вид>`, `deduction:<вид>`), с 6-й — сотрудники.
 * Загрузка читает только ключи, поэтому подписи можно переводить.
 *
 * Отличия от HRMS:
 * - Период — месяц (сводная помесячная), недельной ведомости нет.
 * - Опоздания удерживают штрафы по политикам («Пересчитать штрафы»), их
 *   колонка — сумма уже посчитанных строк, загрузкой не читается (как
 *   `__auto_attendance_penalty`). Старой формулы опозданий с коэффициентом
 *   из main_settings нет — у omni4 нет этих настроек.
 */
import ExcelJS from "exceljs";
import type { PayPivot } from "./payroll";
import type { SheetCell } from "./timesheet";

export type PayUnit = "month" | "week" | "day" | "hour";
export type TemplateMode = "daily" | "hourly";
export const PAY_UNITS: readonly PayUnit[] = ["month", "week", "day", "hour"];

const WORKED: ReadonlySet<SheetCell["kind"]> = new Set(["worked", "late", "at_work", "missing_mark"]);

export type SalaryInput = {
  id: string;
  name: string;
  salary: number;
  unit: PayUnit;
  /** Дни месяца и задетых им недель (пн–вс): недельной ставке нужна неделя целиком. */
  cells: SheetCell[];
  /** Длина смен по дате, минуты, — до того, как табель снял её отсутствием. */
  planByDate: ReadonlyMap<string, number>;
  /** Границы месяца «ГГГГ-ММ-ДД». */
  from: string;
  to: string;
};

/** Кусок недельной ставки: засчитано в месяце, смен недели в месяце и всего. */
type Segment = { credited: number; shifts: number; unitShifts: number };

export type SalaryRow = {
  /** Смен в месяце и их часы. */
  normDays: number;
  normHours: number;
  creditedDays: number;
  /** Факт засчитанных дней; без ухода и оплачиваемое отсутствие — по смене. */
  paidHours: number;
  lateMinutes: number;
  noCheckout: string[];
  offShift: string[];
  weeks: Segment[];
};

const monday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};
const ddmm = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

/**
 * Дни → норма и засчитанное, правила `fetchEmployeesWithSalary` HRMS:
 * засчитан день с приходом или оплачиваемым отсутствием. Ставке за месяц
 * и неделю не засчитан день «вне графика», ставке за день и час —
 * засчитан, а отсутствие без смены — нет.
 */
export function salaryRow(input: SalaryInput): SalaryRow {
  const byUnit = input.unit === "day" || input.unit === "hour";
  const row: SalaryRow = { normDays: 0, normHours: 0, creditedDays: 0, paidHours: 0, lateMinutes: 0, noCheckout: [], offShift: [], weeks: [] };
  const weeks = new Map<string, Segment>();
  for (const cell of input.cells) {
    const plan = (input.planByDate.get(cell.date) ?? 0) / 60;
    const shift = plan > 0 && cell.kind !== "outside";
    const inMonth = cell.date >= input.from && cell.date <= input.to;
    // «Вне графика» месяцу и неделе не засчитан; день без смены и без этой
    // пометки — засчитан, как в HRMS (source_type off_schedule).
    const worked = WORKED.has(cell.kind) && cell.counted && (byUnit || cell.day?.status !== "off_schedule");
    const paidLeave = cell.kind === "leave" && cell.leave?.paid === true;
    const credited = inMonth && (worked || (paidLeave && (shift || !byUnit)));

    const week = weeks.get(monday(cell.date)) ?? { credited: 0, shifts: 0, unitShifts: 0 };
    weeks.set(monday(cell.date), week);
    if (shift) week.unitShifts += 1;
    if (!inMonth) continue;
    if (shift) {
      week.shifts += 1;
      row.normDays += 1;
      row.normHours += plan;
    }
    if (worked) row.lateMinutes += cell.lateMinutes;
    if (!credited) continue;
    week.credited += 1;
    row.creditedDays += 1;
    row.paidHours += worked && cell.workedMinutes != null ? cell.workedMinutes / 60 : plan;
    if (worked && cell.workedMinutes == null && (shift || !byUnit)) row.noCheckout.push(ddmm(cell.date));
    if (worked && !shift && byUnit) row.offShift.push(ddmm(cell.date));
  }
  row.weeks = [...weeks.values()].filter((week) => week.unitShifts > 0);
  row.normHours = round2(row.normHours);
  row.paidHours = round2(row.paidHours);
  return row;
}

const round2 = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

/** Шаблон строки: ставка за час — всегда часовой, остальные — выбранный. */
export const rowMode = (unit: PayUnit, mode: TemplateMode): TemplateMode => (unit === "hour" ? "hourly" : mode);

/** Множитель ставки к месяцу в часовом шаблоне: день × смены, неделя × 4. */
const hourlyFactor = (unit: PayUnit, row: SalaryRow) =>
  unit === "day" ? { k: row.normDays, excel: `*${row.normDays}` } : unit === "week" ? { k: 4, excel: "*4" } : { k: 1, excel: "" };

export type Accrual = {
  norm: number;
  worked: number;
  price: number;
  amount: number;
  /** Формула цены от клеток строки: правка ставки в Excel пересчитает оклад. */
  priceFormula: (cells: { salary: string; norm: string; worked: string }) => string;
};

/** Начисленный оклад за месяц — `accruedSalary` HRMS для месячного периода. */
export function accrual(salary: number, unit: PayUnit, mode: TemplateMode, row: SalaryRow): Accrual {
  if (rowMode(unit, mode) === "hourly") {
    if (unit === "hour") {
      return { norm: row.normHours, worked: row.paidHours, price: salary, amount: Math.round(salary * row.paidHours), priceFormula: (c) => c.salary };
    }
    const { k, excel } = hourlyFactor(unit, row);
    const norm = row.normHours;
    const price = norm > 0 ? (salary * k) / norm : 0;
    // k = 1 — тем же порядком действий, что HRMS: на ровно .5 иначе ±1.
    const amount = norm > 0 ? Math.round(k === 1 ? salary * (row.paidHours / norm) : price * row.paidHours) : 0;
    return { norm, worked: row.paidHours, price, amount, priceFormula: (c) => `IF(${c.norm}>0,${c.salary}${excel}/${c.norm},0)` };
  }
  if (unit === "day") {
    return { norm: row.normDays, worked: row.creditedDays, price: salary, amount: Math.round(salary * row.creditedDays), priceFormula: (c) => c.salary };
  }
  if (unit === "month") {
    const norm = row.normDays;
    const worked = norm > 0 ? Math.min(row.creditedDays, norm) : row.creditedDays;
    return {
      norm,
      worked,
      price: norm > 0 ? salary / norm : 0,
      amount: norm > 0 ? Math.round(salary * (worked / norm)) : 0,
      priceFormula: (c) => `IF(${c.norm}>0,${c.salary}/${c.norm},0)`,
    };
  }
  // Неделя: каждая неделя по цене своих смен (пн–вс, и вне месяца тоже).
  const shares = row.weeks.map((week) => [Math.min(week.credited, week.shifts), week.unitShifts] as const);
  const worked = shares.reduce((sum, [credited]) => sum + credited, 0);
  const share = shares.reduce((sum, [credited, shifts]) => sum + credited / shifts, 0);
  const formula = shares.map(([credited, shifts]) => `${credited}/${shifts}`).join("+") || "0";
  return {
    norm: row.normDays,
    worked,
    price: worked > 0 ? (salary * share) / worked : 0,
    amount: Math.round(salary * share),
    priceFormula: (c) => `IF(${c.worked}>0,${c.salary}*(${formula})/${c.worked},0)`,
  };
}

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
  price: string;
  norm: string;
  worked: string;
  lateMinutes: string;
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
  noCheckout: (dates: string, hourly: boolean) => string;
  offShift: (dates: string) => string;
};

export type TemplateEmployee = SalaryInput & {
  /** Уже посчитанные штрафы месяца — в колонку `auto`. */
  fines: number;
};

export type TemplateInput = {
  mode: TemplateMode;
  labels: TemplateLabels;
  employees: TemplateEmployee[];
  /** Виды без «Оклада»: он своей колонкой. */
  accruals: PayTypeColumn[];
  deductions: PayTypeColumn[];
  /** Вид, который пишет пересчёт штрафов: колонка только для чтения. */
  autoDeductionId: string;
};

/** Ключи строки 5: по ним загрузка находит колонки. */
export const META = { guid: "__user_guid", salary: "__base_salary", auto: "__auto_attendance_penalty" } as const;
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
  const { labels, mode, employees, accruals, deductions } = input;
  const book = new ExcelJS.Workbook();
  book.creator = "omni4";
  const sheet = book.addWorksheet(labels.sheet, { views: [{ state: "frozen", ySplit: 5 }] });

  const col = { accrualType: 4, payUnit: 5, rate: 6, price: 7, norm: 8, worked: 9, late: 10, salary: 11 };
  const accrualsFrom = col.salary + 1;
  const deductionsFrom = accrualsFrom + accruals.length;
  const accruedCol = deductionsFrom + deductions.length;
  const deductedCol = accruedCol + 1;
  const netCol = accruedCol + 2;
  const last = netCol;
  const autoCol = deductions.findIndex((type) => type.id === input.autoDeductionId);

  [6, 40, 34, 18, 16, 20, 20, 22, 20, 22].forEach((width, i) => (sheet.getColumn(i + 1).width = width));
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
  [labels.rate, labels.price, labels.norm, labels.worked].forEach((value, i) => header(sheet.getCell(4, col.rate + i), value, NAVY, 11));
  tall(col.late, labels.lateMinutes, RED, 11);
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

  const meta = ["__index", META.guid, "__employee_name", "__accrual_type", "__pay_unit", "__salary_rate", "__unit_price", "__norm", "__worked", "__lateness_minutes", META.salary];
  meta.forEach((key, i) => (sheet.getCell(META_ROW, i + 1).value = key));
  accruals.forEach((type, i) => (sheet.getCell(META_ROW, accrualsFrom + i).value = `income:${type.id}`));
  deductions.forEach((type, i) => (sheet.getCell(META_ROW, deductionsFrom + i).value = i === autoCol ? META.auto : `deduction:${type.id}`));
  sheet.getCell(META_ROW, accruedCol).value = "__total_accrued";
  sheet.getCell(META_ROW, deductedCol).value = "__total_deducted";
  sheet.getCell(META_ROW, netCol).value = "__net_payable";
  sheet.getRow(META_ROW).hidden = true;

  const kinds = new Set<string>();
  const hourlyRows: boolean[] = [];
  employees.forEach((employee, index) => {
    const r = DATA_ROW + index;
    const row = salaryRow(employee);
    const hourly = rowMode(employee.unit, mode) === "hourly";
    const pay = accrual(employee.salary, employee.unit, mode, row);
    kinds.add(`${employee.unit}:${hourly}`);
    hourlyRows.push(hourly);
    const ref = { salary: `${letter(col.rate)}${r}`, norm: `${letter(col.norm)}${r}`, worked: `${letter(col.worked)}${r}` };

    sheet.getCell(r, 1).value = index + 1;
    sheet.getCell(r, 2).value = employee.id;
    sheet.getCell(r, 3).value = employee.name;
    sheet.getCell(r, col.accrualType).value = hourly ? labels.hourly : labels.daily;
    sheet.getCell(r, col.payUnit).value = labels.unit[employee.unit];
    sheet.getCell(r, col.rate).value = employee.salary;
    sheet.getCell(r, col.price).value = formula(pay.priceFormula(ref), pay.price);
    sheet.getCell(r, col.norm).value = pay.norm;
    sheet.getCell(r, col.worked).value = pay.worked;
    sheet.getCell(r, col.late).value = row.lateMinutes;
    sheet.getCell(r, col.salary).value = formula(`ROUND(${letter(col.price)}${r}*${ref.worked},0)`, pay.amount);
    for (let column = accrualsFrom; column < accruedCol; column += 1) sheet.getCell(r, column).value = 0;
    if (autoCol >= 0) sheet.getCell(r, deductionsFrom + autoCol).value = employee.fines;
    sheet.getCell(r, accruedCol).value = formula(`SUM(${letter(col.salary)}${r}:${letter(deductionsFrom - 1)}${r})`);
    sheet.getCell(r, deductedCol).value = formula(deductions.length ? `SUM(${letter(deductionsFrom)}${r}:${letter(accruedCol - 1)}${r})` : "0");
    sheet.getCell(r, netCol).value = formula(`${letter(accruedCol)}${r}-${letter(deductedCol)}${r}`);

    // Нет ухода — день засчитан по смене; без смены — засчитан ставке за день и час.
    const notes = [
      row.noCheckout.length > 0 && labels.noCheckout(row.noCheckout.join(", "), hourly),
      row.offShift.length > 0 && labels.offShift(row.offShift.join(", ")),
    ].filter(Boolean);
    const flagged = notes.length > 0;
    // Без смен в месяце нормы нет — оклад не начислен, минуты опозданий не к чему приложить.
    const noShifts = row.normDays === 0;
    if (flagged) {
      const cell = sheet.getCell(r, col.worked);
      fill(cell, "FFFFEB3B");
      cell.note = notes.join("\n");
    }
    if (noShifts) fill(sheet.getCell(r, col.late), "FFFF0000");
    borders(sheet, r, last);
    if (index % 2 === 0) {
      for (let column = 1; column <= last; column += 1) {
        if ((column === col.worked && flagged) || (column === col.late && noShifts)) continue;
        fill(sheet.getCell(r, column), "FFF8FAFC");
      }
    }
  });

  const end = Math.max(DATA_ROW, DATA_ROW + employees.length - 1);
  const total = end + 1;
  sheet.mergeCells(total, 1, total, col.payUnit);
  const label = sheet.getCell(total, 1);
  label.value = labels.total;
  label.font = { bold: true, size: 12, color: { argb: "FF1F3562" } };
  label.alignment = { horizontal: "right", vertical: "middle" };
  fill(label, "FFE5ECF7");
  for (let column = col.rate; column <= last; column += 1) {
    const cell = sheet.getCell(total, column);
    // Ставки, дни и часы разных единиц не складываются.
    cell.value =
      kinds.size > 1 && column <= col.worked
        ? null
        : employees.length
          ? formula(`SUM(${letter(column)}${DATA_ROW}:${letter(column)}${end})`)
          : 0;
    cell.font = { bold: true, color: { argb: "FF2B3D63" } };
    fill(cell, "FFE5ECF7");
  }
  borders(sheet, total, last);
  sheet.getRow(total).height = 30;

  for (let r = DATA_ROW; r <= total; r += 1) {
    const hours = r === total ? hourlyRows[0] : hourlyRows[r - DATA_ROW];
    for (let column = col.rate; column <= last; column += 1) {
      const cell = sheet.getCell(r, column);
      cell.numFmt = column === col.price || (hours && (column === col.norm || column === col.worked)) ? "#,##0.00" : "#,##0";
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
 * сотрудника × вид с суммой больше нуля; «Оклад» — видом `salaryTypeId`,
 * если его нет среди колонок видов. Колонка штрафов (`__auto_…`) не читается.
 * Есть ли такие сотрудники, проверяет вызывающий (`unknownEmployee`).
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
  const typeCols: { column: number; typeId: string }[] = [];
  const meta = sheet.getRow(META_ROW);
  let unknownType = 0;
  for (let column = 1; column <= Math.max(meta.cellCount, sheet.columnCount); column += 1) {
    const key = cellText(meta.getCell(column).value);
    if (key === META.guid) guidCol = column;
    else if (key === META.salary) salaryCol = column;
    else {
      const id = /^(?:income|deduction):(.+)$/.exec(key)?.[1]?.trim();
      if (!id || !UUID.test(id)) continue;
      if (types.has(id)) typeCols.push({ column, typeId: id });
      else unknownType += 1;
    }
  }
  if (!guidCol) throw new TemplateError("no guid column");
  const salaryType = salaryCol && salaryTypeId && !typeCols.some((c) => c.typeId === salaryTypeId) ? types.get(salaryTypeId) : undefined;
  const columns = [...typeCols, ...(salaryType ? [{ column: salaryCol, typeId: salaryTypeId }] : [])];
  if (!columns.length) throw new TemplateError("no pay type columns");

  const result: ImportResult = { records: [], skipped: { invalidEmployee: 0, negative: 0, unknownType } };
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

/* ---------- выгрузка сводной ---------- */

export type PivotLabels = Record<"sheet" | "employee" | "dept" | "accruals" | "deductions" | "accrued" | "deducted" | "net" | "total", string>;

/** Сводная месяца как на экране — числами, без формул; удержания со знаком минус. */
export async function buildPivotXlsx(pivot: PayPivot, labels: PivotLabels): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "omni4";
  const sheet = book.addWorksheet(labels.sheet, { views: [{ state: "frozen", ySplit: 2, xSplit: 1 }] });
  const columns = [...pivot.accruals, ...pivot.deductions];
  const deduction = new Set(pivot.deductions.map((c) => c.id));
  const signed = (id: string, value: number) => (deduction.has(id) ? -value : value);
  const last = columns.length + 5;

  const head = (row: number, column: number, value: string) => {
    const cell = sheet.getCell(row, column);
    cell.value = value;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fill(cell, "FFE5ECF7");
  };
  const tall = (column: number, value: string) => {
    sheet.mergeCells(1, column, 2, column);
    head(1, column, value);
  };
  tall(1, labels.employee);
  tall(2, labels.dept);
  if (pivot.accruals.length) {
    sheet.mergeCells(1, 3, 1, 2 + pivot.accruals.length);
    head(1, 3, labels.accruals);
  }
  if (pivot.deductions.length) {
    sheet.mergeCells(1, 3 + pivot.accruals.length, 1, 2 + columns.length);
    head(1, 3 + pivot.accruals.length, labels.deductions);
  }
  columns.forEach((column, i) => head(2, 3 + i, column.name));
  tall(last - 2, labels.accrued);
  tall(last - 1, labels.deducted);
  tall(last, labels.net);

  pivot.rows.forEach((row) =>
    sheet.addRow([
      row.name,
      row.dept,
      ...columns.map((column) => signed(column.id, row.cells[column.id] ?? 0)),
      row.accrued,
      -row.deducted,
      row.accrued - row.deducted,
    ]),
  );
  const total = sheet.addRow([
    labels.total,
    "",
    ...columns.map((column) => signed(column.id, pivot.total.cells[column.id] ?? 0)),
    pivot.total.accrued,
    -pivot.total.deducted,
    pivot.total.accrued - pivot.total.deducted,
  ]);
  total.font = { bold: true };

  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 20;
  for (let column = 3; column <= last; column += 1) {
    sheet.getColumn(column).width = 16;
    sheet.getColumn(column).numFmt = "#,##0";
  }
  for (let row = 1; row <= sheet.rowCount; row += 1) borders(sheet, row, last);
  return book.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
