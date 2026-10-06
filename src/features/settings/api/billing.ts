import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useSession } from "@/shared/api/use-session";
import { keys } from "@/shared/lib/query-keys";
import { reportError } from "@/shared/lib/toast";

/**
 * Тариф и оплата.
 *
 * Деньги двигаются так же, как в старой админке: баланс пополняется
 * с привязанной карты (Payme, `receipt-pay`), карта привязывается
 * кодом из SMS. Тариф отсюда не меняется: `attach-fare` отказывает
 * тарифам ucode (company_service `project.go:1717` — «ucode plans
 * cannot be changed via AttachFare»), а omni4 — проект ucode.
 *
 * `POST /v1/transaction` — НЕ пополнение: это ручная проводка, и она
 * зачисляет деньги без всякой оплаты (docs/backend-notes.md, «Тариф
 * и оплата»). Клиенту её звать нельзя.
 *
 * Все ручки берут проект из токена, параметра проекта у них нет.
 * Ответы — proto-структуры company_service (`billing_service.proto`)
 * в snake_case; нулевые поля шлюз опускает (omitempty), поэтому
 * каждое поле здесь необязательное.
 */

/** Сводка: баланс, следующее списание, дата продления. */
const STATUS = "/v1/billing/status";
/** Текущая подписка: какой тариф и на какой срок. */
const SUBSCRIPTION = "/v1/subscription/current";
const FARE = "/v1/fare";
const CARDS = "/v1/payment/card-list";
/**
 * История платежей. Без `all=true`: с ним шлюз снимает отбор по проекту
 * и отдаёт транзакции ВСЕХ проектов (`billing.go:441`) — см.
 * docs/backend-notes.md, «Транзакции».
 */
const TRANSACTIONS = "/v1/transaction";

/** Биллинг меняется раз в день, а не по ходу работы. */
const STALE = 5 * 60_000;

type StatusDto = {
  project_status?: string;
  subscription_status?: string;
  renewal_date?: string;
  days_until_renewal?: number;
  next_charge?: number;
  project_balance?: number;
  credit_limit?: number;
  available_funds?: number;
  shortfall?: number;
  low_balance_warning?: boolean;
  currency_code?: string;
};

export type BillingStatus = {
  /** Статус подписки: `active`, `pending_downgrade`… Пусто — подписки нет. */
  subscription: string;
  /** Дата продления, `YYYY-MM-DD`. */
  renewalDate: string;
  daysUntilRenewal: number;
  /** Сколько спишется при продлении. */
  nextCharge: number;
  balance: number;
  creditLimit: number;
  /** Баланс плюс кредитный лимит — то, чем проект может заплатить. */
  available: number;
  /** Сколько не хватит на следующее списание. 0 — хватает. */
  shortfall: number;
  lowBalance: boolean;
  /** Валюта всех сумм выше — сумы, см. BALANCE_CURRENCY. */
  currency: string;
  /** Валюта тарифа: в ней назначена его цена. */
  fareCurrency: string;
};

/**
 * Суммы сводки — в сумах, что бы ни стояло в `currency_code`.
 *
 * Бэкенд переводит цену тарифа в сумы по курсу (`next_charge = price ×
 * rate`, company_service `billing.go:1381`; для UZS курс 1,
 * `ugen_billing.go:106`) и сравнивает её с балансом — значит, и баланс
 * в сумах. А `currency_code` в том же ответе — валюта ТАРИФА (`c.id =
 * ef.currency_id`, `billing.go:1333`). Подписать ею суммы — показать
 * «3 533 535 USD» там, где списывается 300 долларов
 * (docs/backend-notes.md, «Тариф: валюта сводки»).
 */
const BALANCE_CURRENCY = "UZS";

export function useBillingStatus() {
  const projectId = useSession().getProjectId() ?? "";

  const query = useQuery({
    queryKey: keys.settings.billingStatus(projectId),
    queryFn: () => api.get<StatusDto>(STATUS),
    enabled: Boolean(projectId),
    staleTime: STALE,
    select: (dto): BillingStatus => ({
      subscription: dto.subscription_status ?? "",
      renewalDate: dto.renewal_date ?? "",
      daysUntilRenewal: dto.days_until_renewal ?? 0,
      nextCharge: dto.next_charge ?? 0,
      balance: dto.project_balance ?? 0,
      creditLimit: dto.credit_limit ?? 0,
      available: dto.available_funds ?? 0,
      shortfall: dto.shortfall ?? 0,
      lowBalance: Boolean(dto.low_balance_warning),
      currency: BALANCE_CURRENCY,
      fareCurrency: dto.currency_code ?? "",
    }),
  });

  return { status: query.data, isLoading: query.isLoading, error: query.error };
}

