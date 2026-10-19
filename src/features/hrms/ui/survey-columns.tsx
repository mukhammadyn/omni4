import { useMemo, useRef, useState } from "react";
import { ArchiveIcon, CopyIcon, EllipsisIcon, EyeIcon, ListChecksIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTablePermissions } from "@/features/auth";
import { useDeleteItems, useUpdateItem, type ExtraColumn, type Item } from "@/features/item";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Icon } from "@/shared/ui/icon";
import { Popover, PopoverItem, PopoverSeparator } from "@/shared/ui/popover";
import { text } from "../api/org";
import { SURVEYS, useDuplicateSurvey, useSurveyParticipants } from "../api/survey";
import { fill, parseDefinition, questions, SURVEY_STATUS, type Fill } from "../model/survey";
import { ParticipantStack } from "./training-columns";

const NO_ROWS: Item[] = [];
const NONE: Item[] = [];

/** `.svy-fill`: полоса, процент и «прошли/назначено». */
function FillBar({ value }: { value: Fill }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-[90px] shrink-0 overflow-hidden rounded-[3px] bg-surface-hover">
        <i className="block h-full bg-success" style={{ width: `${value.percent}%` }} />
      </span>
      <b className="text-xs">{value.percent}%</b>
      <small className="text-xs text-fg-subtle">
        {value.done}/{value.total}
      </small>
    </span>
  );
}

/** Меню строки списка опросов (surveys.html, `[data-m]`). */
function SurveyRowMenu({ row, onOpen }: { row: Item; onOpen: (guid: string, edit: boolean) => void }) {
  const { t } = useTranslation();
  const can = useTablePermissions()(SURVEYS);
  const update = useUpdateItem(SURVEYS);
  const remove = useDeleteItems(SURVEYS);
  const duplicate = useDuplicateSurvey();
  const [confirm, setConfirm] = useState(false);
  const guid = text(row.guid);

  return (
    <span onClick={(event) => event.stopPropagation()} className="flex justify-end">
      <Popover
        align="end"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-label={t("survey.actions")}
            onClick={toggle}
            className={`grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-active hover:text-fg ${open ? "bg-surface-active text-fg" : ""}`}
          >
            <Icon as={EllipsisIcon} size={14} />
          </button>
        )}
      >
        {(close) => (
          <>
            <PopoverItem
              icon={<Icon as={EyeIcon} size={16} className="shrink-0 text-fg-muted" />}
              onClick={() => {
                close();
                onOpen(guid, false);
              }}
            >
              {t("action.open")}
            </PopoverItem>
            {can.update && (
              <PopoverItem
                icon={<Icon as={PencilIcon} size={16} className="shrink-0 text-fg-muted" />}
                onClick={() => {
                  close();
                  onOpen(guid, true);
                }}
              >
                {t("action.edit")}
              </PopoverItem>
            )}
            {can.write && (
              <PopoverItem
                icon={<Icon as={CopyIcon} size={16} className="shrink-0 text-fg-muted" />}
                onClick={() => {
                  close();
                  duplicate.mutate({ row, suffix: t("survey.copySuffix") });
                }}
              >
                {t("survey.duplicate")}
              </PopoverItem>
            )}
            {can.update && row.status !== SURVEY_STATUS.archived && (
              <PopoverItem
                icon={<Icon as={ArchiveIcon} size={16} className="shrink-0 text-fg-muted" />}
                onClick={() => {
                  close();
                  update.mutate({ guid, values: { status: SURVEY_STATUS.archived } });
                }}
              >
                {t("survey.archive")}
              </PopoverItem>
            )}
            {can.delete && (
              <>
                <PopoverSeparator />
                <PopoverItem
                  danger
                  icon={<Icon as={Trash2Icon} size={16} className="shrink-0" />}
                  onClick={() => {
                    close();
                    setConfirm(true);
                  }}
                >
                  {t("action.delete")}
                </PopoverItem>
              </>
            )}
          </>
        )}
      </Popover>
      {confirm && (
        <ConfirmDialog
          title={t("survey.deleteTitle")}
          description={t("survey.deleteText", { title: text(row.title) })}
          confirmLabel={t("action.delete")}
          busy={remove.isPending}
          onConfirm={() => remove.mutate([guid], { onSuccess: () => setConfirm(false) })}
          onClose={() => setConfirm(false)}
        />
      )}
    </span>
  );
}

/**
 * Хвост таблицы опросов из прототипа (surveys.html, listView):
 * Вопросы · Назначено · Заполняемость · меню строки. Назначенные
 * и прошедшие — по `hr_survey_participants`.
 *
 * `rows` не задан — таблица не опросов: колонок и запросов нет.
 */
export function useSurveyColumns(rows: Item[] | undefined, onOpen: (guid: string, edit: boolean) => void): ExtraColumn[] {
  const { t } = useTranslation();
  const list = rows ?? NO_ROWS;
  const ids = useMemo(() => list.map((row) => text(row.guid)).filter(Boolean), [list]);
  const bySurvey = useSurveyParticipants(ids);
  /* Обработчик — новый на каждый рендер экрана; колонки из-за него не пересобираются. */
  const open = useRef(onOpen);
  open.current = onOpen;

  return useMemo(() => {
    if (!rows) return [];
    const of = (row: Item) => bySurvey.get(text(row.guid)) ?? NONE;
    return [
      {
        id: "survey:questions",
        label: t("survey.questions"),
        width: 150,
        render: (row) => (
          <span className="flex items-center gap-1 text-xs text-fg-muted">
            <Icon as={ListChecksIcon} size={14} />
            {t("survey.questionCount", { count: questions(parseDefinition(row.definition)).length })}
            {Boolean(row.is_anonymous) && (
              <span title={t("survey.anonymous")} className="ml-1 flex">
                <Icon as={LockIcon} size={13} />
              </span>
            )}
          </span>
        ),
      },
      {
        id: "survey:assigned",
        label: t("survey.assigned"),
        width: 140,
        numeric: true,
        render: (row) =>
          of(row).length ? <ParticipantStack participants={of(row)} /> : <span className="text-fg-subtle">—</span>,
      },
      {
        id: "survey:fill",
        label: t("survey.fill"),
        width: 190,
        render: (row) =>
          of(row).length ? (
            <FillBar value={fill(of(row).map((p) => p.status))} />
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      { id: "survey:menu", label: "", width: 48, render: (row) => <SurveyRowMenu row={row} onOpen={(guid, edit) => open.current(guid, edit)} /> },
    ];
  }, [rows, bySurvey, t]);
}
