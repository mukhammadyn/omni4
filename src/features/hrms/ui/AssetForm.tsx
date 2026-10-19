import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BoxesIcon, CheckIcon, CircleDotIcon, FileTextIcon, ImagePlusIcon, Trash2Icon, UserCheckIcon } from "lucide-react";
import { fileUrl, uploadFolder, useItem, useUploadFiles, type Item } from "@/features/item";
import { localized, useTableSchema, type Field, type Relation } from "@/features/table";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { ASSETS, useSaveAsset } from "../api/asset";
import { blank, formError, FormBar, FormField, FormItem, FormSection } from "./record-form";
import { EmployeePicker } from "./ShiftDialog";

/** «Основное» — `edit()` прототипа, слагами схемы; фото — своим блоком выше. */
const BASE = ["name", "category", "serial_number", "cost", "currency", "purchase_date", "warranty_until", "description"];
const FULL = new Set(["name", "description"]);

/**
 * Форма имущества — `edit()` прототипа (property.html): фото, учётные
 * данные, у новой — «Выдача» сразу сотруднику. Статус и владелец здесь
 * не правятся — это движение (страница), как в udevs_hrms_admin.
 */
export function AssetForm({
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
  const record = useItem(ASSETS, guid, Boolean(guid));
  const { schema, isLoading } = useTableSchema(ASSETS);
  const relations = useMemo(() => new Map(schema.relations.map((r) => [r.id, r])), [schema.relations]);
  if (isLoading || (guid && !record.item)) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;
  return (
    <Editor
      guid={guid}
      row={record.item ?? { guid: "", currency: "UZS" }}
      fields={schema.fields}
      relations={relations}
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
  locale,
  language,
  onSaved,
  onClose,
}: {
  guid: string;
  row: Item;
  fields: Field[];
  relations: Map<string, Relation>;
  locale: string;
  language: string;
  onSaved: (guid: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const creating = !guid;
  const [draft, setDraft] = useState<Item>(row);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [employee, setEmployee] = useState("");
  const save = useSaveAsset();
  const upload = useUploadFiles();
  const bySlug = useMemo(() => new Map(fields.map((f) => [f.slug, f])), [fields]);
  /* MULTI_IMAGE — список адресов; у старых строк бывает одна строка. */
  const photos = (Array.isArray(draft.photos) ? draft.photos : [draft.photos]).filter((url): url is string => typeof url === "string" && url !== "");

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
          tableSlug={ASSETS}
          relations={relations}
          locale={locale}
          language={language}
          creating={creating}
          required={slug === "name"}
          wide={FULL.has(slug)}
          {...(slug === "name" ? { placeholder: t("asset.namePlaceholder") } : slug === "serial_number" ? { placeholder: "SN-000001" } : {})}
          onChange={(value, extra) => set(slug, value, extra)}
        />
      )
    );
  };

  const addPhotos = (files: File[]) => {
    const photoField = bySlug.get("photos");
    if (!files.length || !photoField) return;
    upload
      .mutateAsync({ files, folder: uploadFolder(photoField.attributes) })
      .then((urls) => set("photos", [...photos, ...urls]), () => undefined);
  };

  const submit = () => {
    const name = bySlug.get("name");
    if (name && blank(draft.name)) return toast.error(`${localized(name.labels, language, name.label)}: ${t("cell.required")}`);
    const problem = formError(creating ? fields : fields.filter((f) => changed.has(f.slug)), draft, language, t);
    if (problem) return toast.error(problem);
    const slugs = creating ? [...BASE, "photos"].filter((slug) => bySlug.has(slug) && !blank(draft[slug])) : [...changed];
    save.mutate(
      { guid, values: Object.fromEntries(slugs.map((slug) => [slug, draft[slug]])), ...(creating && employee ? { employee } : {}) },
      { onSuccess: onSaved },
    );
  };

  return (
    <>
      <div className="mx-auto max-w-[860px] pt-5 pb-24">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[10px] bg-surface-hover text-fg-muted">
            <Icon as={BoxesIcon} size={20} />
          </span>
          <div>
            <h1 className="text-[22px] font-semibold">{t(creating ? "asset.form.new" : "asset.form.title")}</h1>
            <p className="text-sm text-fg-muted">{t("asset.form.subtitle")}</p>
          </div>
        </div>

        <FormSection icon={FileTextIcon} title={t("asset.form.base")} hint={t("asset.form.baseHint")}>
          <FormItem label={bySlug.get("photos") ? localized(bySlug.get("photos")!.labels, language, bySlug.get("photos")!.label) : ""} wide>
            <div className="flex flex-wrap items-center gap-3">
              {photos.map((url) => (
                <span key={url} className="group relative">
                  <img src={fileUrl(url)} alt="" className="size-20 rounded-lg border border-border object-cover" />
                  <button
                    type="button"
                    aria-label={t("action.delete")}
                    onClick={() => set("photos", photos.filter((item) => item !== url))}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-surface/85 text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    <Icon as={Trash2Icon} size={13} />
                  </button>
                </span>
              ))}
              <label className="flex cursor-pointer items-center gap-2">
                <span className="grid size-20 place-items-center rounded-lg border border-dashed border-border-strong text-fg-subtle hover:bg-surface-hover">
                  <Icon as={ImagePlusIcon} size={22} />
                </span>
                <span className="text-sm">
                  <span className="text-accent-text">{upload.isPending ? t("cell.uploading") : t(photos.length ? "asset.form.addPhoto" : "asset.form.uploadPhoto")}</span>
                  <small className="block text-xs text-fg-subtle">{t("asset.form.photoHint")}</small>
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    addPhotos([...(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </FormItem>
          {BASE.map((slug) => field(slug))}
        </FormSection>

        {creating && (
          <FormSection icon={UserCheckIcon} title={t("asset.form.issue")} hint={t("asset.form.issueHint")}>
            <FormItem label={t("asset.employee")} wide>
              <EmployeePicker value={employee ? [employee] : []} onChange={(ids) => setEmployee(ids.filter((id) => id !== employee).at(-1) ?? "")} />
              <small className="text-xs text-fg-subtle">{t("asset.form.issueEmpty")}</small>
            </FormItem>
          </FormSection>
        )}
      </div>

      <FormBar
        note={
          <>
            <Icon as={CircleDotIcon} size={12} />
            {t(creating ? "asset.form.new" : "asset.form.title")}
          </>
        }
      >
        <Button variant="secondary" onClick={onClose}>
          {t("action.cancel")}
        </Button>
        <Button onClick={submit} disabled={save.isPending || upload.isPending}>
          <Icon as={CheckIcon} size={15} />
          {t(creating ? "asset.form.create" : "action.save")}
        </Button>
      </FormBar>
    </>
  );
}
