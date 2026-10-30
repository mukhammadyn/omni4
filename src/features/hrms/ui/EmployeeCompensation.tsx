import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  HandCoinsIcon,
  HashIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  Rows3Icon,
  TagIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { formatNumber } from "@/shared/lib/number-value";
import { Button } from "@/shared/ui/button";
import { CHIP_DOT, CHIP_STYLES, hexToChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Tabs } from "@/shared/ui/tabs";
import { Tooltip } from "@/shared/ui/tooltip";
import { useEmployeePay, type PayDraft, type PayRecord, type PayType } from "../api/payroll";

type Op = "" | PayRecord["kind"];

const sumOf = (rows: PayRecord[], kind: PayRecord["kind"]) =>
  rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.amount, 0);

/**
 * Вкладка «Компенсация» страницы сотрудника — `compTab` прототипа
 * (employee.html, `#comp`): начисления и удержания (`hr_payroll_lines`)
 * с отбором по операции, группами по месяцу даты и итогами.
 * ponytail: экспорта и импорта Excel прототипа нет — у таблицы они есть
 * в обычном пункте «Начисления».
 */
export function EmployeeCompensation({ employeeId, departmentId }: { employeeId: string; departmentId: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const pay = useEmployeePay(employeeId, departmentId);
  const [op, setOp] = useState<Op>("");
  const [grouped, setGrouped] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PayRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<PayRecord | null>(null);

  const rows = useMemo(
    () =>
      pay.records
        .filter((row) => !op || row.kind === op)
        .sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)),
    [pay.records, op],
  );
  const groups = useMemo(() => {
    const map = new Map<string, PayRecord[]>();
    for (const row of rows) map.set(row.date.slice(0, 7), [...(map.get(row.date.slice(0, 7)) ?? []), row]);
    return [...map];
  }, [rows]);

  const money = (n: number, sign: "+" | "−" | "" = "") =>
    n ? `${sign || (n < 0 ? "−" : "")}${formatNumber(Math.abs(n), locale)}` : "0";
  const monthName = (key: string) =>
    new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });

  const Totals = ({ list, small }: { list: PayRecord[]; small?: boolean }) => {
    const inc = sumOf(list, "accrual");
    const ded = sumOf(list, "deduction");
    const cls = small ? "text-xs" : "text-[13px]";
    return (
      <span className={`flex items-baseline gap-4 text-fg-muted ${cls}`}>
        <span className="max-md:hidden">
          {t("comp.accrued")} <b className="font-semibold text-success">{money(inc, "+")}</b>
        </span>
        <span className="max-md:hidden">
          {t("comp.deducted")} <b className="font-semibold text-danger">{money(ded, "−")}</b>
        </span>
        <span>
          {t("comp.total")} <b className="font-semibold text-fg">{money(inc - ded)} {t("comp.currency")}</b>
        </span>
      </span>
    );
  };

  const th = "h-9 border-b border-border px-3 text-left text-xs font-normal text-fg-muted";
  const td = "h-10 border-b border-border px-3";
  const head = (icon: LucideIcon, label: string, className = "") => (
    <th className={`${th} ${className}`}>
      <span className={`inline-flex items-center gap-1.5 ${className.includes("text-right") ? "justify-end" : ""}`}>
        <Icon as={icon} size={13} />
        {label}
      </span>
    </th>
  );

  const row = (record: PayRecord) => (
    <tr key={record.id}>
      <td className={`${td} tabular-nums`}>{formatDate(record.date, "date", locale)}</td>
      <td className={td}>{record.typeName}</td>
      <td className={td}>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_STYLES[record.kind === "accrual" ? "green" : "red"]}`}
        >
          {t(`comp.op.${record.kind}`)}
        </span>
      </td>
      <td className={`${td} text-right tabular-nums`}>
        <b className="font-semibold">
          {formatNumber(record.amount, locale)} {t("comp.currency")}
        </b>
      </td>
      <td className={`${td} text-fg-muted`}>{record.description}</td>
      <td className={`${td} text-fg-subtle tabular-nums`}>{formatDate(record.createdAt, "datetime", locale)}</td>
      <td className={`${td} text-right whitespace-nowrap`}>
        {pay.can.write && (
          <span className="inline-flex gap-1">
            <Tooltip label={t("comp.edit")}>
              <button
                type="button"
                aria-label={t("comp.edit")}
                onClick={() => setEditing(record)}
                className="grid size-7 place-items-center rounded-md border border-border text-fg-muted hover:bg-surface-hover hover:text-fg"
              >
                <Icon as={PencilIcon} size={14} />
              </button>
            </Tooltip>
            {pay.can.delete && (
              <Tooltip label={t("comp.delete")}>
                <button
                  type="button"
                  aria-label={t("comp.delete")}
                  onClick={() => setDeleting(record)}
                  className="grid size-7 place-items-center rounded-md border border-danger/30 text-danger hover:bg-danger-subtle"
                >
                  <Icon as={Trash2Icon} size={14} />
                </button>
              </Tooltip>
            )}
          </span>
        )}
      </td>
    </tr>
  );

  return (
    <section className="rounded-[10px] border border-border bg-surface">
      <div className="flex items-start gap-2 px-4 pt-3">
        <Icon as={HandCoinsIcon} size={16} className="mt-0.5 text-fg-muted" />
        <div>
          <h3 className="text-[15px] font-semibold">{t("comp.title")}</h3>
          <p className="text-xs text-fg-subtle">{t("comp.subtitle", { count: rows.length, months: groups.length })}</p>
        </div>
        {pay.can.write && (
          <Button variant="secondary" className="ml-auto" onClick={() => setEditing("new")}>
            <Icon as={PlusIcon} size={14} />
            {t("comp.add")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 px-4 pt-3 pb-1.5">
        <Tabs
          variant="segment"
          activeId={op}
          onSelect={(id) => setOp(id as Op)}
          tabs={[
            { id: "", label: t("comp.filter.all") },
            { id: "accrual", label: t("comp.filter.accrual") },
            { id: "deduction", label: t("comp.filter.deduction") },
          ]}
        />
        <button
          type="button"
          onClick={() => setGrouped((on) => !on)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs ${
            grouped ? "border-accent/40 bg-accent-subtle text-accent-text" : "border-border text-fg-muted"
          }`}
        >
          <Icon as={Rows3Icon} size={13} />
          {t("comp.grouping")}: <b className="font-semibold">{t(grouped ? "comp.byMonth" : "comp.none")}</b>
        </button>
        <span className="flex-1" />
        <Totals list={rows} />
      </div>

      <div className="overflow-x-auto px-4 pb-3.5">
        {pay.loading ? (
          <p className="py-8 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
        ) : !rows.length ? (
          <p className="py-8 text-center text-sm text-fg-subtle">{t("comp.empty")}</p>
        ) : (
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {head(CalendarIcon, t("comp.col.date"), "w-39")}
                {head(TagIcon, t("comp.col.type"), "w-40")}
                {head(LoaderIcon, t("comp.col.op"), "w-35")}
                {head(HashIcon, t("comp.col.amount"), "w-40 text-right")}
                {head(AlignLeftIcon, t("comp.col.description"))}
                {head(ClockIcon, t("comp.col.created"), "w-38")}
                <th className={`${th} w-21`} />
              </tr>
            </thead>
            {grouped ? (
              groups.map(([key, list]) => {
                const shut = closed.has(key);
                return (
                  <tbody key={key}>
                    <tr
                      className="cursor-pointer bg-surface-soft hover:bg-surface-hover"
                      onClick={() =>
                        setClosed((prev) => {
                          const next = new Set(prev);
                          if (!next.delete(key)) next.add(key);
                          return next;
                        })
                      }
                    >
                      <td colSpan={7} className="h-10 border-b border-border px-3">
                        <span className="flex items-center gap-2">
                          <Icon
                            as={ChevronDownIcon}
                            size={15}
                            className={`text-fg-subtle transition-transform ${shut ? "-rotate-90" : ""}`}
                          />
                          <b className="font-semibold capitalize">{monthName(key)}</b>
                          <span className="text-fg-subtle">{list.length}</span>
                          <span className="flex-1" />
                          <Totals list={list} small />
                        </span>
                      </td>
                    </tr>
                    {!shut && list.map(row)}
                  </tbody>
                );
              })
            ) : (
              <tbody>{rows.map(row)}</tbody>
            )}
          </table>
        )}
      </div>

      {editing && (
        <PayDialog
          record={editing === "new" ? null : editing}
          types={pay.payTypes}
          onSave={async (draft) => {
            await pay.save(draft, editing === "new" ? undefined : editing.id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("comp.delete")}
          description={t("comp.deleteHint", { type: deleting.typeName, amount: formatNumber(deleting.amount, locale) })}
          confirmLabel={t("comp.delete")}
          busy={false}
          onConfirm={() => {
            void pay.remove(deleting.id);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

/** `compModal` прототипа: дата, тип, операция, сумма, описание. Тип подставляет операцию. */
function PayDialog({
  record,
  types,
  onSave,
  onClose,
}: {
  record: PayRecord | null;
  types: PayType[];
  onSave: (draft: PayDraft) => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<PayDraft>(
    record ?? { date: todayInput(), typeId: "", kind: "accrual", amount: 0, description: "" },
  );
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PayDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <Modal onClose={onClose}>
      <form
        className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          onSave(draft).finally(() => setBusy(false));
        }}
      >
        <div>
          <h2 className="text-lg font-semibold">{t(record ? "comp.editTitle" : "comp.addTitle")}</h2>
          <p className="text-sm text-fg-muted">{t(record ? "comp.editHint" : "comp.addHint")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("comp.col.op")}>
            <Tabs
              variant="field"
              activeId={draft.kind}
              onSelect={(kind) =>
                set({ kind: kind as PayDraft["kind"], ...(types.find((type) => type.id === draft.typeId)?.kind === kind ? {} : { typeId: "" }) })
              }
              tabs={[
                { id: "accrual", label: t("comp.op.accrual") },
                { id: "deduction", label: t("comp.op.deduction") },
              ]}
            />
          </Field>
          <Field label={t("comp.col.date")}>
            <DatePicker value={draft.date} locale={i18n.language} onChange={(date) => set({ date })} />
          </Field>
          <Field label={t("comp.col.type")}>
            <Dropdown
              value={draft.typeId}
              /* Операция задаёт, какие типы годятся: тип — начисление или удержание. */
              items={types
                .filter((type) => type.kind === draft.kind)
                .map((type) => ({
                  value: type.id,
                  label: type.name,
                  ...(type.color ? { icon: <span className={`size-2 shrink-0 rounded-full ${CHIP_DOT[hexToChipColor(type.color)]}`} /> } : {}),
                }))}
              placeholder={t("comp.pickType")}
              onChange={(typeId) => set({ typeId })}
            />
          </Field>
          <Field label={t("comp.amountLabel")}>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={draft.amount || ""}
              onChange={(event) => set({ amount: Number(event.target.value.replace(/\D/g, "")) })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("comp.col.description")}>
              <Input value={draft.description} onChange={(event) => set({ description: event.target.value })} />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !draft.date || !draft.typeId || !draft.amount}>
            {t("action.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
