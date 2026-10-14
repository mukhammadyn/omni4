import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClockIcon, CoffeeIcon, CopyIcon, InfoIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Avatar, useItemCounts, type Filters } from "@/features/item";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { SHIFTS, useDeleteTemplate, useSaveTemplate, useScheduleEmployees, useTemplates } from "../api/schedule";
import { weekMinutesOf, type Template } from "../model/schedule";
import { plusDays } from "../model/timesheet";
import { TemplatePreview, templateDot, useDuration, useTemplateSummary } from "./schedule-parts";

/**
 * «Шаблоны» графика работы (`tplView` прототипа, schedule.html): карточка
 * на шаблон — неделя или цикл клетками, часы в неделю, перерыв, кто на
 * нём (шаблон в карточке сотрудника), «Изменить» и «Применить».
 *
 * Удалить шаблон нельзя, пока по нему есть смены впереди: они остались бы
 * сиротами, а применить другой — дело одного окна. Сделан под
 * `hr_work_schedules` (FIXED_VIEW_TYPES).
 */
export function WorkSchedules({
  onEdit,
  onApply,
}: {
  /** Окно шаблона; без шаблона — новый. */
  onEdit?: (template?: Template) => void;
  onApply?: (template: Template) => void;
}) {
  const { t } = useTranslation();
  const { templates, loading } = useTemplates();
  const { employees } = useScheduleEmployees();
  const duration = useDuration();
  const summary = useTemplateSummary();
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const [deleting, setDeleting] = useState<Template | null>(null);

  const today = todayInput();
  const future = useItemCounts(
    SHIFTS,
    templates.map((template): Filters => ({
      hr_work_schedules_id: { op: "any", values: [template.id] },
      date: { op: "after", values: [plusDays(today, -1)] },
    })),
    "",
  );
  const usedBy = useMemo(() => {
    const index = new Map<string, typeof employees>();
    for (const employee of employees) if (employee.templateId) index.set(employee.templateId, [...(index.get(employee.templateId) ?? []), employee]);
    return index;
  }, [employees]);

  const duplicate = (template: Template) =>
    save.mutate(
      { ...template, id: "", dayIds: [], name: t("template.copyName", { name: template.name }) },
      { onSuccess: () => toast.success(t("template.copied")) },
    );
  const askDelete = (template: Template, index: number) => {
    if (future[index]) return toast.error(t("template.inUse", { count: future[index] }));
    setDeleting(template);
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
      <p className="mt-3.5 flex items-center gap-1.5 text-[13px] text-fg-subtle">
        <Icon as={InfoIcon} size={14} />
        {t("template.intro")}
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5 py-4">
          {templates.map((template, index) => {
            const used = usedBy.get(template.id) ?? [];
            return (
              <div key={template.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface px-4 py-3.5 transition-shadow hover:shadow-raised">
                <div className="flex items-center gap-2.5">
                  <span className={`size-3 shrink-0 rounded-full ${templateDot(template)}`} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] font-semibold">{template.name || "—"}</b>
                    <small className="text-[12.5px] text-fg-subtle">
                      {t(`template.type.${template.type}`)} · {summary(template)}
                    </small>
                  </div>
                  <Popover
                    align="end"
                    trigger={({ toggle }) => (
                      <button type="button" onClick={toggle} aria-label={t("template.menu")} className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover">
                        <Icon as={MoreHorizontalIcon} size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {onApply && (
                          <PopoverItem icon={<Icon as={UsersIcon} size={15} />} onClick={() => {
                            close();
                            onApply(template);
                          }}>
                            {t("template.applyTo")}
                          </PopoverItem>
                        )}
                        {onEdit && (
                          <PopoverItem icon={<Icon as={PencilIcon} size={15} />} onClick={() => {
                            close();
                            onEdit(template);
                          }}>
                            {t("action.edit")}
                          </PopoverItem>
                        )}
                        <PopoverItem icon={<Icon as={CopyIcon} size={15} />} onClick={() => {
                            close();
                            duplicate(template);
                          }}>
                          {t("template.duplicate")}
                        </PopoverItem>
                        <PopoverSeparator />
                        <PopoverItem danger icon={<Icon as={Trash2Icon} size={15} />} onClick={() => {
                            close();
                            askDelete(template, index);
                          }}>
                          {t("action.delete")}
                        </PopoverItem>
                      </>
                    )}
                  </Popover>
                </div>

                <TemplatePreview template={template} />

                <div className="flex gap-3.5 text-[12.5px] text-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon as={ClockIcon} size={13} className="text-fg-subtle" />
                    {t("template.perWeek", { hours: duration(weekMinutesOf(template)) })}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon as={CoffeeIcon} size={13} className="text-fg-subtle" />
                    {template.breakMinutes ? t("template.break", { minutes: template.breakMinutes }) : t("template.noBreak")}
                  </span>
                </div>
                {template.description && <p className="text-[13px] text-fg-muted">{template.description}</p>}

                <div className="mt-auto flex items-center gap-2 border-t border-border pt-2.5">
                  <span className="flex pl-1">
                    {used.slice(0, 4).map((employee) => (
                      <span key={employee.id} className="-ml-1 rounded-full ring-2 ring-surface">
                        <Avatar name={employee.name} photo={employee.photo || undefined} size="md" />
                      </span>
                    ))}
                  </span>
                  <span className="text-[12.5px] whitespace-nowrap text-fg-subtle">
                    {used.length ? t("schedule.employees", { count: used.length }) : t("template.unused")}
                  </span>
                  <span className="flex-1" />
                  {onEdit && (
                    <Button size="sm" variant="secondary" onClick={() => onEdit(template)}>
                      <Icon as={PencilIcon} size={13} />
                      {t("action.edit")}
                    </Button>
                  )}
                  {onApply && (
                    <Button size="sm" onClick={() => onApply(template)}>
                      {t("template.apply")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit()}
              className="flex min-h-[220px] flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-border-strong text-fg-muted transition-colors hover:border-accent hover:bg-accent-subtle hover:text-accent-text"
            >
              <Icon as={PlusIcon} size={22} />
              <b className="text-sm font-semibold">{t("template.new")}</b>
              <small className="text-xs text-fg-subtle">{t("template.newHint")}</small>
            </button>
          )}
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title={t("template.deleteTitle", { name: deleting.name })}
          description={t("template.deleteText")}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onConfirm={() =>
            remove.mutate(deleting, {
              onSuccess: () => {
                toast.success(t("template.deleted"));
                setDeleting(null);
              },
            })
          }
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
