import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import { Avatar } from "@/features/item";
import { Popover } from "@/shared/ui/popover";
import { localized, useTableSchema } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { cardKey, METRICS, templatesFor, useAddKpi, useCardsOfPeriods, useMetrics, type KpiEmployee } from "../api/kpi";
import { AGGREGATIONS, childPeriods, KPI_TYPES, periodOf, shiftPeriod, splitTarget, type Aggregation, type KpiType, type Period } from "../model/kpi";
import { Checkbox } from "@/shared/ui/checkbox";
import { NavButton } from "./BudgetSheet";
import { usePeriodLabel } from "./EmployeeKpi";
import { Segments } from "./schedule-parts";

export type KpiDraftSeed = { positionId?: string; employeeIds?: string[]; period?: Period };

/**
 * «Добавить KPI» — модалка модуля KPI udevs_hrms_admin, урезанная
 * до нашей схемы: должность → её сотрудники, название, квартал,
 * цель, вес, единица и направление. Дерева дочерних KPI, источника,
 * вознаграждения и описания в схеме нет — их нет и здесь.
 */
export function AddKpiDialog({
  employees,
  seed,
  onClose,
}: {
  employees: KpiEmployee[];
  seed: KpiDraftSeed;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { schema } = useTableSchema(METRICS);
  const add = useAddKpi();
  const metrics = useMetrics(true);
  const ofPosition = (id: string) => employees.filter((e) => e.positionId === id);
  const [draft, setDraft] = useState({
    positionId: seed.positionId ?? "",
    employeeIds: seed.employeeIds ?? (seed.positionId ? ofPosition(seed.positionId).map((e) => e.id) : []),
    name: "",
    target: "",
    weight: "",
    unit: "pcs",
    direction: "up",
  });
  const [positionQuery, setPositionQuery] = useState("");
  /* Шаблон должности: пока не трогали — да, если выбрана вся должность; разовый KPI одному человеку шаблоном не становится. */
  const [templateChoice, setTemplateChoice] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>(seed.period ?? periodOf("quarterly", new Date().toISOString().slice(0, 10)));
  const periodLabel = usePeriodLabel();
  /* Разбивка на дочерние периоды — родительский KPI udevs_hrms_admin. Планы детей: null — поровну. */
  const [split, setSplit] = useState(false);
  const [aggregation, setAggregation] = useState<Aggregation>("sum");
  const [childTargets, setChildTargets] = useState<string[] | null>(null);
  const children = childPeriods(period);
  const splitOn = split && children.length > 0;
  const childValues = childTargets ?? splitTarget(Number(draft.target) || 0, children.length).map(String);
  const existing = useCardsOfPeriods([period, ...(splitOn ? children : [])]);
  /* Смена вида или периода — дети другие, их планы снова поровну. */
  const moveTo = (next: Period) => (setPeriod(next), setChildTargets(null));
  const pickType = (type: KpiType) => moveTo(periodOf(type, period.start));
  const set = (patch: Partial<typeof draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const optionsOf = (slug: string) =>
    [...(schema.fields.find((f) => f.slug === slug)?.options?.values() ?? [])].map((o) => ({ value: o.value, label: localized(o.labels, i18n.language, o.label || o.value) }));
  const positions = [...new Map(employees.filter((e) => e.positionId).map((e) => [e.positionId, e.position])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const staff = ofPosition(draft.positionId);
  const chosen = staff.filter((e) => draft.employeeIds.includes(e.id));
  /* Кому карта заведётся заново — и сколько шаблонов в неё встанет (по должности одинаково). */
  const asTemplate = templateChoice ?? (staff.length > 0 && chosen.length === staff.length);
  const fresh = chosen.filter((e) => !existing.has(cardKey(e.id, period)));
  const templateCount = fresh[0] ? templatesFor(metrics, fresh[0].positionId, fresh[0].deptId, period.type).length : 0;

  const submit = () => {
    if (!draft.positionId) return toast.error(t("kpi.validation.position"));
    if (!draft.name.trim()) return toast.error(t("kpi.validation.name"));
    if (!(Number(draft.target) > 0)) return toast.error(t("kpi.validation.target"));
    if (!draft.employeeIds.length) return toast.error(t("kpi.validation.employees"));
    const childSum = childValues.reduce((a, v) => a + (Number(v) || 0), 0);
    if (splitOn && childValues.some((v) => !(Number(v) >= 0) || v === "")) return toast.error(t("kpi.validation.childPlan"));
    if (splitOn && aggregation === "sum" && Math.abs(childSum - Number(draft.target)) > 0.001)
      return toast.error(t("kpi.validation.childSum", { children: childSum, parent: Number(draft.target) }));
    add.mutate(
      {
        name: draft.name.trim(),
        unit: draft.unit,
        direction: draft.direction,
        target: Number(draft.target),
        weight: Number(draft.weight) || 0,
        positionId: draft.positionId,
        asTemplate,
        period,
        ...(splitOn ? { split: { aggregation, children: children.map((c, i) => ({ period: c, target: Number(childValues[i]) })) } } : {}),
        employees: chosen.map((e) => ({ id: e.id, deptId: e.deptId, templates: (type: KpiType) => templatesFor(metrics, e.positionId, e.deptId, type) })),
        cards: new Map(existing),
      },
      {
        onSuccess: () => {
          toast.success(t("kpi.addedMany", { count: draft.employeeIds.length }));
          onClose();
        },
      },
    );
  };

  const field = "flex flex-col gap-1.5 text-xs font-medium text-fg-subtle";
  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-lg font-semibold">{t("kpi.addKpi")}</h2>
            <p className="mt-0.5 text-[13px] text-fg-subtle">{t("kpi.addKpiHint")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
            className="grid size-8 place-items-center rounded-md border border-border text-fg-subtle hover:bg-surface-hover"
          >
            <Icon as={XIcon} size={16} />
          </button>
        </div>

        <form
          id="add-kpi"
          onSubmit={(event) => (event.preventDefault(), submit())}
          className="flex flex-col gap-5 overflow-auto px-5 pb-4"
        >
          <label className={field}>
            {t("kpi.name")} *
            <Input autoFocus value={draft.name} placeholder={t("kpi.namePlaceholder")} onChange={(e) => set({ name: e.target.value })} />
          </label>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <label className={field}>
              {t("kpi.position")} *
              <Dropdown
                value={draft.positionId}
                items={positions.filter((p) => p.label.toLowerCase().includes(positionQuery.toLowerCase()))}
                placeholder={t("kpi.validation.position")}
                search={positionQuery}
                onSearch={setPositionQuery}
                onChange={(positionId) => set({ positionId, employeeIds: ofPosition(positionId).map((e) => e.id) })}
              />
            </label>
            <div className={field}>
              {t("kpi.employees")}
              <EmployeeMulti staff={staff} value={draft.employeeIds} disabled={!draft.positionId} onChange={(employeeIds) => set({ employeeIds })} />
              {fresh.length > 0 && (
                <small className="text-xs font-normal">
                  {t("kpi.freshCards", { count: fresh.length, quarter: periodLabel(period, true), templates: templateCount })}
                </small>
              )}
            </div>
          </div>

          {draft.positionId && (
            <label className="-mt-2 flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox checked={asTemplate} onChange={() => setTemplateChoice(!asTemplate)} className="mt-0.5" />
              <span>
                {t("kpi.asTemplate", { position: positions.find((p) => p.value === draft.positionId)?.label ?? "" })}
                <small className="block text-xs text-fg-subtle">{t(asTemplate ? "kpi.asTemplateOn" : "kpi.asTemplateOff")}</small>
              </span>
            </label>
          )}

          <div className="grid gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className={field}>
              {t("kpi.kpiType")} *
              <Segments full value={period.type} onChange={pickType} items={KPI_TYPES.map((k) => ({ value: k, label: t(`kpi.typeShort.${k}`) }))} />
            </div>
            <div className={field}>
              {t("kpi.period")}
              <div className="flex h-9 items-center justify-between rounded-md border border-border-strong bg-input px-1 text-sm font-normal text-fg">
                <NavButton label={t("kpi.prevPeriod")} onClick={() => moveTo(shiftPeriod(period, -1))} icon={ChevronLeftIcon} />
                <span>{periodLabel(period, true)}</span>
                <NavButton label={t("kpi.nextPeriod")} onClick={() => moveTo(shiftPeriod(period, 1))} icon={ChevronRightIcon} />
              </div>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <label className={field}>
              {t("kpi.col.target")} *
              <Input type="number" inputMode="decimal" value={draft.target} placeholder="100" onChange={(e) => (set({ target: e.target.value }), setChildTargets(null))} />
            </label>
            <label className={field}>
              {t("kpi.unit")}
              <Dropdown value={draft.unit} items={optionsOf("unit")} onChange={(unit) => set({ unit })} />
            </label>
            <label className={field}>
              {t("kpi.weightPercent")}
              <Input type="number" inputMode="decimal" value={draft.weight} placeholder="10" onChange={(e) => set({ weight: e.target.value })} />
            </label>
          </div>

          <div className={field}>
            {t("kpi.direction")}
            <Segments full value={draft.direction} onChange={(direction) => set({ direction })} items={optionsOf("direction")} />
          </div>

          {children.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-soft p-3.5">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={split} onChange={() => setSplit(!split)} className="mt-0.5" />
                <span>
                  <b className="font-semibold">{t("kpi.split.title")}</b>
                  <small className="block text-xs text-fg-subtle">{t("kpi.split.hint")}</small>
                </span>
              </label>
              {splitOn && (
                <>
                  <div className={field}>
                    {t("kpi.split.aggregation")}
                    <Segments full value={aggregation} onChange={setAggregation} items={AGGREGATIONS.map((a) => ({ value: a, label: t(`kpi.agg.${a}`) }))} />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-x-3 gap-y-1.5 text-sm">
                    {children.map((c, i) => (
                      <Fragment key={c.start}>
                        <span className="text-fg-muted">{periodLabel(c, true)}</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={childValues[i] ?? ""}
                          aria-label={periodLabel(c, true)}
                          onChange={(e) => setChildTargets(childValues.map((v, j) => (j === i ? e.target.value : v)))}
                        />
                      </Fragment>
                    ))}
                    <span className="text-xs text-fg-subtle">{t("kpi.split.sum")}</span>
                    <span className="text-right text-xs text-fg-subtle tabular-nums">
                      {childValues.reduce((a, v) => a + (Number(v) || 0), 0)} / {Number(draft.target) || 0}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" form="add-kpi" disabled={add.isPending}>
            {t("kpi.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Сотрудники должности — мультиселект, как EmployeePicker графика,
 * но по готовому списку: кандидаты уже отобраны должностью.
 */
function EmployeeMulti({
  staff,
  value,
  disabled,
  onChange,
}: {
  staff: KpiEmployee[];
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const byId = new Map(staff.map((e) => [e.id, e]));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const shown = staff.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()));
  const all = staff.length > 0 && value.length === staff.length;

  if (disabled)
    return (
      <div className="flex min-h-9 items-center rounded-md border border-border-strong bg-input px-2.5 text-sm font-normal text-fg-subtle opacity-60">
        {t("kpi.positionFirst")}
      </div>
    );
  return (
    <Popover
      className="w-full"
      trigger={({ open, toggle: flip }) => (
        <div
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={flip}
          onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), flip())}
          className={`flex min-h-9 w-full cursor-pointer items-start gap-0.5 rounded-md border bg-input py-1 pr-1 pl-1.5 font-normal text-fg ${open ? "border-accent" : "border-border-strong hover:border-fg-subtle"}`}
        >
          <div className="flex min-h-7 flex-1 flex-wrap items-center gap-1">
            {value.length === 0 ? (
              <span className="pl-1 text-sm text-fg-subtle">{t("kpi.pickEmployees")}</span>
            ) : all && staff.length > 3 ? (
              <span className="pl-1 text-sm">{t("kpi.allOfPosition", { count: staff.length })}</span>
            ) : (
              value.map((id) => (
                <span key={id} className="inline-flex h-6 max-w-full items-center gap-1 rounded bg-surface-hover pr-1 pl-2 text-xs">
                  <span className="truncate">{byId.get(id)?.name ?? "…"}</span>
                  <button
                    type="button"
                    aria-label={t("action.delete")}
                    onClick={(event) => (event.stopPropagation(), toggle(id))}
                    className="grid size-4 place-items-center rounded text-fg-subtle hover:bg-border"
                  >
                    <Icon as={XIcon} size={11} />
                  </button>
                </span>
              ))
            )}
          </div>
          <span className="grid h-7 w-6 place-items-center text-fg-subtle">
            <Icon as={ChevronDownIcon} size={14} />
          </span>
        </div>
      )}
    >
      {() => (
        <div className="w-[360px] p-1">
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-border-strong px-2 text-sm focus-within:border-accent">
            <Icon as={SearchIcon} size={14} className="text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("kpi.searchEmployee")}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(all ? [] : staff.map((e) => e.id))}
            className="mt-1 w-full rounded-md px-1.5 py-1 text-left text-[13px] text-accent-text hover:bg-surface-hover"
          >
            {all ? t("kpi.clearAll") : t("kpi.selectAll", { count: staff.length })}
          </button>
          <div className="max-h-60 overflow-auto">
            {shown.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-surface-hover"
              >
                <Avatar name={e.name} photo={e.photo || undefined} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{e.name}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{e.dept}</span>
                </span>
                {value.includes(e.id) && <Icon as={CheckIcon} size={14} className="shrink-0 text-accent" />}
              </button>
            ))}
            {shown.length === 0 && <p className="py-3 text-center text-xs text-fg-subtle">{t("kpi.noEmployees")}</p>}
          </div>
        </div>
      )}
    </Popover>
  );
}
