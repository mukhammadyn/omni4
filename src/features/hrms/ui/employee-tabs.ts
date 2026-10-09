/**
 * Свои вкладки страницы сотрудника — «Отсутствия» и «Посещаемость»
 * (`#abs`, `#att` прототипа). Имена — в адресе (`?tab=attendance`):
 * по ним экраны посещаемости открывают нужную вкладку.
 */
export const ABSENCES_TAB = "absences";
export const ATTENDANCE_TAB = "attendance";
export type EmployeeTab = typeof ABSENCES_TAB | typeof ATTENDANCE_TAB;
