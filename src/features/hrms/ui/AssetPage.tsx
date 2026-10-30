import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeftIcon,
  ArchiveXIcon,
  BarcodeIcon,
  CalendarCheckIcon,
  CalendarIcon,
  CheckCheckIcon,
  CopyIcon,
  EllipsisIcon,
  HashIcon,
  HistoryIcon,
  PencilIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  TagIcon,
  Trash2Icon,
  Undo2Icon,
  UserIcon,
  UserPlusIcon,
  WalletIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar, Cell, useDeleteItems } from "@/features/item";
import { localized, optionOf, type Field } from "@/features/table";
import { formatDate } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { ASSETS, useAsset, useDuplicateAsset, useMoveAsset } from "../api/asset";
import { firstText, related, text, useOrgDirectory } from "../api/org";
import { ASSET, issuedSince, money, MOVE, movesFrom, WARRANTY_SOON, warrantyDays, type Move } from "../model/asset";
import { actionIcon, AssetThumb, MoveDialog, moveKey } from "./asset-parts";
import { Card, Meta } from "./page-parts";

/** Движение без вопросов — сразу; выдача, ремонт и списание — окном. */
const ASKS = new Set<Move>([MOVE.issued, MOVE.toRepair, MOVE.writtenOff]);

/**
 * Страница имущества — `property.html` прототипа (`view()`): шапка с
 * действиями по статусу, «Сведения», «История» из журнала и «Закреплено
 * за». Движение — `useMoveAsset` (как `move_property` udevs_hrms_admin).
 */
