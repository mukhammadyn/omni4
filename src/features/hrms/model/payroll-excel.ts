/**
 * Excel «Зарплаты» — шаблон ведомости и его загрузка, как в HRMS
 * (`udevs-hrms-reports`, methods/get-salary-excel-template.js и
 * import-salary-excel.js; кнопки — udevs_hrms_admin, modules/Finance/Salary).
 *
 * Раскладка, формулы и подсказки — как в HRMS: «Цена дня / часа» и «Оклад» —
 * формулы от ставки, нормы и отработанного (правка ставки в Excel пересчитает
 * оклад), «Количество опозданий» и старая формула «Опозданий» — от минут.
 * Цифры — арифметикой HRMS (`model/timesheet-salary`) по дням утверждённых
 * табелей, а где их нет — по посещаемости (ADR-0018, дополнение от 2026-10-28).
 *
 * Формат файла тот же: строка 5 — скрытые ключи колонок (`__user_guid`,
 * `__base_salary`, `income:<вид>`, `deduction:<вид>`), с 6-й — сотрудники.
 * Загрузка читает только ключи, поэтому подписи можно переводить.
 * Штрафы по политикам пишет «Утвердить», в шаблоне они только читаются
 * (`__auto_attendance_penalty`). Период — месяц или неделя пн–вс, тот, что
 * открыт в сводной; он записан в файл (`__period:<с>:<по>`), и загрузка
 * отказывает файлу другого периода.
 */
import ExcelJS from "exceljs";
import type { CalcMode } from "./payroll";
import type { PayUnit } from "./timesheet-days";
import { calculateSalaryRow, hourlyFactor, type SalaryInput } from "./timesheet-salary";

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

export type TemplateEmployee = {
  id: string;
  name: string;
  /** Вход HRMS за период; нет дней ни в табеле, ни в посещаемости — null. */
  input: SalaryInput | null;
  /** Штрафы по политикам, записанные «Утвердить», — в колонку `auto`, только чтение. */
  fines: number;
  /** Часть дней периода — из посещаемости: утверждённого табеля на них нет. */
  fromAttendance: boolean;
};

