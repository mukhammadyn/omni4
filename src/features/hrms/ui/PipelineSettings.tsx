import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, EllipsisIcon, PencilIcon, PlusIcon, SearchIcon, StarIcon, Trash2Icon } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_COLORS, CHIP_DOT, CHIP_HEX, CHIP_STYLES, hexToChipColor, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { CONTAINERS, usePipelines, type Container, type Pipeline, type PipelineDraft, type Stage, type StageDraft } from "../api/pipelines";
import { Switch } from "./record-form";

/** Цвета групп — как варианты `container` в схеме. */
const GROUP: Record<Container, ChipColor> = { new: "blue", in_progress: "yellow", done: "green" };
const th = "px-3 py-2 text-left text-xs font-normal whitespace-nowrap text-fg-muted";
const td = "px-3 py-1.5";
const rowButton = "grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-active hover:text-fg";

type Editing = { kind: "pipeline"; pipeline: Pipeline | null } | { kind: "stage"; pipeline: Pipeline; stage: Stage | null };
type Deleting = { kind: "pipeline"; pipeline: Pipeline } | { kind: "stage"; stage: Stage };

/** «Воронки рекрутинга» — дерево `ot` прототипа: воронка и её этапы одной таблицей. */
export function PipelineSettings() {
  const { t } = useTranslation();
  const data = usePipelines();
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const q = search.trim().toLowerCase();
  const hit = (name: string) => !q || name.toLowerCase().includes(q);
  const shown = data.pipelines.filter((p) => hit(p.name) || p.stages.some((s) => hit(s.name)));
  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const run = (p: Promise<unknown>, done: string) => void p.then(() => toast.success(done), () => {});

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon as={SearchIcon} size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pipe.search")} className="pl-8" />
        </div>
        <Button onClick={() => setEditing({ kind: "pipeline", pipeline: null })}>
          <Icon as={PlusIcon} size={14} />
          {t("pipe.add")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>{t("pipe.name")}</th>
              <th className={th}>{t("pipe.group")}</th>
              <th className={`${th} text-right`}>{t("pipe.sla")}</th>
              <th className={`${th} text-right`}>{t("pipe.candidates")}</th>
              <th className={th}>{t("pipe.notifyShort")}</th>
              <th className="w-18" />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const open = Boolean(q) || !closed.has(p.id);
              const stages = q && !hit(p.name) ? p.stages.filter((s) => hit(s.name)) : p.stages;
              return [
                <tr key={p.id} className="group border-b border-border hover:bg-surface-hover">
                  <td className={`${td} w-full max-w-0`}>
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <button
                        type="button"
                        aria-label={open ? t("tree.collapse") : t("tree.expand")}
                        onClick={() => toggle(p.id)}
                        className="grid size-5 shrink-0 place-items-center rounded text-fg-subtle hover:bg-surface-active"
                      >
                        <Icon as={ChevronRightIcon} size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
                      </button>
                      <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[p.color ? hexToChipColor(p.color) : "gray"]}`} />
                      <span className={`truncate ${p.active ? "" : "text-fg-subtle line-through"}`} title={p.name}>
                        {p.name}
                      </span>
                      <span className="shrink-0 rounded bg-surface-hover px-1.5 text-xs text-fg-muted tabular-nums">{p.stages.length}</span>
                      {p.isDefault && (
                        <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs whitespace-nowrap ${CHIP_STYLES.blue}`}>
                          <Icon as={StarIcon} size={11} />
                          {t("pipe.default")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={td} />
                  <td className={`${td} text-right text-fg-muted tabular-nums`}>{p.sla ?? "—"}</td>
                  <td className={`${td} text-right text-fg-muted tabular-nums`}>{p.stages.reduce((sum, s) => sum + s.candidates, 0)}</td>
                  <td className={td} />
                  <td className={`${td} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-0.5">
                      <button
                        type="button"
                        aria-label={t("pipe.addStage")}
                        title={t("pipe.addStage")}
                        onClick={() => setEditing({ kind: "stage", pipeline: p, stage: null })}
                        className={`${rowButton} opacity-0 group-hover:opacity-100 focus:opacity-100`}
                      >
                        <Icon as={PlusIcon} size={14} />
                      </button>
                      <Popover
                        align="end"
                        trigger={({ toggle: open }) => (
                          <button type="button" aria-label={t("dir.actions")} onClick={open} className={rowButton}>
                            <Icon as={EllipsisIcon} size={14} />
                          </button>
                        )}
                      >
                        {(close) => (
                          <>
                            <PopoverItem icon={<Icon as={PencilIcon} />} onClick={() => (close(), setEditing({ kind: "pipeline", pipeline: p }))}>
                              {t("dir.edit")}
                            </PopoverItem>
                            <PopoverItem icon={<Icon as={PlusIcon} />} onClick={() => (close(), setEditing({ kind: "stage", pipeline: p, stage: null }))}>
                              {t("pipe.addStage")}
                            </PopoverItem>
                            <PopoverSeparator />
                            <PopoverItem danger icon={<Icon as={Trash2Icon} />} onClick={() => (close(), setDeleting({ kind: "pipeline", pipeline: p }))}>
                              {t("action.delete")}
                            </PopoverItem>
                          </>
                        )}
                      </Popover>
                    </span>
                  </td>
                </tr>,
                ...(open
                  ? stages.map((s, i) => (
                      <tr key={s.id} className="border-b border-border hover:bg-surface-hover">
                        <td className={`${td} w-full max-w-0`}>
                          <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: 28 }}>
                            <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[s.color ? hexToChipColor(s.color) : "gray"]}`} />
                            <span className="truncate" title={s.name}>
                              {s.name}
                            </span>
                          </span>
                        </td>
                        <td className={td}>
                          {s.container && (
                            <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs whitespace-nowrap ${CHIP_STYLES[GROUP[s.container]]}`}>
                              {t(`pipe.groups.${s.container}`)}
                            </span>
                          )}
                        </td>
                        <td className={`${td} text-right text-fg-muted tabular-nums`}>{s.sla ?? "—"}</td>
                        <td className={`${td} text-right text-fg-muted tabular-nums`}>{s.candidates}</td>
                        <td className={td}>
                          <Switch on={s.notify} label="" ariaLabel={`${t("pipe.notify")}: ${s.name}`} onToggle={() => void data.toggleNotify(s)} />
                        </td>
                        <td className={`${td} text-right`}>
                          <Popover
                            align="end"
                            trigger={({ toggle: open }) => (
                              <button type="button" aria-label={t("dir.actions")} onClick={open} className={rowButton}>
                                <Icon as={EllipsisIcon} size={14} />
                              </button>
                            )}
                          >
                            {(close) => (
                              <>
                                <PopoverItem icon={<Icon as={PencilIcon} />} onClick={() => (close(), setEditing({ kind: "stage", pipeline: p, stage: s }))}>
                                  {t("dir.edit")}
                                </PopoverItem>
                                {i > 0 && !q && (
                                  <PopoverItem icon={<Icon as={ArrowUpIcon} />} onClick={() => (close(), void data.moveStage(p, s, -1))}>
                                    {t("dir.moveUp")}
                                  </PopoverItem>
                                )}
                                {i < stages.length - 1 && !q && (
                                  <PopoverItem icon={<Icon as={ArrowDownIcon} />} onClick={() => (close(), void data.moveStage(p, s, 1))}>
                                    {t("dir.moveDown")}
                                  </PopoverItem>
                                )}
                                <PopoverSeparator />
                                <PopoverItem danger icon={<Icon as={Trash2Icon} />} onClick={() => (close(), setDeleting({ kind: "stage", stage: s }))}>
                                  {t("action.delete")}
                                </PopoverItem>
                              </>
                            )}
                          </Popover>
                        </td>
                      </tr>
                    ))
                  : []),
              ];
            })}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-fg-subtle">
                  {data.loading ? t("common.loading") : t("pipe.none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing?.kind === "pipeline" && (
        <PipelineDialog
          pipeline={editing.pipeline}
          onClose={() => setEditing(null)}
          onSave={(draft) => data.savePipeline(editing.pipeline?.id ?? null, draft).then(() => (setEditing(null), toast.success(t("pipe.saved"))))}
        />
      )}
      {editing?.kind === "stage" && (
        <StageDialog
          stage={editing.stage}
          onClose={() => setEditing(null)}
          onSave={(draft) => data.saveStage(editing.pipeline, editing.stage?.id ?? null, draft).then(() => (setEditing(null), toast.success(t("pipe.saved"))))}
        />
      )}
      {deleting && <DeleteDialog deleting={deleting} busy={data.busy} onClose={() => setDeleting(null)} onConfirm={() => {
        const done = t("pipe.deleted");
        run(deleting.kind === "pipeline" ? data.removePipeline(deleting.pipeline) : data.removeStage(deleting.stage), done);
        setDeleting(null);
      }} />}
    </div>
  );
}

/** Удалить нельзя, пока на этапах есть кандидаты или на воронке вакансии: они повисли бы без этапа. */
function DeleteDialog({ deleting, busy, onClose, onConfirm }: { deleting: Deleting; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  // Любой статус: у нанятого и отклонённого этап — последний пройденный, его видно в карточке.
  const candidates = deleting.kind === "pipeline" ? deleting.pipeline.stages.reduce((sum, s) => sum + s.linked, 0) : deleting.stage.linked;
  const vacancies = deleting.kind === "pipeline" ? deleting.pipeline.vacancies : 0;
  const blocked = candidates > 0 || vacancies > 0;
  const name = deleting.kind === "pipeline" ? deleting.pipeline.name : deleting.stage.name;
  return (
    <ConfirmDialog
      title={t(deleting.kind === "pipeline" ? "pipe.deletePipeline" : "pipe.deleteStage", { name })}
      description={
        blocked
          ? t("pipe.blocked", { candidates, vacancies })
          : deleting.kind === "pipeline"
            ? t("pipe.deletePipelineHint", { count: deleting.pipeline.stages.length })
            : t("pipe.deleteStageHint")
      }
      confirmLabel={t("action.delete")}
      busy={busy || blocked}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

function ColorPick({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const chosen = value ? hexToChipColor(value) : null;
  return (
    <div className="flex flex-wrap gap-2">
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

const label = "mb-1 block text-xs font-medium text-fg-muted";
const slaOf = (value: string) => (value.trim() === "" ? null : Math.max(0, Math.round(Number(value)) || 0));

function Frame({ title, busy, valid, onClose, onSubmit, children }: { title: string; busy: boolean; valid: boolean; onClose: () => void; onSubmit: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose}>
      <form
        onSubmit={(e) => (e.preventDefault(), valid && !busy && onSubmit())}
        className="w-full max-w-md rounded-xl border border-border bg-surface shadow-modal"
      >
        <h2 className="border-b border-border px-4 py-3 font-semibold">{title}</h2>
        <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {t("action.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PipelineDialog({ pipeline, onClose, onSave }: { pipeline: Pipeline | null; onClose: () => void; onSave: (d: PipelineDraft) => Promise<unknown> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(pipeline?.name ?? "");
  const [color, setColor] = useState(pipeline?.color ?? CHIP_HEX.blue);
  const [sla, setSla] = useState(pipeline?.sla?.toString() ?? "");
  const [isDefault, setDefault] = useState(pipeline?.isDefault ?? false);
  const [active, setActive] = useState(pipeline?.active ?? true);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setBusy(true);
    onSave({ name: name.trim(), color, sla: slaOf(sla), isDefault, active }).catch(() => setBusy(false));
  };
  return (
    <Frame title={t(pipeline ? "pipe.editPipeline" : "pipe.add")} busy={busy} valid={Boolean(name.trim())} onClose={onClose} onSubmit={submit}>
      <label>
        <span className={label}>{t("pipe.name")}</span>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <span className={label}>{t("pipe.color")}</span>
        <ColorPick value={color} onChange={setColor} />
      </div>
      <label>
        <span className={label}>{t("pipe.slaTotal")}</span>
        <Input type="number" min={0} value={sla} onChange={(e) => setSla(e.target.value)} />
      </label>
      <Switch on={isDefault} label={t("pipe.isDefault")} onToggle={() => setDefault(!isDefault)} />
      <Switch on={active} label={t("pipe.active")} onToggle={() => setActive(!active)} />
    </Frame>
  );
}

function StageDialog({ stage, onClose, onSave }: { stage: Stage | null; onClose: () => void; onSave: (d: StageDraft) => Promise<unknown> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? CHIP_HEX.blue);
  const [container, setContainer] = useState<Container | "">(stage?.container ?? "in_progress");
  const [sla, setSla] = useState(stage?.sla?.toString() ?? "");
  const [notify, setNotify] = useState(stage?.notify ?? false);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    setBusy(true);
    onSave({ name: name.trim(), color, container, sla: slaOf(sla), notify }).catch(() => setBusy(false));
  };
  return (
    <Frame title={t(stage ? "pipe.editStage" : "pipe.addStage")} busy={busy} valid={Boolean(name.trim())} onClose={onClose} onSubmit={submit}>
      <label>
        <span className={label}>{t("pipe.name")}</span>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <span className={label}>{t("pipe.group")}</span>
        <Tabs
          variant="field"
          activeId={container}
          onSelect={(id) => setContainer(id as Container)}
          tabs={CONTAINERS.map((c) => ({ id: c, label: t(`pipe.groups.${c}`) }))}
        />
      </div>
      <div>
        <span className={label}>{t("pipe.color")}</span>
        <ColorPick value={color} onChange={setColor} />
      </div>
      <label>
        <span className={label}>{t("pipe.sla")}</span>
        <Input type="number" min={0} value={sla} onChange={(e) => setSla(e.target.value)} />
      </label>
      <Switch on={notify} label={t("pipe.notify")} hint={t("pipe.notifyHint")} onToggle={() => setNotify(!notify)} />
    </Frame>
  );
}
