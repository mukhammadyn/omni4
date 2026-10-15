import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BookCheckIcon,
  CalendarIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GraduationCapIcon,
  LoaderCircleIcon,
  MapPinIcon,
  PaperclipIcon,
  PencilIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Avatar, Cell, fileUrl, type Item } from "@/features/item";
import { localized, optionOf, type Field } from "@/features/table";
import { formatDate } from "@/shared/lib/date-value";
import type { TranslationKey } from "@/shared/lib/i18n";
import { Button } from "@/shared/ui/button";
import { CHIP_STYLES, type ChipColor } from "@/shared/ui/chip";
import { Icon } from "@/shared/ui/icon";
import { Modal } from "@/shared/ui/modal";
import { Popover, PopoverItem } from "@/shared/ui/popover";
import { firstText, related, text, useOrgDirectory } from "../api/org";
import { PARTICIPANTS, TRAININGS, useTraining, type Material, type Participant } from "../api/training";
import { HOMEWORK, homeworkCounts } from "../model/training";
import { Card, Meta } from "./page-parts";
import { StatusButton } from "./VacancyPage";
import { Score } from "./vacancy-parts";

const NO_RELATIONS = new Map();

/* HTML описания — редактором в режиме чтения, как у вакансии; грузится отдельно. */
const RichText = lazy(() => import("@/shared/ui/rich-text").then((m) => ({ default: m.RichText })));

/** Период «12 сент. — 16 сент.»; один день — одна дата. */
export function trainingPeriod(row: Item, locale: string) {
  const from = formatDate(text(row.starts_at), "date", locale) ?? "";
  const to = formatDate(text(row.ends_at), "date", locale);
  return to && to !== from ? `${from} — ${to}` : from;
}

/** Имя файла из адреса CDN — без каталога и uuid, который CDN ставит впереди. */
const fileName = (url: string) =>
  decodeURIComponent(url.split("/").pop() ?? url).replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, "");

/**
 * Страница тренинга — `training.html` прототипа (`view()`): шапка
 * со статусом, описание, KPI по ДЗ (они же отбор участников),
 * участники с проверкой ДЗ и материалы.
 */
