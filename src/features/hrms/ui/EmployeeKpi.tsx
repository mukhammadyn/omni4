import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightIcon, CheckIcon, MessageSquarePlusIcon, MessageSquareTextIcon, PlusIcon, RotateCcwIcon, TargetIcon } from "lucide-react";
import type { Item } from "@/features/item";
import { localized, optionOf, useTableSchema, type Field } from "@/features/table";
import { todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Chip, type ChipColor } from "@/shared/ui/chip";
import { CommitInput } from "@/shared/ui/commit-input";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { text } from "../api/org";
import {
  statusValues,
  METRICS,
  SCORECARDS,
  templatesFor,
  totalOf,
  useAddResult,
  useCreateScorecard,
  useEmployeeKpi,
  useMetrics,
  useUpdateActual,
  useUpdateResult,
  useUpdateScorecard,
  type Result,
} from "../api/kpi";
import { coefficientOf, completion, KPI_TYPES, NEXT_STATUS, lastPeriods, ratingOf, SCORECARD, scoreOf, typeOfRange, type KpiType, type Period } from "../model/kpi";
import { Segments } from "./schedule-parts";
import { Card } from "./page-parts";

/**
 * Подпись периода: год «2026», квартал «Q4 2026», месяц «окт. 2026»,
 * неделя «19.10 – 23.10». `long` — у месяца полное имя (заголовок курсора).
 */
