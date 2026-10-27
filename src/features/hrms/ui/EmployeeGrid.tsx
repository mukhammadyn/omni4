import { GraduationCapIcon, MapPinIcon, PlusIcon, Trash2Icon, UsersIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import type { Item } from "@/features/item";
import { localized, type Field } from "@/features/table";
import type { TranslationKey } from "@/shared/lib/i18n";
import { formatDate } from "@/shared/lib/date-value";
import { CommitInput } from "@/shared/ui/commit-input";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { CONTACTS, FAMILY, QUALIFICATIONS, useEmployeeRows } from "../api/employee-rows";
import { firstText, text } from "../api/org";
import { Card } from "./page-parts";

type Column = {
  slug: string;
  type: "select" | "text" | "date";
  /** Своя подпись колонки — когда подпись поля в схеме шире, чем тут нужно. */
  label?: TranslationKey;
  /** Ширина колонки (класс); без неё — остаток. */
  width?: string;
  placeholder?: TranslationKey;
  /** Варианты select'а, зависящие от строки. */
  filter?: (value: string, row: Item) => boolean;
  /** Своё чтение значения — когда в строке его может не быть. */
  read?: (row: Item) => string;
  /** Своя запись при выборе — когда за полем меняется соседнее. */
  values?: (next: string, row: Item, options: (slug: string, row: Item) => string[]) => Item;
};

type Grid = {
  table: string;
  icon: LucideIcon;
  title: TranslationKey;
  add: TranslationKey;
  empty: TranslationKey;
  columns: Column[];
  blank: Item;
  /** Отбор строк по полям; уходит и в новую строку. */
  where?: Record<string, string>;
};

/** Название зависит от типа (`EP_CT` прототипа): адреса — `*_address`, остальное — контакты. */
const kindOf = (name: string) => (name.endsWith("_address") ? "address" : "contact");
const kindOfRow = (row: Item) => firstText(row.kind) || kindOf(firstText(row.name));

export const CONTACTS_GRID: Grid = {
  table: CONTACTS,
  icon: MapPinIcon,
  title: "employee.tab.contacts",
  add: "employee.addContact",
  empty: "employee.noContacts",
  blank: { kind: "contact", name: "personal_phone", value: "" },
  columns: [
    {
      slug: "kind",
      type: "select",
      width: "w-40",
      read: kindOfRow,
      /* Тип сменился — название берём первое подходящее, как в прототипе. */
      values: (next, row, options) => ({ kind: next, name: options("name", { ...row, kind: next })[0] ?? "" }),
    },
    { slug: "name", type: "select", width: "w-60", filter: (value, row) => kindOf(value) === kindOfRow(row) },
    { slug: "value", type: "text", placeholder: "employee.contactPlaceholder" },
  ],
};

export const FAMILY_GRID: Grid = {
  table: FAMILY,
  icon: UsersIcon,
  title: "employee.tab.family",
  add: "employee.addFamily",
  empty: "employee.noFamily",
  blank: { relation: "spouse" },
  columns: [
    { slug: "relation", type: "select", width: "w-48" },
    { slug: "full_name", type: "text", placeholder: "employee.familyNamePlaceholder" },
    { slug: "birth_date", type: "date", width: "w-44" },
    { slug: "phone", type: "text", width: "w-48", placeholder: "employee.phonePlaceholder" },
  ],
};

/**
 * «Образование» — строки `hr_qualifications` вида `education` (`EG.edu`
 * прототипа). Сертификаты в той же таблице — на «Личном».
 */
export const EDUCATION_GRID: Grid = {
  table: QUALIFICATIONS,
  icon: GraduationCapIcon,
  title: "employee.tab.education",
  add: "employee.addEducation",
  empty: "employee.noEducation",
  where: { type: "education" },
  blank: { degree: "bachelor" },
  columns: [
    { slug: "degree", type: "select", width: "w-48" },
    { slug: "institution", type: "text", label: "employee.eduInstitution" },
    { slug: "title", type: "text", width: "w-48", label: "employee.eduSpecialty" },
    { slug: "date_from", type: "date", width: "w-36", label: "employee.eduFrom" },
    { slug: "date_to", type: "date", width: "w-36", label: "employee.eduTo" },
    { slug: "credential_id", type: "text", width: "w-32", label: "employee.eduDiploma" },
  ],
};

const cellInput = "h-8 border-0 bg-transparent shadow-none hover:bg-surface-hover";

/**
 * Вкладка-таблица сотрудника — `gridTab` прототипа: каждая ячейка сразу
 * поле ввода, строка сохраняется по полю. Варианты и подписи — из схемы
 * таблицы, а не из кода.
 */
export function EmployeeGrid({ grid, employeeId, language }: { grid: Grid; employeeId: string; language: string }) {
  const { t, i18n } = useTranslation();
  const data = useEmployeeRows(grid.table, employeeId, grid.where);
  const can = useTablePermissions()(grid.table);
  /* Заполненная строка удаляется только после вопроса; пустая — сразу. */
  const [deleting, setDeleting] = useState<string | null>(null);
  const filled = (row: Item) => grid.columns.some((column) => column.type !== "select" && text(row[column.slug]));
  const field = (slug: string): Field | undefined => data.fields.find((item) => item.slug === slug);
  const label = (slug: string) => {
    const target = field(slug);
    return target ? localized(target.labels, language, target.label) : slug;
  };
  const optionsOf = (slug: string, row: Item) => {
    const column = grid.columns.find((item) => item.slug === slug);
    return [...(field(slug)?.options.values() ?? [])]
      .filter((option) => !column?.filter || column.filter(option.value, row))
      .map((option) => ({ value: option.value, label: localized(option.labels, language, option.label || option.value) }));
  };

  const cell = (column: Column, row: Item) => {
    const guid = text(row.guid);
    const current = column.type === "select" ? firstText(row[column.slug]) : text(row[column.slug]);
    const save = (next: string) =>
      next !== current &&
      data.edit(guid, column.values?.(next, row, (slug, r) => optionsOf(slug, r).map((o) => o.value)) ?? { [column.slug]: next || null });
    if (column.type === "select")
      return (
        <Dropdown
          value={column.read?.(row) ?? current}
          items={optionsOf(column.slug, row)}
          size="sm"
          ariaLabel={label(column.slug)}
          disabled={!can.update}
          onChange={save}
        />
      );
    if (column.type === "date")
      return can.update ? (
        <DatePicker
          value={current.slice(0, 10)}
          locale={i18n.language}
          ariaLabel={label(column.slug)}
          clearLabel={t("cell.clear")}
          className={`w-full ${cellInput}`}
          onChange={save}
        />
      ) : (
        <span className="px-1.5">{formatDate(current, "date", i18n.language) ?? ""}</span>
      );
    return (
      <CommitInput
        value={current}
        label={label(column.slug)}
        placeholder={column.placeholder ? t(column.placeholder) : ""}
        allowEmpty
        disabled={!can.update}
        className={cellInput}
        onCommit={save}
      />
    );
  };

  return (
    <Card icon={grid.icon} title={t(grid.title)} count={data.rows.length}>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-160 border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[13px] text-fg-muted">
              {grid.columns.map((column) => (
                <th key={column.slug} className={`px-2.5 py-2 font-medium first:pl-4 ${column.width ?? ""}`}>
                  {column.label ? t(column.label) : label(column.slug)}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={text(row.guid)} className="group border-b border-border">
                {grid.columns.map((column) => (
                  <td key={column.slug} className="px-1.5 py-1 first:pl-4">
                    {cell(column, row)}
                  </td>
                ))}
                <td className="text-center">
                  {can.delete && (
                    <button
                      type="button"
                      title={t("action.delete")}
                      aria-label={t("action.delete")}
                      onClick={() => (filled(row) ? setDeleting(text(row.guid)) : data.remove(text(row.guid)))}
                      className="rounded-md p-1.5 text-fg-subtle opacity-40 group-hover:opacity-100 hover:bg-surface-hover hover:text-fg"
                    >
                      <Icon as={Trash2Icon} size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr className="border-b border-border">
                <td colSpan={grid.columns.length + 1} className="px-4 py-6 text-center text-fg-subtle">
                  {data.isLoading ? t("common.loading") : t(grid.empty)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {can.write && (
        <button
          type="button"
          onClick={() => data.add(grid.blank)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <Icon as={PlusIcon} size={15} />
          {t(grid.add)}
        </button>
      )}
      {deleting && (
        <ConfirmDialog
          title={t("employee.rowDeleteTitle")}
          description={t("employee.rowDeleteText")}
          confirmLabel={t("action.delete")}
          busy={false}
          onConfirm={() => {
            data.remove(deleting);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </Card>
  );
}
