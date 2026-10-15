import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, type ExtraColumn, type Item } from "@/features/item";
import { firstText, related, text } from "../api/org";
import { useTrainingParticipants } from "../api/training";
import { homeworkCounts, type HomeworkCounts } from "../model/training";

const NO_ROWS: Item[] = [];
const NONE: Item[] = [];

/** Первые четыре участника внахлёст и число — `.tr-stack` прототипа. */
export function ParticipantStack({ participants }: { participants: Item[] }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="flex">
        {participants.slice(0, 4).map((p, at) => {
          const person = related(p, "hr_employees_id");
          return (
            <span key={text(p.guid)} className={`rounded-full ring-2 ring-surface ${at ? "-ml-1.5" : ""}`}>
              <Avatar name={text(person.full_name)} photo={firstText(person.photo) || undefined} size="sm" />
            </span>
          );
        })}
      </span>
      <b>{participants.length}</b>
    </span>
  );
}

/** `.tr-pb`: зелёным — принято, жёлтым — сдано и ещё не принято. */
export function HomeworkBar({ counts }: { counts: HomeworkCounts }) {
  const { t } = useTranslation();
  const share = (n: number) => `${counts.total ? (n / counts.total) * 100 : 0}%`;
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-1.5 w-[90px] shrink-0 overflow-hidden rounded-[3px] bg-surface-hover">
        <i className="bg-success" style={{ width: share(counts.accepted) }} />
        <i className="bg-warning" style={{ width: share(counts.submitted - counts.accepted) }} />
      </span>
      <small className="whitespace-nowrap text-xs text-fg-muted">
        {t("training.accepted", { done: counts.accepted, total: counts.total })}
      </small>
    </span>
  );
}

/**
 * Хвост таблицы тренингов из прототипа (trainings.html, listView):
 * Участники · Домашнее задание. Считаются по `hr_training_participants`.
 *
 * `rows` не задан — таблица не тренингов: колонок и запросов нет.
 */
export function useTrainingColumns(rows: Item[] | undefined): ExtraColumn[] {
  const { t } = useTranslation();
  const list = rows ?? NO_ROWS;
  const ids = useMemo(() => list.map((row) => text(row.guid)).filter(Boolean), [list]);
  const byTraining = useTrainingParticipants(ids);

  return useMemo(() => {
    if (!rows) return [];
    const of = (row: Item) => byTraining.get(text(row.guid)) ?? NONE;
    return [
      {
        id: "training:participants",
        label: t("training.participants"),
        width: 140,
        numeric: true,
        render: (row) => <ParticipantStack participants={of(row)} />,
      },
      {
        id: "training:homework",
        label: t("training.homework"),
        width: 200,
        render: (row) =>
          row.homework_required ? (
            <HomeworkBar counts={homeworkCounts(of(row).map((p) => p.homework_status))} />
          ) : (
            <span className="text-fg-subtle">{t("training.noHomework")}</span>
          ),
      },
    ];
  }, [rows, byTraining, t]);
}
