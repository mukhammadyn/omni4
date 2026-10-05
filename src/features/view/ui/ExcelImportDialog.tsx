import { useRef, useState } from "react";
import { CloudUploadIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { localized, useCreateTextFields, type Field } from "@/features/table";
import { slugify } from "@/shared/lib/slug";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { useImportExcel, useReadExcel } from "../api/excel";

/**
 * Загрузка строк из Excel.
 *
 * Два шага в одном окне: выбрать файл, потом сопоставить его столбцы
 * с полями таблицы. Второй шаг обязателен и не сворачивается в «мы всё
 * угадали»: в шапке файла человеческие названия, а не слаги, и
 * молчаливая догадка пишет данные не в те колонки — а это уже не
 * отменить кнопкой.
 *
 * Сопоставление идёт от ПОЛЯ к столбцу, а не наоборот: полей у таблицы
 * конечное известное число, а столбцов в чужом файле бывает пятьдесят,
 * из которых нужны три.
 *
 * Столбцы, которым не нашлось поля, перечислены отдельно: под отмеченные
 * перед импортом заводятся текстовые поля с подписью из шапки. Отметки
 * стоят сами, только когда своих полей у таблицы нет вовсе, — иначе
 * пятьдесят столбцов чужого файла молча стали бы пятьюдесятью колонками.
 */
export function ExcelImportDialog({
  tableSlug,
  fields,
  language,
  canAddFields,
  onClose,
}: {
  tableSlug: string;
  /** Поля таблицы: заполнить можно любое, а не только показанное во view. */
  fields: Field[];
  language: string;
  /** Заводить поля под столбцы без пары. Нет — столбцы просто пропускаются. */
  canAddFields: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);

  const read = useReadExcel();
  const write = useImportExcel(tableSlug);
  const createFields = useCreateTextFields(tableSlug);

  const [file, setFile] = useState<{ excelId: string; columns: string[] } | null>(null);
  /** Поле → столбец файла. Нет ключа — поле не заполняется. */
  const [mapping, setMapping] = useState<Record<string, string>>({});
  /* Кроме guid: его ставит сама база, а текст из файла в UUID не ляжет. */
  const fillable = fields.filter((field) => field.slug !== "guid");
  /** Столбцы без поля, под которые перед импортом завести поле. */
  const [create, setCreate] = useState<Set<string>>(new Set());

  const pick = (chosen: File | undefined) => {
    if (!chosen) return;

    read.mutate(chosen, {
      onSuccess: (result) => {
        setFile(result);
        /*
         * Предзаполняем только точные совпадения подписи или слага со
         * столбцом. «Похоже» здесь не годится: «Цена» и «Цена закупки»
         * отличаются одним словом и парой тысяч рублей в каждой строке.
         */
        const byLabel = new Map(result.columns.map((column) => [column.trim().toLowerCase(), column]));
        const bySlug = new Map(result.columns.map((column) => [slugify(column), column]));
        const guessed: Record<string, string> = {};

        for (const field of fillable) {
          const column =
            byLabel.get(localized(field.labels, language, field.label).trim().toLowerCase()) ?? bySlug.get(field.slug);
          if (column && !Object.values(guessed).includes(column)) guessed[field.id] = column;
        }

        setMapping(guessed);
        setCreate(fillable.length || !canAddFields ? new Set() : new Set(result.columns));
      },
    });
  };

  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const free = (file?.columns ?? []).filter((column) => !mapped.has(column));
  // Отметки, поставленные до того, как право пропало, не создают полей.
  const creating = canAddFields ? free.filter((column) => create.has(column)) : [];
  const busy = createFields.isPending || write.isPending;

  const submit = async () => {
    /* Карта переворачивается на отправку: ручка ждёт «столбец → поле». */
    const body: Record<string, string> = {};
    for (const [fieldId, column] of Object.entries(mapping)) {
      if (column) body[column] = fieldId;
    }

    if (creating.length) {
      try {
        const ids = await createFields.mutateAsync({
          labels: creating,
          taken: fields.map((field) => field.slug),
          language,
        });
        creating.forEach((column, index) => (body[column] = ids[index]!));
      } catch {
        return; // Ошибку уже показал хук; окно остаётся — можно снять отметки и повторить.
      }
    }

    write.mutate({ excelId: file?.excelId ?? "", mapping: body }, { onSuccess: onClose });
  };

  const toggle = (column: string) =>
    setCreate((prev) => {
      const next = new Set(prev);
      if (!next.delete(column)) next.add(column);
      return next;
    });

  return (
    <Modal onClose={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-modal">
        <h2 className="text-base font-semibold">{t("view.import")}</h2>

        {!file ? (
          <>
            <p className="text-sm text-fg-muted">{t("view.importHint")}</p>

            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => pick(event.target.files?.[0])}
            />

            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={read.isPending}
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong p-8 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon as={read.isPending ? LoaderCircleIcon : CloudUploadIcon} size={24} className={read.isPending ? "animate-spin" : ""} />
              {t(read.isPending ? "common.loading" : "view.importPick")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-fg-muted">{t(fillable.length ? "view.importMapHint" : "view.importNoFields")}</p>

            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {fillable.map((field) => (
                <label key={field.id} className="flex h-9 items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg-muted">
                    {localized(field.labels, language, field.label)}
                  </span>

                  <Dropdown
                    value={mapping[field.id] ?? ""}
                    placeholder={t("view.importSkip")}
                    ariaLabel={localized(field.labels, language, field.label)}
                    className="w-56 shrink-0"
                    items={file.columns.map((column) => ({ value: column, label: column }))}
                    onChange={(column) => setMapping((prev) => ({ ...prev, [field.id]: column }))}
                  />
                </label>
              ))}

              {canAddFields && free.length > 0 && (
                <section className={fillable.length ? "mt-3 border-t border-border pt-3" : ""}>
                  <label className="flex h-8 items-center gap-2 text-xs font-medium text-fg-subtle">
                    <Checkbox
                      checked={creating.length === free.length}
                      indeterminate={creating.length > 0 && creating.length < free.length}
                      onChange={() => setCreate(new Set(creating.length === free.length ? [] : free))}
                    />
                    {t("view.importCreateTitle", { count: free.length })}
                  </label>

                  {free.map((column) => (
                    <label key={column} className="flex h-8 items-center gap-2 text-sm">
                      <Checkbox checked={create.has(column)} onChange={() => toggle(column)} />
                      <span className="min-w-0 flex-1 truncate">{column}</span>
                      {create.has(column) && <span className="text-xs text-fg-subtle">{t("view.importNewField")}</span>}
                    </label>
                  ))}
                </section>
              )}
            </div>
          </>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          {file && (
            <span className="mr-auto text-xs text-fg-subtle">
              {t("view.importChosen", { count: mapped.size })}
              {creating.length > 0 && ` · ${t("view.importCreating", { count: creating.length })}`}
            </span>
          )}

          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>

          {file && (
            <Button disabled={(!mapped.size && !creating.length) || busy} onClick={() => void submit()}>
              {t("view.import")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
