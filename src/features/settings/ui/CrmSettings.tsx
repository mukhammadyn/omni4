import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2Icon,
  CircleCheckBigIcon,
  EllipsisIcon,
  GripVerticalIcon,
  LoaderIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_COLORS, CHIP_DOT, CHIP_HEX, CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { CommitInput } from "@/shared/ui/commit-input";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import {
  CONTAINERS,
  move,
  useCallQuality,
  useCrmLostReasons,
  useCrmPipelines,
  useCrmSources,
  useDealCount,
  type CallQualityVersion,
  type Container,
  type Criterion,
  type Entry,
  type Pipeline,
  type Stage,
} from "../api/crm-settings";
import { SectionHeader } from "./parts";

/**
 * Вкладка «CRM» настроек — экраны прототипа (settings.html#pipelines,
 * #sources, #lost, #ai-calls): строки с ручкой перетаскивания, теги
 * цветом записи, правка в меню «…».
 */

const tone = (color: string): ChipColor => (color ? hexToChipColor(color) : "gray");
const row = "flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1";
const rowButton = "grid size-7 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-active hover:text-fg";
const fieldLabel = "mb-1 block text-xs font-medium text-fg-muted";
const run = (p: Promise<unknown>, done?: string) => void p.then(() => done && toast.success(done), () => {});

function Screen({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={title} hint={hint} />
      <div className="flex max-w-3xl flex-col gap-3">{children}</div>
    </div>
  );
}

function Tag({ name, color }: { name: string; color: string }) {
  return <span className={`inline-flex h-6 min-w-0 max-w-full items-center truncate rounded-md px-2 text-sm ${CHIP_STYLES[tone(color)]}`}>{name}</span>;
}

function Grip({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <span
      draggable
      title={t("crmset.drag")}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        const row = e.currentTarget.parentElement?.closest("[data-row]");
        if (row) e.dataTransfer.setDragImage(row, 16, 16);
      }}
      className="grid shrink-0 cursor-grab place-items-center text-fg-subtle"
    >
      <Icon as={GripVerticalIcon} size={14} />
    </span>
  );
}

/**
 * Строка, на которую роняют: `onDrop` получает, что уронили. Тянут
 * за ручку (`Grip id`), а не за строку — иначе в полях строки не выделить текст.
 */
function dragRow(id: string, onDrop: (dragged: string) => void) {
  return {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dragged = e.dataTransfer.getData("text/plain");
      if (dragged && dragged !== id) onDrop(dragged);
    },
  };
}

