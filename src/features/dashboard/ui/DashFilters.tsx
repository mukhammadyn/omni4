import { useState } from "react";
import { CalendarIcon, ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterChip, filterKind } from "@/features/item";
import { localized, useTableSchema } from "@/features/table";
import { useDataLanguages } from "@/features/workspace";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { CUSTOM, PRESETS, filterKey, type DashFilter, type FilterValues } from "../model/filters";
import { TablePicker } from "./WidgetEditor";

/**
 * Общие фильтры над виджетами (ADR-0013). Значения — в адресе
 * (`values`), объявления — в дашборде: их добавляют и убирают
 * только в «Настроить».
 */
export function DashFilters({
  filters,
  values,
  editing,
  onValues,
  onFilters,
}: {
  filters: DashFilter[];
  values: FilterValues;
  editing: boolean;
  onValues: (values: FilterValues) => void;
  onFilters: (filters: DashFilter[]) => void;
}) {
  const { t } = useTranslation();
  if (!filters.length && !editing) return null;

  const put = (key: string, value: string[]) => {
    const next = { ...values };
    if (value.length) next[key] = value;
    else delete next[key];
    onValues(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pb-1">
      {filters.map((filter) => {
        const key = filterKey(filter);
        return (
          <span key={key} className="flex items-center gap-0.5">
            {filter.kind === "period" ? (
              <PeriodChip label={filter.label || t("dashboard.period")} value={values[key] ?? []} onChange={(value) => put(key, value)} />
            ) : (
              <RecordChip filter={filter} value={values[key] ?? []} onChange={(value) => put(key, value)} />
            )}
            {editing && (
              <button
                type="button"
                aria-label={t("dashboard.removeFilter")}
                title={t("dashboard.removeFilter")}
                onClick={() => onFilters(filters.filter((item) => filterKey(item) !== key))}
                className="grid size-6 cursor-pointer place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-danger"
              >
                <Icon as={XIcon} size={13} />
              </button>
            )}
          </span>
        );
      })}

      {editing && (
        <Popover
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Icon as={PlusIcon} size={13} />
              {t("dashboard.addFilter")}
            </button>
          )}
        >
          {(close) => (
            <AddFilter
              hasPeriod={filters.some((filter) => filter.kind === "period")}
              taken={new Set(filters.map(filterKey))}
              onAdd={(filter) => {
                onFilters([...filters, filter]);
                close();
              }}
            />
          )}
        </Popover>
      )}
    </div>
  );
}

/** Чип «Периода»: готовые значения словом и свой диапазон. */
function PeriodChip({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const { t } = useTranslation();
  const [head, from = "", to = ""] = value;
  const summary =
    head === CUSTOM
      ? [from, to].filter(Boolean).map((day) => day.split("-").reverse().join(".")).join(" — ")
      : head
        ? t(`dashboard.preset.${head as (typeof PRESETS)[number]}`)
        : "";

  return (
    <Popover
      trigger={({ open, toggle }) => (
        <Chip open={open} set={Boolean(head)} onClick={toggle}>
          <Icon as={CalendarIcon} size={14} />
          <span className="truncate font-medium">{label}</span>
          {summary && <span className="truncate">: {summary}</span>}
        </Chip>
      )}
    >
      {(close) => (
        <div className="w-60">
          {PRESETS.map((preset) => (
            <PopoverItem
              key={preset}
              active={head === preset}
              onClick={() => {
                onChange([preset]);
                close();
              }}
            >
              {t(`dashboard.preset.${preset}`)}
            </PopoverItem>
          ))}
          <div className="mt-1 flex flex-col gap-1 border-t border-border p-1 pt-2 text-xs text-fg-muted">
            {t("dashboard.preset.custom")}
            {/* Неполный диапазон держим в адресе как есть: periodRange
                его не примет, и отбор не уйдёт, пока не заданы обе даты. */}
            {[from, to].map((day, index) => (
              <input
                key={index}
                type="date"
                value={head === CUSTOM ? day : ""}
                onChange={(event) => {
                  const next = head === CUSTOM ? [from, to] : ["", ""];
                  next[index] = event.target.value;
                  onChange([CUSTOM, ...next]);
                }}
                className="h-7 w-full rounded-md border border-border-strong bg-input px-2 text-sm text-fg"
              />
            ))}
          </div>
          {head && (
            <PopoverItem
              onClick={() => {
                onChange([]);
                close();
              }}
            >
              {t("dashboard.clearFilter")}
            </PopoverItem>
          )}
        </div>
      )}
    </Popover>
  );
}

/**
 * «Запись таблицы» — тот же чип, что у фильтра таблицы, по полю,
 * которым фильтр объявлен: выбор строк, подписи, «Я» у сотрудников.
 */
function RecordChip({ filter, value, onChange }: { filter: Extract<DashFilter, { kind: "record" }>; value: string[]; onChange: (value: string[]) => void }) {
  const { current: language } = useDataLanguages();
  const { schema } = useTableSchema(filter.sourceTable);
  const field = schema.fields.find((item) => item.slug === filter.sourceField);
  const relation = schema.relations.find((item) => item.id === field?.relationId);
  if (!field) return null;

  return (
    <FilterChip
      field={filter.label ? { ...field, label: filter.label, labels: {} } : field}
      relation={relation}
      language={language}
      filter={{ op: "is", values: value }}
      onChange={(next) => onChange(next.values)}
      onRemove={() => onChange([])}
    />
  );
}

/** Новый фильтр: «Период» или запись таблицы — через поле-ссылку на неё. */
function AddFilter({ hasPeriod, taken, onAdd }: { hasPeriod: boolean; taken: Set<string>; onAdd: (filter: DashFilter) => void }) {
  const { t } = useTranslation();
  const { current: language } = useDataLanguages();
  const [table, setTable] = useState("");
  const { schema } = useTableSchema(table || undefined);

  const links = schema.fields.flatMap((field) => {
    const relation = schema.relations.find((item) => item.id === field.relationId);
    return filterKind(field) === "relation" && relation?.toSlug && !taken.has(relation.toSlug)
      ? [{ field, relation }]
      : [];
  });

  return (
    <div className="flex w-72 flex-col gap-2">
      {!hasPeriod && (
        <PopoverItem icon={<Icon as={CalendarIcon} size={14} />} onClick={() => onAdd({ kind: "period", label: "" })}>
          {t("dashboard.period")}
        </PopoverItem>
      )}
      <div className="flex flex-col gap-2 border-t border-border p-1 pt-2">
        <span className="text-xs text-fg-muted">{t("dashboard.recordFilterHint")}</span>
        <TablePicker value={table} onPick={setTable} />
        {table && (
          <Dropdown
            value=""
            size="sm"
            placeholder={links.length ? t("dashboard.pickLink") : t("dashboard.noLinks")}
            disabled={!links.length}
            items={links.map(({ field }) => ({ value: field.slug, label: localized(field.labels, language, field.label) }))}
            onChange={(slug) => {
              const link = links.find(({ field }) => field.slug === slug);
              if (!link) return;
              onAdd({
                kind: "record",
                label: localized(link.field.labels, language, link.field.label),
                table: link.relation.toSlug,
                sourceTable: table,
                sourceField: slug,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function Chip({ open, set, onClick, children }: { open: boolean; set: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`flex h-7 max-w-72 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-xs transition-colors ${
        set ? "border-accent bg-accent-subtle text-accent-text" : "border-border-strong text-fg-muted hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {children}
      <Icon as={ChevronDownIcon} size={14} className="opacity-60" />
    </button>
  );
}
