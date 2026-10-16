import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { CHIP_COLORS, CHIP_HEX, hexToChipColor } from "@/shared/ui/chip";
import { Dropdown } from "@/shared/ui/dropdown";
import { Input } from "@/shared/ui/input";
import { TimeInput } from "@/shared/ui/time-input";
import { Modal } from "@/shared/ui/modal";
import { toast } from "@/shared/lib/toast";
import { useSaveTemplate } from "../api/schedule";
import { blankTemplate, isClock, weekMinutesOf, type ShiftKind, type Template, type TemplateDay } from "../model/schedule";
import { KindIcon, Row, Segments, useKinds, TEMPLATE_DOT, TemplatePreview, useDuration } from "./schedule-parts";

/** Норма недели; больше — переработка (`tplModal` прототипа). */
const WEEK_NORM = 40 * 60;

/**
 * Окно шаблона — `tplModal` прототипа: название, цвет, перерыв;
 * недельный — семь дней со временем и типом, сменный цикл — N через M;
 * предпросмотр и часы в неделю. Без шаблона — новый.
 */
export function TemplateDialog({ template, onClose }: { template?: Template; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const duration = useDuration();
  const save = useSaveTemplate();
  const kinds = useKinds();
  const [form, setForm] = useState<Template>(() => template ?? blankTemplate(kinds.list[0]?.id));
  const set = (patch: Partial<Template>) => setForm((prev) => ({ ...prev, ...patch }));
  const setDay = (index: number, patch: Partial<TemplateDay>) =>
    set({ days: form.days.map((day, i) => (i === index ? { ...day, ...patch } : day)) });
  const setCycle = (patch: Partial<Template["cycle"]>) => set({ cycle: { ...form.cycle, ...patch } });
  const weekday = (index: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 12 + index)));
  const minutes = weekMinutesOf(form);

  const submit = () => {
    if (!form.name.trim()) return toast.error(t("template.needName"));
    if (form.type === "weekly" && !form.days.some((day) => day.working)) return toast.error(t("template.needDay"));
    const clocks =
      form.type === "weekly" ? form.days.filter((day) => day.working).flatMap((day) => [day.start, day.end]) : [form.cycle.start, form.cycle.end];
    if (!clocks.every(isClock)) return toast.error(t("shift.badTime"));
    // Окно открыли раньше, чем пришёл справочник, — пустой вид становится первым.
    const first = kinds.list[0]?.id ?? "";
    const filled = { ...form, days: form.days.map((day) => ({ ...day, kind: day.kind || first })), cycle: { ...form.cycle, kind: form.cycle.kind || first } };
    save.mutate(filled, {
      onSuccess: () => {
        toast.success(template ? t("template.saved") : t("template.created"));
        onClose();
      },
    });
  };

  // Список, а не кнопки: видов в справочнике сколько угодно.
  const kindPicker = (value: ShiftKind, onChange: (kind: ShiftKind) => void) => (
    <Dropdown value={value} items={kinds.list.map((kind) => ({ value: kind.id, label: kind.name, icon: <KindIcon kind={kind} size={14} /> }))} onChange={onChange} />
  );


  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="px-5 pt-4 pb-3 text-xl font-semibold">{template ? t("template.edit") : t("template.new")}</h2>

        <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-4">
          <Row label={t("template.name")}>
            <Input autoFocus value={form.name} onChange={(event) => set({ name: event.target.value })} placeholder={t("template.namePlaceholder")} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label={t("template.color")}>
              <div className="flex h-9 items-center gap-2">
                {CHIP_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => set({ color: CHIP_HEX[color] })}
                    className={`size-5 rounded-full ${TEMPLATE_DOT[color]} ${
                      hexToChipColor(form.color) === color ? "ring-2 ring-fg-subtle ring-offset-2 ring-offset-surface" : ""
                    }`}
                  />
                ))}
              </div>
            </Row>
            <Row label={t("template.breakMinutes")}>
              <Input type="number" min={0} max={120} value={form.breakMinutes} onChange={(event) => set({ breakMinutes: Number(event.target.value) || 0 })} />
            </Row>
          </div>

          <Segments
            value={form.type}
            items={[
              { value: "weekly", label: t("template.type.weekly") },
              { value: "cycle", label: t("template.type.cycle") },
            ]}
            onChange={(type) => set({ type })}
          />

          {form.type === "weekly" ? (
            <Row label={t("template.weekdays")}>
              <div className="flex flex-col gap-1.5">
                {form.days.map((day, index) => (
                  <div key={index} className={`flex flex-wrap items-center gap-2 ${day.working ? "" : "opacity-70"}`}>
                    <label className="flex w-[70px] cursor-pointer items-center gap-2 text-[13px] font-medium capitalize">
                      <Checkbox checked={day.working} onChange={() => setDay(index, { working: !day.working })} />
                      {weekday(index)}
                    </label>
                    {day.working ? (
                      <>
                        <div className="w-24">
                          <TimeInput value={day.start} onChange={(start) => setDay(index, { start })} />
                        </div>
                        <span className="text-fg-subtle">—</span>
                        <div className="w-24">
                          <TimeInput value={day.end} onChange={(end) => setDay(index, { end })} />
                        </div>
                        <div className="w-40">{kindPicker(day.kind, (kind) => setDay(index, { kind }))}</div>
                      </>
                    ) : (
                      <span className="text-[13px] text-fg-subtle">{t("schedule.dayOff")}</span>
                    )}
                  </div>
                ))}
              </div>
            </Row>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Row label={t("template.workDays")}>
                  <Input type="number" min={1} max={7} value={form.cycle.work} onChange={(event) => setCycle({ work: Math.max(1, Number(event.target.value) || 1) })} />
                </Row>
                <Row label={t("template.offDays")}>
                  <Input type="number" min={1} max={7} value={form.cycle.off} onChange={(event) => setCycle({ off: Math.max(1, Number(event.target.value) || 1) })} />
                </Row>
                <Row label={t("template.shiftStart")}>
                  <TimeInput value={form.cycle.start} onChange={(start) => setCycle({ start })} />
                </Row>
                <Row label={t("template.shiftEnd")}>
                  <TimeInput value={form.cycle.end} onChange={(end) => setCycle({ end })} />
                </Row>
              </div>
              <Row label={t("template.shiftKind")}>{kindPicker(form.cycle.kind, (kind) => setCycle({ kind }))}</Row>
            </>
          )}

          <Row label={t("template.preview")}>
            <TemplatePreview template={form} />
            <span className="text-xs text-fg-subtle">
              {t("template.perWeekLong", { hours: duration(minutes) })}
              {minutes > WEEK_NORM && ` · ${t("template.overNorm")}`}
            </span>
          </Row>
          <Row label={t("template.description")}>
            <Input value={form.description} onChange={(event) => set({ description: event.target.value })} placeholder={t("template.descriptionPlaceholder")} />
          </Row>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? t("common.saving") : template ? t("action.save") : t("template.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
