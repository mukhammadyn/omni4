import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Avatar } from "@/features/item";
import { localized, optionOf, useTableSchema, type Field } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Chip } from "@/shared/ui/chip";
import { CommitInput } from "@/shared/ui/commit-input";
import { Icon } from "@/shared/ui/icon";
import { useTablePermissions } from "@/features/auth";
import { RESULTS, SCORECARDS, useDeleteKpi, useKpiSheet, useUpdateActual, type KpiChild, type KpiEmployee, type Result } from "../api/kpi";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Checkbox } from "@/shared/ui/checkbox";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { EditKpiDialog } from "./EditKpiDialog";
import { AddKpiDialog, type KpiDraftSeed } from "./AddKpiDialog";
import { columnsOf, completion, CURSOR_OF, KPI_TYPES, periodOf, ratingOf, SCORECARD, shiftPeriod, type KpiType, type Period } from "../model/kpi";
import { useUi } from "@/shared/lib/ui-store";
import { NavButton } from "./BudgetSheet";
import { useScheduleSettings } from "./schedule-settings";
import { RATING_COLOR, StatusStep, usePeriodLabel } from "./EmployeeKpi";
import { Segments } from "./schedule-parts";

/* Подсветка текущего периода поверх фона: сам accent-subtle полупрозрачный, и строки просвечивали бы под липкой шапкой. */
const CURRENT_TH = "bg-surface bg-[linear-gradient(var(--color-accent-subtle),var(--color-accent-subtle))]";
const PARTS = ["target", "actual", "pct"] as const;
const W = 280;
const cell = "h-9 border-b border-border px-2.5 whitespace-nowrap";
const sticky = "sticky left-0 z-[2] bg-surface";

/**
 * Сводная KPI за год (вид `KPI`) на `hr_kpi_scorecards` — по образцу
 * модуля KPI udevs_hrms_admin: отделы → сотрудники → показатели,
 * вид KPI (неделя/месяц/квартал/год) — колонки его периодов внутри
 * курсора (CURSOR_OF), в каждой «Цель · Факт · %», итог справа. Факт правится
 * в ячейке, пока карта квартала не утверждена; нет карты — «Создать»
 * по шаблонам должности. Клик по сотруднику — его вкладка «KPI».
 */
