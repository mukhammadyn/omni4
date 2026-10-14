/**
 * Свои вкладки страницы сотрудника — «Отсутствия», «Посещаемость»
 * и «График работы» (`#abs`, `#att`, `#sched` прототипа). Имена — в адресе (`?tab=attendance`):
 * по ним экраны посещаемости открывают нужную вкладку.
 */
export const ABSENCES_TAB = "absences";
export const ATTENDANCE_TAB = "attendance";
export const SCHEDULE_TAB = "schedule";
export type EmployeeTab = typeof ABSENCES_TAB | typeof ATTENDANCE_TAB | typeof SCHEDULE_TAB;
