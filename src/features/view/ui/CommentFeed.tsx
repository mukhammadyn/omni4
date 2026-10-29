import { useMemo, useState } from "react";
import { SendIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermission } from "@/features/auth";
import { Cell, selfDefaults, useCreateItem, useItems, type Item } from "@/features/item";
import { useTableSchema } from "@/features/table";
import { useSession } from "@/shared/api/use-session";
import { formatDate } from "@/shared/lib/date-value";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import type { RelationTab } from "../model/relation-tabs";

/**
 * Вкладка-лента комментариев (`COMMENTS`): записи чужой таблицы,
 * привязанные к открытой, — снизу вверх, с полем ввода внизу. Вкладка
 * «Комментарии» карточки сделки в new-crm (CrmCommentsTimeline).
 *
 * Таблица — любая с текстом: текст — `body` или первое MULTI_LINE,
 * автор — первая связь на `core_users`, время — `created_at`. Есть поле
 * `kind` с вариантом `comment` (`crm_timeline` схемы v2) — показываются
 * и пишутся только комментарии, события остаются в стороне.
 *
 * ponytail: без вложений, правки и удаления; 200 последних записей.
 * Нужны — `attachments` у `crm_timeline` уже есть.
 */
const LIMIT = 200;

export function CommentFeed({
  tab,
  parentGuid,
  locale,
  language,
}: {
  tab: RelationTab;
  parentGuid: string;
  locale: string;
  language: string;
}) {
  const { t } = useTranslation();
  const session = useSession();
  const can = useTablePermission(tab.tableSlug);
  const { schema } = useTableSchema(tab.tableSlug);
  const relations = useMemo(() => new Map(schema.relations.map((item) => [item.id, item])), [schema.relations]);

  const body = schema.fields.find((field) => field.slug === "body") ??
    schema.fields.find((field) => field.type === "MULTI_LINE");
  const kind = schema.fields.find((field) => field.slug === "kind" && field.options.has("comment"));
  const author = schema.fields.find(
    (field) =>
      field.relationId &&
      field.slug !== tab.fieldSlug &&
      schema.relations.find((relation) => relation.id === field.relationId)?.toSlug === "core_users",
  );

  const filters = useMemo(
    () => ({
      [tab.fieldSlug]: { op: "contains" as const, values: [parentGuid] },
      ...(kind ? { [kind.slug]: { op: "is" as const, values: ["comment"] } } : {}),
    }),
    [tab.fieldSlug, parentGuid, kind],
  );
  const { page } = useItems(can.read ? tab.tableSlug : undefined, { limit: LIMIT, page: 1, filters });
  /* Сервер отдаёт новые первыми (ORDER BY created_at DESC по умолчанию);
     сортировать по created_at явно нельзя — docs/backend-notes.md. */
  const comments = useMemo(() => [...page.rows].reverse(), [page.rows]);

  const create = useCreateItem(tab.tableSlug);
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (!text || !body) return;
    create.mutate(
      {
        ...selfDefaults(schema.relations, { userId: session.getUserId(), objectIds: session.getObjectIds() }),
        [body.slug]: text,
        [tab.fieldSlug]: parentGuid,
        ...(kind ? { [kind.slug]: "comment" } : {}),
      },
      { onSuccess: () => setDraft("") },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        {comments.length === 0 && <li className="text-sm text-fg-subtle">{t("comments.empty")}</li>}
        {comments.map((row: Item) => (
          <li key={row.guid} className="text-sm">
            <div className="flex items-center gap-2 text-xs text-fg-subtle">
              {author && (
                <span className="min-w-0 truncate font-medium text-fg-muted">
                  <Cell field={author} row={row} tableSlug={tab.tableSlug} relations={relations} locale={locale} language={language} />
                </span>
              )}
              <span className="shrink-0 tabular-nums">{formatDate(row["created_at"], "datetime", locale)}</span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-fg">{body ? String(row[body.slug] ?? "") : ""}</p>
          </li>
        ))}
      </ul>

      {can.write && body && (
        <div className="relative mx-6 mb-4 rounded-[9px] ring-1 ring-border-strong ring-inset">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
            }}
            placeholder={t("comments.placeholder")}
            rows={3}
            className="block w-full resize-none bg-transparent px-3 py-2.5 pr-14 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <Button
            className="absolute right-2.5 bottom-2.5 size-8 px-0"
            disabled={!draft.trim() || create.isPending}
            aria-label={t("comments.send")}
            onClick={send}
          >
            <Icon as={SendIcon} size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