type SubscriptionDto = {
  fare_id?: string;
  pending_fare_id?: string;
  start_date?: string;
  end_date?: string;
  billing_period_months?: number;
  cancel_at_period_end?: boolean;
};

type FareDto = { id?: string; name?: string; price?: number; currency?: { code?: string } };

export type Plan = {
  name: string;
  price: number;
  currency: string;
  /** Месяцев в оплаченном периоде. 0 — не указано. */
  periodMonths: number;
  startDate: string;
  endDate: string;
  /** Подписку отменили: она доживёт до конца периода и не продлится. */
  canceling: boolean;
  /** Тариф, на который проект перейдёт при продлении. Пусто — тот же. */
  nextName: string;
};

/**
 * Тариф: подписка и по ней — сам тариф. Имени тарифа в подписке нет,
 * только id, поэтому запросов два, и второй ждёт первый.
 *
 * `enabled` — есть ли подписка вообще; это знает сводка
 * (`BillingStatus.subscription`). Без подписки ручка отвечает не пустотой,
 * а ошибкой: строку она ищет через `QueryRow` и отдаёт `ErrNoRows`
 * наверх (company_service `billing.go:1175`).
 *
 * Валюту цены ручка тарифа не отдаёт: `GetFare` не джойнит `currency`.
 * Её знает сводка (`fareCurrency`) — но про тариф, который спишется
 * ПРИ ПРОДЛЕНИИ, то есть про новый при отложенном переходе. Поэтому
 * берём её только когда перехода нет.
 */
export function usePlan(status: BillingStatus | undefined) {
  const projectId = useSession().getProjectId() ?? "";

  const subscription = useQuery({
    queryKey: keys.settings.subscription(projectId),
    queryFn: () => api.get<SubscriptionDto>(SUBSCRIPTION),
    enabled: Boolean(status?.subscription) && Boolean(projectId),
    staleTime: STALE,
  });

  const fareId = subscription.data?.fare_id ?? "";
  const pendingId = subscription.data?.pending_fare_id ?? "";

  const fare = useFare(fareId);
  const pending = useFare(pendingId);

  const sub = subscription.data;
  const plan: Plan | undefined =
    sub && fare.data
      ? {
          name: fare.data.name ?? "",
          price: fare.data.price ?? 0,
          currency: fare.data.currency?.code ?? (pendingId ? "" : (status?.fareCurrency ?? "")),
          periodMonths: sub.billing_period_months ?? 0,
          startDate: sub.start_date ?? "",
          endDate: sub.end_date ?? "",
          canceling: Boolean(sub.cancel_at_period_end),
          nextName: pending.data?.name ?? "",
        }
      : undefined;

  return { plan, isLoading: subscription.isLoading || fare.isLoading };
}

function useFare(fareId: string) {
  const projectId = useSession().getProjectId() ?? "";

  return useQuery({
    queryKey: keys.settings.fare(projectId, fareId),
    queryFn: () => api.get<FareDto>(`${FARE}/${fareId}`),
    enabled: Boolean(projectId && fareId),
    staleTime: STALE,
  });
}

/**
 * `payme_token` в ответе тоже есть — платёжный токен карты, — и в DTO
 * его нет намеренно: фронту он не нужен, а отдавать его ручке незачем
 * (docs/backend-notes.md, «Карты проекта»).
 */
type CardDto = { id?: string; pan?: string; expire?: string; verify?: boolean; type?: string };

export type Card = {
  id: string;
  /**
   * Последние четыре цифры. Бэкенд хранит номер уже маскированным, но
   * в двух видах: `860006******1234` от Payme (`payme.go:67`) и
   * `****1234` от Stripe (`payment.go:162`). Срезаем до общего хвоста —
   * и формат один, и полный номер не покажется, если однажды придёт.
   */
  last4: string;
  expire: string;
  /** Карта прошла подтверждение кодом. Без него с неё не списывают. */
  verified: boolean;
  type: string;
};

export function useCards() {
  const projectId = useSession().getProjectId() ?? "";

  const query = useQuery({
    queryKey: keys.settings.cards(projectId),
    queryFn: () =>
      api.get<{ project_cards?: CardDto[] }>(CARDS, { params: { limit: 50, offset: 0 } }),
    enabled: Boolean(projectId),
    staleTime: STALE,
    select: (dto): Card[] =>
      (dto.project_cards ?? []).map((card) => ({
        id: card.id ?? "",
        last4: (card.pan ?? "").replace(/\D/g, "").slice(-4),
        expire: card.expire ?? "",
        verified: Boolean(card.verify),
        type: card.type ?? "",
      })),
  });

  return { cards: query.data ?? NO_CARDS, isLoading: query.isLoading };
}

const NO_CARDS: Card[] = [];

type TransactionDto = {
  id?: string;
  amount?: number;
  comment?: string;
  payment_status?: string;
  transaction_type?: string;
  payment_type?: string;
  created_at?: string;
  currency?: { code?: string };
  fare?: { name?: string };
};