export function KpiSheet({
  viewId,
  search,
  create,
  onCreateClose,
  onOpenEmployee,
}: {
  viewId: string;
  search: string;
  /** «Создать» в шапке экрана нажата: открыть «Добавить KPI». */
  create: boolean;
  onCreateClose: () => void;
  onOpenEmployee: (guid: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  /* Вид запоминается за view, как настройки графика; период — всегда от сегодня. */
  const saved = useUi((st) => st.viewState[`${viewId}:kpi`]);
  const setViewState = useUi((st) => st.setViewState);
  const type: KpiType = (KPI_TYPES as readonly string[]).includes(saved as string) ? (saved as KpiType) : "quarterly";
  const setType = (next: KpiType) => setViewState(`${viewId}:kpi`, next);
  const [cursor, setCursor] = useState(() => periodOf(CURSOR_OF[type], today));
  const cols = columnsOf(type, cursor);
  const COLS = cols.map((_, i) => i);
  const periodLabel = usePeriodLabel();
  /* Смена вида — курсор того же дня, но своего шага. */
  const pickType = (next: KpiType) => {
    setType(next);
    setCursor(periodOf(CURSOR_OF[next], cursor.start <= today && today <= cursor.end ? today : cursor.start));
  };
  /* Свёрнутые отделы; по умолчанию все раскрыты. */
  const [folded, setFolded] = useState<Set<string>>(new Set());
  /* Раскрытые сотрудники — их показатели; по умолчанию свёрнуты. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  /* Раскрытые родительские показатели — их дочерние периоды. */
  const [openParents, setOpenParents] = useState<Set<string>>(new Set());
  const { where } = useScheduleSettings(viewId);
  const { employees, childrenOf, loading } = useKpiSheet(type, cols, where);
  const { schema } = useTableSchema(SCORECARDS);
  const permissionOf = useTablePermissions();
  const canEdit = permissionOf(SCORECARDS).update && permissionOf(RESULTS).update;
  const canCreate = permissionOf(SCORECARDS).write && permissionOf(RESULTS).write;
  const [adding, setAdding] = useState<KpiDraftSeed | null>(null);
  const updateActual = useUpdateActual();
  const label = (field: Field | undefined, value: string) => {
    const found = field && optionOf(field, value);
    return found ? localized(found.labels, i18n.language, found.label || found.value) : value;
  };
  const statusField = schema.fields.find((f) => f.slug === "status");
  const ratingField = schema.fields.find((f) => f.slug === "rating");

  const query = search.trim().toLowerCase();
  const shown = employees.filter((e) => !query || `${e.name} ${e.position}`.toLowerCase().includes(query));
  const groups = useMemo(() => {
    const map = new Map<string, KpiEmployee[]>();
    for (const e of shown) map.set(e.dept || t("kpi.noDepartment"), [...(map.get(e.dept || t("kpi.noDepartment")) ?? []), e]);
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [shown, t]);

  const flip = (set: typeof setFolded) => (id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggle = flip(setFolded);
  const toggleEmployee = flip(setOpen);
  const toggleParent = flip(setOpenParents);
  /* Правка и удаление строки показателя: строка, её дети и период карты. */
  type Target = { result: Result; kids: KpiChild[]; period: Period };
  const [editing, setEditing] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [unlink, setUnlink] = useState(false);
  const remove = useDeleteKpi();
  const yearTotal = (e: KpiEmployee) => {
    const totals = e.cards.flatMap((c) => (c ? [c.total] : []));
    return totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  };
  const metricsOf = (e: KpiEmployee) => {
    const map = new Map<string, { name: string; direction: string; byColumn: (Result | null)[] }>();
    e.cards.forEach((card, q) =>
      card?.rows.forEach((r) => {
        const entry = map.get(r.metric.id) ?? { name: r.metric.name, direction: r.metric.direction, byColumn: cols.map(() => null) };
        entry.byColumn[q] = r;
        map.set(r.metric.id, entry);
      }),
    );
    return [...map.values()];
  };
  const pctTone = (pct: number) => (pct >= 100 ? "text-success" : pct < 70 ? "text-danger" : "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 text-sm">
        <Segments value={type} onChange={pickType} items={KPI_TYPES.map((k) => ({ value: k, label: t(`kpi.type.${k}`) }))} />
        <span className="mx-2 h-4 w-px bg-border" />
        <NavButton label={t("kpi.prevPeriod")} onClick={() => setCursor(shiftPeriod(cursor, -1))} icon={ChevronLeftIcon} />
        <b className="min-w-[120px] text-center font-semibold">{periodLabel(cursor, true)}</b>
        <NavButton label={t("kpi.nextPeriod")} onClick={() => setCursor(shiftPeriod(cursor, 1))} icon={ChevronRightIcon} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[13px] tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: W, minWidth: W }} className={`${sticky} top-0 z-[5] h-[34px] border-b border-border pl-6 text-left text-xs font-medium text-fg-subtle`}>
                {t("kpi.who")}
              </th>
              {COLS.map((q) => (
                <th
                  key={q}
                  colSpan={PARTS.length}
                  className={`sticky top-0 z-[3] h-[34px] border-b border-l border-border px-2.5 text-center text-[11.5px] font-semibold text-fg-muted uppercase ${cols[q]!.start <= today && today <= cols[q]!.end ? CURRENT_TH : "bg-surface"}`}
                >
                  {periodLabel(cols[q]!)}
                </th>
              ))}
              <th rowSpan={2} className="sticky top-0 z-[3] h-[34px] border-b border-l border-border bg-surface px-2.5 text-right text-[11.5px] font-semibold text-fg-muted uppercase">
                {t("kpi.sum")}
              </th>
            </tr>
            <tr>
              {COLS.flatMap((q) =>
                PARTS.map((part, i) => (
                  <th
                    key={`${q}-${part}`}
                    className={`sticky top-[34px] z-[3] h-7 border-b border-border bg-surface-soft px-2.5 text-right text-[10.5px] font-medium text-fg-subtle uppercase ${i === 0 ? "border-l" : ""}`}
                  >
                    {t(part === "pct" ? "kpi.col.completion" : `kpi.col.${part}`)}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={2 + COLS.length * PARTS.length} className="py-10 text-center text-fg-subtle">
                  {loading ? t("common.loading") : t("kpi.sheetEmpty")}
                </td>
              </tr>
            )}
            {groups.map(([name, people]) => (
              <Fragment key={name}>
                <tr>
                  <td colSpan={2 + COLS.length * PARTS.length} className={`${cell} bg-surface-soft p-0 font-semibold`}>
                    <button type="button" onClick={() => toggle(name)} aria-expanded={!folded.has(name)} className="flex h-full w-full items-center gap-1.5 pl-3 text-left">
                      <Icon as={ChevronDownIcon} size={14} className={`text-fg-subtle ${folded.has(name) ? "-rotate-90" : ""}`} />
                      {name} <span className="font-normal text-fg-subtle">{people.length}</span>
                    </button>
                  </td>
                </tr>
                {!folded.has(name) && people.map((e) => {
                  const total = yearTotal(e);
                  const metrics = metricsOf(e);
                  const unfolded = open.has(e.id);
                  return (
                    <Fragment key={e.id}>
                      <tr className="hover:bg-surface-hover">
                        <td style={{ width: W, minWidth: W, maxWidth: W }} className={`${cell} ${sticky} pl-3`}>
                          <span className="flex items-center gap-2">
                            {/* Стрелка — только у кого есть показатели: раскрывать пустое незачем. */}
                            {metrics.length > 0 ? (
                              <button
                                type="button"
                                aria-expanded={unfolded}
                                aria-label={e.name}
                                onClick={() => toggleEmployee(e.id)}
                                className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-hover"
                              >
                                <Icon as={ChevronDownIcon} size={14} className={unfolded ? "" : "-rotate-90"} />
                              </button>
                            ) : (
                              <span className="size-5 shrink-0" />
                            )}
                            <Avatar name={e.name} photo={e.photo} size="sm" />
                            <button type="button" onClick={() => onOpenEmployee(e.id)} className="min-w-0 text-left hover:underline">
                              <b className="block truncate font-medium">{e.name}</b>
                              <small className="block truncate text-xs text-fg-subtle">{e.position}</small>
                            </button>
                          </span>
                        </td>
                        {e.cards.map((card, q) => (
                          <td key={q} colSpan={PARTS.length} className={`${cell} border-l text-right`}>
                            {card && card.rows.length > 0 ? (
                              <span className="inline-flex items-center gap-2">
                                <StatusStep card={card} total={card.total} label={label(statusField, card.status)} canEdit={canEdit} />
                                {/* Рейтинг не правится: он из итога, итог — из фактов показателей ниже. */}
                                <Chip color={RATING_COLOR[ratingOf(card.total)] ?? "gray"}>{label(ratingField, ratingOf(card.total))}</Chip>
                                <b className={pctTone(card.total)}>{card.total}%</b>
                              </span>
                            ) : canCreate && card?.status !== SCORECARD.approved ? (
                              <button
                                type="button"
                                onClick={() => setAdding({ positionId: e.positionId, employeeIds: [e.id], period: cols[q]! })}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-fg-subtle hover:bg-surface-hover hover:text-fg"
                              >
                                <Icon as={PlusIcon} size={12} />
                                {t("kpi.addKpi")}
                              </button>
                            ) : (
                              <span className="text-fg-subtle">—</span>
                            )}
                          </td>
                        ))}
                        <td className={`${cell} border-l text-right font-semibold ${total == null ? "text-fg-subtle" : pctTone(total)}`}>
                          {total == null ? "—" : `${total}%`}
                        </td>
                      </tr>
                      {unfolded && metrics.map((m) => {
                        const parentKey = `${e.id}|${m.name}`;
                        /* Дети каждого родителя — в колонке его периода. */
                        const kids = m.byColumn.map((r) => (r?.aggregation ? (childrenOf.get(r.id) ?? []) : []));
                        const hasKids = kids.some((k) => k.length > 0);
                        const kidsOpen = openParents.has(parentKey);
                        return (
                        <Fragment key={parentKey}>
                          <tr className="text-fg-muted">
                            <td style={{ width: W, minWidth: W, maxWidth: W }} className={`${cell} ${sticky} pl-10`}>
                              <span className="flex min-w-0 items-center gap-1">
                              {hasKids ? (
                                <button
                                  type="button"
                                  aria-expanded={kidsOpen}
                                  aria-label={m.name}
                                  onClick={() => toggleParent(parentKey)}
                                  className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-hover"
                                >
                                  <Icon as={ChevronDownIcon} size={14} className={kidsOpen ? "" : "-rotate-90"} />
                                </button>
                              ) : (
                                <span className="size-5 shrink-0" />
                              )}
                              <span className="block truncate">
                                {m.name || "—"}
                                {m.byColumn.some((r) => r?.aggregation) && (
                                  <span title={t("kpi.fromChildren")} className="ml-1.5 rounded bg-surface-hover px-1 text-xs text-fg-subtle">Σ</span>
                                )}
                                {m.direction === "down" && <span className="text-xs text-fg-subtle"> · {t("kpi.lessIsBetter")}</span>}
                              </span>
                              {canEdit && (
                                <RowMenu
                                  label={t("kpi.rowActions")}
                                  /* По строке на колонку, где показатель стоит; в утверждённой карте — недоступно. */
                                  targets={m.byColumn.flatMap((r, q) =>
                                    r ? [{ target: { result: r, kids: kids[q] ?? [], period: cols[q]! }, locked: e.cards[q]?.status === SCORECARD.approved }] : [],
                                  )}
                                  periodLabel={(p) => periodLabel(p)}
                                  onEdit={setEditing}
                                  onDelete={(target) => (setUnlink(false), setDeleting(target))}
                                />
                              )}
                              </span>
                            </td>
                            {m.byColumn.flatMap((r, q) => {
                              if (!r) return PARTS.map((part, i) => <td key={`${q}-${part}`} className={`${cell} ${i === 0 ? "border-l" : ""}`} />);
                              const pct = completion(r.target, r.actual, r.metric.direction);
                              /* Факт родителя собирается из дочерних — руками не вводится. */
                              const editable = canEdit && e.cards[q]?.status !== SCORECARD.approved && !r.aggregation;
                              return [
                                <td key={`${q}-t`} className={`${cell} border-l text-right`}>{r.target.toLocaleString(i18n.language)}</td>,
                                <td key={`${q}-a`} className={`${cell} text-right text-fg`}>
                                  {editable ? (
                                    <CommitInput
                                      label={t("kpi.col.actual")}
                                      value={r.actual == null ? "" : String(r.actual)}
                                      allowEmpty
                                      className="h-7 w-24 text-right"
                                      onCommit={(next) => updateActual(r, next === "" ? null : Number(next))}
                                    />
                                  ) : r.actual == null ? (
                                    "—"
                                  ) : (
                                    r.actual.toLocaleString(i18n.language)
                                  )}
                                </td>,
                                <td key={`${q}-p`} className={`${cell} text-right ${pctTone(pct)}`}>{r.actual == null ? "—" : `${pct}%`}</td>,
                              ];
                            })}
                            <td className={`${cell} border-l`} />
                          </tr>
                          {kidsOpen &&
                            kids.flatMap((list, q) =>
                              list.map((k) => {
                                const pct = completion(k.result.target, k.result.actual, k.result.metric.direction);
                                const editable = canEdit && k.status !== SCORECARD.approved;
                                return (
                                  <tr key={k.result.id} className="text-fg-muted">
                                    <td style={{ width: W, minWidth: W, maxWidth: W }} className={`${cell} ${sticky} pl-20 text-xs`}>
                                      ↳ {periodLabel(k.period, true)}
                                    </td>
                                    {cols.flatMap((_, c) =>
                                      c !== q
                                        ? PARTS.map((part, i) => <td key={`${c}-${part}`} className={`${cell} ${i === 0 ? "border-l" : ""}`} />)
                                        : [
                                            <td key={`${c}-t`} className={`${cell} border-l text-right`}>{k.result.target.toLocaleString(i18n.language)}</td>,
                                            <td key={`${c}-a`} className={`${cell} text-right text-fg`}>
                                              {editable ? (
                                                <CommitInput
                                                  label={t("kpi.col.actual")}
                                                  value={k.result.actual == null ? "" : String(k.result.actual)}
                                                  allowEmpty
                                                  className="h-7 w-24 text-right"
                                                  onCommit={(next) => updateActual(k.result, next === "" ? null : Number(next))}
                                                />
                                              ) : k.result.actual == null ? (
                                                "—"
                                              ) : (
                                                k.result.actual.toLocaleString(i18n.language)
                                              )}
                                            </td>,
                                            <td key={`${c}-p`} className={`${cell} text-right ${pctTone(pct)}`}>{k.result.actual == null ? "—" : `${pct}%`}</td>,
                                          ],
                                    )}
                                    <td className={`${cell} border-l`} />
                                  </tr>
                                );
                              }),
                            )}
                        </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <EditKpiDialog result={editing.result} kids={editing.kids} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t("kpi.deleteTitle", { name: deleting.result.metric.name })}
          description={t("kpi.deleteText", { period: ` ${periodLabel(deleting.period, true)}`, kids: deleting.kids.length })}
          confirmLabel={t("kpi.delete")}
          busy={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate(
              { ids: [deleting.result.id, ...deleting.kids.map((k) => k.result.id)], metricId: deleting.result.metric.id, unlinkTemplate: unlink },
              { onSuccess: () => (toast.success(t("kpi.deleted")), setDeleting(null)) },
            )
          }
        >
          {deleting.result.metric.positionId && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox checked={unlink} onChange={() => setUnlink(!unlink)} className="mt-0.5" />
              {t("kpi.unlinkTemplate")}
            </label>
          )}
        </ConfirmDialog>
      )}
      {(adding || create) && (
        <AddKpiDialog
          employees={employees}
          seed={adding ?? { period: periodOf(type, cols.find((c) => c.start <= today && today <= c.end)?.start ?? cols[0]!.start) }}
          onClose={() => {
            setAdding(null);
            onCreateClose();
          }}
        />
      )}
    </div>
  );
}

/** «⋯» строки показателя: «Редактировать» и «Удалить» по каждой его карте в колонках. */
function RowMenu<T>({
  label,
  targets,
  periodLabel,
  onEdit,
  onDelete,
}: {
  label: string;
  targets: { target: T & { period: Period }; locked: boolean }[];
  periodLabel: (p: Period) => string;
  onEdit: (target: T & { period: Period }) => void;
  onDelete: (target: T & { period: Period }) => void;
}) {
  const { t } = useTranslation();
  const many = targets.length > 1;
  return (
    <Popover
      align="end"
      className="ml-auto shrink-0"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-label={label} className="grid size-6 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg">
          <Icon as={EllipsisIcon} size={14} />
        </button>
      )}
    >
      {(close) => (
        <div className="min-w-56 p-1">
          {targets.map(({ target, locked }) => (
            <Fragment key={target.period.start}>
              {many && <div className="px-2 pt-1.5 pb-0.5 text-xs text-fg-subtle">{periodLabel(target.period)}</div>}
              {locked ? (
                <p className="px-2 py-1.5 text-xs text-fg-subtle">{t("kpi.approvedLocked")}</p>
              ) : (
                <>
                  <PopoverItem icon={<Icon as={PencilIcon} size={14} />} onClick={() => (onEdit(target), close())}>
                    {t("kpi.editKpi")}
                  </PopoverItem>
                  <PopoverItem danger icon={<Icon as={Trash2Icon} size={14} />} onClick={() => (onDelete(target), close())}>
                    {t("kpi.delete")}
                  </PopoverItem>
                </>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </Popover>
  );
}
