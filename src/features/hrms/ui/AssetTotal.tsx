import { useTranslation } from "react-i18next";
import { useAssetsForTotal } from "../api/asset";
import { money, totals } from "../model/asset";

/** «Общая стоимость: 12 500 000 UZS · 3 200 USD» — подвал properties.html. */
export function AssetTotal({ filters, search }: { filters: Parameters<typeof useAssetsForTotal>[0]; search: Parameters<typeof useAssetsForTotal>[1] }) {
  const { t } = useTranslation();
  const sums = totals(useAssetsForTotal(filters, search, true));
  if (!sums.length) return null;
  return (
    <span className="truncate text-xs text-fg-subtle">
      {t("asset.total")}{" "}
      <b className="font-semibold text-fg tabular-nums">{sums.map((x) => `${money(x.sum)} ${x.currency}`).join(" · ")}</b>
    </span>
  );
}
