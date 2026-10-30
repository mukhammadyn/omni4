import { expect, test } from "vitest";
import { contactsFromCandidate, employeeFromCandidate } from "./candidate-page";

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
    hr_positions_id: "p1",
    hr_departments_id: "d1",
    work_format: "office",
    hire_date: "2026-10-28",
    status: "active",
  });
});

test("контакты кандидата — строками «Адресов и телефонов», пустые не пишутся", () => {
  const rows = contactsFromCandidate({ email: "n@mail.uz", phone: null, telegram_username: "@nig" }, "e1");
  expect(rows.map((row) => ({ ...row, guid: undefined }))).toEqual([
    { guid: undefined, hr_employees_id: "e1", kind: "contact", name: "email", value: "n@mail.uz" },
    { guid: undefined, hr_employees_id: "e1", kind: "contact", name: "telegram", value: "@nig" },
  ]);
});
