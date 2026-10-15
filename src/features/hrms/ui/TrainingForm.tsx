import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookCheckIcon,
  CheckIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  PaperclipIcon,
  Trash2Icon,
  UploadCloudIcon,
  UsersIcon,
} from "lucide-react";
import { uploadFolder, useUploadFiles, type Item } from "@/features/item";
import { localized, useTableSchema, type Field, type Relation } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { text } from "../api/org";
import { MATERIALS, TRAININGS, useSaveTraining, useTrainingDraftSource, type MaterialDraft } from "../api/training";
import { blank, formError, FormBar, FormField, FormItem, FormSection } from "./record-form";
import { EmployeePicker } from "./ShiftDialog";
import { fileName } from "./TrainingPage";

/*
 * Секция «Основное» — `edit()` прототипа: что, когда и где. Тип, часы
 * и провайдер — поля схемы сверх прототипа: в форме, но не на странице.
 */
const BASE = ["title", "status", "category", "core_users_id", "starts_at", "ends_at", "location", "type", "hours", "provider", "description"];
const FULL = new Set(["title", "status", "location"]);

/**
 * Форма тренинга — `edit()` прототипа: «Основное», «Домашнее задание»,
 * «Сотрудники», «Материалы». `guid` пуст — новый тренинг.
 * Всё уходит по «Сохранить» (useSaveTraining).
 */
