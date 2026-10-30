import { useDeferredValue, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MAX_LIMIT, useItems } from "@/features/item";
import { localized, useTableSchema } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { slugify } from "@/shared/lib/slug";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_COLORS, CHIP_DOT, CHIP_HEX, Chip, hexToChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { useSaveFieldOptions, type OptionDraft } from "../api/field-options";
import type { OptionsSection } from "./directories";
import { LogEmpty, SectionHeader, Td, Th } from "./parts";

/**
 * Справочник, у которого нет таблицы, — варианты PICK_LIST («Типы
 * занятости»). Вид тот же, что у DirectorySettings: тег-название,
 * «Сотрудники», меню строки; окно — название и цвет.
 *
 * Каждое действие сохраняет весь список сразу: вариантов единицы,
 * а ручка поля принимает только его целиком.
 */
export function OptionsSettings({ section }: { section: OptionsSection }) {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [main] = section.tables;
  const { schema, error } = useTableSchema(main);
  const save = useSaveFieldOptions(section.tables, section.field, language);

  const field = schema.fields.find((one) => one.slug === section.field);
  /* ponytail: строки считаются на клиенте одним запросом (MAX_LIMIT), как
     в DirectorySettings; больше тысячи сотрудников — нужен агрегат. */
  const rows = useItems(main, { limit: MAX_LIMIT, page: 1, relations: false });
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of rows.page.rows) {
      const raw = row[section.field];
      // MULTISELECT — список значений, PICK_LIST — одно.
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (typeof value === "string" && value) out.set(value, (out.get(value) ?? 0) + 1);
      }
    }
    return out;
  }, [rows.page.rows, section.field]);

  /*
   * Варианты поля и, в конце, значения, которые уже стоят в строках, но
   * вариантом не заведены: навыки вписывали свободным текстом, и
   * вариантов у поля не было вовсе. Первое сохранение заводит их все —
   * со slug, равным тексту, так что строки с ними совпадают сразу.
   */
  const options: OptionDraft[] = useMemo(() => {
    const own = [...(field?.options.values() ?? [])].map((one) => ({
      value: one.value,
      label: localized(one.labels, language, one.label),
      color: one.color ?? "",
    }));
    const known = new Set(own.flatMap((one) => [one.value, one.label]));
    const loose = [...counts.keys()]
      .filter((value) => !known.has(value))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value, color: "" }));
    return [...own, ...loose];
  }, [field, language, counts]);

  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());
  const shown = options.filter((one) => !search || one.label.toLowerCase().includes(search));

  const [editing, setEditing] = useState<OptionDraft | "new" | null>(null);
  const [deleting, setDeleting] = useState<OptionDraft | null>(null);

  const commit = (next: OptionDraft[], done?: () => void) =>
    save.mutate(next, {
      onSuccess: () => {
        toast.success(t("settings.saved"));
        done?.();
      },
    });

  const move = (at: number, step: -1 | 1) => {
    const next = [...options];
    const other = next[at + step];
    if (!other) return;
    next[at + step] = next[at]!;
    next[at] = other;
    commit(next);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-6">
      <SectionHeader title={t(section.titleKey)} hint={t(section.hintKey)} />

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon
            as={SearchIcon}
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("table.search")}
            aria-label={t("table.search")}
            className="pl-8"
          />
        </div>
        <Button onClick={() => setEditing("new")}>
          <Icon as={PlusIcon} size={14} />
          {t("dir.add")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <LogEmpty text={String(error)} />
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>{t("dir.name")}</Th>
                <Th className="text-right">{t("dir.employees")}</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {shown.map((option) => {
                const at = options.indexOf(option);
                return (
                  <tr
                    key={option.value}
                    onClick={() => setEditing(option)}
                    className="group cursor-pointer transition-colors hover:bg-surface-hover"
                  >
                    <Td>
                      {section.dot ? (
                        <span className="flex items-center gap-2 font-medium">
                          <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[option.color ? hexToChipColor(option.color) : "gray"]}`} />
                          {option.label}
                        </span>
                      ) : (
                        <Chip color={option.color ? hexToChipColor(option.color) : "gray"}>{option.label}</Chip>
                      )}
                    </Td>
                    <Td className="text-right text-fg-muted tabular-nums">
                      {rows.isLoading ? "—" : (counts.get(option.value) ?? 0)}
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
                        <Popover
                          align="end"
                          trigger={({ toggle }) => (
                            <button
                              type="button"
                              aria-label={t("dir.actions")}
                              title={t("dir.actions")}
                              onClick={toggle}
                              className="grid size-6 cursor-pointer place-items-center rounded text-fg-subtle hover:bg-surface-active hover:text-fg"
                            >
                              <Icon as={EllipsisIcon} size={14} />
                            </button>
                          )}
                        >
                          {(close) => {
                            const run = (action: () => void) => () => {
                              close();
                              action();
                            };
                            return (
                              <>
                                <PopoverItem icon={<Icon as={PencilIcon} />} onClick={run(() => setEditing(option))}>
                                  {t("dir.edit")}
                                </PopoverItem>
                                {!search && (
                                  <>
                                    <PopoverItem icon={<Icon as={ArrowUpIcon} />} onClick={run(() => move(at, -1))}>
                                      {t("dir.moveUp")}
                                    </PopoverItem>
                                    <PopoverItem icon={<Icon as={ArrowDownIcon} />} onClick={run(() => move(at, 1))}>
                                      {t("dir.moveDown")}
                                    </PopoverItem>
                                  </>
                                )}
                                <PopoverSeparator />
                                <PopoverItem danger icon={<Icon as={Trash2Icon} />} onClick={run(() => setDeleting(option))}>
                                  {t("action.delete")}
                                </PopoverItem>
                              </>
                            );
                          }}
                        </Popover>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!error && !shown.length && <LogEmpty text={search ? t("dir.notFound") : t("dir.empty")} />}
      </div>

      {options.length > 0 && (
        <p className="mt-2 shrink-0 text-xs text-fg-subtle tabular-nums">
          {search
            ? t("dir.found", { found: shown.length, total: options.length })
            : t("dir.count", { count: options.length })}
        </p>
      )}

      {editing && (
        <OptionDialog
          option={editing === "new" ? undefined : editing}
          title={editing === "new" ? `${t("dir.add")}: ${t(section.titleKey)}` : `${t("dir.edit")}: ${editing.label}`}
          busy={save.isPending}
          onDelete={editing === "new" ? undefined : () => setDeleting(editing)}
          onSave={(draft) => {
            const next =
              editing === "new"
                ? [...options, { ...draft, value: uniqueValue(draft.label, options) }]
                : options.map((one) => (one.value === editing.value ? { ...one, ...draft } : one));
            commit(next, () => setEditing(null));
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t("dir.deleteTitle", { name: deleting.label })}
          description={[
            t("dir.cannotUndo"),
            counts.get(deleting.value) ? t("dir.optionUsed", { count: counts.get(deleting.value) }) : "",
          ]
            .filter(Boolean)
            .join(" ")}
          confirmLabel={t("action.delete")}
          busy={save.isPending}
          onConfirm={() =>
            commit(
              options.filter((one) => one.value !== deleting.value),
              () => {
                setDeleting(null);
                setEditing(null);
              },
            )
          }
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** Значение в строке — латиницей из названия; занято — с номером. */
function uniqueValue(label: string, options: OptionDraft[]) {
  const base = slugify(label) || "option";
  const taken = new Set(options.map((one) => one.value));
  let value = base;
  for (let n = 2; taken.has(value); n++) value = `${base}_${n}`;
  return value;
}

export function OptionDialog({
  option,
  title,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  option: OptionDraft | undefined;
  title: string;
  busy: boolean;
  onSave: (draft: { label: string; color: string }) => void;
  onDelete: (() => void) | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(option?.label ?? "");
  const [color, setColor] = useState(option?.color || CHIP_HEX.blue);
  const [tried, setTried] = useState(false);
  const chosen = hexToChipColor(color);

  const submit = () => {
    if (!label.trim()) return setTried(true);
    onSave({ label: label.trim(), color });
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="px-5 pt-4 pb-3 text-xl font-semibold">{title}</h2>

        <div className="flex flex-col gap-3.5 px-5 pb-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-fg-muted">
              {t("dir.name")}
              <span className="text-danger"> *</span>
            </span>
            <Input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
            {tried && !label.trim() && (
              <span className="text-xs text-danger">{t("table.fillRequired", { count: 1 })}</span>
            )}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {CHIP_COLORS.map((one) => (
              <button
                key={one}
                type="button"
                aria-label={one}
                aria-pressed={chosen === one}
                onClick={() => setColor(CHIP_HEX[one])}
                className={`size-6 rounded-full ${CHIP_DOT[one]} transition-shadow ${
                  chosen === one ? "ring-2 ring-fg-subtle ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-border-strong"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {onDelete && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>
              <Icon as={Trash2Icon} size={14} />
              {t("action.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={busy} onClick={submit}>
            {option ? t("action.save") : t("action.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