export function TrainingPage({
  guid,
  locale,
  language,
  onEdit,
  onOpenEmployee,
}: {
  guid: string;
  locale: string;
  language: string;
  onEdit: () => void;
  onOpenEmployee: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const training = useTraining(guid);
  /* Отбор участников по статусу ДЗ — щелчком по KPI, как `hf` прототипа. */
  const [filter, setFilter] = useState("");
  const relations = useMemo(() => new Map(training.relations.map((r) => [r.id, r])), [training.relations]);
  const bySlug = useMemo(() => new Map(training.fields.map((f) => [f.slug, f])), [training.fields]);

  const row = training.row;
  if (!row) {
    return (
      <p className="p-8 text-center text-sm text-fg-subtle">
        {training.isLoading ? t("common.loading") : (training.error ?? t("training.notFound"))}
      </p>
    );
  }

  const cell = (field: Field, values: Item = row) => (
    <Cell field={field} row={values} tableSlug={TRAININGS} relations={relations} locale={locale} language={language} wrap />
  );
  const option = (slug: string) => {
    const field = bySlug.get(slug);
    const found = field && optionOf(field, text(row[slug]));
    return found ? localized(found.labels, language, found.label || found.value) : text(row[slug]);
  };

  const homework = row.homework_required === true;
  const counts = homeworkCounts(training.participants.map((p) => p.row.homework_status));
  const status = bySlug.get("status");
  const due = formatDate(text(row.homework_due), "date", locale);
  const kpis: { icon: LucideIcon; label: TranslationKey; n: number; color: ChipColor; status: string }[] = [
    { icon: UsersIcon, label: "training.kpi.assigned", n: counts.total, color: "blue", status: "" },
    { icon: LoaderCircleIcon, label: "training.kpi.submitted", n: counts.submitted, color: "blue", status: HOMEWORK.submitted },
    { icon: CircleCheckIcon, label: "training.kpi.accepted", n: counts.accepted, color: "green", status: HOMEWORK.accepted },
    { icon: CircleXIcon, label: "training.kpi.rejected", n: counts.rejected, color: "red", status: HOMEWORK.rejected },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="px-6 pb-20 max-md:px-3">
        {/* `.vc-head` прототипа. */}
        <header className="flex flex-wrap items-start gap-3.5 pt-5 pb-5">
          <span className={`grid size-11 shrink-0 place-items-center rounded-[10px] ${CHIP_STYLES.purple}`}>
            <Icon as={GraduationCapIcon} size={20} />
          </span>
          <div className="min-w-60 flex-1">
            <h1 className="mb-1 flex flex-wrap items-center gap-2 text-[22px] leading-tight font-semibold tracking-[-0.01em]">
              {text(row.title) || "—"}
              {status && text(row.status) && <span className="flex text-sm font-normal">{cell(status)}</span>}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-fg-muted">
              <Meta icon={CalendarIcon} text={trainingPeriod(row, locale)} />
              <Meta
                icon={UserIcon}
                text={text(related(row, "core_users_id").full_name) && t("training.trainer", { name: text(related(row, "core_users_id").full_name) })}
              />
              <Meta icon={MapPinIcon} text={text(row.location)} />
              <Meta icon={TagIcon} text={option("category")} />
              <Meta
                icon={BookCheckIcon}
                text={homework ? (due ? t("training.homeworkDue", { date: due }) : t("training.homeworkRequired")) : t("training.withoutHomework")}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && training.can.update && (
              <Popover
                align="end"
                trigger={({ open, toggle }) => (
                  <StatusButton field={status} value={text(row.status)} language={language} open={open} onClick={toggle} />
                )}
              >
                {(close) =>
                  [...status.options.values()].map((opt) => (
                    <PopoverItem
                      key={opt.value}
                      onClick={() => {
                        training.edit("status", opt.value);
                        close();
                      }}
                      {...(opt.value === text(row.status) ? { trailing: <Icon as={CheckIcon} size={14} className="shrink-0" /> } : {})}
                    >
                      {cell(status, { status: opt.value })}
                    </PopoverItem>
                  ))
                }
              </Popover>
            )}
            {training.can.update && (
              <Button variant="secondary" onClick={onEdit}>
                <Icon as={PencilIcon} size={15} />
                {t("training.edit")}
              </Button>
            )}
          </div>
        </header>

        {text(row.description) && (
          <div className="mb-3.5 rounded-[10px] border border-border px-4 py-3">
            <Suspense fallback={null}>
              <RichText value={text(row.description)} readOnly />
            </Suspense>
          </div>
        )}

        {/* `.td-kpi`: без ДЗ считать нечего — карточки неактивны. */}
        <div className="mb-4 grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
          {kpis.map((k) => (
            <button
              key={k.label}
              type="button"
              disabled={!homework}
              onClick={() => setFilter(filter === k.status ? "" : k.status)}
              className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors enabled:hover:bg-surface-hover ${
                filter === k.status && k.status ? "border-accent" : "border-border"
              }`}
            >
              <span className={`grid size-10 place-items-center rounded-[10px] ${CHIP_STYLES[k.color]}`}>
                <Icon as={k.icon} size={19} />
              </span>
              <span>
                <b className="block text-2xl leading-tight font-bold tabular-nums">{k.n}</b>
                <small className="text-[13px] text-fg-muted">{t(k.label)}</small>
              </span>
            </button>
          ))}
        </div>

        <Participants
          participants={filter ? training.participants.filter((p) => p.row.homework_status === filter) : training.participants}
          total={training.participants.length}
          fields={training.participantFields}
          homework={homework}
          canReview={training.canReview}
          locale={locale}
          language={language}
          onAccept={training.accept}
          onReject={training.reject}
          onOpenEmployee={onOpenEmployee}
        />

        <Card icon={PaperclipIcon} title={t("training.materials")} count={training.materials.length}>
          {training.materials.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 pt-1">
              {training.materials.map((m) => (
                <MaterialTile key={m.id} material={m} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-surface-hover p-3.5 text-sm text-fg-subtle">{t("training.noMaterials")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** «Сотрудники и домашние задания» — `.td-et` прототипа. */
function Participants({
  participants,
  total,
  fields,
  homework,
  canReview,
  locale,
  language,
  onAccept,
  onReject,
  onOpenEmployee,
}: {
  participants: Participant[];
  total: number;
  fields: Field[];
  homework: boolean;
  canReview: boolean;
  locale: string;
  language: string;
  onAccept: (participant: string, score: number, comment: string) => void;
  onReject: (participant: string, comment: string) => void;
  onOpenEmployee: (guid: string) => void;
}) {
  const { t } = useTranslation();
  const { departments } = useOrgDirectory();
  const departmentOf = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const [accepting, setAccepting] = useState<Participant | null>(null);
  const [rejecting, setRejecting] = useState<Participant | null>(null);
  const statusField = fields.find((f) => f.slug === "homework_status");
  const th = "px-2.5 py-2 text-left text-[12.5px] font-medium text-fg-muted";

  return (
    <Card icon={UsersIcon} title={t("training.participantsTitle")} count={total}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={th}>{t("training.col.employee")}</th>
              <th className={th}>{t("training.col.department")}</th>
              {homework && (
                <>
                  <th className={th}>{t("training.col.status")}</th>
                  <th className={th}>{t("training.col.file")}</th>
                  <th className={th}>{t("training.col.submitted")}</th>
                  <th className={th}>{t("training.col.score")}</th>
                  <th className={`${th} text-right`}>{t("training.col.review")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const person = related(p.row, "hr_employees_id");
              const file = text(p.row.homework_file);
              return (
                <tr key={p.id} className="border-b border-border last:border-b-0">
                  <td className="px-2.5 py-2">
                    <button type="button" onClick={() => onOpenEmployee(p.employeeId)} className="flex items-center gap-2 hover:underline">
                      <Avatar name={text(person.full_name)} photo={firstText(person.photo) || undefined} size="sm" />
                      {text(person.full_name) || "—"}
                    </button>
                  </td>
                  <td className="px-2.5 py-2 text-fg-muted">{departmentOf.get(text(person.hr_departments_id)) ?? "—"}</td>
                  {homework && (
                    <>
                      <td className="px-2.5 py-2">
                        {statusField && (
                          <Cell field={statusField} row={p.row} tableSlug={PARTICIPANTS} relations={NO_RELATIONS} locale={locale} language={language} />
                        )}
                        {p.row.homework_status === HOMEWORK.rejected && text(p.row.review_comment) && (
                          <small className="block max-w-45 truncate text-[11.5px] text-danger" title={text(p.row.review_comment)}>
                            {text(p.row.review_comment)}
                          </small>
                        )}
                      </td>
                      <td className="px-2.5 py-2">
                        {file ? (
                          <a href={fileUrl(file)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.25 text-accent-text hover:underline">
                            <Icon as={FileTextIcon} size={13} />
                            <span className="max-w-45 truncate">{fileName(file)}</span>
                          </a>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2">{formatDate(text(p.row.submitted_at), "date", locale) || <span className="text-fg-subtle">—</span>}</td>
                      <td className="px-2.5 py-2">
                        {typeof p.row.score === "number" ? <Score value={p.row.score} /> : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        {p.row.homework_status === HOMEWORK.submitted && canReview ? (
                          <span className="inline-flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => setAccepting(p)}>
                              <Icon as={CheckIcon} size={13} />
                              {t("training.accept")}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setRejecting(p)} aria-label={t("training.reject")}>
                              <Icon as={XIcon} size={13} />
                            </Button>
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!participants.length && <p className="py-6 text-center text-sm text-fg-subtle">{t("training.noParticipants")}</p>}
      </div>

      {accepting && (
        <AcceptDialog
          name={text(related(accepting.row, "hr_employees_id").full_name)}
          onClose={() => setAccepting(null)}
          onAccept={(score, comment) => {
            onAccept(accepting.id, score, comment);
            setAccepting(null);
          }}
        />
      )}
      {rejecting && (
        <RejectDialog
          name={text(related(rejecting.row, "hr_employees_id").full_name)}
          onClose={() => setRejecting(null)}
          onReject={(comment) => {
            onReject(rejecting.id, comment);
            setRejecting(null);
          }}
        />
      )}
    </Card>
  );
}

function Dialog({ title, children, footer, onClose }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-xl">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{title}</h2>
        <div className="px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
      </div>
    </Modal>
  );
}

const inputClass = "w-full rounded-md border border-border-strong bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/** «Принять домашнее задание»: оценка 1–10 и необязательный отзыв. */
function AcceptDialog({ name, onClose, onAccept }: { name: string; onClose: () => void; onAccept: (score: number, comment: string) => void }) {
  const { t } = useTranslation();
  const [score, setScore] = useState(9);
  const [comment, setComment] = useState("");
  return (
    <Dialog
      title={t("training.acceptTitle")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button onClick={() => onAccept(score, comment.trim())}>{t("training.accept")}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">{name}</p>
      <label className="mb-1.5 block text-[12.5px] text-fg-muted">{t("training.col.score")}</label>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`size-8.5 rounded-lg font-semibold tabular-nums transition-colors ${
              score === n ? CHIP_STYLES[n >= 8 ? "green" : n >= 6 ? "yellow" : "red"] : "ring-1 ring-border-strong ring-inset hover:bg-surface-hover"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <label className="mb-1.5 block text-[12.5px] text-fg-muted">{t("training.comment")}</label>
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("training.optional")} className={inputClass} />
    </Dialog>
  );
}

/** «Отклонить»: на доработку — с тем, что доработать. */
function RejectDialog({ name, onClose, onReject }: { name: string; onClose: () => void; onReject: (comment: string) => void }) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  return (
    <Dialog
      title={t("training.rejectTitle")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button variant="danger" onClick={() => onReject(comment.trim() || t("training.reworkDefault"))}>
            {t("training.reject")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-fg-muted">{t("training.rejectHint", { name })}</p>
      <label className="mb-1.5 block text-[12.5px] text-fg-muted">{t("training.rework")}</label>
      <textarea autoFocus rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
    </Dialog>
  );
}

/** Плашка материала — `.cd-doc` прототипа: вид по расширению, открыть или скачать. */
function MaterialTile({ material }: { material: Material }) {
  const href = material.url || fileUrl(material.file);
  const isLink = Boolean(material.url) || material.type !== "file";
  const ext = isLink ? "" : (fileName(material.file).split(".").pop() ?? "").slice(0, 4).toUpperCase();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-surface-hover"
    >
      <span className={`grid h-9 w-8.5 shrink-0 place-items-center rounded-md text-[9.5px] font-bold ${CHIP_STYLES[isLink ? "purple" : "blue"]}`}>
        {isLink ? <Icon as={ExternalLinkIcon} size={15} /> : ext || "FILE"}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm font-medium">{material.title || fileName(href)}</b>
        <small className="block truncate text-xs text-fg-subtle">{isLink ? href.replace(/^https?:\/\//, "").split("/")[0] : fileName(material.file)}</small>
      </span>
      <Icon as={isLink ? ExternalLinkIcon : DownloadIcon} size={15} className="shrink-0 text-fg-muted" />
    </a>
  );
}