export function usePeriodLabel() {
  const { i18n } = useTranslation();
  return (p: Period, long = false) => {
    const year = p.start.slice(0, 4);
    if (p.type === "yearly") return year;
    if (p.type === "daily")
      return `${new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(`${p.start}T00:00:00Z`))} ${p.start.slice(8, 10)}.${p.start.slice(5, 7)}`;
    if (p.type === "quarterly") return `Q${Math.floor((Number(p.start.slice(5, 7)) - 1) / 3) + 1} ${year}`;
    if (p.type === "monthly")
      return new Intl.DateTimeFormat(i18n.language, { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${p.start}T00:00:00Z`));
    const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
    return `${dm(p.start)} – ${dm(p.end)}`;
  };
}

export const RATING_COLOR: Record<string, ChipColor> = { exceeds: "green", meets: "blue", partial: "yellow", below: "red" };

/**
 * «KPI» сотрудника — `kpiTab()` прототипа (employee.html#kpi): карта
 * показателей за квартал, итог с рейтингом и коэффициентом бонуса,
 * динамика по кварталам, таблица с фактом и комментарий руководителя.
 */
export function EmployeeKpi({ employeeId, positionId, departmentId, language }: { employeeId: string; positionId: string; departmentId: string; language: string }) {
  const { t, i18n } = useTranslation();
  const { cards, results, isLoading, canEdit, canCreate } = useEmployeeKpi(employeeId);
  const { schema: cardSchema } = useTableSchema(SCORECARDS);
  const { schema: metricSchema } = useTableSchema(METRICS);
  const [type, setType] = useState<KpiType>("quarterly");
  const quarters = lastPeriods(type, todayInput(), 4);
  const [picked, setPicked] = useState(3);
  const periodLabel = usePeriodLabel();
  const [adding, setAdding] = useState(false);
  const updateCard = useUpdateScorecard();
  const updateResult = useUpdateResult();
  const updateActual = useUpdateActual();
  const create = useCreateScorecard();
  const metrics = useMetrics(canCreate);
  if (isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const label = (field: Field | undefined, value: string) => {
    const found = field && optionOf(field, value);
    return found ? localized(found.labels, language, found.label || found.value) : value;
  };
  const unitField = metricSchema.fields.find((f) => f.slug === "unit");
  const fmt = (value: number | null, unit: string) =>
    value == null ? "—" : `${value.toLocaleString(i18n.language)}${unit === "pcs" ? "" : ` ${label(unitField, unit)}`}`;
  const cardOf = (q: Period) =>
    cards.find((c) => text(c.period_start).slice(0, 10) === q.start && typeOfRange(text(c.period_start), text(c.period_end)) === q.type);
  const quarter = quarters[picked]!;
  const card = cardOf(quarter);
  const rows = card ? (results.get(text(card.guid)) ?? []) : [];
  const total = totalOf(rows);
  const rating = ratingOf(total);
  const approved = card?.status === SCORECARD.approved;
  const editable = canEdit && card && !approved;
  const cardId = text(card?.guid);
  const templates = templatesFor(metrics, positionId, departmentId, type);

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <small className="text-[13px] text-fg-subtle">
        {card ? `${label(cardSchema.fields.find((f) => f.slug === "status"), text(card.status))}` : t("kpi.noCard")}
      </small>
      <div className="flex flex-wrap items-center gap-2">
        <Segments
          value={type}
          onChange={(next) => (setType(next), setPicked(3))}
          items={KPI_TYPES.map((k) => ({ value: k, label: t(`kpi.typeShort.${k}`) }))}
        />
        <Tabs variant="segment" activeId={String(picked)} onSelect={(id) => setPicked(Number(id))} tabs={quarters.map((q, i) => ({ id: String(i), label: periodLabel(q) }))} />
      </div>
    </div>
  );

  if (!card)
    return (
      <Card icon={TargetIcon} title={t("kpi.title")}>
        {header}
        <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-fg-subtle">
          {t("kpi.empty", { quarter: periodLabel(quarter, true) })}
          {canCreate && (
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate({ employeeId, departmentId, period: quarter, metrics: templates })}
            >
              <Icon as={PlusIcon} size={14} />
              {t("kpi.create", { count: templates.length })}
            </Button>
          )}
        </div>
      </Card>
    );

  return (
    <Card icon={TargetIcon} title={t("kpi.title")}>
      {header}
      <div className="mb-4 grid gap-3 min-[900px]:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-lg border border-border p-4">
          {/* `.kpi-ring` прототипа: кольцо — conic-gradient по итогу. */}
          <div
            className="grid size-24 place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--color-accent) ${Math.min(100, total)}%, var(--color-surface-hover) 0)` }}
          >
            <div className="grid size-19 place-items-center rounded-full bg-surface text-xl font-semibold">{total}%</div>
          </div>
          <div className="flex flex-col items-start gap-1.5">
            <b className="text-sm">{t("kpi.total")}</b>
            <Chip color={RATING_COLOR[rating] ?? "gray"}>{label(cardSchema.fields.find((f) => f.slug === "rating"), rating)}</Chip>
            <small className="text-xs text-fg-subtle">
              {t("kpi.coefficient")} <b className="text-fg">×{coefficientOf(total).toFixed(1)}</b>
            </small>
          </div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 text-[12.5px] text-fg-subtle">{t("kpi.trend")}</div>
          <div className="flex h-24 items-end gap-3">
            {quarters.map((q, i) => {
              const c = cardOf(q);
              const value = c ? totalOf(results.get(text(c.guid)) ?? []) : 0;
              return (
                <button key={q.start} type="button" onClick={() => setPicked(i)} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span
                    className={`grid w-full max-w-16 place-items-start justify-center rounded-t-md pt-1 text-xs ${i === picked ? "bg-accent text-accent-fg" : "bg-surface-hover text-fg-muted"}`}
                    style={{ height: `${Math.max(18, Math.min(100, value / 1.2))}%` }}
                  >
                    {c ? `${value}%` : "—"}
                  </span>
                  <small className="text-xs text-fg-subtle">{periodLabel(q)}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-190 text-sm">
          <thead className="text-xs text-fg-subtle">
            <tr className="border-b border-border">
              <th className="py-2 text-left font-medium">{t("kpi.col.metric")}</th>
              <th className="w-20 py-2 text-right font-medium">{t("kpi.col.weight")}</th>
              <th className="w-32 py-2 text-right font-medium">{t("kpi.col.target")}</th>
              <th className="w-32 py-2 text-right font-medium">{t("kpi.col.actual")}</th>
              <th className="w-56 py-2 pl-4 text-left font-medium">{t("kpi.col.completion")}</th>
              <th className="w-22 py-2 text-right font-medium">{t("kpi.col.score")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = completion(r.target, r.actual, r.metric.direction);
              const cell = (slug: "weight" | "target" | "actual", value: number | null) =>
                /* Факт родителя собирается из дочерних — руками не вводится. */
                editable && !(slug === "actual" && r.aggregation) ? (
                  <CommitInput
                    label={t(`kpi.col.${slug}`)}
                    value={value == null ? "" : String(value)}
                    allowEmpty={slug === "actual"}
                    className="h-7 w-24 text-right"
                    onCommit={(next) => {
                      const value = next === "" ? null : Number(next);
                      if (slug === "actual") updateActual(r, value);
                      else updateResult.mutate({ guid: r.id, values: { [slug]: value } });
                    }}
                  />
                ) : slug === "weight" ? (
                  `${value ?? 0}%`
                ) : (
                  fmt(value, r.metric.unit)
                );
              return (
                <tr key={r.id} className="group/row border-b border-border">
                  <td className="py-2">
                    <span className="font-medium">{r.metric.name || "—"}</span>
                    {r.aggregation && (
                      <span title={t("kpi.fromChildren")} className="ml-1.5 rounded bg-surface-hover px-1 text-xs text-fg-subtle">
                        Σ {t(`kpi.agg.${r.aggregation}`)}
                      </span>
                    )}
                    {r.metric.direction === "down" && <span className="text-xs text-fg-subtle"> · {t("kpi.lessIsBetter")}</span>}
                  </td>
                  <td className="py-2 text-right">{cell("weight", r.weight)}</td>
                  <td className="py-2 text-right">
                    {!editable && r.metric.direction === "down" ? "≤ " : ""}
                    {cell("target", r.target)}
                  </td>
                  <td className="py-2 pr-2 text-right font-semibold">
                    <CommentCell result={r} canEdit={Boolean(editable)}>{cell("actual", r.actual)}</CommentCell>
                  </td>
                  <td className="py-2 pl-4">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                        <i
                          className={`block h-full ${pct >= 100 ? "bg-success" : pct < 70 ? "bg-danger" : "bg-accent"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </span>
                      <small className="w-10 text-right text-xs text-fg-subtle">{pct}%</small>
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold">{scoreOf(r.weight, pct).toFixed(1)}</td>
                </tr>
              );
            })}
            <tr className="bg-surface-hover font-semibold">
              <td className="px-2 py-2">{t("kpi.sum")}</td>
              <td className={`py-2 text-right ${rows.reduce((a, r) => a + r.weight, 0) === 100 ? "" : "text-danger"}`}>
                {rows.reduce((a, r) => a + r.weight, 0)}%
              </td>
              <td colSpan={3} />
              <td className="py-2 pr-2 text-right">{total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3.5 flex items-start gap-2 rounded-lg bg-surface-hover px-3 py-2.5 text-sm">
        <span>💬</span>
        <div className="flex-1">
          <b>{t("kpi.comment")}</b>
          {editable ? (
            <CommitInput
              label={t("kpi.comment")}
              value={text(card.comment)}
              allowEmpty
              className="mt-1 w-full"
              onCommit={(comment) => updateCard.mutate({ guid: cardId, values: { comment } })}
            />
          ) : (
            <p className="mt-0.5 text-fg-muted">{text(card.comment) || "—"}</p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {editable && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Icon as={PlusIcon} size={14} />
              {t("kpi.add")}
            </Button>
          )}
          <span className="flex-1" />
          {approved ? (
            <Button variant="secondary" onClick={() => updateCard.mutate({ guid: cardId, values: statusValues(SCORECARD.draft, total) })}>
              <Icon as={RotateCcwIcon} size={14} />
              {t("kpi.step.reopen")}
            </Button>
          ) : (
            <Button
              onClick={() => {
                const next = NEXT_STATUS[text(card.status)] ?? SCORECARD.self;
                updateCard.mutate(
                  { guid: cardId, values: statusValues(next, total) },
                  next === SCORECARD.approved ? { onSuccess: () => toast.success(t("kpi.approved", { quarter: periodLabel(quarter, true) })) } : {},
                );
              }}
            >
              <Icon as={NEXT_STATUS[text(card.status)] === SCORECARD.approved ? CheckIcon : ArrowRightIcon} size={14} />
              {t(`kpi.step.${NEXT_STATUS[text(card.status)] ?? SCORECARD.self}`)}
            </Button>
          )}
        </div>
      )}
      {adding && (
        <AddMetric
          card={cardId}
          metrics={metrics.filter((m) => !rows.some((r) => r.metric.id === text(m.guid)))}
          onClose={() => setAdding(false)}
        />
      )}
    </Card>
  );
}

/** «Добавить показатель» — `#kpiAdd` прототипа: шаблон, цель и вес. */
function AddMetric({ card, metrics, onClose }: { card: string; metrics: Item[]; onClose: () => void }) {
  const { t } = useTranslation();
  const add = useAddResult();
  const [metric, setMetric] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [weight, setWeight] = useState("");
  const pick = (id: string) => {
    const m = metrics.find((x) => text(x.guid) === id);
    setMetric(id);
    setTarget(text(m?.target));
    setWeight(text(m?.weight));
  };
  const submit = () =>
    add.mutate(
      { card, metric, target: Number(target) || 0, weight: Number(weight) || 0 },
      {
        onSuccess: () => {
          toast.success(t("kpi.added"));
          onClose();
        },
      },
    );
  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="text-xl font-semibold">{t("kpi.add")}</h2>
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          {t("kpi.col.metric")}
          <Dropdown
            value={metric}
            items={metrics
              .filter((m) => text(m.name).toLowerCase().includes(query.toLowerCase()))
              .map((m) => ({ value: text(m.guid), label: text(m.name) }))}
            search={query}
            onSearch={setQuery}
            onChange={pick}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
            {t("kpi.col.target")}
            <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
            {t("kpi.weightPercent")}
            <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={!metric || add.isPending} onClick={submit}>
            {t("kpi.add")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Статус карты в сводной: кнопка со статусом и меню шага — следующий
 * по порядку или «Вернуть в работу» у утверждённой. Без права правки —
 * просто подпись.
 */
export function StatusStep({ card, total, label, canEdit }: { card: { id: string; status: string }; total: number; label: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateScorecard();
  if (!canEdit) return <span className="text-xs text-fg-subtle">{label}</span>;
  const reopen = card.status === SCORECARD.approved;
  const next = NEXT_STATUS[card.status] ?? SCORECARD.self;
  return (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="rounded px-1 text-xs text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-fg">
          {label}
        </button>
      )}
    >
      {(close) => (
        <div className="p-1">
          <PopoverItem
            icon={<Icon as={reopen ? RotateCcwIcon : next === SCORECARD.approved ? CheckIcon : ArrowRightIcon} size={14} />}
            onClick={() => {
              update.mutate({ guid: card.id, values: statusValues(reopen ? SCORECARD.draft : next, total) });
              close();
            }}
          >
            {reopen ? t("kpi.step.reopen") : t(`kpi.step.${next}`)}
          </PopoverItem>
        </div>
      )}
    </Popover>
  );
}

/**
 * Заметка к ячейке факта — как в udevs_hrms_admin (comments.tsx), но
 * одна на строку за период: поле `comment` строки карты. Есть заметка —
 * метка в углу и текст при наведении; клик по метке — мини-редактор
 * у ячейки. Пишут обычно «почему недобор».
 */
export function CommentCell({ result, canEdit, children }: { result: Result; canEdit: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const update = useUpdateResult();
  const [text, setText] = useState(result.comment);
  if (!result.comment && !canEdit) return <>{children}</>;
  return (
    <span className="group/comment flex items-center justify-end gap-1" title={result.comment || undefined}>
      {/* Значок слева от значения: есть заметка — виден всегда и окрашен, нет — проступает при наведении на строку. */}
      <Popover
        align="end"
        className="shrink-0"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={() => (setText(result.comment), toggle())}
            aria-label={t("kpi.note.label")}
            title={result.comment || t("kpi.note.add")}
            className={`grid size-6 place-items-center rounded transition-opacity hover:bg-surface-hover ${
              result.comment ? "text-warning" : "text-fg-subtle opacity-40 group-hover/comment:opacity-100 group-hover/row:opacity-100"
            }`}
          >
            <Icon as={result.comment ? MessageSquareTextIcon : MessageSquarePlusIcon} size={14} />
          </button>
        )}
      >
        {(close) => (
          <div className="flex w-72 flex-col gap-2 p-2">
            <textarea
              autoFocus
              rows={3}
              value={text}
              readOnly={!canEdit}
              placeholder={t("kpi.note.placeholder")}
              onChange={(e) => setText(e.target.value)}
              className="w-full resize-none rounded-md border border-border-strong bg-input px-2.5 py-1.5 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent"
            />
            {canEdit && (
              <div className="flex justify-end gap-1.5">
                {result.comment && (
                  <Button size="sm" variant="ghost" onClick={() => (update.mutate({ guid: result.id, values: { comment: null } }), close())}>
                    {t("kpi.note.clear")}
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={text.trim() === result.comment}
                  onClick={() => (update.mutate({ guid: result.id, values: { comment: text.trim() || null } }), close())}
                >
                  {t("action.save")}
                </Button>
              </div>
            )}
          </div>
        )}
      </Popover>
      {children}
    </span>
  );
}