export type TemplateInput = {
  period: { from: string; to: string };
  /** Месячная ведомость или недельная — у HRMS `period.is_month`. */
  isMonth: boolean;
  mode: CalcMode;
  labels: TemplateLabels;
  employees: TemplateEmployee[];
  /** Виды без «Оклада»: он своей колонкой. */
  accruals: PayTypeColumn[];
  deductions: PayTypeColumn[];
  /** Вид удержаний табеля: штрафы (только чтение) или, при `legacy`, старая формула опозданий. */
  autoDeductionId: string;
  /** Политик штрафов в периоде нет — колонка вида удержаний несёт старую формулу и загружается. */
  legacy: boolean;
  /** Настройки старой формулы (`core_settings`). */
  lateness: { coefficient: number; grace: number };
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

/** Ведомость — раскладка, формулы и оформление шаблона HRMS (get-salary-excel-template.js). */
export async function buildTemplate(input: TemplateInput): Promise<ArrayBuffer> {
  const { labels, mode, employees, accruals, deductions, isMonth } = input;
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
  const lateCol = deductions.findIndex((type) => type.id === input.autoDeductionId);
  // Штрафы — только для чтения; старая формула (нет политик) — обычное удержание, его пишет загрузка.
  const autoCol = input.legacy ? -1 : lateCol;

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
  sheet.getCell(META_ROW, last + 1).value = `${META.period}${input.period.from}:${input.period.to}`;
  sheet.getRow(META_ROW).hidden = true;

  const kinds = new Set<string>();
  const hourlyRows: boolean[] = [];
  employees.forEach((employee, index) => {
    const r = DATA_ROW + index;
    const data = employee.input;
    sheet.getCell(r, 1).value = index + 1;
    sheet.getCell(r, 2).value = employee.id;
    sheet.getCell(r, 3).value = employee.name;
    for (let column = accrualsFrom; column < accruedCol; column += 1) sheet.getCell(r, column).value = 0;
    if (autoCol >= 0) sheet.getCell(r, deductionsFrom + autoCol).value = employee.fines;
    sheet.getCell(r, accruedCol).value = formula(`SUM(${letter(col.salary)}${r}:${letter(deductionsFrom - 1)}${r})`);
    sheet.getCell(r, deductedCol).value = formula(deductions.length ? `SUM(${letter(deductionsFrom)}${r}:${letter(accruedCol - 1)}${r})` : "0");
    sheet.getCell(r, netCol).value = formula(`${letter(accruedCol)}${r}-${letter(deductedCol)}${r}`);
    if (!data) {
      // Ни табеля, ни посещаемости за период — строка для премий, оклад 0.
      sheet.getCell(r, col.salary).value = 0;
      hourlyRows.push(false);
      borders(sheet, r, last);
      return;
    }

    const row = calculateSalaryRow(data, mode, isMonth);
    kinds.add(`${row.unit}:${row.rowHourly}`);
    hourlyRows.push(row.rowHourly);
    const salaryCell = `${letter(col.rate)}${r}`;
    const normCell = `${letter(col.norm)}${r}`;
    const workedCell = `${letter(col.worked)}${r}`;
    const priceCell = `${letter(col.price)}${r}`;
    // Клетка нормы — когда в ней та же норма, что у цены; иначе (табель без дней «вне работы») — число, чтобы Excel не пересчитал оклад иначе.
    const normRef = isMonth && row.workDays === row.monthNorm ? normCell : String(row.monthNorm);

    // Цена дня / часа — формула от ставки, как в HRMS: правка ставки в Excel пересчитает и цену, и оклад.
    const price = sheet.getCell(r, col.price);
    if (row.rowHourly && row.unit !== "hour") {
      price.value = formula(`IF(${normCell}>0,${salaryCell}${hourlyFactor(data, isMonth).excel}/${normCell},0)`, row.priceValue);
    } else if (row.unit === "day" || row.unit === "hour") {
      price.value = formula(salaryCell, row.priceValue);
    } else if (row.single) {
      price.value = formula(`IF(${normRef}>0,${salaryCell}/${normRef},0)`, row.priceValue);
    } else {
      const shares = row.shares.map(([credited, shifts]) => `${credited}/${shifts}`).join("+") || "0";
      price.value = formula(`IF(${workedCell}>0,${salaryCell}*(${shares})/${workedCell},0)`, row.priceValue);
    }
    sheet.getCell(r, col.salary).value = formula(`ROUND(${priceCell}*${workedCell},0)`, row.accruedValue);

    sheet.getCell(r, col.accrualType).value = row.rowHourly ? labels.hourly : labels.daily;
    sheet.getCell(r, col.payUnit).value = labels.unit[row.unit];
    sheet.getCell(r, col.rate).value = row.salaryMonth;
    sheet.getCell(r, col.norm).value = row.workDays;
    sheet.getCell(r, col.worked).value = row.workedDays;

    // Дни без ухода засчитаны целиком, у ставки за день и час — ещё и работа без смены: клетка жёлтая, даты в подсказке.
    const notes = [
      data.no_checkout.length > 0 && labels.noCheckout(data.no_checkout.join(", "), row.rowHourly),
      data.off_shift.length > 0 && labels.offShift(data.off_shift.join(", ")),
    ].filter(Boolean);
    if (notes.length) {
      const worked = sheet.getCell(r, col.worked);
      fill(worked, "FFFFEB3B");
      worked.note = notes.join("\n");
    }
    // Минуты опозданий — всегда; без смен в периоде клетка красная: норму минут взять неоткуда.
    const late = sheet.getCell(r, col.late);
    late.value = data.late_minutes;
    if (!data.has_work_schedule) fill(late, "FFFF0000");

    // Старая формула опозданий HRMS — только месячная ставка, дневной шаблон, есть смены, нет политик.
    if (input.legacy && lateCol >= 0) {
      const cell = sheet.getCell(r, deductionsFrom + lateCol);
      if (row.rowHourly || row.unit !== "month" || !data.has_work_schedule) cell.value = 0;
      else {
        const { coefficient, grace } = input.lateness;
        const workDaysRef = isMonth && row.workDays === data.month_work_days ? normCell : String(data.month_work_days);
        const minutes = data.month_work_days * data.daily_minutes;
        const result = minutes > 0 ? Math.round((row.salaryMonth / minutes) * Math.max(0, data.late_minutes - grace) * coefficient) : 0;
        cell.value = formula(
          `IF(AND(${workDaysRef}>0,${data.daily_minutes}>0),ROUND(${salaryCell}/(${workDaysRef}*${data.daily_minutes})*MAX(${letter(col.late)}${r}-${grace},0)*${coefficient},0),0)`,
          result,
        );
      }
    }

    borders(sheet, r, last);
    if (index % 2 === 0) {
      for (let column = 1; column <= last; column += 1) {
        if ((column === col.worked && notes.length) || (column === col.late && !data.has_work_schedule)) continue;
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
    cell.value = kinds.size > 1 && column <= col.worked ? null : employees.length ? formula(`SUM(${letter(column)}${DATA_ROW}:${letter(column)}${end})`) : 0;
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
