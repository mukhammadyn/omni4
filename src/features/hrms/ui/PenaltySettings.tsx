import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CalendarXIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  FileSlidersIcon,
  InfoIcon,
  LinkIcon,
  LogOutIcon,
  MapPinIcon,
  NetworkIcon,
  PencilIcon,
  PlusIcon,
  SearchCheckIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { formatDate, todayInput } from "@/shared/lib/date-value";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DatePicker } from "@/shared/ui/date-picker";
import { Dropdown } from "@/shared/ui/dropdown";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Tabs } from "@/shared/ui/tabs";
import {
  matchingPolicies,
  SCOPES,
  STEPPED,
  usePenalties,
  usePenaltyTargets,
  VIOLATIONS,
  type PenaltyAssignment,
  type PenaltyPolicy,
  type PolicyDraft,
  type Scope,
  type Violation,
} from "../api/penalty";
import { Switch } from "./record-form";

/** Пороги, из которых выбирают, — `FN_TH` прототипа. */
const THRESHOLDS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

const RULE_ICON: Record<Violation, LucideIcon> = {
  late: ArrowDownRightIcon,
  early_leave: ArrowUpRightIcon,
  no_checkout: LogOutIcon,
  absence: CalendarXIcon,
};

const SCOPE_LOOK: Record<Scope, { icon: LucideIcon; color: ChipColor }> = {
  employee: { icon: UserIcon, color: "green" },
  department: { icon: NetworkIcon, color: "purple" },
  location: { icon: MapPinIcon, color: "blue" },
  all_locations: { icon: MapPinIcon, color: "gray" },
};

const money = (n: number, locale: string) => n.toLocaleString(locale).replace(/,/g, " ");

/** Новая политика — с порогами прототипа, чтобы было что поправить, а не с пустыми. */
const fresh = (name: string): PolicyDraft => ({
  name,
  description: "",
  rules: {
    late: { on: true, steps: [{ minutes: 15, amount: 15000 }, { minutes: 30, amount: 30000 }, { minutes: 60, amount: 60000 }] },
    early_leave: { on: true, steps: [{ minutes: 15, amount: 15000 }, { minutes: 30, amount: 30000 }] },
    no_checkout: { on: true, steps: [{ minutes: 0, amount: 20000 }] },
    absence: { on: true, steps: [{ minutes: 0, amount: 100000 }] },
  },
});

/**
 * «Штрафы за посещаемость» — `fnRoot` прототипа (settings.html#hr-fines):
 * вкладки «Кого штрафовать» (назначения) и «Политики штрафов».
 */
export function PenaltySettings() {
  const { t } = useTranslation();
  const data = usePenalties();
  const [tab, setTab] = useState<"asg" | "pol">("pol");
  const [open, setOpen] = useState("");

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <Tabs
        variant="segment"
        activeId={tab}
        onSelect={(id) => setTab(id as "asg" | "pol")}
        tabs={[
          { id: "asg", label: t("fine.tabAssign"), icon: UsersIcon, count: data.assignments.length },
          { id: "pol", label: t("fine.tabPolicies"), icon: FileSlidersIcon, count: data.policies.length },
        ]}
      />
      {tab === "pol" ? (
        <PoliciesTab data={data} open={open} setOpen={setOpen} />
      ) : (
        <AssignmentsTab
          data={data}
          onOpenPolicy={(id) => {
            setOpen(id);
            setTab("pol");
          }}
        />
      )}
    </div>
  );
}

type Data = ReturnType<typeof usePenalties>;

