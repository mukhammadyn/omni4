import { expect, test } from "vitest";
import { employeeFromCandidate } from "./candidate-page";

test("сотрудник из кандидата: имя и контакты — его, место — вакансии, приём — день выхода", () => {
  const employee = employeeFromCandidate(
    {
      guid: "c1",
      first_name: "Нигора",
      last_name: "Исмоилова",
      full_name: "Исмоилова Нигора",
      email: "n@mail.uz",
      phone: null,
      start_date: "2026-10-28",
      hr_vacancies_id_data: { hr_positions_id: "p1", hr_departments_id: "d1", work_format: "office" },
    },
    "e1",
  );
  expect(employee).toEqual({
    guid: "e1",
    hr_candidates_id: "c1",
    first_name: "Нигора",
    last_name: "Исмоилова",
    full_name: "Исмоилова Нигора",
    personal_email: "n@mail.uz",
    hr_positions_id: "p1",
    hr_departments_id: "d1",
    work_format: "office",
    hire_date: "2026-10-28",
    status: "active",
  });
});
