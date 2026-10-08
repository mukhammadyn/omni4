import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { Tabs } from "@/shared/ui/tabs";
import { ToolButton } from "@/shared/ui/tool-button";
import { mineField, withMine, type Filters } from "../model/query";

/** Поле «кто» таблицы: колонка связи с людьми и её подпись. */
export type WhoField = { slug: string; label: string };

/**
 * «Все | Мои» на панели view — [[Me filter]] одним щелчком. Это тот же
 * фильтр «поле — Я», что собирается руками в строке фильтров, поэтому
 * он виден там чипом, уезжает в адрес и запоминается, как любой другой.
 *
 * Полей «кто» бывает несколько (исполнитель и автор у задач): «Мои»
 * берёт первое, стрелка рядом переключает поле.
 */
export function MineToggle({
  fields,
  filters,
  onFilters,
}: {
  fields: WhoField[];
  filters: Filters;
  onFilters: (next: Filters) => void;
}) {
  const { t } = useTranslation();
  const slugs = fields.map((field) => field.slug);
  const active = mineField(filters, slugs);
  const field = fields.find((item) => item.slug === active) ?? fields[0];

  if (!field) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tabs
        variant="segment"
        tabs={[
          { id: "all", label: t("view.all") },
          { id: "mine", label: t("view.mine"), title: t("view.mineAs", { field: field.label }) },
        ]}
        activeId={active ? "mine" : "all"}
        onSelect={(id) => onFilters(withMine(filters, slugs, id === "mine" ? field.slug : undefined))}
      />

      {fields.length > 1 && (
        <Popover
          align="end"
          trigger={({ open, toggle }) => (
            <ToolButton
              icon={ChevronDownIcon}
              label={t("view.mineField")}
              open={open}
              onClick={toggle}
            />
          )}
        >
          {(close) =>
            fields.map((item) => (
              <PopoverItem
                key={item.slug}
                active={item.slug === active}
                onClick={() => {
                  onFilters(withMine(filters, slugs, item.slug));
                  close();
                }}
              >
                {t("view.mineAs", { field: item.label })}
              </PopoverItem>
            ))
          }
        </Popover>
      )}
    </div>
  );
}
