import { todayInput } from "@/shared/lib/date-value";
import { ShiftDialog } from "./ShiftDialog";
import { TemplateDialog } from "./TemplateDialog";

/**
 * «Создать» в шапке графика — `onNew` прототипа: на календаре новая
 * смена на сегодня, на шаблонах — новый шаблон. Строку таблицы черновиком
 * эти экраны не заводят: смене нужны дни серии, шаблону — его неделя.
 */
export function ScheduleCreate({ viewType, onClose }: { viewType: string; onClose: () => void }) {
  return viewType === "WORK_SCHEDULES" ? <TemplateDialog onClose={onClose} /> : <ShiftDialog open={{ date: todayInput() }} onClose={onClose} />;
}

/** Экраны графика, у которых «Создать» — своё окно. */
export const SCHEDULE_VIEWS = new Set(["SCHEDULE", "WORK_SCHEDULES"]);
