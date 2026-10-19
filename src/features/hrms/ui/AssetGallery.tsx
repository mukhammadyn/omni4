import type { UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import { Avatar, Cell, type Item } from "@/features/item";
import { localized, optionOf, useTableSchema } from "@/features/table";
import { Icon } from "@/shared/ui/icon";
import { ASSETS } from "../api/asset";
import { firstText, related, text } from "../api/org";
import { money } from "../model/asset";
import { AssetThumb } from "./asset-parts";

const NO_RELATIONS = new Map();

/**
 * «Сетка» имущества — `gridView()` прототипа (properties.html, `.pp-card`):
 * фото во всю ширину, название, «категория · серийный номер», цена
 * и статус, внизу — за кем числится. Раскладка карточки GALLERY
 * `attributes.card: "asset"`; поля — слагами `hr_assets`, колонки view
 * карточка не читает.
 */
export function AssetGallery({
  rows,
  locale,
  language,
  onOpenRow,
  onAdd,
  onEndReached,
}: {
  rows: Item[];
  locale: string;
  language: string;
  onOpenRow: (guid: string) => void;
  onAdd?: (() => void) | undefined;
  onEndReached?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const { schema } = useTableSchema(ASSETS);
  const category = schema.fields.find((f) => f.slug === "category");
  const status = schema.fields.find((f) => f.slug === "status");
  const label = (row: Item) => {
    const found = category && optionOf(category, text(row.category));
    return found ? localized(found.labels, language, found.label || found.value) : text(row.category);
  };
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    if (onEndReached && box.scrollHeight - box.scrollTop - box.clientHeight < 300) onEndReached();
  };

  return (
    <div onScroll={onScroll} className="min-h-0 flex-1 overflow-auto px-6">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 py-3.5">
        {rows.map((row) => {
          const guid = text(row.guid);
          const person = related(row, "hr_employees_id");
          return (
            <li key={guid}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenRow(guid)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onOpenRow(guid);
                  }
                }}
                className="flex h-full cursor-pointer flex-col rounded-[8px] border border-border bg-surface shadow-raised transition-colors hover:bg-surface-hover"
              >
                <AssetThumb row={row} size="lg" />
                <div className="flex flex-1 flex-col px-4 pt-3 pb-3">
                  <b className="truncate text-[15px] font-semibold">{text(row.name) || "—"}</b>
                  <small className="truncate text-[13px] text-fg-subtle">{[label(row), text(row.serial_number)].filter(Boolean).join(" · ")}</small>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="flex-1 text-sm tabular-nums">{row.cost ? `${money(row.cost)} ${text(row.currency) || "UZS"}` : ""}</span>
                    {status && text(row.status) && (
                      <Cell field={status} row={row} tableSlug={ASSETS} relations={NO_RELATIONS} locale={locale} language={language} />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5 text-sm">
                    {text(row.hr_employees_id) ? (
                      <>
                        <Avatar name={text(person.full_name)} photo={firstText(person.photo) || undefined} size="sm" />
                        <span className="truncate">{text(person.full_name) || "—"}</span>
                      </>
                    ) : (
                      <span className="text-fg-subtle">{t("asset.unassigned")}</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {onAdd && (
          <li>
            <button
              type="button"
              onClick={onAdd}
              className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong text-sm text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Icon as={PlusIcon} size={18} />
              {t("table.addRow")}
            </button>
          </li>
        )}
      </ul>
      {!rows.length && !onAdd && <p className="py-8 text-center text-sm text-fg-subtle">{t("table.noRows")}</p>}
    </div>
  );
}
