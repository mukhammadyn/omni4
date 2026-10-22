import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, InfoIcon } from "lucide-react";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { useApplyTemplate, useEmployeeDaysOff, useEmployeesById, useScheduleDirectory, useTemplates, type ScheduleEmployee } from "../api/schedule";
import { draftsOfTemplate, expandTemplate, weekMinutesOf } from "../model/schedule";
import { plusDays } from "../model/timesheet";
import { DialogLoading, Row, TemplatePreview, templateDot, useDuration, useTemplateSummary } from "./schedule-parts";
import { EmployeePicker } from "./ShiftDialog";

/**
 * «Применить шаблон» — `applyModal` прототипа: шаблон, сотрудники,
 * период и филиал; смены создаются по шаблону одной серией, шаблон
 * встаёт в карточку сотрудника. «Заменить существующие» снимает прежние
 * смены сотрудников в периоде; «Сдвигать цикл» — у сменного цикла
 * на нескольких, чтобы смены перекрывали друг друга.
 */
type Props = { templateId?: string; employeeIds?: string[]; onClose: () => void };

/** Шаблон и филиал по умолчанию берутся из карточки первого сотрудника — ждём её. */
export function ApplyTemplateDialog(props: Props) {
  const first = useEmployeesById(props.employeeIds?.slice(0, 1) ?? []);
  if (first.loading) return <DialogLoading onClose={props.onClose} />;
  return <ApplyForm {...props} first={first.employees[0]} />;
}

function ApplyForm({ templateId, employeeIds = [], first, onClose }: Props & { first: ScheduleEmployee | undefined }) {
  const { t, i18n } = useTranslation();
  const duration = useDuration();
  const summary = useTemplateSummary();
  const { templates } = useTemplates();
  const { locations } = useScheduleDirectory();
  const apply = useApplyTemplate();
  const today = todayInput();
  const [form, setForm] = useState({
    templateId: templateId ?? first?.templateId ?? "",
    employeeIds,
    from: plusDays(today, 1),
    to: `${today.slice(0, 4)}-12-31`,
    locationId: first?.locationId ?? "",
    replace: true,
    offset: true,
  });
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));
  const template = templates.find((item) => item.id === form.templateId) ?? templates[0];
  const { of: holidays, loading: holidaysLoading } = useEmployeeDaysOff(form.employeeIds, form.from, form.to);
  // Должность каждого — в его смены; только выбранные, а не вся компания.
  const chosen = useEmployeesById(form.employeeIds);
  const weeks = Math.max(1, Math.round((Date.parse(form.to) - Date.parse(form.from)) / 864e5 / 7));
  const cycle = template?.type === "cycle" && form.employeeIds.length > 1;

  const days = useMemo(
    () =>
      template && form.employeeIds.length && form.from <= form.to
        ? expandTemplate(template, form.employeeIds, { from: form.from, to: form.to, holidays, offset: cycle && form.offset })
        : [],
    [template, form.employeeIds, form.from, form.to, form.offset, cycle, holidays],
  );

  const submit = () => {
    if (!template) return;
    if (!form.employeeIds.length) return toast.error(t("shift.needEmployees"));
    if (form.to < form.from) return toast.error(t("apply.badPeriod"));
    // Прошлое — норма табеля: «Заменить» сняло бы прошлые смены, а новые легли бы задним числом.
    if (form.from < today) return toast.error(t("apply.pastFrom"));
    const positions = new Map(chosen.employees.map((item) => [item.id, item.positionId]));
    const add = draftsOfTemplate(template, days, {
      seriesId: crypto.randomUUID(),
      locationId: form.locationId,
      positionOf: (id) => positions.get(id) ?? "",
    });
    apply.mutate(
      { templateId: template.id, employeeIds: form.employeeIds, from: form.from, to: form.to, replace: form.replace, add },
      {
        onSuccess: () => {
          toast.success(t("apply.done", { name: template.name, people: form.employeeIds.length, shifts: add.length }));
          onClose();
        },
      },
    );
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-xl font-semibold">{t("apply.title")}</h2>
          <p className="mt-0.5 text-[13.5px] text-fg-subtle">{t("apply.subtitle")}</p>
        </div>

        <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-4">
          <Row label={t("apply.template")}>
            <div className="grid grid-cols-2 gap-1.5">
              {templates.map((item) => {
                const on = item.id === template?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => set({ templateId: item.id })}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      on ? "bg-accent-subtle ring-2 ring-accent ring-inset" : "ring-1 ring-border ring-inset hover:bg-surface-hover"
                    }`}
                  >
                    <span className={`size-3 shrink-0 rounded-full ${templateDot(item)}`} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-semibold">{item.name}</b>
                      <small className="block truncate text-[11.5px] text-fg-subtle">{summary(item)}</small>
                    </span>
                    {on && <Icon as={CheckIcon} size={14} className="shrink-0 text-accent-text" />}
                  </button>
                );
              })}
            </div>
          </Row>
          {template && <TemplatePreview template={template} />}

          <Row label={t("shift.employees")}>
            <EmployeePicker value={form.employeeIds} onChange={(ids) => set({ employeeIds: ids })} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label={t("apply.from")}>
              <DatePicker value={form.from} locale={i18n.language} className="h-(--spacing-input) w-full" onChange={(from) => from && set({ from })} />
            </Row>
            <Row label={t("apply.to")}>
              <DatePicker value={form.to} locale={i18n.language} className="h-(--spacing-input) w-full" onChange={(to) => to && set({ to })} />
            </Row>
          </div>
          <Row label={t("shift.location")}>
            <Dropdown
              value={form.locationId}
              items={[{ value: "", label: "—" }, ...locations.map((item) => ({ value: item.id, label: item.name }))]}
              onChange={(locationId) => set({ locationId })}
            />
          </Row>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox checked={form.replace} onChange={() => set({ replace: !form.replace })} />
            {t("apply.replace")}
          </label>
          {cycle && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
              <Checkbox checked={form.offset} onChange={() => set({ offset: !form.offset })} />
              {t("apply.offset")}
            </label>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-surface-hover px-3 py-2.5 text-[13px]">
            <Icon as={InfoIcon} size={15} className="shrink-0 text-fg-subtle" />
            <span>
              {form.employeeIds.length && template
                ? t("apply.summary", {
                    people: form.employeeIds.length,
                    weeks,
                    perWeek: duration(weekMinutesOf(template)),
                    shifts: days.length,
                  })
                : t("shift.pickEmployees")}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button onClick={submit} disabled={apply.isPending || holidaysLoading || chosen.loading || !template}>
            <Icon as={CheckIcon} size={14} />
            {apply.isPending ? t("common.saving") : t("template.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
