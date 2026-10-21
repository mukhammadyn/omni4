import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { localized, useTableSchema } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { METRICS, useEditKpi, type KpiChild, type Result } from "../api/kpi";
import { AGGREGATIONS, type Aggregation } from "../model/kpi";
import { usePeriodLabel } from "./EmployeeKpi";
import { Segments } from "./schedule-parts";

/**
 * «Редактировать KPI» — то же окно, что «Добавить KPI», для одной строки
 * карты: название, единица и направление — у показателя (во всех картах),
 * цель, вес, способ подсчёта и планы дочерних — у этой строки.
 * Сотрудник и период не меняются: другой период — другой KPI.
 */
export function EditKpiDialog({ result, kids, onClose }: { result: Result; kids: KpiChild[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { schema } = useTableSchema(METRICS);
  const edit = useEditKpi();
  const periodLabel = usePeriodLabel();
  const [draft, setDraft] = useState({
    name: result.metric.name,
    unit: result.metric.unit || "pcs",
    direction: result.metric.direction || "up",
    target: String(result.target),
    weight: String(result.weight),
    aggregation: (result.aggregation || "sum") as Aggregation,
    kids: kids.map((k) => String(k.result.target)),
  });
  const set = (patch: Partial<typeof draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const optionsOf = (slug: string) =>
    [...(schema.fields.find((f) => f.slug === slug)?.options?.values() ?? [])].map((o) => ({ value: o.value, label: localized(o.labels, i18n.language, o.label || o.value) }));
  const kidSum = draft.kids.reduce((a, v) => a + (Number(v) || 0), 0);

  const submit = () => {
    if (!draft.name.trim()) return toast.error(t("kpi.validation.name"));
    if (!(Number(draft.target) > 0)) return toast.error(t("kpi.validation.target"));
    if (kids.length && draft.kids.some((v) => v === "" || !(Number(v) >= 0))) return toast.error(t("kpi.validation.childPlan"));
    if (kids.length && draft.aggregation === "sum" && Math.abs(kidSum - Number(draft.target)) > 0.001)
      return toast.error(t("kpi.validation.childSum", { children: kidSum, parent: Number(draft.target) }));
    edit.mutate(
      {
        metric: { id: result.metric.id, name: draft.name.trim(), unit: draft.unit, direction: draft.direction },
        row: { id: result.id, target: Number(draft.target), weight: Number(draft.weight) || 0, ...(result.aggregation ? { aggregation: draft.aggregation } : {}) },
        children: kids.map((k, i) => ({ id: k.result.id, target: Number(draft.kids[i]), actual: k.result.actual })),
      },
      {
        onSuccess: () => {
          toast.success(t("kpi.edited"));
          onClose();
        },
      },
    );
  };

  const field = "flex flex-col gap-1.5 text-xs font-medium text-fg-subtle";
  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-lg font-semibold">{t("kpi.editKpi")}</h2>
            <p className="mt-0.5 text-[13px] text-fg-subtle">{t("kpi.editKpiHint")}</p>
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

        <form id="edit-kpi" onSubmit={(event) => (event.preventDefault(), submit())} className="flex flex-col gap-5 overflow-auto px-5 pb-4">
          <label className={field}>
            {t("kpi.name")} *
            <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="grid gap-5 sm:grid-cols-3">
            <label className={field}>
              {t("kpi.col.target")} *
              <Input type="number" inputMode="decimal" value={draft.target} onChange={(e) => set({ target: e.target.value })} />
            </label>
            <label className={field}>
              {t("kpi.unit")}
              <Dropdown value={draft.unit} items={optionsOf("unit")} onChange={(unit) => set({ unit })} />
            </label>
            <label className={field}>
              {t("kpi.weightPercent")}
              <Input type="number" inputMode="decimal" value={draft.weight} onChange={(e) => set({ weight: e.target.value })} />
            </label>
          </div>
          <div className={field}>
            {t("kpi.direction")}
            <Segments full value={draft.direction} onChange={(direction) => set({ direction })} items={optionsOf("direction")} />
          </div>

          {result.aggregation && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-soft p-3.5">
              <div className={field}>
                {t("kpi.split.aggregation")}
                <Segments full value={draft.aggregation} onChange={(aggregation) => set({ aggregation })} items={AGGREGATIONS.map((a) => ({ value: a, label: t(`kpi.agg.${a}`) }))} />
              </div>
              {kids.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-x-3 gap-y-1.5 text-sm">
                  {kids.map((k, i) => (
                    <Fragment key={k.result.id}>
                      <span className="text-fg-muted">{periodLabel(k.period, true)}</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        aria-label={periodLabel(k.period, true)}
                        value={draft.kids[i] ?? ""}
                        onChange={(e) => set({ kids: draft.kids.map((v, j) => (j === i ? e.target.value : v)) })}
                      />
                    </Fragment>
                  ))}
                  <span className="text-xs text-fg-subtle">{t("kpi.split.sum")}</span>
                  <span className="text-right text-xs text-fg-subtle tabular-nums">
                    {kidSum} / {Number(draft.target) || 0}
                  </span>
                </div>
              )}
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" form="edit-kpi" disabled={edit.isPending}>
            {t("kpi.saveChanges")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
