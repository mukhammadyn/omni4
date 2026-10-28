import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, LoaderCircleIcon, MoreHorizontalIcon, UploadIcon } from "lucide-react";
import type { Filters } from "@/features/item";
import { localized, optionOf } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, hexToChipColor } from "@/shared/ui/chip";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { useImportPayroll, usePayrollTemplate, usePayTypes, useSheetChoices, useSheetTemplate, type SheetChoice } from "../api/payroll-excel";
import type { CalcMode } from "../model/payroll";
import type { PeriodKind } from "../model/timesheet-days";
import { monthName, weekName } from "../model/timesheet-docs";
import type { TemplateEmployee, TemplateLabels } from "../model/payroll-excel";

type Range = { from: string; to: string };

/* exceljs весит под мегабайт — грузится по первому нажатию, а не со сводной. */
const excel = () => import("../model/payroll-excel");

const download = (data: ArrayBuffer, name: string) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
};

/**
 * «…» сводной — «Скачать шаблон: дневной / часовой» и «Загрузить Excel», как
 * меню шаблона в «Зарплате» HRMS (udevs_hrms_admin, Finance/Salary). Шаблон —
 * по табелю, выбранному в окне (любой период и статус), или по посещаемости
 * открытого периода; загрузка пишет всегда в открытый период: шаблон сентября
 * можно загрузить в октябрь.
 */