export function TrainingForm({
  guid,
  locale,
  language,
  onSaved,
  onClose,
}: {
  guid: string;
  locale: string;
  language: string;
  onSaved: (guid: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const source = useTrainingDraftSource(guid);
  const relations = useMemo(() => new Map(source.relations.map((r) => [r.id, r])), [source.relations]);
  if (source.isLoading || (guid && (!source.row || source.partsLoading)))
    return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;
  return (
    <Editor
      guid={guid}
      row={source.row ?? { guid: "", status: "draft", type: "event", homework_required: false }}
      fields={source.fields}
      relations={relations}
      participants={source.participants}
      materials={source.materials}
      locale={locale}
      language={language}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

function Editor({
  guid,
  row,
  fields,
  relations,
  participants,
  materials,
  locale,
  language,
  onSaved,
  onClose,
}: {
  guid: string;
  row: Item;
  fields: Field[];
  relations: Map<string, Relation>;
  participants: ReturnType<typeof useTrainingDraftSource>["participants"];
  materials: ReturnType<typeof useTrainingDraftSource>["materials"];
  locale: string;
  language: string;
  onSaved: (guid: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const creating = !guid;
  const [draft, setDraft] = useState<Item>(row);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [employeeIds, setEmployeeIds] = useState(() => participants.map((p) => p.employeeId));
  const [nextMaterials, setNextMaterials] = useState<MaterialDraft[]>(materials);
  const [link, setLink] = useState({ title: "", url: "" });
  const saveTraining = useSaveTraining();
  const upload = useUploadFiles();
  const { schema: materialSchema } = useTableSchema(MATERIALS);
  const bySlug = useMemo(() => new Map(fields.map((f) => [f.slug, f])), [fields]);
  const homework = draft.homework_required === true;

  const set = (slug: string, value: unknown, extra: Item = {}) => {
    setDraft((cur) => ({ ...cur, [slug]: value, ...extra }));
    setChanged((cur) => new Set(cur).add(slug));
  };
  const field = (slug: string) => {
    const f = bySlug.get(slug);
    return (
      f && (
        <FormField
          key={f.id}
          field={f}
          row={draft}
          tableSlug={TRAININGS}
          relations={relations}
          locale={locale}
          language={language}
          creating={creating}
          required={slug === "title"}
          {...(FULL.has(slug) ? { wide: true } : {})}
          onChange={(value, extra) => set(slug, value, extra)}
        />
      )
    );
  };

  const save = () => {
    const title = bySlug.get("title");
    if (title && blank(draft.title)) return toast.error(`${localized(title.labels, language, title.label)}: ${t("cell.required")}`);
    const problem = formError(creating ? fields : fields.filter((f) => changed.has(f.slug)), draft, language, t);
    if (problem) return toast.error(problem);
    /* Конец раньше начала — тренинг одного дня, как `tfSave` прототипа. */
    const ends = text(draft.ends_at) && text(draft.starts_at) && text(draft.ends_at) < text(draft.starts_at) ? { ends_at: draft.starts_at } : {};
    const values = creating
      ? Object.fromEntries(fields.filter((f) => !blank(draft[f.slug])).map((f) => [f.slug, draft[f.slug]]))
      : Object.fromEntries([...changed].map((slug) => [slug, draft[slug]]));
    saveTraining.mutate(
      { guid, values: { ...values, ...ends }, homework, participants, employeeIds, materials, nextMaterials },
      { onSuccess: onSaved },
    );
  };

  const addFiles = (files: File[]) => {
    const fileField = materialSchema.fields.find((f) => f.slug === "file");
    if (!files.length) return;
    upload.mutate(
      { files, folder: uploadFolder(fileField?.attributes ?? {}) },
      {
        onSuccess: (urls) =>
          setNextMaterials((cur) => [...cur, ...urls.map((url) => ({ title: fileName(url), type: "file", file: url, url: "" }))]),
      },
    );
  };
  const addLink = () => {
    const url = link.url.trim();
    if (!url) return toast.error(t("training.form.linkRequired"));
    setNextMaterials((cur) => [...cur, { title: link.title.trim() || url, type: "link", file: "", url }]);
    setLink({ title: "", url: "" });
  };

  return (
    <>
      <div className="mx-auto max-w-[860px] pt-5 pb-24">
        <h1 className="mb-1 text-[22px] font-semibold">{t(creating ? "training.form.new" : "training.form.title")}</h1>
        <p className="mb-4 text-sm text-fg-muted">{t("training.form.subtitle")}</p>

        <FormSection icon={FileTextIcon} title={t("training.form.base")} hint={t("training.form.baseHint")}>
          {BASE.map((slug) => field(slug))}
        </FormSection>

        <FormSection icon={BookCheckIcon} title={t("training.homework")} hint={t("training.form.homeworkHint")}>
          {field("homework_required")}
          {homework && field("homework_due")}
        </FormSection>

        <FormSection icon={UsersIcon} title={`${t("training.form.participants")} · ${employeeIds.length}`} hint={t("training.form.participantsHint")}>
          <FormItem wide>
            <EmployeePicker value={employeeIds} onChange={setEmployeeIds} />
          </FormItem>
        </FormSection>

        <FormSection icon={PaperclipIcon} title={`${t("training.materials")} · ${nextMaterials.length}`} hint={t("training.form.materialsHint")}>
          <FormItem wide>
            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-sm text-fg-muted transition-colors hover:bg-surface-hover">
              <Icon as={UploadCloudIcon} size={20} />
              {upload.isPending ? t("cell.uploading") : t("training.form.drop")}
              <input type="file" multiple hidden onChange={(e) => addFiles([...(e.target.files ?? [])])} />
            </label>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg bg-surface-hover p-2.5 max-md:grid-cols-1">
              <Input value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} placeholder={t("training.form.linkTitle")} />
              <Input value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="https://…" />
              <Button variant="secondary" onClick={addLink}>
                <Icon as={LinkIcon} size={15} />
                {t("training.form.addLink")}
              </Button>
            </div>
            {nextMaterials.map((m, at) => (
              <div key={m.id ?? `new-${at}`} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <Icon as={m.url ? ExternalLinkIcon : FileTextIcon} size={15} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">{m.title || fileName(m.file || m.url)}</span>
                <button
                  type="button"
                  aria-label={t("action.delete")}
                  onClick={() => setNextMaterials((cur) => cur.filter((_, i) => i !== at))}
                  className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-danger"
                >
                  <Icon as={Trash2Icon} size={14} />
                </button>
              </div>
            ))}
          </FormItem>
        </FormSection>
      </div>

      <FormBar
        note={
          <>
            <Icon as={CircleDotIcon} size={12} />
            {t(creating ? "training.form.new" : "training.form.title")}
          </>
        }
      >
        <Button variant="secondary" onClick={onClose}>
          {t("action.cancel")}
        </Button>
        <Button onClick={save} disabled={saveTraining.isPending || upload.isPending}>
          <Icon as={CheckIcon} size={15} />
          {t("action.save")}
        </Button>
      </FormBar>
    </>
  );
}
