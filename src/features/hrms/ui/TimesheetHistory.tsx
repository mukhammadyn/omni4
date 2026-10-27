import { useState, type ReactNode } from "react";
import {
  CalendarClockIcon,
  CheckIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/shared/lib/date-value";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { firstText, related, text } from "../api/org";
import { useLogEvent, useTimesheetEvents } from "../api/timesheet-docs";
import type { SheetAction } from "../model/timesheet-docs";

const ICONS: Record<SheetAction | "created", LucideIcon> = {
  created: PlusIcon,
  filled: CalendarClockIcon,
  approved: CheckIcon,
  returned: Undo2Icon,
  edited: PencilIcon,
  comment: MessageSquareIcon,
};
const TONES: Partial<Record<SheetAction, string>> = {
  approved: "text-success",
  returned: "text-warning",
};

/**
 * Вкладка «История» табеля — `history` прототипа: лента событий новыми
 * сверху, внизу «Запись создана» (по `created_at` самого табеля, события
 * для неё нет), под лентой — поле комментария.
 *
 * Пишут в неё только наши экраны: правка через общую таблицу или API
 * сюда не попадёт (журнала строки у бэкенда нет — docs/backend-notes,
 * «Журнал изменений»).
 */
export function TimesheetHistory({
  guid,
  createdAt,
  canComment,
  locale,
}: {
  guid: string;
  createdAt: string;
  canComment: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const events = useTimesheetEvents(guid);
  const log = useLogEvent(guid);
  const [draft, setDraft] = useState("");
  /*
   * `created_at` приходит без пояса, но записан в UTC (docs/backend-notes,
   * «created_at без пояса»): без «Z» строка читалась бы как местное время.
   */
  const when = (value: string) =>
    formatDate(value && !/Z|[+-]\d{2}:?\d{2}$/.test(value) ? `${value}Z` : value, "datetime", locale) ?? "";

  const send = () => {
    const comment = draft.trim();
    if (!comment || log.isPending) return;
    log.mutate({ action: "comment", comment }, { onSuccess: () => setDraft("") });
  };

  const titleOf = (action: SheetAction, row: Record<string, unknown>) =>
    action === "edited"
      ? t("timesheets.event.edited", { field: text(row.field) })
      : t(`timesheets.event.${action}`);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[10px] border border-border bg-surface px-4 py-3">
        {events.isLoading ? (
          <p className="py-4 text-center text-sm text-fg-subtle">{t("common.loading")}</p>
        ) : (
          <ol className="flex flex-col">
            {events.rows.map((row) => {
              const action = (firstText(row.action) || "edited") as SheetAction;
              const user = related(row, "core_users_id");
              const author = text(user.full_name) || text(user.email);
              return (
                <Entry
                  key={text(row.guid)}
                  icon={ICONS[action] ?? PencilIcon}
                  tone={TONES[action] ?? ""}
                  title={titleOf(action, row)}
                  meta={[when(text(row.created_at)), author].filter(Boolean).join(" · ")}
                >
                  {action === "edited" && (
                    <p className="mt-1 text-sm text-fg-muted">
                      <span className="line-through decoration-fg-subtle">{text(row.before) || "—"}</span>
                      {" → "}
                      <span className="text-fg">{text(row.after) || "—"}</span>
                    </p>
                  )}
                  {action === "comment" && (
                    <p className="mt-1.5 rounded-lg bg-surface-soft px-3 py-2 text-sm whitespace-pre-wrap">{text(row.comment)}</p>
                  )}
                </Entry>
              );
            })}
            <Entry icon={ICONS.created} tone="" title={t("timesheets.event.created")} meta={when(createdAt)} />
          </ol>
        )}
      </section>

      {canComment && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3">
          <textarea
            value={draft}
            rows={2}
            placeholder={t("timesheets.commentPlaceholder")}
            aria-label={t("timesheets.commentPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            className="block w-full resize-y bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <div className="flex items-center justify-between gap-3">
            <small className="text-xs text-fg-subtle">{t("timesheets.commentHint")}</small>
            <Button size="sm" disabled={!draft.trim() || log.isPending} onClick={send}>
              <Icon as={SendIcon} size={14} />
              {t("timesheets.send")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Пункт ленты: значок в кружке на линии, заголовок, «когда · кто», тело. */
function Entry({
  icon,
  tone,
  title,
  meta,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  meta: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 py-2.5 [&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:top-9 [&:not(:last-child)]:before:bottom-0 [&:not(:last-child)]:before:left-3.5 [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-border">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full border border-border bg-surface ${tone || "text-fg-muted"}`}>
        <Icon as={icon} size={14} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm font-medium">{title}</div>
        {meta && <div className="text-xs text-fg-subtle">{meta}</div>}
        {children}
      </div>
    </li>
  );
}