export type Transaction = {
  id: string;
  createdAt: string;
  /** Пополнение, списание за тариф… — как пришло с бэкенда. */
  type: string;
  /** Способ оплаты: карта, чек, вручную. */
  method: string;
  /**
   * Пояснение к платежу: тариф, за который списано, а у платежа
   * не за тариф — комментарий того, кто его провёл.
   */
  note: string;
  amount: number;
  currency: string;
  status: string;
};

export const TRANSACTIONS_PAGE = 20;

export function useTransactions(page: number, limit: number) {
  const projectId = useSession().getProjectId() ?? "";

  const query = useQuery({
    queryKey: keys.settings.transactions(projectId, page, limit),
    queryFn: () =>
      api.get<{ transactions?: TransactionDto[]; count?: number }>(TRANSACTIONS, {
        params: { limit, offset: (page - 1) * limit },
      }),
    enabled: Boolean(projectId),
    staleTime: STALE,
    placeholderData: (previous) => previous,
    select: (dto) => ({
      count: dto.count ?? 0,
      rows: (dto.transactions ?? []).map(
        (row): Transaction => ({
          id: row.id ?? "",
          createdAt: row.created_at ?? "",
          type: row.transaction_type ?? "",
          method: row.payment_type ?? "",
          note: row.fare?.name || row.comment || "",
          amount: row.amount ?? 0,
          currency: row.currency?.code ?? "",
          status: row.payment_status ?? "",
        }),
      ),
    }),
  });

  return {
    transactions: query.data?.rows ?? NO_TRANSACTIONS,
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
  };
}

const NO_TRANSACTIONS: Transaction[] = [];

/**
 * Пополнение баланса с привязанной карты.
 *
 * Сумма — в СУМАХ: сервер сам переводит её в тийины для Payme
 * (company_service `payme.go:200`) и зачисляет на баланс в сумах.
 * Принимаются только UZCARD и HUMO; VISA сервер отклоняет.
 *
 * Ответ 200 приходит и на НЕоплаченный чек: исход — только в тексте
 * `status` (состояние чека Payme, `config/constants.go:82`). Оплачен —
 * ровно «Cheque paid.»; всё остальное — отказ, и показываем его как есть.
 */
const PAID = "Cheque paid.";

export function useTopUp() {
  const queryClient = useQueryClient();
  const projectId = useSession().getProjectId() ?? "";

  return useMutation({
    mutationFn: async ({ cardId, amount }: { cardId: string; amount: number }) => {
      const dto = await api.post<{ status?: string }>("/v1/payment/receipt-pay", {
        project_card_id: cardId,
        amount,
      });
      if (dto.status !== PAID) throw new Error(dto.status || "Payment failed");
    },
    onError: (error) => reportError(error, "billing.topUpFailed"),
    /* Пополнение двигает всё сразу: баланс, «не хватает», историю. */
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.settings.billingAll(projectId) }),
  });
}

export type CardCode = {
  /** Карта заведена неподтверждённой — по этому id её подтверждают. */
  cardId: string;
  /** Куда ушёл код, маской: «99890*****12». */
  phone: string;
};

/**
 * Привязка карты, шаг первый: номер и срок → SMS с кодом.
 *
 * Срок — `MMYY`, как его ждёт Payme (`cards.create`); сервер его
 * не проверяет, поэтому формат держит форма.
 */
export function useRequestCardCode() {
  return useMutation({
    mutationFn: async ({ pan, expire }: { pan: string; expire: string }): Promise<CardCode> => {
      const dto = await api.post<{ phone?: string; project_card_id?: string }>(
        "/v1/payment/get-verify-code",
        { pan, expire },
      );
      if (!dto.project_card_id) throw new Error("No card id");
      return { cardId: dto.project_card_id, phone: dto.phone ?? "" };
    },
    onError: (error) => reportError(error, "billing.cardFailed"),
  });
}

/** Шаг второй: код из SMS. После него карта в списке и с неё можно платить. */
export function useVerifyCard() {
  const queryClient = useQueryClient();
  const projectId = useSession().getProjectId() ?? "";

  return useMutation({
    mutationFn: ({ cardId, code }: { cardId: string; code: string }) =>
      api.post<unknown>("/v1/payment/verify", { project_card_id: cardId, code }),
    onError: (error) => reportError(error, "billing.codeFailed"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.settings.cards(projectId) }),
  });
}

export function useRemoveCard() {
  const queryClient = useQueryClient();
  const projectId = useSession().getProjectId() ?? "";

  return useMutation({
    mutationFn: (cardId: string) => api.delete<unknown>(`/v1/payment/card/${cardId}`),
    onError: (error) => reportError(error, "common.deleteFailed"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.settings.cards(projectId) }),
  });
}