function ColorPick({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const chosen = tone(value);
  return (
    <div className="flex flex-wrap gap-2 px-2 py-1">
      {CHIP_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          aria-pressed={chosen === color}
          onClick={() => onChange(CHIP_HEX[color])}
          className={`size-5 rounded-full ${CHIP_DOT[color]} ${chosen === color ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
        />
      ))}
    </div>
  );
}

/** Меню «…» строки: название, цвет, своё (`children`) и удаление. */
function RowMenu({ name, color, onRename, onColor, onDelete, children }: { name: string; color: string; onRename: (v: string) => void; onColor: (hex: string) => void; onDelete: () => void; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button type="button" aria-label={t("dir.actions")} onClick={toggle} className={rowButton}>
          <Icon as={EllipsisIcon} size={14} />
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-64 flex-col gap-2 p-1">
          <label className="px-2 pt-1">
            <span className={fieldLabel}>{t("crmset.name")}</span>
            <CommitInput label={t("crmset.name")} value={name} onCommit={onRename} />
          </label>
          <div>
            <span className={`${fieldLabel} px-2`}>{t("pipe.color")}</span>
            <ColorPick value={color} onChange={onColor} />
          </div>
          {children}
          <PopoverSeparator />
          <PopoverItem danger icon={<Icon as={Trash2Icon} />} onClick={() => (close(), onDelete())}>
            {t("action.delete")}
          </PopoverItem>
        </div>
      )}
    </Popover>
  );
}

/** «Добавить …»: кнопка, по нажатию — поле; Enter создаёт, Esc — передумал. */
function AddInline({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Icon as={PlusIcon} size={14} />
        {label}
      </Button>
    );
  const submit = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    onAdd(name.trim()).then(
      () => (setName(""), setBusy(false), setOpen(false)),
      () => setBusy(false),
    );
  };
  return (
    <form onSubmit={(e) => (e.preventDefault(), submit())} className="flex max-w-sm items-center gap-2">
      <Input autoFocus value={name} placeholder={label} disabled={busy} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} onBlur={() => !name.trim() && setOpen(false)} />
      {busy && <Icon as={LoaderIcon} size={14} className="animate-spin text-fg-subtle" />}
    </form>
  );
}

/* ===== Воронки и этапы ===== */

const GROUP: Record<Container, ChipColor> = { new: "blue", in_progress: "yellow", done: "green" };
const GROUP_ICON = { new: SparklesIcon, in_progress: LoaderIcon, done: CircleCheckBigIcon } as const;

export function CrmPipelineSettings() {
  const { t } = useTranslation();
  const data = useCrmPipelines();
  const [chosen, setChosen] = useState("");
  const [deleting, setDeleting] = useState<{ pipeline: Pipeline } | { stage: Stage } | null>(null);
  const pipeline = data.pipelines.find((p) => p.id === chosen) ?? data.pipelines.find((p) => p.isDefault) ?? data.pipelines[0];

  return (
    <Screen title={t("crmset.pipelines")} hint={t("crmset.pipelinesHint")}>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs variant="segment" activeId={pipeline?.id ?? ""} onSelect={setChosen} tabs={data.pipelines.map((p) => ({ id: p.id, label: p.active ? p.name : `${p.name} · ${t("crmset.off")}` }))} />
        {pipeline && (
          <Popover
            trigger={({ toggle }) => (
              <button type="button" aria-label={t("dir.actions")} onClick={toggle} className={rowButton}>
                <Icon as={EllipsisIcon} size={14} />
              </button>
            )}
          >
            {(close) => (
              <div className="flex w-64 flex-col gap-2 p-1">
                <label className="px-2 pt-1">
                  <span className={fieldLabel}>{t("crmset.name")}</span>
                  <CommitInput key={pipeline.id} label={t("crmset.name")} value={pipeline.name} onCommit={(name) => run(data.renamePipeline(pipeline, name))} />
                </label>
                <span className="px-2">
                  <ActiveSwitch on={pipeline.active} label={t("crmset.active")} onToggle={() => run(data.toggleActive(pipeline))} />
                  <span className="ml-2 text-sm">{t("crmset.active")}</span>
                </span>
                <PopoverSeparator />
                <PopoverItem danger icon={<Icon as={Trash2Icon} />} onClick={() => (close(), setDeleting({ pipeline }))}>
                  {t("pipe.deletePipeline", { name: pipeline.name })}
                </PopoverItem>
              </div>
            )}
          </Popover>
        )}
        <AddInline label={t("crmset.addPipeline")} onAdd={(name) => data.addPipeline(name).then(setChosen)} />
      </div>

      {!pipeline && <p className="py-6 text-center text-sm text-fg-subtle">{data.loading ? t("common.loading") : t("pipe.none")}</p>}

      {pipeline &&
        CONTAINERS.map((container) => {
          const stages = pipeline.stages.filter((s) => s.container === container);
          const drop = (dragged: string, before: Stage | null) => {
            const stage = pipeline.stages.find((s) => s.id === dragged);
            if (stage) run(data.dropStage(pipeline, stage, container, before));
          };
          return (
            <section
              key={container}
              className="rounded-xl border border-border bg-surface-hover/40 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                drop(e.dataTransfer.getData("text/plain"), null);
              }}
            >
              <header className="mb-2 flex items-center gap-2.5">
                <span className={`grid size-7 shrink-0 place-items-center rounded-md ${CHIP_STYLES[GROUP[container]]}`}>
                  <Icon as={GROUP_ICON[container]} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-sm font-semibold">{t(`crmset.groups.${container}`)}</b>
                  <small className="block text-xs text-fg-muted">{t(`crmset.groupHints.${container}`)}</small>
                </div>
                <span className="text-xs text-fg-subtle">{t("crmset.stageCount", { count: stages.length })}</span>
              </header>
              <div className="flex flex-col gap-1.5">
                {stages.map((s) => (
                  <div key={s.id} data-row className={row} {...dragRow(s.id, (dragged) => drop(dragged, s))}>
                    <Grip id={s.id} />
                    <span className="min-w-0 flex-1"><Tag name={s.name} color={s.color} /></span>
                    <span className="text-xs text-fg-subtle">{t("crmset.probability")}</span>
                    <span className="w-16 shrink-0"><CommitInput
                      label={`${t("crmset.probability")}: ${s.name}`}
                      value={s.probability?.toString() ?? ""}
                      allowEmpty
                      className="text-right"
                      onCommit={(v) => run(data.updateStage(s, { probability: v.trim() === "" ? null : Math.min(100, Math.max(0, Math.round(Number(v)) || 0)) }))}
                    /></span>
                    <span className="text-xs text-fg-subtle">%</span>
                    <RowMenu
                      name={s.name}
                      color={s.color}
                      onRename={(name) => run(data.updateStage(s, { name }))}
                      onColor={(color) => run(data.updateStage(s, { color }))}
                      onDelete={() => setDeleting({ stage: s })}
                    >
                      <label className="px-2">
                        <span className={fieldLabel}>{t("crmset.termDays")}</span>
                        <CommitInput
                          label={t("crmset.termDays")}
                          value={s.termDays?.toString() ?? ""}
                          allowEmpty
                          onCommit={(v) => run(data.updateStage(s, { term_days: v.trim() === "" ? null : Math.max(0, Math.round(Number(v)) || 0) }))}
                        />
                      </label>
                    </RowMenu>
                  </div>
                ))}
                <AddInline label={t("pipe.addStage")} onAdd={(name) => data.addStage(pipeline, container, name)} />
              </div>
            </section>
          );
        })}

      {deleting && (
        <DeleteStageOrPipeline
          target={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            run("pipeline" in deleting ? data.removePipeline(deleting.pipeline) : data.removeStage(deleting.stage), t("pipe.deleted"));
            setDeleting(null);
          }}
        />
      )}
    </Screen>
  );
}

/** Пока на воронке или этапе есть сделки — удалить нельзя: они повисли бы без этапа. */
function DeleteStageOrPipeline({ target, onClose, onConfirm }: { target: { pipeline: Pipeline } | { stage: Stage }; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const isPipeline = "pipeline" in target;
  const id = isPipeline ? target.pipeline.id : target.stage.id;
  const deals = useDealCount(isPipeline ? "crm_pipelines_id" : "crm_stages_id", id);
  const name = isPipeline ? target.pipeline.name : target.stage.name;
  return (
    <ConfirmDialog
      title={t(isPipeline ? "pipe.deletePipeline" : "pipe.deleteStage", { name })}
      description={
        deals === undefined
          ? t("common.loading")
          : deals > 0
            ? t("crmset.blocked", { count: deals })
            : isPipeline
              ? t("pipe.deletePipelineHint", { count: target.pipeline.stages.length })
              : t("pipe.deleteStageHint")
      }
      confirmLabel={t("action.delete")}
      busy={deals !== 0}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

/* ===== Источники лидов и причины проигрыша ===== */

function EntryList({ data, addLabel, aside }: { data: ReturnType<typeof useCrmSources> | ReturnType<typeof useCrmLostReasons>; addLabel: string; aside: (e: Entry) => ReactNode }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState<Entry | null>(null);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        {data.entries.map((e, i) => (
          <div
            key={e.id}
            data-row
            className={row}
            {...dragRow(e.id, (dragged) => {
              const from = data.entries.findIndex((x) => x.id === dragged);
              if (from >= 0) run(data.reorder(from, i));
            })}
          >
            <Grip id={e.id} />
            <span className={`min-w-0 flex-1 ${e.active ? "" : "opacity-50"}`}>
              <Tag name={e.name} color={e.color} />
            </span>
            {aside(e)}
            <RowMenu
              name={e.name}
              color={e.color}
              onRename={(name) => run(data.update(e, { name }))}
              onColor={(color) => run(data.update(e, { color }))}
              onDelete={() => setDeleting(e)}
            />
          </div>
        ))}
        {!data.entries.length && <p className="py-4 text-center text-sm text-fg-subtle">{data.loading ? t("common.loading") : t("crmset.empty")}</p>}
      </div>
      <AddInline label={addLabel} onAdd={(name) => data.add(name, CHIP_HEX[CHIP_COLORS[data.entries.length % CHIP_COLORS.length]!])} />
      {deleting && (
        <DeleteEntry
          entry={deleting}
          field={data.field}
          onClose={() => setDeleting(null)}
          onConfirm={() => (run(data.remove(deleting), t("pipe.deleted")), setDeleting(null))}
        />
      )}
    </>
  );
}

/** С записью связаны сделки — не удалить: связь осталась бы на удалённую строку. Выключить можно. */
function DeleteEntry({ entry, field, onClose, onConfirm }: { entry: Entry; field: "crm_sources_id" | "crm_lost_reasons_id"; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const deals = useDealCount(field, entry.id);
  return (
    <ConfirmDialog
      title={t("crmset.deleteEntry", { name: entry.name })}
      description={deals === undefined ? t("common.loading") : deals > 0 ? t("crmset.entryBlocked", { count: deals }) : t("crmset.deleteEntryHint")}
      confirmLabel={t("action.delete")}
      busy={deals !== 0}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function ActiveSwitch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className="group flex items-center">
      <span className="relative h-4.5 w-7.5 shrink-0 rounded-full bg-border-strong transition-colors group-aria-checked:bg-accent-solid">
        <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-sm transition-[left] group-aria-checked:left-3.5" />
      </span>
    </button>
  );
}

export function CrmSourceSettings() {
  const { t } = useTranslation();
  const data = useCrmSources();
  return (
    <Screen title={t("dir.sources")} hint={t("dir.sourcesHint")}>
      <EntryList
        data={data}
        addLabel={t("crmset.addSource")}
        aside={(e) => <ActiveSwitch on={e.active} label={`${t("crmset.active")}: ${e.name}`} onToggle={() => run(data.update(e, { is_active: !e.active }))} />}
      />
    </Screen>
  );
}

export function CrmLostSettings() {
  const { t } = useTranslation();
  const data = useCrmLostReasons();
  return (
    <Screen title={t("dir.lost")} hint={t("dir.lostHint")}>
      <EntryList data={data} addLabel={t("crmset.addLost")} aside={(e) => <span className="text-xs text-fg-subtle">{t("crmset.dealsInMonth", { count: data.counts.get(e.id) ?? 0 })}</span>} />
    </Screen>
  );
}

/* ===== AI-анализ звонков ===== */

export function CrmCallQualitySettings() {
  const { t } = useTranslation();
  const data = useCallQuality();
  const [chosen, setChosen] = useState("");
  const version = data.versions.find((v) => v.id === chosen) ?? data.versions.find((v) => v.active) ?? data.versions[0];

  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <SectionHeader title={t("crmset.callQuality")} hint={t("crmset.callQualityHint")} />
      {!version ? (
        <p className="py-6 text-center text-sm text-fg-subtle">{data.loading ? t("common.loading") : t("crmset.noVersions")}</p>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <b className="block text-sm font-semibold">{t("crmset.auto")}</b>
                <small className="text-xs text-fg-muted">{t("crmset.autoHint")}</small>
              </div>
              <ActiveSwitch on={version.auto} label={t("crmset.auto")} onToggle={() => run(data.setAuto(version, !version.auto))} />
            </div>
            <label className="mt-3.5 block max-w-75">
              <span className={fieldLabel}>{t("crmset.activeVersion")}</span>
              <select
                className="h-(--spacing-input) w-full rounded-md border border-border bg-surface px-2 text-sm"
                value={version.id}
                onChange={(e) => {
                  const next = data.versions.find((v) => v.id === e.target.value);
                  if (!next) return;
                  setChosen(next.id);
                  run(data.activate(next), t("crmset.activated"));
                }}
              >
                {data.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CriteriaEditor key={version.id} version={version} onSave={(criteria, violations) => data.save(version, criteria, violations)} />
        </div>
      )}
    </div>
  );
}

const fit = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
};
const area = "w-full resize-none rounded-md border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent";

/** Черновик критериев правится на месте и уходит одной записью по «Сохранить». */
function CriteriaEditor({ version, onSave }: { version: CallQualityVersion; onSave: (c: Criterion[], v: string) => Promise<unknown> }) {
  const { t } = useTranslation();
  const [criteria, setCriteria] = useState(version.criteria);
  const [violations, setViolations] = useState(version.violations);
  const [invalid, setInvalid] = useState(-1);
  const [busy, setBusy] = useState(false);
  const total = criteria.reduce((sum, c) => sum + (Number(c.max_score) || 0), 0);
  const patch = (i: number, values: Partial<Criterion>) => setCriteria((list) => list.map((c, j) => (j === i ? { ...c, ...values } : c)));
  useEffect(() => document.querySelectorAll<HTMLTextAreaElement>("[data-fit]").forEach(fit));

  const save = () => {
    const bad = criteria.findIndex((c) => !c.name.trim());
    setInvalid(bad);
    if (bad >= 0) return void toast.error(t("crmset.nameRequired"));
    setBusy(true);
    onSave(criteria, violations).then(
      () => (setBusy(false), total === 100 ? toast.success(t("crmset.saved")) : toast.warning(t("crmset.savedOff", { total }))),
      () => setBusy(false),
    );
  };

  return (
    <>
      <div className="mt-2 flex items-center gap-3">
        <h3 className="text-base font-semibold">{t("crmset.criteria")}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${CHIP_STYLES[total === 100 ? "green" : "red"]}`}>
          <Icon as={total === 100 ? CheckCircle2Icon : TriangleAlertIcon} size={12} />
          {t("crmset.sum", { total })}
          {total !== 100 && ` — ${t(total > 100 ? "crmset.over" : "crmset.under", { count: Math.abs(100 - total) })}`}
        </span>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => setCriteria((list) => [...list, { id: `criterion-${crypto.randomUUID()}`, name: "", max_score: 0, instructions: "" }])}>
          <Icon as={PlusIcon} size={14} />
          {t("crmset.addCriterion")}
        </Button>
      </div>

      {criteria.map((c, i) => (
        <div key={c.id} data-row className="rounded-xl border border-border p-3" {...dragRow(c.id, (dragged) => setCriteria((list) => move(list, list.findIndex((x) => x.id === dragged), i)))}>
          <div className="flex items-end gap-2">
            <span className="pb-2.5">
              <Grip id={c.id} />
            </span>
            <label className="flex-1">
              <span className={fieldLabel}>{t("crmset.name")}</span>
              <Input value={c.name} aria-invalid={invalid === i} placeholder={t("crmset.criterionName")} onChange={(e) => patch(i, { name: e.target.value })} />
            </label>
            <label className="w-27.5">
              <span className={fieldLabel}>{t("crmset.maxScore")}</span>
              <Input type="number" min={0} max={100} value={c.max_score} onChange={(e) => patch(i, { max_score: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <button type="button" aria-label={t("crmset.deleteCriterion")} title={t("crmset.deleteCriterion")} className={`${rowButton} mb-1`} onClick={() => setCriteria((list) => list.filter((_, j) => j !== i))}>
              <Icon as={Trash2Icon} size={14} />
            </button>
          </div>
          <label className="mt-2 block">
            <span className={fieldLabel}>{t("crmset.rules")}</span>
            <textarea data-fit rows={4} className={area} value={c.instructions} placeholder={t("crmset.rulesPlaceholder")} onChange={(e) => (patch(i, { instructions: e.target.value }), fit(e.target))} />
          </label>
        </div>
      ))}
      {!criteria.length && <p className="py-4 text-center text-sm text-fg-subtle">{t("crmset.noCriteria")}</p>}

      <label className="block rounded-xl border border-border p-3">
        <span className={fieldLabel}>{t("crmset.violations")}</span>
        <textarea data-fit rows={4} className={area} value={violations} onChange={(e) => (setViolations(e.target.value), fit(e.target))} />
      </label>
      <div className="flex justify-end pb-6">
        <Button onClick={save} disabled={busy}>
          <Icon as={SaveIcon} size={14} />
          {t("action.save")}
        </Button>
      </div>
    </>
  );
}

