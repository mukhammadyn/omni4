/**
 * Имущество: `hr_assets` — вещь и её текущее состояние, `hr_asset_movements`
 * — журнал (только добавление). Как `properties` и `property_histories`
 * в udevs_hrms_admin, но действие журнала — по прототипу (property.html),
 * а не пара «был → стал».
 *
 * Статус вещи (`status`, PICK_LIST): in_stock · assigned · repair · written_off.
 * Действие журнала (`action`, PICK_LIST): received · issued · returned ·
 * sent_to_repair · returned_from_repair · written_off · changed.
 */
export const ASSET = { inStock: "in_stock", assigned: "assigned", repair: "repair", writtenOff: "written_off" } as const;
export const MOVE = {
  received: "received",
  issued: "issued",
  returned: "returned",
  toRepair: "sent_to_repair",
  fromRepair: "returned_from_repair",
  writtenOff: "written_off",
  changed: "changed",
} as const;
export type Move = (typeof MOVE)[keyof typeof MOVE];

/** Куда переводит действие. Владелец остаётся только у «Выдано» — как `move_property`. */
const TARGET: Partial<Record<Move, string>> = {
  [MOVE.received]: ASSET.inStock,
  [MOVE.issued]: ASSET.assigned,
  [MOVE.returned]: ASSET.inStock,
  [MOVE.toRepair]: ASSET.repair,
  [MOVE.fromRepair]: ASSET.inStock,
  [MOVE.writtenOff]: ASSET.writtenOff,
};
export const targetOf = (move: Move): string | undefined => TARGET[move];

/**
 * Действия, доступные из статуса, — кнопки и меню прототипа:
 * на складе — выдать, в ремонт, списать; выдано — вернуть, в ремонт,
 * списать; в ремонте — из ремонта, списать; списано — «вернуть в учёт»
 * (в журнал — поступление).
 */
export function movesFrom(status: unknown): Move[] {
  switch (status) {
    case ASSET.assigned:
      return [MOVE.returned, MOVE.toRepair, MOVE.writtenOff];
    case ASSET.repair:
      return [MOVE.fromRepair, MOVE.writtenOff];
    case ASSET.writtenOff:
      return [MOVE.received];
    default:
      return [MOVE.issued, MOVE.toRepair, MOVE.writtenOff];
  }
}

/**
 * Записи журнала одного действия. В ремонт и списание с рук — сначала
 * возврат на склад от прежнего владельца, как `log('Возврат на склад')`
 * в прототипе: иначе в истории не видно, у кого вещь была до ремонта.
 */
export function movesToLog(move: Move, holder: string): { action: Move; employee: string }[] {
  const leaves = holder && (move === MOVE.toRepair || move === MOVE.writtenOff);
  return [...(leaves ? [{ action: MOVE.returned, employee: holder }] : []), { action: move, employee: move === MOVE.returned ? holder : "" }];
}

/** Гарантия: дней до конца; отрицательное — истекла; null — не задана. */
export function warrantyDays(until: unknown, today: Date): number | null {
  if (typeof until !== "string" || !until) return null;
  const end = new Date(`${until.slice(0, 10)}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
/** Меньше стольких дней — «осталось N дн.» жёлтым, как в прототипе. */
export const WARRANTY_SOON = 60;

/** Сумма по валютам: у вещи своя валюта, складывать UZS с USD нельзя. */
export function totals(rows: Record<string, unknown>[]): { currency: string; sum: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const cost = Number(row.cost);
    if (!Number.isFinite(cost) || !cost) continue;
    const currency = typeof row.currency === "string" && row.currency ? row.currency : "UZS";
    sums.set(currency, (sums.get(currency) ?? 0) + cost);
  }
  return [...sums].map(([currency, sum]) => ({ currency, sum }));
}

/** «12 500 000» — разряды пробелом, как `money()` прототипа. */
export const money = (value: unknown) => String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/**
 * С какого числа вещь у нынешнего владельца — последняя «выдача» ему
 * в журнале. Отдельного `assigned_date`, как в udevs_hrms_admin, в схеме нет.
 */
export function issuedSince(movements: Record<string, unknown>[], holder: string): string {
  const dates = movements
    .filter((m) => m.action === MOVE.issued && m.hr_employees_id === holder && typeof m.date === "string")
    .map((m) => m.date as string)
    .sort();
  return dates.at(-1) ?? "";
}
