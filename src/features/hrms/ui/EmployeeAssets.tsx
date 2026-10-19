import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSignatureIcon, PackageIcon, PlusIcon, Undo2Icon } from "lucide-react";
import { useTablePermissions } from "@/features/auth";
import type { Item } from "@/features/item";
import { localized, optionOf, useTableSchema } from "@/features/table";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES } from "@/shared/ui/chip";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { ASSETS, useEmployeeAssets, useMoveAsset, useStockAssets } from "../api/asset";
import { related, text, useOrgDirectory } from "../api/org";
import { money, MOVE, totals } from "../model/asset";
import { printAct } from "./asset-act";
import { AssetThumb, moveKey } from "./asset-parts";
import { Card } from "./page-parts";

/**
 * «Имущество» сотрудника — `assetsTab()` прототипа (employee.html#assets):
 * что числится за ним, на какую сумму, когда выдано; «Выдать имущество»
 * со склада и «Вернуть». Как PropertySection udevs_hrms_admin, но с
 * движением прямо отсюда.
 */
export function EmployeeAssets({
  employeeId,
  locale,
  language,
  onOpenAsset,
}: {
  employeeId: string;
  locale: string;
  language: string;
  onOpenAsset: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const { assets, issues, isLoading } = useEmployeeAssets(employeeId);
  const { schema } = useTableSchema(ASSETS);
  const can = useTablePermissions()(ASSETS);
  const move = useMoveAsset();
  const { departments } = useOrgDirectory();
  const [issuing, setIssuing] = useState(false);
  if (isLoading) return <p className="p-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>;

  const category = schema.fields.find((f) => f.slug === "category");
  const categoryLabel = (row: Item) => {
    const found = category && optionOf(category, text(row.category));
    return found ? localized(found.labels, language, found.label || found.value) : text(row.category);
  };
  /* Дата выдачи — последняя «выдача» этой вещи этому сотруднику. */
  const issuedOn = (asset: string) =>
    issues
      .filter((m) => text(m.hr_assets_id) === asset)
      .map((m) => text(m.date))
      .sort()
      .at(-1) ?? "";
  const sum = totals(assets)
    .map((x) => `${money(x.sum)} ${x.currency}`)
    .join(" · ");
  const th = "px-2.5 py-2 text-left text-[12.5px] font-medium text-fg-muted";

  return (
    <Card icon={PackageIcon} title={t("asset.tab.title")} count={assets.length}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-fg-subtle">
          {assets.length ? t("asset.tab.summary", { count: assets.length, sum: sum || "0" }) : t("asset.tab.none")}
        </p>
        <span className="flex-1" />
        {assets.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const person = related(assets[0]!, "hr_employees_id");
              const date = (value: string) => formatDate(value, "date", locale) ?? "";
              const opened = printAct({
                employee: text(person.full_name),
                department: departments.find((d) => d.id === text(person.hr_departments_id))?.name ?? "",
                date: date(todayInput()),
                lines: assets.map((row) => ({
                  name: text(row.name),
                  inventory: text(row.inventory_number),
                  serial: text(row.serial_number),
                  cost: row.cost,
                  currency: text(row.currency) || "UZS",
                  issued: date(issuedOn(text(row.guid))),
                })),
              });
              if (!opened) toast.error(t("asset.act.blocked"));
            }}
          >
            <Icon as={FileSignatureIcon} size={14} />
            {t("asset.act.title")}
          </Button>
        )}
        {can.update && (
          <Button size="sm" onClick={() => setIssuing(true)}>
            <Icon as={PlusIcon} size={14} />
            {t("asset.tab.issue")}
          </Button>
        )}
      </div>
      {assets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>{t("asset.name")}</th>
                <th className={th}>{t("asset.category")}</th>
                <th className={th}>{t("asset.serial")}</th>
                <th className={`${th} text-right`}>{t("asset.cost")}</th>
                <th className={th}>{t("asset.issueDate")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {assets.map((row) => (
                <tr key={text(row.guid)} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-2">
                    <button type="button" onClick={() => onOpenAsset(text(row.guid))} className="flex items-center gap-2.5 text-left">
                      <AssetThumb row={row} />
                      <span>
                        <b className="block font-medium hover:underline">{text(row.name) || "—"}</b>
                        <small className="text-xs text-fg-subtle">{text(row.inventory_number)}</small>
                      </span>
                    </button>
                  </td>
                  <td className="px-2.5 py-2">
                    {categoryLabel(row) && <span className={`rounded px-1.5 py-0.5 text-xs ${CHIP_STYLES.gray}`}>{categoryLabel(row)}</span>}
                  </td>
                  <td className="px-2.5 py-2 font-mono text-[13px] text-fg-muted">{text(row.serial_number) || "—"}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{row.cost ? `${money(row.cost)} ${text(row.currency) || "UZS"}` : "—"}</td>
                  <td className="px-2.5 py-2">{formatDate(issuedOn(text(row.guid)), "date", locale) || "—"}</td>
                  <td className="px-2.5 py-2 text-right">
                    {can.update && (
                      <button
                        type="button"
                        disabled={move.isPending}
                        onClick={() =>
                          move.mutate(
                            { guid: text(row.guid), holder: employeeId, move: MOVE.returned },
                            { onSuccess: () => toast.success(t(moveKey("done", MOVE.returned))) },
                          )
                        }
                        className="inline-flex items-center gap-1 text-[13px] text-accent-text hover:underline"
                      >
                        <Icon as={Undo2Icon} size={13} />
                        {t("asset.tab.return")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issuing && <IssueFromStock employeeId={employeeId} onClose={() => setIssuing(false)} />}
    </Card>
  );
}

/** «Выдать имущество» со страницы сотрудника: вещь со склада, дата, комментарий. */
function IssueFromStock({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const stock = useStockAssets(true);
  const move = useMoveAsset();
  const [asset, setAsset] = useState("");
  const [date, setDate] = useState(todayInput());
  const [comment, setComment] = useState("");
  const [query, setQuery] = useState("");
  const label = "mb-1.5 block text-[12.5px] text-fg-muted";
  const items = stock
    .map((row) => ({ value: text(row.guid), label: [text(row.name), text(row.inventory_number), text(row.serial_number)].filter(Boolean).join(" · ") }))
    .filter((item) => !query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t("asset.tab.issue")}</h2>
        <div className="flex flex-col gap-3 px-4 py-3">
          <div>
            <span className={label}>{t("asset.tab.fromStock")}</span>
            <Dropdown
              value={asset}
              items={items}
              placeholder={t("asset.tab.pick")}
              search={query}
              onSearch={setQuery}
              emptyText={t("asset.tab.stockEmpty")}
              onChange={setAsset}
            />
          </div>
          <label>
            <span className={label}>{t("asset.issueDate")}</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span className={label}>{t("asset.comment")}</span>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("asset.commentHint")} />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            disabled={!asset || move.isPending}
            onClick={() =>
              move.mutate(
                { guid: asset, holder: "", move: MOVE.issued, employee: employeeId, date: date || todayInput(), comment: comment.trim() },
                {
                  onSuccess: () => {
                    toast.success(t(moveKey("done", MOVE.issued)));
                    onClose();
                  },
                },
              )
            }
          >
            {t(moveKey("do", MOVE.issued))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
