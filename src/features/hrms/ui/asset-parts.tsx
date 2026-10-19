import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArchiveXIcon,
  ArmchairIcon,
  CarIcon,
  CheckCheckIcon,
  CircleIcon,
  KeyRoundIcon,
  KeyboardIcon,
  LaptopIcon,
  MonitorIcon,
  PackageIcon,
  PackagePlusIcon,
  PencilIcon,
  SmartphoneIcon,
  Undo2Icon,
  UserCheckIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { fileUrl, type Item } from "@/features/item";
import { todayInput } from "@/shared/lib/date-value";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import type { TranslationKey } from "@/shared/lib/i18n";
import { openPreview } from "@/shared/ui/file-preview";
import { Modal } from "@/shared/ui/modal";
import { MOVE, type Move } from "../model/asset";
import { EmployeePicker } from "./ShiftDialog";

/** Категория → значок и цвет плитки — `PROP.CAT` прототипа. */
export const CATEGORY: Record<string, [LucideIcon, ChipColor]> = {
  computers: [LaptopIcon, "blue"],
  phones: [SmartphoneIcon, "green"],
  monitors: [MonitorIcon, "purple"],
  peripherals: [KeyboardIcon, "orange"],
  furniture: [ArmchairIcon, "brown"],
  transport: [CarIcon, "red"],
  access: [KeyRoundIcon, "yellow"],
  other: [PackageIcon, "gray"],
};

/** Действие журнала → значок и цвет — `HI` прототипа. */
export const ACTION: Record<string, [LucideIcon, ChipColor]> = {
  [MOVE.received]: [PackagePlusIcon, "gray"],
  [MOVE.issued]: [UserCheckIcon, "green"],
  [MOVE.returned]: [Undo2Icon, "blue"],
  [MOVE.toRepair]: [WrenchIcon, "yellow"],
  [MOVE.fromRepair]: [CheckCheckIcon, "blue"],
  [MOVE.writtenOff]: [ArchiveXIcon, "red"],
  [MOVE.changed]: [PencilIcon, "gray"],
};
export const actionIcon = (action: unknown) => ACTION[String(action)] ?? [CircleIcon, "gray" as ChipColor];

/**
 * Ключ перевода действия. Не каждое сочетание существует: `move`
 * и `done` — у действий из movesFrom, `do` — у тех, что спрашивают окном
 * (выдать, в ремонт, списать), `action` — у всех строк журнала.
 */
export const moveKey = (kind: "move" | "do" | "done" | "action", move: unknown) => `asset.${kind}.${String(move)}` as TranslationKey;

const SIZE = { sm: "size-8 rounded-md", lg: "aspect-[16/10] w-full rounded-t-lg", xl: "size-16 rounded-xl" };

/** Адреса фото вещи: MULTI_IMAGE — список, у старых строк бывает одна строка. */
export const photosOf = (row: Item) =>
  (Array.isArray(row.photos) ? row.photos : [row.photos]).filter((url): url is string => typeof url === "string" && url !== "").map(fileUrl);

/**
 * Миниатюра — первое фото, нет — значок категории (`PROP.thumb`).
 * Фото целиком (`object-contain`) на плитке цвета категории: вещь
 * не обрезается, сколько бы её ни сфотографировали. С фото — щелчок
 * открывает просмотр всех фото вещи, а не строку под ней.
 */
export function AssetThumb({ row, size = "sm" }: { row: Item; size?: keyof typeof SIZE }) {
  const photos = photosOf(row);
  const [icon, color] = CATEGORY[String(row.category)] ?? CATEGORY.other!;
  const tile = `${SIZE[size]} grid shrink-0 place-items-center overflow-hidden ${CHIP_STYLES[color]}`;
  if (!photos.length)
    return (
      <span className={tile}>
        <Icon as={icon} size={size === "sm" ? 15 : size === "lg" ? 40 : 28} />
      </span>
    );
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        openPreview(photos, 0, "image");
      }}
      className={`${tile} cursor-zoom-in`}
    >
      <img src={photos[0]} alt="" loading="lazy" className="size-full object-contain" />
    </button>
  );
}

/**
 * Окно действия — `giveModal()` и окно «Причина» прототипа: выдача
 * спрашивает сотрудника, дату и комментарий, ремонт и списание — причину.
 */
export function MoveDialog({
  move,
  busy,
  employee: initial = "",
  onClose,
  onSubmit,
}: {
  move: Move;
  busy: boolean;
  /** Выдать — сразу этому сотруднику (со страницы сотрудника). */
  employee?: string;
  onClose: () => void;
  onSubmit: (values: { employee: string; date: string; comment: string }) => void;
}) {
  const { t } = useTranslation();
  const issue = move === MOVE.issued;
  const [employee, setEmployee] = useState(initial);
  const [date, setDate] = useState(todayInput());
  const [comment, setComment] = useState("");
  const label = "mb-1.5 block text-[12.5px] text-fg-muted";
  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t(moveKey("move", move))}</h2>
        <div className="flex flex-col gap-3 px-4 py-3">
          {issue && (
            <>
              <div>
                <span className={label}>{t("asset.employee")}</span>
                {/* Один сотрудник: из выбора остаётся последний отмеченный. */}
                <EmployeePicker value={employee ? [employee] : []} onChange={(ids) => setEmployee(ids.filter((id) => id !== employee).at(-1) ?? "")} />
              </div>
              <label>
                <span className={label}>{t("asset.issueDate")}</span>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </>
          )}
          <label>
            <span className={label}>{t(issue ? "asset.comment" : "asset.reason")}</span>
            <Input
              autoFocus={!issue}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t(issue ? "asset.commentHint" : move === MOVE.toRepair ? "asset.repairHint" : "asset.writeOffHint")}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            variant={move === MOVE.writtenOff ? "danger" : "primary"}
            disabled={busy || (issue && !employee)}
            onClick={() => onSubmit({ employee, date: date || todayInput(), comment: comment.trim() })}
          >
            {t(moveKey("do", move))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
