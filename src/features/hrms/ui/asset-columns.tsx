import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, EllipsisIcon, EyeIcon, PencilIcon, Trash2Icon, Undo2Icon, UserPlusIcon } from "lucide-react";
import { useTablePermissions } from "@/features/auth";
import { useDeleteItems, type ExtraColumn, type Item } from "@/features/item";
import { toast } from "@/shared/lib/toast";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { ASSETS, useDuplicateAsset, useMoveAsset } from "../api/asset";
import { text } from "../api/org";
import { ASSET, MOVE } from "../model/asset";
import { MoveDialog, moveKey } from "./asset-parts";

type Open = (guid: string, edit: boolean) => void;

/** Меню строки — `[data-m]` properties.html прототипа. */
function AssetRowMenu({ row, onOpen }: { row: Item; onOpen: Open }) {
  const { t } = useTranslation();
  const can = useTablePermissions()(ASSETS);
  const move = useMoveAsset();
  const duplicate = useDuplicateAsset();
  const remove = useDeleteItems(ASSETS);
  const [issuing, setIssuing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const guid = text(row.guid);
  const holder = text(row.hr_employees_id);
  const item = (icon: typeof EyeIcon, label: string, run: () => void, danger = false) => (close: () => void) => (
    <PopoverItem
      key={label}
      danger={danger}
      icon={<Icon as={icon} size={16} className={danger ? "shrink-0" : "shrink-0 text-fg-muted"} />}
      onClick={() => {
        close();
        run();
      }}
    >
      {label}
    </PopoverItem>
  );

  return (
    <span onClick={(event) => event.stopPropagation()} className="flex justify-end">
      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-label={t("asset.actions")}
            onClick={toggle}
            className={`grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-active hover:text-fg ${open ? "bg-surface-active text-fg" : ""}`}
          >
            <Icon as={EllipsisIcon} size={14} />
          </button>
        )}
      >
        {(close) => (
          <>
            {item(EyeIcon, t("action.open"), () => onOpen(guid, false))(close)}
            {can.update && item(PencilIcon, t("action.edit"), () => onOpen(guid, true))(close)}
            {can.update &&
              row.status === ASSET.assigned &&
              item(Undo2Icon, t(moveKey("move", MOVE.returned)), () =>
                move.mutate({ guid, holder, move: MOVE.returned }, { onSuccess: () => toast.success(t(moveKey("done", MOVE.returned))) }),
              )(close)}
            {can.update && row.status === ASSET.inStock && item(UserPlusIcon, t(moveKey("move", MOVE.issued)), () => setIssuing(true))(close)}
            {can.write && item(CopyIcon, t("asset.duplicate"), () => duplicate.mutate(row, { onSuccess: (copy) => onOpen(copy, true) }))(close)}
            {can.delete && (
              <>
                <PopoverSeparator />
                {item(Trash2Icon, t("action.delete"), () => setDeleting(true), true)(close)}
              </>
            )}
          </>
        )}
      </Popover>
      {issuing && (
        <MoveDialog
          move={MOVE.issued}
          busy={move.isPending}
          onClose={() => setIssuing(false)}
          onSubmit={(values) =>
            move.mutate(
              { guid, holder, move: MOVE.issued, ...values },
              {
                onSuccess: () => {
                  setIssuing(false);
                  toast.success(t(moveKey("done", MOVE.issued)));
                },
              },
            )
          }
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("asset.deleteTitle")}
          description={t("asset.deleteText", { name: text(row.name) })}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onConfirm={() => remove.mutate([guid], { onSuccess: () => setDeleting(false) })}
          onClose={() => setDeleting(false)}
        />
      )}
    </span>
  );
}

/**
 * Хвост таблицы имущества: меню строки. Фото, инвентарный номер,
 * сотрудник и статус — колонки самой схемы, их ставит view.
 *
 * `rows` не задан — таблица не имущества: колонок нет.
 */
export function useAssetColumns(rows: Item[] | undefined, onOpen: Open): ExtraColumn[] {
  /* Обработчик — новый на каждый рендер экрана; колонки из-за него не пересобираются. */
  const open = useRef(onOpen);
  open.current = onOpen;
  return useMemo(
    () => (rows ? [{ id: "asset:menu", label: "", width: 48, render: (row: Item) => <AssetRowMenu row={row} onOpen={(g, e) => open.current(g, e)} /> }] : []),
    [rows],
  );
}
