/**
 * Тренинги: `hr_trainings`, участники `hr_training_participants`
 * (тренинг × сотрудник с результатом ДЗ) и материалы
 * `hr_training_materials` (`ucode/erp/erp.dbml`).
 *
 * Статус ДЗ участника (`homework_status`, PICK_LIST):
 *   not_required  — ДЗ у тренинга нет;
 *   not_submitted — ждём файл;
 *   submitted     — сдано, ждёт проверки;
 *   accepted      — принято с оценкой;
 *   rejected      — на доработку, с комментарием.
 */
export const HOMEWORK = {
  notRequired: "not_required",
  notSubmitted: "not_submitted",
  submitted: "submitted",
  accepted: "accepted",
  rejected: "rejected",
} as const;

/** Статус прохождения нового участника (`status`, обязателен в схеме). */
export const ASSIGNED = "assigned";

export type HomeworkCounts = {
  /** Назначено. */
  total: number;
  /** Сдали хоть раз: на проверке, принято, на доработке. */
  submitted: number;
  /** На проверке сейчас. */
  review: number;
  accepted: number;
  rejected: number;
};

/** Счётчики ДЗ — KPI страницы тренинга и полоса в списке. */
export function homeworkCounts(statuses: unknown[]): HomeworkCounts {
  const is = (status: string) => statuses.filter((s) => s === status).length;
  const review = is(HOMEWORK.submitted);
  const accepted = is(HOMEWORK.accepted);
  const rejected = is(HOMEWORK.rejected);
  return { total: statuses.length, submitted: review + accepted + rejected, review, accepted, rejected };
}

/**
 * Статус ДЗ участника, когда у тренинга включили или сняли ДЗ.
 * Сданное и проверенное при включении не трогается: результат
 * не стирается из-за того, что галку сняли и вернули.
 */
export function homeworkStatusFor(required: boolean, current: unknown): string {
  if (!required) return HOMEWORK.notRequired;
  return !current || current === HOMEWORK.notRequired ? HOMEWORK.notSubmitted : String(current);
}

/** Новый участник тренинга. */
export function participantRow(training: string, employee: string, required: boolean) {
  return {
    guid: crypto.randomUUID(),
    hr_trainings_id: training,
    hr_employees_id: employee,
    status: ASSIGNED,
    homework_status: homeworkStatusFor(required, null),
  };
}

/**
 * Кого добавить и чьи строки удалить, чтобы участниками стали ровно
 * `next`. Оставшиеся сохраняют свою строку — и сданное ДЗ с оценкой.
 */
export function participantsDiff(current: { id: string; employeeId: string }[], next: string[]) {
  const keep = new Set(next);
  const have = new Set(current.map((p) => p.employeeId));
  return {
    add: [...keep].filter((id) => !have.has(id)),
    remove: current.filter((p) => !keep.has(p.employeeId)).map((p) => p.id),
  };
}
