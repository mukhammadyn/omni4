import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2Icon, CodeIcon, GraduationCapIcon, HandshakeIcon, MessagesSquareIcon, PlusIcon, ShieldCheckIcon, UsersIcon, WrenchIcon, type LucideIcon } from "lucide-react";
import { useTablePermissions } from "@/features/auth";
import { localized, optionOf, useTableSchema, type Field } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { Chip, CHIP_HEX, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Tabs } from "@/shared/ui/tabs";
import { related, text } from "../api/org";
import { PARTICIPANTS, TRAININGS, useAssignTraining, useEmployeeTrainings, useTrainingOptions } from "../api/training";
import { plusDays } from "../model/timesheet";
import { Card } from "./page-parts";

/** Статус участия (`participant_status`) → цвет; порядок — фильтр `TRS` прототипа. */
const STATUS_COLOR: Record<string, ChipColor> = { completed: "green", in_progress: "blue", assigned: "gray", overdue: "red" };
/** Обложка карточки — по категории тренинга. */
const CATEGORY_COLOR: Record<string, ChipColor> = {
  mandatory: "red",
  onboarding: "blue",
  hard_skills: "purple",
  soft_skills: "yellow",
  sales: "green",
  management: "orange",
  tools: "brown",
};

/** Значок обложки — по категории, как `ic` у тренингов прототипа. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  mandatory: ShieldCheckIcon,
  onboarding: Building2Icon,
  hard_skills: CodeIcon,
  soft_skills: MessagesSquareIcon,
  sales: HandshakeIcon,
  management: UsersIcon,
  tools: WrenchIcon,
};

/**
 * «Тренинги» сотрудника — `trainTab()` прототипа (employee.html#train):
 * KPI, фильтр по статусу и карточки с прогрессом. Карточка ведёт
 * на страницу тренинга.
 */