function Intro({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <p className="flex-1 text-sm leading-relaxed text-fg-muted">{text}</p>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ---------- Политики ---------- */

function PoliciesTab({ data, open, setOpen }: { data: Data; open: string; setOpen: (id: string) => void }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Intro text={t("fine.policiesIntro")}>
        <Button disabled={creating} onClick={() => (setCreating(true), setOpen(""))}>
          <Icon as={PlusIcon} size={14} />
          {t("fine.newPolicy")}
        </Button>
      </Intro>
      <div className="flex flex-col gap-2.5">
        {data.policies.map((policy) => (
          <PolicyCard
            key={`${policy.id}:${open === policy.id}`}
            policy={policy}
            uses={data.assignments.filter((a) => a.policyId === policy.id).length}
            open={open === policy.id}
            onToggle={() => (setOpen(open === policy.id ? "" : policy.id), setCreating(false))}
            data={data}
          />
        ))}
        {creating && (
          <PolicyCard policy={null} uses={0} open onToggle={() => setCreating(false)} data={data} onCreated={(id) => (setCreating(false), setOpen(id))} />
        )}
        {!data.loading && !data.policies.length && !creating && (
          <p className="rounded-xl border border-border py-6 text-center text-sm text-fg-subtle">{t("fine.noPolicies")}</p>
        )}
      </div>
    </>
  );
}

function Chips({ draft }: { draft: PolicyDraft }) {
  const { t, i18n } = useTranslation();
  const chips: string[] = [];
  for (const kind of VIOLATIONS) {
    const rule = draft.rules[kind];
    if (!rule.on || !rule.steps.length) continue;
    chips.push(
      STEPPED.has(kind)
        ? t(`fine.chip.${kind}` as "fine.chip.late", { from: minutes(Math.min(...rule.steps.map((s) => s.minutes)), t) })
        : t(`fine.chip.${kind}` as "fine.chip.absence", { amount: money(rule.steps[0]?.amount ?? 0, i18n.language) }),
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.length ? (
        chips.map((chip) => (
          <span key={chip} className="rounded-[5px] bg-surface-hover px-2 py-0.5 text-xs text-fg-muted">
            {chip}
          </span>
        ))
      ) : (
        <span className="rounded-[5px] bg-surface-hover px-2 py-0.5 text-xs text-fg-muted italic">{t("fine.off")}</span>
      )}
    </div>
  );
}

function minutes(m: number, t: (key: "fine.min" | "fine.hours", o: { n: string }) => string) {
  return m < 60 ? t("fine.min", { n: String(m) }) : t("fine.hours", { n: String(m % 60 ? (m / 60).toFixed(1).replace(".", ",") : m / 60) });
}

function PolicyCard({
  policy,
  uses,
  open,
  onToggle,
  data,
  onCreated,
}: {
  policy: PenaltyPolicy | null;
  uses: number;
  open: boolean;
  onToggle: () => void;
  data: Data;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const initial = (): PolicyDraft => (policy ? structuredClone({ name: policy.name, description: policy.description, rules: policy.rules }) : fresh(t("fine.newPolicy")));
  const [draft, setDraft] = useState<PolicyDraft>(initial);
  const [deleting, setDeleting] = useState(false);
  const shown = open ? draft : policy ? { name: policy.name, description: policy.description, rules: policy.rules } : draft;

  const save = async () => {
    if (!draft.name.trim()) return toast.error(t("fine.nameRequired"));
    const id = await data.savePolicy(draft, policy?.id);
    toast.success(t("fine.saved"));
    if (!policy) onCreated?.(id);
  };

  return (
    <div className={`rounded-xl border bg-surface ${open ? "border-border-strong shadow-raised" : "border-border"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2.5 px-4 py-3.5 text-left">
        <Icon as={open ? ChevronUpIcon : ChevronDownIcon} size={16} className="mt-0.5 shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-[15px] font-semibold">{shown.name || t("fine.untitled")}</b>
            {!policy && <span className={`rounded px-1.5 text-xs font-medium ${CHIP_STYLES.yellow}`}>{t("fine.unsaved")}</span>}
            {policy &&
              (uses ? (
                <span className="inline-flex items-center gap-1 text-xs text-chip-green-fg">
                  <Icon as={LinkIcon} size={12} />
                  {t("fine.uses", { count: uses })}
                </span>
              ) : (
                <span className="text-xs text-fg-subtle">{t("fine.notAssigned")}</span>
              ))}
          </div>
          {shown.description && <small className="mt-0.5 block text-[12.5px] text-fg-subtle">{shown.description}</small>}
          <Chips draft={shown} />
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-fg-muted">{t("fine.policyName")}</span>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-fg-muted">{t("fine.description")}</span>
            <Input value={draft.description} placeholder={t("fine.descriptionHint")} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          {VIOLATIONS.map((kind) => (
            <RuleBlock
              key={kind}
              kind={kind}
              rule={draft.rules[kind]}
              onChange={(rule) => setDraft({ ...draft, rules: { ...draft.rules, [kind]: rule } })}
            />
          ))}
          <div className="flex items-center gap-2 pt-1">
            {policy && (
              <Button
                variant="danger"
                onClick={() => (uses ? toast.error(t("fine.deleteAssigned")) : setDeleting(true))}
              >
                <Icon as={Trash2Icon} size={14} />
                {t("action.delete")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => (policy ? setDraft(initial()) : onToggle())}>
              {t("action.cancel")}
            </Button>
            <span className="flex-1" />
            <Button disabled={data.busy} onClick={() => void save().catch(() => undefined)}>
              {t("fine.save")}
            </Button>
          </div>
        </div>
      )}

      {deleting && policy && (
        <ConfirmDialog
          title={t("fine.deleteTitle")}
          description={t("fine.deleteHint", { name: policy.name })}
          confirmLabel={t("action.delete")}
          busy={false}
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false);
            void data.removePolicy(policy.id).then(() => toast.success(t("fine.deleted")));
          }}
        />
      )}
    </div>
  );
}

function RuleBlock({ kind, rule, onChange }: { kind: Violation; rule: PolicyDraft["rules"][Violation]; onChange: (rule: PolicyDraft["rules"][Violation]) => void }) {
  const { t, i18n } = useTranslation();
  const stepped = STEPPED.has(kind);
  const amountInput = (amount: number, set: (n: number) => void) => (
    <div className="relative">
      <Input
        inputMode="numeric"
        className="pr-12 text-right font-semibold tabular-nums"
        value={amount ? money(amount, i18n.language) : ""}
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-fg-subtle">UZS</span>
    </div>
  );
  const setStep = (i: number, step: Partial<{ minutes: number; amount: number }>) => {
    const steps = rule.steps.map((s, at) => (at === i ? { ...s, ...step } : s));
    onChange({ ...rule, steps: step.minutes == null ? steps : steps.sort((a, b) => a.minutes - b.minutes) });
  };

  return (
    <div className="rounded-[10px] border border-border">
      <div className={`flex items-center gap-3 px-3.5 py-3 ${rule.on ? "" : "opacity-60"}`}>
        <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent">
          <Icon as={RULE_ICON[kind]} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-sm font-semibold">{t(`fine.rule.${kind}`)}</b>
          <small className="text-[12.5px] text-fg-subtle">{t(`fine.ruleHint.${kind}`)}</small>
        </div>
        <Switch
          on={rule.on}
          label=""
          onToggle={() =>
            onChange({ on: !rule.on, steps: !rule.on && !rule.steps.length ? [{ minutes: stepped ? 15 : 0, amount: 0 }] : rule.steps })
          }
        />
      </div>
      {rule.on &&
        (stepped ? (
          <div className="border-t border-border px-3.5 py-3">
            <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_220px_32px] gap-2 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">
              <span>{t("fine.threshold")}</span>
              <span>{t("fine.amount")}</span>
            </div>
            {rule.steps.map((step, i) => (
              <div key={i} className="mb-1.5 grid grid-cols-[minmax(0,1fr)_220px_32px] items-center gap-2">
                <Dropdown
                  value={String(step.minutes)}
                  items={[...new Set([...THRESHOLDS, step.minutes])]
                    .sort((a, b) => a - b)
                    .map((m) => ({ value: String(m), label: minutes(m, t), icon: <Icon as={ClockIcon} size={14} className="text-fg-subtle" /> }))}
                  onChange={(m) => setStep(i, { minutes: Number(m) })}
                />
                {amountInput(step.amount, (amount) => setStep(i, { amount }))}
                <button
                  type="button"
                  aria-label={t("action.delete")}
                  onClick={() => onChange({ ...rule, steps: rule.steps.filter((_, at) => at !== i) })}
                  className="grid size-8 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-danger"
                >
                  <Icon as={Trash2Icon} size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const last = rule.steps.at(-1);
                const next = THRESHOLDS.find((m) => !last || m > last.minutes) ?? 180;
                onChange({ ...rule, steps: [...rule.steps, { minutes: next, amount: last ? last.amount * 2 : 15000 }] });
              }}
              className="mt-0.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong text-sm text-fg-muted hover:border-accent hover:bg-accent-subtle hover:text-accent"
            >
              <Icon as={PlusIcon} size={14} />
              {t("fine.addThreshold")}
            </button>
            <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
              <Icon as={InfoIcon} size={13} />
              {t("fine.thresholdNote")}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-3 text-sm">
            <span>{t("fine.oneAmount")}</span>
            <div className="w-55">{amountInput(rule.steps[0]?.amount ?? 0, (amount) => onChange({ ...rule, steps: [{ minutes: 0, amount }] }))}</div>
          </div>
        ))}
    </div>
  );
}

/* ---------- Назначения ---------- */

function ScopeBadge({ scope }: { scope: Scope }) {
  const { t } = useTranslation();
  const look = SCOPE_LOOK[scope];
  return (
    <span className={`inline-flex h-5.5 items-center gap-1.5 rounded-[5px] px-2 text-[12.5px] font-medium ${CHIP_STYLES[look.color]}`}>
      <Icon as={look.icon} size={12} />
      {t(`fine.scope.${scope}`)}
    </span>
  );
}

function AssignmentsTab({ data, onOpenPolicy }: { data: Data; onOpenPolicy: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const targets = usePenaltyTargets();
  const [level, setLevel] = useState<"" | Scope>("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PenaltyAssignment | null>(null);
  const [who, setWho] = useState("");
  const [search, setSearch] = useState("");
  const rows = data.assignments.filter((a) => !level || a.scope === level);
  const policyName = (id: string) => data.policies.find((p) => p.id === id)?.name ?? "—";
  const th = "px-2.5 py-2 text-left text-xs font-medium text-fg-subtle";

  const person = targets.employee.find((e) => e.id === who);
  const matches = person ? matchingPolicies(person, data.assignments) : [];

  return (
    <>
      <Intro text={t("fine.assignIntro")}>
        <Button onClick={() => setAdding(true)}>
          <Icon as={PlusIcon} size={14} />
          {t("fine.assign")}
        </Button>
      </Intro>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["employee", "department", "location"] as const).map((scope, i) => (
          <span key={scope} className="inline-flex items-center gap-1.5">
            <ScopeBadge scope={scope} />
            {i < 2 && <Icon as={ChevronRightIcon} size={13} className="text-fg-subtle" />}
          </span>
        ))}
        <span className="flex-1" />
        <Tabs
          variant="segment"
          activeId={level}
          onSelect={(id) => setLevel(id as "" | Scope)}
          tabs={[
            { id: "", label: t("fine.all"), count: data.assignments.length },
            ...SCOPES.map((scope) => ({ id: scope, label: t(`fine.scopes.${scope}`), count: data.assignments.filter((a) => a.scope === scope).length })),
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>{t("fine.level")}</th>
              <th className={th}>{t("fine.target")}</th>
              <th className={th}>{t("fine.policy")}</th>
              <th className={th}>{t("fine.from")}</th>
              <th className={th}>{t("fine.active")}</th>
              <th className="w-18" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-2.5 py-1.5">
                  <ScopeBadge scope={a.scope} />
                </td>
                <td className="px-2.5 py-1.5 font-medium">{a.scope === "all_locations" ? t("fine.scopes.all_locations") : a.target || "—"}</td>
                <td className="px-2.5 py-1.5">
                  <button type="button" className="text-accent hover:underline" onClick={() => onOpenPolicy(a.policyId)}>
                    {policyName(a.policyId)}
                  </button>
                </td>
                <td className="px-2.5 py-1.5 text-fg-muted">{formatDate(a.from, "date", i18n.language) || "—"}</td>
                <td className="px-2.5 py-1.5">
                  <Switch on={a.active} label="" onToggle={() => void data.toggleAssignment(a)} />
                </td>
                <td className="px-2.5 py-1.5">
                  <div className="flex justify-end gap-0.5">
                    <button
                      type="button"
                      aria-label={t("action.edit")}
                      onClick={() => setEditing(a)}
                      className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-fg"
                    >
                      <Icon as={PencilIcon} size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={t("action.delete")}
                      onClick={() => void data.removeAssignment(a.id).then(() => toast.success(t("fine.unassigned")))}
                      className="grid size-7 place-items-center rounded text-fg-subtle hover:bg-surface-hover hover:text-danger"
                    >
                      <Icon as={Trash2Icon} size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-fg-subtle">
                  {t("fine.noAssignments")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-border">
        <header className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-text">
            <Icon as={SearchCheckIcon} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <b className="block text-sm font-semibold">{t("fine.check")}</b>
            <small className="text-[12.5px] text-fg-subtle">{t("fine.checkHint")}</small>
          </div>
          <div className="w-full sm:w-80">
            <Dropdown
              value={who}
              placeholder={t("fine.pickEmployee")}
              ariaLabel={t("fine.check")}
              search={search}
              onSearch={setSearch}
              items={targets.employee
                .filter((e) => !search.trim() || e.name.toLowerCase().includes(search.trim().toLowerCase()))
                .map((e) => ({ value: e.id, label: e.name }))}
              onChange={setWho}
            />
          </div>
        </header>
        {person && <CheckResult matches={matches} policies={data.policies} onOpenPolicy={onOpenPolicy} />}
      </section>

      {(adding || editing) && (
        <AssignDialog
          data={data}
          targets={targets}
          initial={editing}
          onClose={() => (setAdding(false), setEditing(null))}
        />
      )}
    </>
  );
}

/**
 * Ответ проверки: действующая политика и почему она, её пороги,
 * ниже — подходящие назначения, которые она перекрыла.
 */
function CheckResult({
  matches,
  policies,
  onOpenPolicy,
}: {
  matches: ReturnType<typeof matchingPolicies>;
  policies: PenaltyPolicy[];
  onOpenPolicy: (id: string) => void;
}) {
  const { t } = useTranslation();
  const policyOf = (id: string) => policies.find((p) => p.id === id);
  const [hit, ...rest] = matches;
  const policy = hit && policyOf(hit.policyId);

  if (!hit || !policy)
    return (
      <div className="flex items-center gap-2.5 border-t border-border bg-surface-hover/50 px-4 py-3.5 text-sm text-fg-muted">
        <Icon as={ShieldOffIcon} size={16} className="shrink-0 text-fg-subtle" />
        {t("fine.noPolicy")}
      </div>
    );

  return (
    <div className="border-t border-border px-4 py-3.5">
      <div className="text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{t("fine.applies")}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onOpenPolicy(policy.id)} className="text-[15px] font-semibold text-accent-text hover:underline">
          {policy.name}
        </button>
        <ScopeBadge scope={hit.scope} />
        <span className="text-sm text-fg-subtle">{t(`fine.via.${hit.scope}`, { name: hit.target })}</span>
      </div>
      <Chips draft={policy} />

      {rest.length > 0 && (
        <div className="mt-3.5 border-t border-dashed border-border pt-3">
          <div className="mb-1.5 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{t("fine.overridden")}</div>
          <ul className="flex flex-col gap-1.5">
            {rest.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                <ScopeBadge scope={a.scope} />
                <span>{a.scope === "all_locations" ? t("fine.scopes.all_locations") : a.target}</span>
                <span className="text-fg-subtle">→</span>
                <button type="button" onClick={() => onOpenPolicy(a.policyId)} className="line-through decoration-fg-subtle hover:text-fg">
                  {policyOf(a.policyId)?.name ?? "—"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AssignDialog({
  data,
  targets,
  initial,
  onClose,
}: {
  data: Data;
  targets: ReturnType<typeof usePenaltyTargets>;
  /** Правка этого назначения; null — новое. */
  initial: PenaltyAssignment | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [scope, setScope] = useState<Scope>(initial?.scope ?? "location");
  const [target, setTarget] = useState(initial?.targetId ?? "");
  const [policy, setPolicy] = useState(initial?.policyId ?? data.policies[0]?.id ?? "");
  const [from, setFrom] = useState(initial?.from || todayInput());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const options = scope === "all_locations" ? [] : targets[scope];
  const label = "mb-1.5 block text-[12.5px] text-fg-muted";

  const submit = async () => {
    setBusy(true);
    try {
      const existed = !!initial || data.assignments.some((a) => a.scope === scope && a.targetId === (scope === "all_locations" ? "" : target));
      await data.assign(scope, scope === "all_locations" ? "" : target, policy, from, initial?.id);
      toast.success(t(existed ? "fine.assignUpdated" : "fine.assigned"));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-modal">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t(initial ? "fine.editTitle" : "fine.assignTitle")}</h2>
        <div className="flex flex-col gap-3 px-4 py-3">
          <div>
            <span className={label}>{t("fine.whom")}</span>
            <Tabs
              variant="field"
              activeId={scope}
              onSelect={(id) => (setScope(id as Scope), setTarget(""), setSearch(""))}
              tabs={(["location", "department", "employee", "all_locations"] as const).map((s) => ({ id: s, label: t(`fine.scope.${s}`), icon: SCOPE_LOOK[s].icon }))}
            />
          </div>
          {scope !== "all_locations" && (
            <div>
              <span className={label}>{t(`fine.scope.${scope}`)}</span>
              <Dropdown
                value={target}
                placeholder={t("fine.pickTarget")}
                search={search}
                onSearch={setSearch}
                items={options
                  .filter((o) => !search.trim() || o.name.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((o) => ({ value: o.id, label: o.name }))}
                onChange={setTarget}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>{t("fine.policy")}</span>
              <Dropdown value={policy} items={data.policies.map((p) => ({ value: p.id, label: p.name }))} onChange={setPolicy} />
            </div>
            <div>
              <span className={label}>{t("fine.from")}</span>
              <DatePicker value={from} locale={i18n.language} ariaLabel={t("fine.from")} className="h-9 w-full" onChange={setFrom} />
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
            <Icon as={InfoIcon} size={13} />
            {t("fine.assignNote")}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button disabled={busy || !policy || (scope !== "all_locations" && !target)} onClick={() => void submit().catch(() => undefined)}>
            {t(initial ? "action.save" : "fine.assignOk")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

