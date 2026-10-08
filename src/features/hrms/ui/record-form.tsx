import { lazy, Suspense, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CheckIcon, XIcon, type LucideIcon } from "lucide-react";
import {
  ActiveCell,
  Cell,
  cellKind,
  editorKind,
  relationDataKey,
  rowErrors,
  uploadFolder,
  useUploadFiles,
  type Item,
} from "@/features/item";
import { localized, type Field, type Relation } from "@/features/table";
import { CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";

/*
 * Части форм записей HRMS по прототипу — `.vf-*` (vacancy.html `edit()`,
 * candidate.html `form()`): секция-карточка, поле с подписью, полоса
 * действий внизу и выбор кнопками вместо списков.
 *
 * Поле рисуется по типу из схемы: строка и число — полем ввода, текст
 * с разметкой — редактором, варианты — плашками, флажок — переключателем,
 * всё прочее (связь, дата) — редактором таблицы (ActiveCell) над полем.
 */

/* Редактор текста тяжёлый — грузится, только когда форма открыта. */
const RichText = lazy(() => import("@/shared/ui/rich-text").then((m) => ({ default: m.RichText })));

/** Больше вариантов в ряд кнопками не поместить — тогда выпадающий список. */
const CHOICE_MAX = 6;

/** Во всю ширину сетки — тексты и списки. */
const WIDE = new Set(["longtext", "multiselect"]);

export const blank = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && !value.trim()) ||
  (Array.isArray(value) && !value.length);

/**
 * Первая ошибка черновика — «Поле: что не так». Правила те же, что
 * у ячейки таблицы (`rowErrors`): обязательность и формат поля —
 * телефон, почта, своя регулярка админа. null — можно сохранять.
 */
export function formError(fields: Field[], row: Item, language: string, t: TFunction): string | null {
  const [entry] = rowErrors(fields, row);
  if (!entry) return null;
  const [slug, error] = entry;
  const field = fields.find((f) => f.slug === slug)!;
  const why = error.message || t(error.kind === "required" ? "cell.required" : "cell.invalid");
  return `${localized(field.labels, language, field.label)}: ${why}`;
}

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);

/** `.vf-sec`: значок, заголовок с подписью, сетка полей в две колонки. */
export function FormSection({
  id,
  icon,
  title,
  hint,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-4 scroll-mt-4 rounded-xl bg-surface ring-1 ring-border ring-inset">
      <div className="flex items-center gap-3 border-b border-border px-4.5 py-3.5">
        <span className="grid size-7.5 place-items-center rounded-lg bg-surface-hover text-fg-muted">
          <Icon as={icon} size={15} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <small className="text-[12.5px] text-fg-subtle">{hint}</small>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-4.5 pt-3.5 pb-4.5 max-md:grid-cols-1">{children}</div>
    </section>
  );
}

