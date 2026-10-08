import { useState } from "react";
import { PlusIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { timeZone } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { Chip, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Field, Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import {
  TRANSACTIONS_PAGE,
  useBillingStatus,
  useCards,
  usePlan,
  useRemoveCard,
  useRequestCardCode,
  useTopUp,
  useTransactions,
  useVerifyCard,
  type Card,
  type CardCode,
} from "../api/billing";
import { GroupTitle, Pager, SectionHeader, SettingRow } from "./parts";

/**
 * Тариф и оплата — `#s-billing` прототипа: что за тариф, когда
 * продление, сколько на счету, какие карты привязаны и куда ушли деньги.
 *
 * Действия — те же, что в старой админке (`SettingsPopup/modules/Billing`):
 * пополнить баланс с карты и привязать карту кодом из SMS. Смены тарифа
 * нет — бэкенд отказывает в ней проектам ucode (см. api/billing.ts).
 */
export function BillingSettings() {
  const { t, i18n } = useTranslation();
  const { status, isLoading } = useBillingStatus();
  const subscribed = Boolean(status?.subscription);
  const { plan } = usePlan(status);
  const { cards } = useCards();
  const removeCard = useRemoveCard();

  const [toppingUp, setToppingUp] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [removing, setRemoving] = useState<Card | null>(null);

  const money = (amount: number, currency: string) =>
    `${amount.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} ${currency}`.trim();
  /* «1 октября 2026», как в сводке прототипа: дата в предложении, а не в таблице. */
  const date = (value: string) =>
    value
      ? new Date(value).toLocaleDateString(i18n.language, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: timeZone(),
        })
      : "—";

  if (isLoading) return <p className="text-sm text-fg-subtle">{t("common.loading")}</p>;

  return (
    <>
      <SectionHeader title={t("billing.title")} hint={t("billing.hint")} />

      {/* Сводка — `.callout.blue` прототипа: тариф и ближайшее списание
          одним предложением, потому что их читают вместе. */}
      <div className="my-2.5 flex gap-2.5 rounded-md bg-callout-blue px-4 py-3.5 text-sm leading-[1.55] text-fg">
        <span aria-hidden className="text-lg leading-[1.3]">
          💎
        </span>

        <div className="min-w-0 flex-1">
          {!subscribed && t("billing.noSubscription")}

          {subscribed && plan && (
            <>
              <b className="font-semibold">{plan.name}</b>
              {plan.price > 0 &&
                ` · ${money(plan.price, plan.currency)}${
                  plan.periodMonths ? ` / ${t("billing.months", { count: plan.periodMonths })}` : ""
                }`}
              {" · "}
              {plan.canceling ? (
                t("billing.canceling", { date: date(plan.endDate) })
              ) : status ? (
                <>
                  {t("billing.nextCharge", { date: date(status.renewalDate) })}{" "}
                  <b className="font-semibold">{money(status.nextCharge, status.currency)}</b>
                </>
              ) : null}
              {plan.nextName && !plan.canceling && (
                <p className="mt-1">{t("billing.nextPlan", { name: plan.nextName })}</p>
              )}
            </>
          )}

          {/* Кнопки под сводкой, как «Сменить тариф» у прототипа. */}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => setToppingUp(true)}>
              <Icon as={WalletIcon} size={14} />
              {t("billing.topUp")}
            </Button>
          </div>
        </div>
      </div>

      {/* Карты — строкой «Способ оплаты», как у прототипа: плашка на карту. */}
      <SettingRow label={t("billing.paymentMethod")} hint={t("billing.paymentMethodHint")}>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {cards.map((card) => (
            <span key={card.id} title={card.verified ? t("billing.verified") : t("billing.unverified")}>
              <Chip
                color={card.verified ? "blue" : "orange"}
                onRemove={() => setRemoving(card)}
                removeLabel={t("billing.removeCard")}
              >
                {cardName(card)}
              </Chip>
            </span>
          ))}
          <Button size="sm" variant="secondary" onClick={() => setAddingCard(true)}>
            <Icon as={PlusIcon} size={14} />
            {t("billing.addCard")}
          </Button>
        </div>
      </SettingRow>

      {status && (
        <>
          <SettingRow label={t("billing.balance")}>
            <span className="text-sm tabular-nums">{money(status.balance, status.currency)}</span>
          </SettingRow>

          {status.creditLimit > 0 && (
            <SettingRow label={t("billing.creditLimit")} hint={t("billing.creditLimitHint")}>
              <span className="text-sm tabular-nums">{money(status.creditLimit, status.currency)}</span>
            </SettingRow>
          )}

          {/* Не хватает — это то, ради чего сюда заходят: словами,
              а не цифрой, которую надо сравнить со следующим списанием. */}
          {(status.shortfall > 0 || status.lowBalance) && (
            <p className="mt-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
              {status.shortfall > 0
                ? t("billing.shortfall", { amount: money(status.shortfall, status.currency) })
                : t("billing.lowBalance")}
            </p>
          )}
        </>
      )}

      <GroupTitle title={t("billing.history")} />
      <Transactions money={money} />

      {toppingUp && (
        <TopUpDialog
          cards={cards}
          onAddCard={() => setAddingCard(true)}
          onClose={() => setToppingUp(false)}
        />
      )}

      {addingCard && <AddCardDialog onClose={() => setAddingCard(false)} />}

      {removing && (
        <ConfirmDialog
          title={t("billing.removeCardTitle", { card: cardName(removing) })}
          description={t("billing.removeCardText")}
          confirmLabel={t("action.delete")}
          busy={removeCard.isPending}
          onConfirm={() => removeCard.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}

function cardName(card: Card): string {
  return [card.type, `•••• ${card.last4}`].filter(Boolean).join(" ");
}

/**
 * Пополнение — `TopUpBalance` старой админки: сумма и карта, с которой
 * списать. Списание идёт сразу, через Payme, поэтому кнопка называет
 * сумму целиком — «Пополнить на 500 000 сум», а не просто «Оплатить».
 *
 * Карт нет — пополнять нечем, и окно говорит это и ведёт к привязке.
 */
function TopUpDialog({
  cards,
  onAddCard,
  onClose,
}: {
  cards: Card[];
  onAddCard: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const topUp = useTopUp();
  const [amount, setAmount] = useState("");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const card = cards.find((item) => item.id === cardId) ?? cards[0];
  const sum = Number(amount.replace(/\s/g, ""));
  const valid = Number.isFinite(sum) && sum > 0 && Boolean(card);

  return (
    <Modal onClose={onClose}>
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !card) return;
          topUp.mutate(
            { cardId: card.id, amount: sum },
            {
              onSuccess: () => {
                toast.success(t("billing.topUpDone"));
                onClose();
              },
            },
          );
        }}
      >
        <div>
          <h2 className="text-base font-semibold">{t("billing.topUp")}</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">{t("billing.topUpHint")}</p>
        </div>

        <Field label={t("billing.amountUzs")}>
          <Input
            autoFocus
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d\s]/g, ""))}
            placeholder="500 000"
          />
        </Field>

        <Field label={t("billing.card")}>
          {cards.length ? (
            <div className="flex flex-col gap-1">
              {cards.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-surface-hover has-checked:border-accent"
                >
                  <input
                    type="radio"
                    name="card"
                    checked={card?.id === item.id}
                    onChange={() => setCardId(item.id)}
                    className="accent-accent"
                  />
                  <span className="flex-1">{cardName(item)}</span>
                  <span className="text-xs text-fg-subtle tabular-nums">{expiry(item.expire)}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">{t("billing.noCardsToPay")}</p>
          )}
        </Field>

        <button
          type="button"
          onClick={onAddCard}
          className="self-start text-xs font-medium text-accent-text hover:underline"
        >
          + {t("billing.addCard")}
        </button>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button type="submit" disabled={!valid || topUp.isPending}>
            {topUp.isPending
              ? t("billing.paying")
              : valid
                ? t("billing.payAmount", { amount: `${sum.toLocaleString(i18n.language)} UZS` })
                : t("billing.topUp")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** `0399` → `03/99`: так срок напечатан на карте. */
function expiry(value: string): string {
  return /^\d{4}$/.test(value) ? `${value.slice(0, 2)}/${value.slice(2)}` : value;
}

/**
 * Привязка карты — `AddCardComponent` старой админки, два шага:
 * номер и срок → код из SMS. Карта принимается UZCARD и HUMO (Payme);
 * VISA привяжется, но списать с неё сервер откажется.
 *
 * Номер не хранится у нас ни в каком виде: он уходит в Payme через
 * сервер, назад приходит только маска.
 */
function AddCardDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const request = useRequestCardCode();
  const verify = useVerifyCard();

  const [pan, setPan] = useState("");
  const [expire, setExpire] = useState("");
  const [sent, setSent] = useState<CardCode | null>(null);
  const [code, setCode] = useState("");

  const digits = pan.replace(/\D/g, "");
  const month = Number(expire.slice(0, 2));
  const ready = digits.length === 16 && /^\d{2}\/\d{2}$/.test(expire) && month >= 1 && month <= 12;

  return (
    <Modal onClose={onClose}>
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!sent) {
            if (ready) {
              request.mutate({ pan: digits, expire: expire.replace("/", "") }, { onSuccess: setSent });
            }
            return;
          }
          verify.mutate(
            { cardId: sent.cardId, code: code.trim() },
            {
              onSuccess: () => {
                toast.success(t("billing.cardAdded"));
                onClose();
              },
            },
          );
        }}
      >
        <div>
          <h2 className="text-base font-semibold">{t("billing.addCard")}</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {sent ? t("billing.codeSent", { phone: sent.phone }) : t("billing.addCardHint")}
          </p>
        </div>

        {!sent ? (
          <>
            <Field label={t("billing.cardNumber")}>
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="cc-number"
                value={pan}
                onChange={(event) => setPan(groupPan(event.target.value))}
                placeholder="8600 0000 0000 0000"
              />
            </Field>

            <Field label={t("billing.cardExpire")}>
              <Input
                inputMode="numeric"
                autoComplete="cc-exp"
                value={expire}
                onChange={(event) => setExpire(formatExpire(event.target.value))}
                placeholder="MM/YY"
              />
            </Field>
          </>
        ) : (
          <Field label={t("billing.smsCode")}>
            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Field>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          {sent ? (
            <Button type="submit" disabled={code.length < 4 || verify.isPending}>
              {t("billing.confirm")}
            </Button>
          ) : (
            <Button type="submit" disabled={!ready || request.isPending}>
              {t("billing.sendCode")}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** Номер по четыре цифры: так его читают с карты и сверяют глазами. */
function groupPan(value: string): string {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Срок `MM/YY`: косая подставляется сама после месяца. */
function formatExpire(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/**
 * Типы транзакций company_service (`TransactionType*`). Незнакомый
 * тип показывается как пришёл: список растёт вместе с бэкендом,
 * и новый тип не должен превращаться в пустую ячейку.
 */
const TYPE_LABEL: Record<string, TranslationKey> = {
  topup: "billing.typeTopup",
  withdraw: "billing.typeWithdraw",
  subscription: "billing.typeSubscription",
  upgrade: "billing.typeUpgrade",
  token_pack: "billing.typeTokenPack",
  template_purchase: "billing.typeTemplate",
  template_refund: "billing.typeRefund",
  user_seat_purchase: "billing.typeSeats",
  user_seat_monthly: "billing.typeSeats",
  user_seat_refund: "billing.typeRefund",
  user_seat_monthly_refund: "billing.typeRefund",
};

/** `payment_status` — enum базы; всё, что не принято и не отменено, ещё в пути. */
const STATUS_COLOR: Record<string, ChipColor> = { accepted: "green", cancelled: "red" };
/** Ячейка `.perm`: 8×10, линия снизу, по центру. */
const PERM = "border-b border-border px-2.5 py-2 text-center";

const STATUS_LABEL: Record<string, TranslationKey> = {
  accepted: "billing.accepted",
  cancelled: "billing.cancelled",
};

function Transactions({ money }: { money: (amount: number, currency: string) => string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const { transactions, count, isLoading } = useTransactions(page, TRANSACTIONS_PAGE);

  return (
    <>
      {/* `.perm` прототипа: 14px, строки через линию, колонки по центру,
          кроме первой; шапка — приглушённая, не капителью. */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[13px] text-fg-muted">
            <th className={`${PERM} text-left font-medium`}>{t("billing.date")}</th>
            <th className={`${PERM} font-medium`}>{t("billing.type")}</th>
            <th className={`${PERM} font-medium`}>{t("billing.amount")}</th>
            <th className={`${PERM} font-medium`}>{t("billing.status")}</th>
          </tr>
        </thead>

        <tbody>
          {(isLoading || !transactions.length) && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-sm text-fg-subtle">
                {isLoading ? t("common.loading") : t("billing.noHistory")}
              </td>
            </tr>
          )}

          {transactions.map((row) => {
            const type = TYPE_LABEL[row.type];
            const status = STATUS_LABEL[row.status];

            return (
              <tr key={row.id}>
                <td className={`${PERM} text-left tabular-nums`}>
                  {row.createdAt ? new Date(row.createdAt).toLocaleDateString(i18n.language, { timeZone: timeZone() }) : ""}
                </td>
                <td className={PERM}>
                  {type ? t(type) : row.type}
                  {row.note && ` · ${row.note}`}
                </td>
                <td className={`${PERM} tabular-nums`}>{money(row.amount, row.currency)}</td>
                <td className={PERM}>
                  <Chip dot color={STATUS_COLOR[row.status] ?? "orange"}>
                    {status ? t(status) : t("billing.pending")}
                  </Chip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Pager page={page} total={count} limit={TRANSACTIONS_PAGE} onPage={setPage} />
    </>
  );
}
