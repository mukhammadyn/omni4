import { expect, test } from "vitest";
import { fill, parseDefinition, questions, questionStats, responsesCsv } from "./survey";
import { SURVEY_TEMPLATES } from "./survey-templates";

test("definition: строка, объект и мусор", () => {
  expect(parseDefinition('{"title":"A"}')).toEqual({ title: "A" });
  expect(parseDefinition({ title: "B" })).toEqual({ title: "B" });
  expect(parseDefinition("not json")).toEqual({});
  expect(parseDefinition(null)).toEqual({});
});

test("вопросы: панели раскрываются, html и без имени пропускаются", () => {
  const def = {
    pages: [
      { elements: [{ type: "rating", name: "q1", title: "Оценка" }, { type: "html", name: "intro" }] },
      { elements: [{ type: "panel", name: "p", elements: [{ type: "comment", name: "q2" }] }] },
    ],
  };
  expect(questions(def)).toEqual([
    { name: "q1", title: "Оценка", type: "rating" },
    { name: "q2", title: "q2", type: "comment" },
  ]);
});

test("заполняемость", () => {
  expect(fill(["completed", "pending", "completed", "skipped"])).toEqual({ total: 4, done: 2, percent: 50 });
  expect(fill([])).toEqual({ total: 0, done: 0, percent: 0 });
});

test("шаблоны: тип из PICK_LIST hr_surveys.type, вопросы у всех, кроме пустого", () => {
  const types = ["enps", "pulse", "engagement", "training", "onboarding", "event", "exit", "survey"];
  for (const template of SURVEY_TEMPLATES) {
    expect(types).toContain(template.type);
    expect(questions(template.definition).length > 0).toBe(template.key !== "blank");
  }
});

test("статистика: eNPS, шкала, варианты, да/нет и текст", () => {
  const def = {
    pages: [
      {
        elements: [
          { type: "rating", name: "enps", rateMin: 0, rateMax: 10 },
          { type: "rating", name: "mood" },
          { type: "checkbox", name: "why", choices: ["A", { value: "b", text: "Бэ" }, "none"] },
          { type: "boolean", name: "ok", labelTrue: "Да", labelFalse: "Нет" },
          { type: "comment", name: "note" },
        ],
      },
    ],
  };
  const [enps, mood, why, ok, note] = questionStats(def, [
    { enps: 10, mood: 5, why: ["A", "b"], ok: true, note: "хорошо" },
    { enps: 3, mood: 4, why: ["b"], ok: false },
    { enps: 8 },
  ]);
  expect(enps).toMatchObject({ kind: "nps", answered: 3, nps: 0, bars: [{ count: 1 }, { count: 1 }, { count: 1 }] });
  expect(mood).toMatchObject({ kind: "rating", average: 4.5, max: 5 });
  expect(mood!.bars[0]).toEqual({ label: "5", count: 1 });
  expect(why!.bars).toEqual([
    { label: "A", count: 1 },
    { label: "Бэ", count: 2 },
  ]);
  expect(ok!.bars.map((b) => b.count)).toEqual([1, 1]);
  expect(note!.texts).toEqual([{ at: 0, text: "хорошо" }]);
});

test("CSV: подписи вариантов, кавычки и BOM", () => {
  const def = { elements: [{ type: "radiogroup", name: "q", title: 'Вопрос "1"', choices: [{ value: 1, text: "Один" }] }] };
  expect(responsesCsv(def, [{ who: "Иван", at: "01.10.2026", answers: { q: 1 } }], ["Сотрудник", "Дата"])).toBe(
    '﻿"Сотрудник","Дата","Вопрос ""1"""\n"Иван","01.10.2026","Один"',
  );
});
