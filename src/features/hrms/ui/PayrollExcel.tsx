import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, LoaderCircleIcon, MoreHorizontalIcon, UploadIcon } from "lucide-react";
import type { Filters } from "@/features/item";
import { toast } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { useImportPayroll, usePayrollTemplate, usePayTypes } from "../api/payroll-excel";
import type { TemplateLabels } from "../model/payroll-excel";

type Range = { from: string; to: string };
const ru = (date: string) => date.split("-").reverse().join(".");

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
 * «…» сводной — «Скачать шаблон» и «Загрузить Excel» за открытый период
 * (месяц или неделю), как меню шаблона в «Зарплате» HRMS (udevs_hrms_admin,
 * Finance/Salary). Дневной или часовой — выбор при «Утвердить» табеля,
 * у шаблона его нет (ADR-0018).
 */
export function PayrollExcel({ range, title, where }: { range: Range; title: string; where: Filters }) {
  const { t } = useTranslation();
  const [building, setBuilding] = useState(false);
  const [importing, setImporting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const types = usePayTypes();
  const save = useImportPayroll();
  const busy = building || importing;

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    if (!/\.xls[xm]?$/i.test(picked.name)) return toast.error(t("payroll.xlsx.wrongFile"));
    setImporting(true);
    let mod: Awaited<ReturnType<typeof excel>> | undefined;
    try {
      mod = await excel();
      const parsed = await mod.parseImport(await picked.arrayBuffer(), types.kinds);
      // Файл другого периода записался бы в открытый — отказ, а не тихая запись не туда.
      if (parsed.period && (parsed.period.from !== range.from || parsed.period.to !== range.to)) {
        return toast.error(t("payroll.xlsx.otherPeriod", { period: `${ru(parsed.period.from)} – ${ru(parsed.period.to)}` }));
      }
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
            <PopoverItem
              icon={<Icon as={DownloadIcon} size={16} />}
              onClick={() => {
                close();
                setBuilding(true);
              }}
            >
              {t("payroll.xlsx.template")}
            </PopoverItem>
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
      {building && <TemplateJob range={range} title={title} where={where} onDone={() => setBuilding(false)} />}
    </>
  );
}

function TemplateJob({ range, title, where, onDone }: { range: Range; title: string; where: Filters; onDone: () => void }) {
  const { t } = useTranslation();
  const data = usePayrollTemplate(range, where);
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
      norm: t("payroll.xlsx.norm"),
      worked: t("payroll.xlsx.worked"),
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
      noTimesheet: t("payroll.xlsx.noTimesheet"),
    };
    void excel()
      .then(({ buildTemplate }) =>
        buildTemplate({
          period: range,
          labels,
          employees: data.employees,
          accruals: data.types.accruals,
          deductions: data.types.deductions,
          autoDeductionId: data.types.finesId,
        }),
      )
      .then((file) => {
        download(file, `salary-template-${range.from}_${range.to}.xlsx`);
        toast.success(t("payroll.xlsx.downloaded"));
      })
      .catch(() => toast.error(t("payroll.xlsx.downloadFailed")))
      .finally(onDone);
  }, [data, range, title, t, onDone]);

  return null;
}