export function AssetPage({
  guid,
  locale,
  language,
  onEdit,
  onOpen,
  onDeleted,
  onOpenEmployee,
}: {
  guid: string;
  locale: string;
  language: string;
  onEdit: () => void;
  /** Открыть другую вещь в форме — копию после «Дублировать». */
  onOpen: (guid: string) => void;
  onDeleted: () => void;
  onOpenEmployee: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const asset = useAsset(guid);
  const move = useMoveAsset();
  const duplicate = useDuplicateAsset();
  const remove = useDeleteItems(ASSETS);
  const { departments } = useOrgDirectory();
  const [asking, setAsking] = useState<Move | null>(null);
  const [deleting, setDeleting] = useState(false);
  const bySlug = useMemo(() => new Map(asset.fields.map((f) => [f.slug, f])), [asset.fields]);
  const relations = useMemo(() => new Map(asset.relations.map((r) => [r.id, r])), [asset.relations]);

  const row = asset.row;
  if (!row)
    return <p className="p-8 text-center text-sm text-fg-subtle">{asset.isLoading ? t("common.loading") : (asset.error ?? t("asset.notFound"))}</p>;

  const status = text(row.status);
  const holder = text(row.hr_employees_id);
  const person = related(row, "hr_employees_id");
  const currency = text(row.currency) || "UZS";
  const label = (slug: string) => {
    const field = bySlug.get(slug);
    const found = field && optionOf(field, text(row[slug]));
    return found ? localized(found.labels, language, found.label || found.value) : text(row[slug]);
  };
  const cell = (field: Field | undefined) =>
    field && <Cell field={field} row={row} tableSlug={ASSETS} relations={relations} locale={locale} language={language} />;
  const date = (value: unknown) => formatDate(text(value), "date", locale) ?? "";
  const days = warrantyDays(row.warranty_until, new Date());
  const since = issuedSince(asset.movements, holder);
  const department = departments.find((d) => d.id === text(person.hr_departments_id))?.name ?? "";

  const run = (next: Move, values: { employee?: string; date?: string; comment?: string } = {}) =>
    move.mutate(
      { guid, holder, move: next, ...values },
      {
        onSuccess: () => {
          setAsking(null);
          toast.success(t(moveKey("done", next)));
        },
      },
    );
  const start = (next: Move) => (ASKS.has(next) ? setAsking(next) : run(next));
  const moves = movesFrom(status);
  /* Главная кнопка — первое действие; ремонт и списание — в меню. */
  const primary = moves[0] === MOVE.toRepair || moves[0] === MOVE.writtenOff ? undefined : moves[0];
  const MAIN_ICON: Partial<Record<Move, LucideIcon>> = {
    [MOVE.issued]: UserPlusIcon,
    [MOVE.returned]: Undo2Icon,
    [MOVE.fromRepair]: CheckCheckIcon,
    [MOVE.received]: RotateCcwIcon,
  };
  const prop = (icon: LucideIcon, name: string, value: ReactNode) => (
    <div className="flex items-start gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <span className="flex w-44 shrink-0 items-center gap-1.5 text-fg-muted">
        <Icon as={icon} size={14} />
        {name}
      </span>
      <span className="min-w-0 flex-1">{value || <span className="text-fg-subtle">—</span>}</span>
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 pb-20 max-md:px-3">
        <header className="flex flex-wrap items-start gap-3.5 pt-5 pb-5">
          <AssetThumb row={row} size="xl" />
          <div className="min-w-60 flex-1">
            <h1 className="mb-1 flex flex-wrap items-center gap-2 text-[22px] leading-tight font-semibold tracking-[-0.01em]">
              {text(row.name) || "—"}
              {status && <span className="flex text-sm font-normal">{cell(bySlug.get("status"))}</span>}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-fg-muted">
              <Meta icon={TagIcon} text={label("category") || t("asset.noCategory")} />
              <Meta icon={BarcodeIcon} text={text(row.serial_number) || "—"} />
              <Meta icon={HashIcon} text={text(row.inventory_number)} />
              <Meta icon={WalletIcon} text={row.cost ? `${money(row.cost)} ${currency}` : ""} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {asset.can.update && primary && (
              <Button variant={primary === MOVE.issued ? "primary" : "secondary"} disabled={move.isPending} onClick={() => start(primary)}>
                <Icon as={MAIN_ICON[primary] ?? UserPlusIcon} size={15} />
                {t(moveKey("move", primary))}
              </Button>
            )}
            {asset.can.update && (
              <Button variant="secondary" onClick={onEdit}>
                <Icon as={PencilIcon} size={15} />
                {t("action.edit")}
              </Button>
            )}
            <Popover
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  aria-label={t("asset.actions")}
                  onClick={toggle}
                  className={`grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg ${open ? "bg-surface-active" : ""}`}
                >
                  <Icon as={EllipsisIcon} size={16} />
                </button>
              )}
            >
              {(close) => (
                <>
                  {asset.can.update &&
                    moves
                      .filter((m) => m !== primary)
                      .map((m) => (
                        <PopoverItem
                          key={m}
                          danger={m === MOVE.writtenOff}
                          icon={<Icon as={m === MOVE.toRepair ? WrenchIcon : ArchiveXIcon} size={16} className="shrink-0" />}
                          onClick={() => {
                            close();
                            start(m);
                          }}
                        >
                          {t(moveKey("move", m))}
                        </PopoverItem>
                      ))}
                  {asset.can.write && (
                    <PopoverItem
                      icon={<Icon as={CopyIcon} size={16} className="shrink-0 text-fg-muted" />}
                      onClick={() => {
                        close();
                        duplicate.mutate(row, { onSuccess: onOpen });
                      }}
                    >
                      {t("asset.duplicate")}
                    </PopoverItem>
                  )}
                  {asset.can.delete && (
                    <>
                      <PopoverSeparator />
                      <PopoverItem
                        danger
                        icon={<Icon as={Trash2Icon} size={16} className="shrink-0" />}
                        onClick={() => {
                          close();
                          setDeleting(true);
                        }}
                      >
                        {t("action.delete")}
                      </PopoverItem>
                    </>
                  )}
                </>
              )}
            </Popover>
          </div>
        </header>

        <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <Card icon={AlignLeftIcon} title={t("asset.details")}>
              {prop(TagIcon, t("asset.category"), label("category") && <span className={`rounded px-1.5 py-0.5 text-xs ${CHIP_STYLES.gray}`}>{label("category")}</span>)}
              {prop(BarcodeIcon, t("asset.serial"), text(row.serial_number) && <span className="font-mono text-[13px]">{text(row.serial_number)}</span>)}
              {prop(HashIcon, t("asset.inventory"), text(row.inventory_number))}
              {prop(WalletIcon, t("asset.cost"), row.cost ? <b className="tabular-nums">{`${money(row.cost)} ${currency}`}</b> : "")}
              {prop(CalendarIcon, t("asset.bought"), date(row.purchase_date))}
              {prop(
                ShieldCheckIcon,
                t("asset.warranty"),
                days !== null && (
                  <span className="flex flex-wrap items-center gap-2">
                    {date(row.warranty_until)}
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${CHIP_STYLES[days < 0 ? "red" : days < WARRANTY_SOON ? "yellow" : "green"]}`}
                    >
                      {days < 0 ? t("asset.warrantyExpired") : days < WARRANTY_SOON ? t("asset.warrantyLeft", { days }) : t("asset.warrantyActive")}
                    </span>
                  </span>
                ),
              )}
              {prop(AlignLeftIcon, t("asset.description"), cell(bySlug.get("description")))}
            </Card>

            <Card icon={HistoryIcon} title={t("asset.history")} count={asset.movements.length}>
              {asset.movements.length ? (
                <ol className="flex flex-col">
                  {asset.movements.map((m, at) => {
                    const [icon, color] = actionIcon(m.action);
                    const who = related(m, "hr_employees_id");
                    const by = related(m, "core_users_id");
                    return (
                      /* `.pp-tl` прототипа: значки связаны линией — лента, а не список. */
                      <li key={text(m.guid)} className="relative flex gap-3 py-2">
                        {at < asset.movements.length - 1 && (
                          <span aria-hidden className="absolute top-10 -bottom-2 left-3.5 w-px -translate-x-1/2 bg-border-strong" />
                        )}
                        <span className={`relative grid size-7 shrink-0 place-items-center rounded-full ${CHIP_STYLES[color]}`}>
                          <Icon as={icon} size={14} />
                        </span>
                        <div className="min-w-0 text-sm">
                          <b className="font-medium">
                            {t(moveKey("action", text(m.action) || "changed"))}
                            {text(m.hr_employees_id) && (
                              <>
                                {" · "}
                                <button type="button" onClick={() => onOpenEmployee(text(m.hr_employees_id))} className="text-accent-text hover:underline">
                                  {text(who.full_name) || "—"}
                                </button>
                              </>
                            )}
                          </b>
                          <small className="block text-xs text-fg-subtle">
                            {[date(m.date), text(by.full_name) || text(by.name), text(m.comment)].filter(Boolean).join(" · ")}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-fg-subtle">{t("asset.noHistory")}</p>
              )}
            </Card>
          </div>

          <Card icon={UserIcon} title={t("asset.holder")}>
            {holder ? (
              <div className="flex flex-col gap-3">
                <button type="button" onClick={() => onOpenEmployee(holder)} className="flex items-center gap-3 rounded-lg p-1 text-left hover:bg-surface-hover">
                  <Avatar name={text(person.full_name)} photo={firstText(person.photo) || undefined} size="lg" />
                  <span className="min-w-0">
                    <b className="block truncate">{text(person.full_name) || "—"}</b>
                    {department && <small className="block truncate text-xs text-fg-muted">{department}</small>}
                  </span>
                </button>
                {since && (
                  <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
                    <Icon as={CalendarCheckIcon} size={14} />
                    {t("asset.issuedOn", { date: date(since) })}
                  </span>
                )}
                {asset.can.update && (
                  <Button size="sm" variant="secondary" disabled={move.isPending} onClick={() => start(MOVE.returned)}>
                    <Icon as={Undo2Icon} size={14} />
                    {t(moveKey("move", MOVE.returned))}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="rounded-lg bg-surface-hover p-3 text-center text-sm text-fg-subtle">
                  {t(status === ASSET.writtenOff ? "asset.isWrittenOff" : status === ASSET.repair ? "asset.inRepair" : "asset.inStock")}
                </p>
                {asset.can.update && status === ASSET.inStock && (
                  <Button size="sm" variant="secondary" onClick={() => start(MOVE.issued)}>
                    <Icon as={UserPlusIcon} size={14} />
                    {t(moveKey("move", MOVE.issued))}
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {asking && <MoveDialog move={asking} busy={move.isPending} onClose={() => setAsking(null)} onSubmit={(values) => run(asking, values)} />}
      {deleting && (
        <ConfirmDialog
          title={t("asset.deleteTitle")}
          description={t("asset.deleteText", { name: text(row.name) })}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onConfirm={() => remove.mutate([guid], { onSuccess: onDeleted })}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