export function PayrollExcel({ range, kind, title, where }: { range: Range; kind: PeriodKind; title: string; where: Filters }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<CalcMode | null>(null);
  const [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const types = usePayTypes();
  const save = useImportPayroll();
  const busy = importing;

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.xls[xm]?$/i.test(picked.name)) return toast.error(t("payroll.xlsx.wrongFile"));
    setImporting(true);
    let mod: Awaited<ReturnType<typeof excel>> | undefined;
    try {
      mod = await excel();
      const parsed = await mod.parseImport(await picked.arrayBuffer(), { types: types.kinds, salaryTypeId: types.salaryId });
      const { inserted, unknownEmployee } = await save(range, parsed.records, t("payroll.xlsx.description", { period: title }));
      const skipped = unknownEmployee + parsed.skipped.invalidEmployee + parsed.skipped.negative;
      if (inserted) toast.success(t("payroll.xlsx.imported", { count: inserted }) + (skipped ? ` ${t("payroll.xlsx.skipped", { count: skipped })}` : ""));
      else toast.success(t("payroll.xlsx.importedNone"));
    } catch (error) {
      // Битый архив и прочее — без текста библиотеки: он по-английски и не о том.
      toast.error(t(mod && error instanceof mod.TemplateError ? "payroll.xlsx.badTemplate" : "payroll.xlsx.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Popover
        align="end"
        trigger={({ toggle }) => (
          <button
            type="button"
            disabled={busy || types.loading}
            onClick={toggle}
            aria-label={t("payroll.xlsx.menu")}
            title={t("payroll.xlsx.menu")}
            className="grid size-7 place-items-center rounded-md border border-border text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-default"
          >
            <Icon as={busy ? LoaderCircleIcon : MoreHorizontalIcon} size={14} className={busy ? "animate-spin" : ""} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-60">
            {(["daily", "hourly"] as const).map((value) => (
              <PopoverItem
                key={value}
                icon={<Icon as={DownloadIcon} size={16} />}
                onClick={() => {
                  close();
                  setDialog(value);
                }}
              >
                {t(`payroll.xlsx.template.${value}`)}
              </PopoverItem>
            ))}
            <PopoverSeparator />
            <PopoverItem
              icon={<Icon as={UploadIcon} size={16} />}
              onClick={() => {
                close();
                file.current?.click();
              }}
            >
              {t("payroll.xlsx.upload")}
            </PopoverItem>
          </div>
        )}
      </Popover>
      <input
        ref={file}
        type="file"
        hidden
        accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {dialog && <TemplateDialog range={range} kind={kind} title={title} where={where} mode={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

/**
 * Окно «Скачать шаблон»: из какого табеля. Сразу выбран табель открытого
 * периода (компании, иначе любой за тот же период), нет такого — посещаемость.
 */
function TemplateDialog({
  range,
  kind,
  title,
  where,
  mode,
  onClose,
}: {
  range: Range;
  kind: PeriodKind;
  title: string;
  where: Filters;
  mode: CalcMode;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { loading, sheets, status } = useSheetChoices();
  // null — не выбирали: табель открытого периода.
  const [choice, setChoice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const same = sheets.filter((sheet) => sheet.from === range.from && sheet.kind === kind);
  const value = choice ?? (same.find((sheet) => !sheet.departmentId) ?? same[0])?.guid ?? "";
  const picked = sheets.find((sheet) => sheet.guid === value);
  const items = [
    { value: "", label: t("payroll.xlsx.fromAttendanceChoice", { period: title }) },
    ...sheets.map((sheet) => {
      const option = status && optionOf(status, sheet.status);
      return {
        value: sheet.guid,
        label: option ? `${sheet.title} · ${localized(option.labels, i18n.language, option.label || option.value)}` : sheet.title,
        icon: <span className={`size-1.5 rounded-full ${CHIP_DOT[hexToChipColor(option?.color ?? "")]}`} />,
      };
    }),
  ];
  // Окно не закрывается, пока шаблон собирается: закрытие оборвало бы его молча.
  const close = () => !running && onClose();

  return (
    <Modal onClose={close}>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal">
        <h2 className="text-lg font-semibold">{t(`payroll.xlsx.template.${mode}`)}</h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-fg-muted">{t("payroll.xlsx.sheetChoice")}</span>
          <Dropdown value={value} items={items} disabled={loading || running} ariaLabel={t("payroll.xlsx.sheetChoice")} onChange={setChoice} />
        </label>
        <p className="text-sm text-fg-muted">{t(picked ? "payroll.xlsx.sheetHint" : "payroll.xlsx.attendanceHint")}</p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={loading || running} onClick={() => setRunning(true)}>
            {running && <Icon as={LoaderCircleIcon} size={14} className="animate-spin" />}
            {t("payroll.xlsx.download")}
          </Button>
        </div>
      </div>
      {/* Данные шаблона грузятся, только пока он собирается. */}
      {running &&
        (picked ? (
          <SheetJob sheet={picked} where={where} mode={mode} onDone={onClose} />
        ) : (
          <AttendanceJob range={range} kind={kind} title={title} where={where} mode={mode} onDone={onClose} />
        ))}
    </Modal>
  );
}

type JobData = {
  loading: boolean;
  employees: TemplateEmployee[];
  legacy: boolean;
  lateness: { coefficient: number; grace: number };
  types: ReturnType<typeof usePayTypes>;
};

function AttendanceJob({ range, kind, title, where, mode, onDone }: { range: Range; kind: PeriodKind; title: string; where: Filters; mode: CalcMode; onDone: () => void }) {
  const data = usePayrollTemplate(range, kind, where);
  return <TemplateJob data={data} range={range} kind={kind} title={title} mode={mode} onDone={onDone} />;
}

function SheetJob({ sheet, where, mode, onDone }: { sheet: SheetChoice; where: Filters; mode: CalcMode; onDone: () => void }) {
  const { i18n } = useTranslation();
  const data = useSheetTemplate(sheet, where);
  const title = sheet.kind === "month" ? monthName(sheet.from.slice(0, 7), i18n.language) : weekName(sheet.from, i18n.language);
  return <TemplateJob data={data} range={sheet} kind={sheet.kind} title={title} mode={mode} onDone={onDone} />;
}

function TemplateJob({
  data,
  range,
  kind,
  title,
  mode,
  onDone,
}: {
  data: JobData;
  range: Range;
  kind: PeriodKind;
  title: string;
  mode: CalcMode;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const started = useRef(false);

  useEffect(() => {
    if (data.loading || started.current) return;
    started.current = true;
    const labels: TemplateLabels = {
      sheet: t("payroll.xlsx.sheet"),
      title: t("payroll.xlsx.title"),
      period: t("payroll.xlsx.period", { period: title }),
      index: "№",
      guid: "USER GUID",
      employee: t("payroll.xlsx.employee"),
      accrualType: t("payroll.xlsx.accrualType"),
      payUnit: t("payroll.xlsx.payUnit"),
      salaryGroup: t("payroll.xlsx.salaryGroup"),
      rate: t("payroll.xlsx.rate"),
      price: t("payroll.xlsx.price"),
      norm: t("payroll.xlsx.norm"),
      worked: t("payroll.xlsx.worked"),
      lateMinutes: t("payroll.xlsx.lateMinutes"),
      accruals: t("payroll.xlsx.accruals"),
      salary: t("payroll.xlsx.salary"),
      deductions: t("payroll.deductions"),
      accrued: t("payroll.xlsx.accrued"),
      deducted: t("payroll.xlsx.deducted"),
      net: t("payroll.net"),
      total: t("payroll.xlsx.total"),
      daily: t("payroll.xlsx.daily"),
      hourly: t("payroll.xlsx.hourly"),
      unit: {
        month: t("payroll.xlsx.unit.month"),
        week: t("payroll.xlsx.unit.week"),
        day: t("payroll.xlsx.unit.day"),
        hour: t("payroll.xlsx.unit.hour"),
      },
      noCheckout: (dates, hourly) => t(hourly ? "payroll.xlsx.noCheckoutHours" : "payroll.xlsx.noCheckoutDays", { dates }),
      offShift: (dates) => t("payroll.xlsx.offShift", { dates }),
    };
    void excel()
      .then(({ buildTemplate }) =>
        buildTemplate({
          period: { from: range.from, to: range.to },
          isMonth: kind === "month",
          mode,
          lateness: data.lateness,
          labels,
          employees: data.employees,
          accruals: data.types.accruals,
          deductions: data.types.deductions,
          autoDeductionId: data.types.finesId,
          legacy: data.legacy,
        }),
      )
      .then((file) => {
        download(file, `salary-template-${mode === "hourly" ? "hourly-" : ""}${range.from}_${range.to}.xlsx`);
        toast.success(t("payroll.xlsx.downloaded"));
        // Утверждённого табеля на часть дней нет — цифры этих людей из посещаемости (как HRMS); сказать об этом.
        const live = data.employees.filter((employee) => employee.fromAttendance).length;
        if (live) toast.warning(t("payroll.xlsx.fromAttendance", { count: live }));
      })
      .catch(() => toast.error(t("payroll.xlsx.downloadFailed")))
      .finally(onDone);
  }, [data, range, mode, title, t, onDone]);

  return null;
}