export function EmployeeTrainings({
  employeeId,
  locale,
  language,
  onOpenTraining,
}: {
  employeeId: string;
  locale: string;
  language: string;
  onOpenTraining: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const { participants, isLoading } = useEmployeeTrainings(employeeId);
  const { schema } = useTableSchema(TRAININGS);
  const { schema: participantSchema } = useTableSchema(PARTICIPANTS);
  const [filter, setFilter] = useState("");
  const [assigning, setAssigning] = useState(false);
  const canAssign = useTablePermissions()(PARTICIPANTS).write;
  if (isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const label = (field: Field | undefined, value: string) => {
    const found = field && optionOf(field, value);
    return found ? localized(found.labels, language, found.label || found.value) : value;
  };
  const statusField = participantSchema.fields.find((f) => f.slug === "status");
  const categoryField = schema.fields.find((f) => f.slug === "category");
  const progress = (p: (typeof participants)[number]) =>
    p.status === "completed" ? 100 : Math.min(100, Math.max(0, Number(p.progress_percent) || 0));
  const hours = (p: (typeof participants)[number]) => Number(related(p, "hr_trainings_id").hours) || 0;
  const done = participants.filter((p) => p.status === "completed");
  const kpis = [
    [t("employeeTrainings.kpi.completed"), t("employeeTrainings.ofTotal", { done: done.length, total: participants.length })],
    [t("employeeTrainings.kpi.inProgress"), participants.filter((p) => p.status === "in_progress").length],
    [t("employeeTrainings.kpi.hours"), t("employeeTrainings.hours", { count: Math.round(participants.reduce((a, p) => a + (hours(p) * progress(p)) / 100, 0)) })],
    [t("employeeTrainings.kpi.certificates"), done.filter((p) => related(p, "hr_trainings_id").category !== "onboarding").length],
  ] as const;
  const list = participants.filter((p) => !filter || p.status === filter);

  return (
    <Card icon={GraduationCapIcon} title={t("training.back")} count={participants.length}>
      <div className="mb-3 grid grid-cols-2 gap-2 min-[900px]:grid-cols-4">
        {kpis.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border px-3 py-2.5">
            <div className="text-xs text-fg-subtle">{k}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs
          variant="segment"
          activeId={filter}
          onSelect={setFilter}
          tabs={[{ id: "", label: t("employeeTrainings.all") }, ...Object.keys(STATUS_COLOR).map((s) => ({ id: s, label: label(statusField, s) }))]}
        />
        {canAssign && (
          <Button size="sm" onClick={() => setAssigning(true)}>
            <Icon as={PlusIcon} size={14} />
            {t("employeeTrainings.assign")}
          </Button>
        )}
      </div>
      {list.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {list.map((p) => {
            const training = related(p, "hr_trainings_id");
            const category = text(training.category);
            const status = text(p.status);
            const pct = progress(p);
            const hex = CHIP_HEX[CATEGORY_COLOR[category] ?? "blue"];
            const due = formatDate(text(p.due_date) || text(training.ends_at), "date", locale);
            const meta = [text(training.provider), training.hours ? t("employeeTrainings.hours", { count: Number(training.hours) }) : ""].filter(Boolean);
            return (
              <button
                key={text(p.guid)}
                type="button"
                onClick={() => onOpenTraining(text(p.hr_trainings_id))}
                className="flex flex-col overflow-hidden rounded-[10px] bg-surface text-left ring-1 ring-border ring-inset transition-shadow hover:shadow-raised"
              >
                {/* `.tr-cover`: цвет категории — значение палитры чипов, а не тема; текст поверх — белый в обеих темах. */}
                <div
                  className="flex h-21 items-start justify-between p-3 text-white"
                  style={{ background: `linear-gradient(135deg, ${hex}, ${hex}bb)` }}
                >
                  <Icon as={CATEGORY_ICON[category] ?? GraduationCapIcon} size={30} />
                  {category && (
                    <span className="rounded bg-white/90 px-1.5 py-0.5 text-xs text-[#37352f]">{label(categoryField, category)}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3">
                  <b className="text-[14.5px] leading-[1.35] font-semibold">{text(training.title) || "—"}</b>
                  {meta.length > 0 && <small className="text-xs text-fg-subtle">{meta.join(" · ")}</small>}
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                      <i
                        className={`block h-full ${pct >= 100 ? "bg-success" : status === "overdue" ? "bg-danger" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <small className="text-xs text-fg-subtle">{pct}%</small>
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-1.5 pt-1">
                    <Chip color={STATUS_COLOR[status] ?? "gray"} dot>
                      {label(statusField, status)}
                    </Chip>
                    {due && (
                      <span className="text-[12.5px] text-fg-subtle">
                        {t(status === "completed" ? "employeeTrainings.completedAt" : "employeeTrainings.due", { date: due })}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-fg-subtle">{t("employeeTrainings.none")}</p>
      )}
      {assigning && (
        <AssignDialog
          employeeId={employeeId}
          taken={new Set(participants.map((p) => text(p.hr_trainings_id)))}
          locale={locale}
          onClose={() => setAssigning(false)}
        />
      )}
    </Card>
  );
}

/** «Назначить тренинг» — `#trAdd` прототипа: тренинг и срок. Уже назначенные не предлагаются. */
function AssignDialog({ employeeId, taken, locale, onClose }: { employeeId: string; taken: Set<string>; locale: string; onClose: () => void }) {
  const { t } = useTranslation();
  const options = useTrainingOptions(true).filter((o) => !taken.has(o.id));
  const assign = useAssignTraining();
  const [training, setTraining] = useState("");
  const [due, setDue] = useState(plusDays(todayInput(), 45));
  const [query, setQuery] = useState("");
  const chosen = options.find((o) => o.id === training);
  const submit = () => {
    if (!chosen) return;
    assign.mutate(
      { training: chosen.id, employee: employeeId, homework: chosen.homework, due },
      {
        onSuccess: () => {
          toast.success(t("employeeTrainings.assigned"));
          onClose();
        },
      },
    );
  };
  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="text-xl font-semibold">{t("employeeTrainings.assign")}</h2>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          {t("employeeTrainings.training")}
          <Dropdown
            value={training}
            items={options.filter((o) => o.title.toLowerCase().includes(query.toLowerCase())).map((o) => ({ value: o.id, label: o.title }))}
            search={query}
            onSearch={setQuery}
            emptyText={t("employeeTrainings.none")}
            onChange={setTraining}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          {t("employeeTrainings.dueLabel")}
          <DatePicker value={due} locale={locale} onChange={setDue} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={!chosen || assign.isPending} onClick={submit}>
            {t("employeeTrainings.assign")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