/** Подпись над полем; `wide` — во всю ширину секции. */
export function FormItem({
  label,
  required = false,
  wide = false,
  children,
}: {
  label?: string | undefined;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${wide ? "col-span-full" : ""}`}>
      {label && (
        <label className="text-[13px] text-fg-muted">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
    </div>
  );
}

/** `.vf-bar`: прибита к низу области страницы; слева — подпись, справа — кнопки. */
export function FormBar({ note, children }: { note: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-6 flex items-center gap-2 border-t border-border bg-bg px-6 py-2.5 max-md:-mx-3 max-md:px-3">
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[13px] text-fg-subtle">{note}</span>
      <span className="flex-1" />
      {children}
    </div>
  );
}

/**
 * Поле записи в форме: подпись и редактор по типу. Правка уходит
 * в `onChange` — в черновик формы, а не запросом.
 */
export function FormField({
  field,
  row,
  tableSlug,
  relations,
  locale,
  language,
  creating = false,
  required = false,
  wide,
  placeholder,
  onChange,
}: {
  field: Field;
  row: Item;
  tableSlug: string;
  relations: Map<string, Relation>;
  locale: string;
  language: string;
  /** Запись ещё не заведена: «только чтение» поля не действует (ActiveCell). */
  creating?: boolean;
  required?: boolean;
  /** По умолчанию — по виду: тексты и списки во всю ширину. */
  wide?: boolean;
  placeholder?: string | undefined;
  /** `extra` — сопровождающие ключи: у связи это `<слаг>_data`. */
  onChange: (value: unknown, extra?: Item) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const upload = useUploadFiles();
  const value = row[field.slug];
  const kind = cellKind(field.type);
  const label = localized(field.labels, language, field.label);
  const tags = kind === "multiselect" && field.options.size === 0;
  const writable = tags ? field.editable && !field.locked : editorKind(field, creating) !== null;
  const cell = <Cell field={field} row={row} tableSlug={tableSlug} relations={relations} locale={locale} language={language} />;

  const control = (): ReactNode => {
    if (!writable) return <div className="flex min-h-(--spacing-input) items-center text-sm">{cell}</div>;
    if (kind === "text" || kind === "number")
      return (
        <Input
          type={kind === "number" ? "number" : "text"}
          value={value === null || value === undefined ? "" : String(value)}
          placeholder={placeholder}
          onChange={(event) => {
            const next = event.target.value;
            onChange(kind === "number" ? (next === "" ? null : Number(next)) : next);
          }}
        />
      );
    if (field.type === "MULTI_LINE")
      return (
        <Suspense fallback={<div className="h-52 rounded-md border border-border-strong bg-input" />}>
          <RichText
            value={typeof value === "string" ? value : ""}
            placeholder={placeholder ?? ""}
            onChange={(html) => onChange(html)}
            onUpload={(file) =>
              upload.mutateAsync({ files: [file], folder: uploadFolder(field.attributes) }).then((urls) => urls[0] ?? "")
            }
          />
        </Suspense>
      );
    if (kind === "longtext")
      return (
        <textarea
          rows={4}
          value={typeof value === "string" ? value : ""}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-md border border-border-strong bg-input px-2.5 py-2 text-sm leading-relaxed outline-none transition-colors hover:border-fg-subtle focus:border-accent"
        />
      );
    if (kind === "boolean") return <Switch on={value === true} label={label} onToggle={() => onChange(value !== true)} />;
    /* Кнопками — пока варианты помещаются в строку; город из восьми — списком. */
    if (kind === "status" && field.options.size <= CHOICE_MAX)
      return <Choice field={field} value={value} language={language} onPick={onChange} />;
    if (tags) return <Tags value={strings(value)} placeholder={placeholder ?? ""} onChange={onChange} />;
    if (kind === "multiselect")
      return (
        <Pills
          multi
          options={[...field.options.values()].map((o) => ({ value: o.value, label: localized(o.labels, language, o.label || o.value) }))}
          value={strings(value)}
          onChange={onChange}
        />
      );

    /* Связь, дата и прочее — редактором таблицы над полем. */
    return (
      <button
        type="button"
        onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
        className="flex h-(--spacing-input) w-full min-w-0 items-center rounded-md border border-border-strong bg-input px-2.5 text-left text-sm transition-colors hover:border-fg-subtle"
      >
        {blank(value) && placeholder ? <span className="text-fg-subtle">{placeholder}</span> : cell}
      </button>
    );
  };

  return (
    <FormItem label={kind === "boolean" ? undefined : label} required={required || field.required} wide={wide ?? WIDE.has(kind)}>
      {control()}
      {anchor && (
        <ActiveCell
          field={field}
          row={row}
          guid={typeof row.guid === "string" ? row.guid : undefined}
          tableSlug={tableSlug}
          anchor={anchor}
          relations={relations}
          locale={locale}
          language={language}
          creating={creating}
          onEdit={(next) => onChange(next)}
          /* Связь — в черновик, а не запросом: иначе она уехала бы сразу. */
          onLink={(item) => onChange(item?.guid ?? null, { [relationDataKey(field.slug)]: item })}
          onClose={() => setAnchor(null)}
        />
      )}
    </FormItem>
  );
}

/** `.switch` прототипа: «Показывать в объявлении». */
function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="group flex h-(--spacing-input) items-center gap-2 self-start text-sm"
    >
      <span className="relative h-4.5 w-7.5 shrink-0 rounded-full bg-border-strong transition-colors group-aria-checked:bg-accent-solid">
        <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-sm transition-[left] group-aria-checked:left-3.5" />
      </span>
      {label}
    </button>
  );
}

/**
 * Выбор из вариантов кнопками, а не списком — `.vf-pills` и `.vf-seg`
 * прототипа. Варианты с цветом — цветными плашками (приоритет, статус),
 * без цвета — сегментами (уровень, формат, опыт).
 */
function Choice({
  field,
  value,
  language,
  onPick,
}: {
  field: Field;
  value: unknown;
  language: string;
  onPick: (value: string) => void;
}) {
  const options = [...field.options.values()];
  const label = (o: (typeof options)[number]) => localized(o.labels, language, o.label || o.value);
  const current = Array.isArray(value) ? value[0] : value;

  if (options.some((o) => o.color))
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onPick(o.value)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-opacity ${CHIP_STYLES[o.color ? hexToChipColor(o.color) : "gray"]} ${
                on ? "opacity-100 ring-[1.5px] ring-current ring-inset" : "opacity-55 hover:opacity-80"
              }`}
            >
              {field.type === "STATUS" && <i className="size-1.5 rounded-full bg-current opacity-80" />}
              {label(o)}
            </button>
          );
        })}
      </div>
    );

  return (
    <div className="flex rounded-md bg-surface-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onPick(o.value)}
          className={`h-7.5 min-w-0 flex-1 truncate rounded-[5px] px-2 text-[13px] transition-colors ${
            o.value === current ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"
          }`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/**
 * Плашки-переключатели — `.vf-chips` прототипа: все варианты на виду,
 * выбранные с галкой. `multi` — несколько (каналы, языки), иначе один
 * (источник, этап).
 */
export function Pills({
  options,
  value,
  multi = false,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  multi?: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
            className="inline-flex h-7.5 items-center gap-1.5 rounded-full px-3 text-[13px] text-fg-muted ring-1 ring-border-strong transition-colors ring-inset hover:text-fg aria-pressed:bg-accent-subtle aria-pressed:text-accent-text aria-pressed:ring-accent/45"
          >
            {on && <Icon as={CheckIcon} size={13} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Метки без списка вариантов (навыки) — `.vf-skills` прототипа: плашки
 * и строка ввода, Enter добавляет, Backspace в пустой строке снимает
 * последнюю.
 */
function Tags({ value, placeholder, onChange }: { value: string[]; placeholder: string; onChange: (next: string[]) => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  return (
    <div className="flex min-h-(--spacing-input) flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-input px-1.5 py-1 focus-within:border-accent">
      {value.map((tag, at) => (
        <span key={`${tag}-${at}`} className={`inline-flex h-6 items-center gap-1 rounded-[4px] pr-0.5 pl-2 text-[13px] ${CHIP_STYLES.gray}`}>
          {tag}
          <button
            type="button"
            aria-label={t("action.delete")}
            onClick={() => onChange(value.filter((_, i) => i !== at))}
            className="grid size-4.5 place-items-center rounded-[3px] hover:bg-surface-hover"
          >
            <Icon as={XIcon} size={12} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          const next = input.trim();
          if (event.key === "Enter" && next) {
            event.preventDefault();
            if (!value.includes(next)) onChange([...value, next]);
            setInput("");
          } else if (event.key === "Backspace" && !input && value.length) onChange(value.slice(0, -1));
        }}
        placeholder={placeholder}
        className="h-6 min-w-50 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-fg-subtle"
      />
    </div>
  );
}
