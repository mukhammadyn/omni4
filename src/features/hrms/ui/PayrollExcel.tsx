import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, LoaderCircleIcon, MoreHorizontalIcon, UploadIcon } from "lucide-react";
import type { Filters } from "@/features/item";
import { toast } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { useImportPayroll, usePayrollTemplate, usePayTypes } from "../api/payroll-excel";
import type { TemplateLabels, TemplateMode } from "../model/payroll-excel";

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
 * «…» сводной — «Скачать шаблон» (дневной, часовой) и «Загрузить Excel»,
 * как меню шаблона в «Зарплате» HRMS (udevs_hrms_admin, Finance/Salary).
 */
export function PayrollExcel({ month, title, where }: { month: string; title: string; where: Filters }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TemplateMode | null>(null);
  const [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const types = usePayTypes();
  const save = useImportPayroll();
  const busy = mode !== null || importing;

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.xls[xm]?$/i.test(picked.name)) return toast.error(t("payroll.xlsx.wrongFile"));
    setImporting(true);
    let mod: Awaited<ReturnType<typeof excel>> | undefined;
    try {
      mod = await excel();
      const parsed = await mod.parseImport(await picked.arrayBuffer(), { types: types.kinds, salaryTypeId: types.salaryId });
      const { inserted, unknownEmployee } = await save(month, parsed.records, t("payroll.xlsx.description", { period: title }));
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
                  setMode(value);
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
      {/* Данные шаблона грузятся, только пока он собирается. */}
      {mode && <TemplateJob month={month} title={title} where={where} mode={mode} onDone={() => setMode(null)} />}
    </>
  );
}

function TemplateJob({ month, title, where, mode, onDone }: { month: string; title: string; where: Filters; mode: TemplateMode; onDone: () => void }) {
  const { t } = useTranslation();
  const data = usePayrollTemplate(month, where);
  const started = useRef(false);

  useEffect(() => {
    if (data.loading || started.current) return;
    started.current = true;
    const labels: TemplateLabels = {
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
      accrued: t("payroll.accrued"),
      deducted: t("payroll.deducted"),
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
          mode,
          labels,
          employees: data.employees,
          accruals: data.types.accruals,
          deductions: data.types.deductions,
          autoDeductionId: data.types.finesId,
        }),
      )
      .then((file) => {
        download(file, `salary-template-${mode === "hourly" ? "hourly-" : ""}${month}.xlsx`);
        toast.success(t("payroll.xlsx.downloaded"));
      })
      .catch(() => toast.error(t("payroll.xlsx.downloadFailed")))
      .finally(onDone);
  }, [data, mode, month, title, t, onDone]);

  return null;
}
