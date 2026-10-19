/**
 * Опросы: `hr_surveys` (вопросы — JSON SurveyJS в `definition`),
 * назначения `hr_survey_participants` (опрос × сотрудник, статус
 * прохождения) и ответы `hr_survey_responses`.
 *
 * Статус опроса (`status`, STATUS): draft · active · completed · archived.
 * Статус участника (`status`, PICK_LIST): pending · completed · skipped.
 */
export const SURVEY_STATUS = { draft: "draft", active: "active", completed: "completed", archived: "archived" } as const;
export const PARTICIPANT = { pending: "pending", completed: "completed", skipped: "skipped" } as const;

/** Остальные свойства элемента (варианты, шкала, логика) модели не нужны — их читает SurveyJS. */
type Element = { type?: string; name?: string; title?: string; elements?: Element[]; templateElements?: Element[]; [key: string]: unknown };
export type Definition = { title?: string; pages?: { name?: string; title?: string; elements?: Element[] }[]; elements?: Element[]; [key: string]: unknown };
export type Question = { name: string; title: string; type: string };

/** Элементы без ответа: оформление и вычисляемые поля. */
const NOT_QUESTIONS = new Set(["html", "image", "expression"]);

/** `definition` приходит строкой (поле JSON) или уже объектом. */
export function parseDefinition(value: unknown): Definition {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Definition;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Definition) : {};
  } catch {
    return {};
  }
}

/** Вопросы по порядку; панели раскрываются, их вложенные вопросы — тоже. */
export function questions(definition: Definition): Question[] {
  const out: Question[] = [];
  const walk = (elements: Element[] | undefined) => {
    for (const el of elements ?? []) {
      if (el.type === "panel") walk(el.elements);
      else if (el.type === "paneldynamic") walk(el.templateElements);
      else if (el.name && !NOT_QUESTIONS.has(el.type ?? "")) out.push({ name: el.name, title: el.title || el.name, type: el.type ?? "" });
    }
  };
  walk(definition.elements);
  for (const page of definition.pages ?? []) walk(page.elements);
  return out;
}

export type Fill = { total: number; done: number; percent: number };

/** Заполняемость: прошли из назначенных. */
export function fill(statuses: unknown[]): Fill {
  const done = statuses.filter((s) => s === PARTICIPANT.completed).length;
  return { total: statuses.length, done, percent: statuses.length ? Math.round((done / statuses.length) * 100) : 0 };
}

export type Answers = Record<string, unknown>;
export type Bar = { label: string; count: number; tone?: "good" | "mid" | "bad" };
export type QuestionStat = Question & {
  /** Ответили на этот вопрос. */
  answered: number;
  kind: "nps" | "rating" | "choice" | "boolean" | "text" | "other";
  bars: Bar[];
  /** Средняя оценка и верх шкалы — у `rating`. */
  average?: number;
  max?: number;
  /** eNPS: промоутеры минус критики, в процентах. */
  nps?: number;
  /** Текстовые ответы по порядку, с индексом ответа. */
  texts?: { at: number; text: string }[];
};

type Choice = string | number | { value?: unknown; text?: unknown };
const choiceValue = (c: Choice) => (typeof c === "object" ? c.value : c);
const choiceText = (c: Choice) => String((typeof c === "object" ? (c.text ?? c.value) : c) ?? "");
const has = (answer: unknown, value: unknown) => (Array.isArray(answer) ? answer.includes(value) : answer === value);
const given = (answer: unknown) => answer !== undefined && answer !== null && answer !== "" && !(Array.isArray(answer) && !answer.length);

/** Элементы определения с их свойствами — для статистики нужны варианты и шкала. */
function elements(definition: Definition) {
  const out = new Map<string, Record<string, unknown>>();
  const walk = (list: Record<string, unknown>[] | undefined) => {
    for (const el of list ?? []) {
      if (Array.isArray(el.elements)) walk(el.elements as Record<string, unknown>[]);
      if (typeof el.name === "string") out.set(el.name, el);
    }
  };
  walk(definition.elements as Record<string, unknown>[] | undefined);
  for (const page of definition.pages ?? []) walk(page.elements as Record<string, unknown>[] | undefined);
  return out;
}

/**
 * Статистика по вопросам — `stats()` прототипа, но из JSON, без модели
 * SurveyJS. Шкала 0–10 считается как eNPS: 9–10 промоутеры, 0–6 критики.
 */
export function questionStats(definition: Definition, responses: Answers[]): QuestionStat[] {
  const byName = elements(definition);
  return questions(definition).map((q) => {
    const el = byName.get(q.name) ?? {};
    const answers = responses.map((r) => r[q.name]).filter(given);
    const base = { ...q, answered: answers.length };

    if (q.type === "rating") {
      const min = Number(el.rateMin ?? 1);
      const max = Number(el.rateMax ?? 5);
      const numbers = answers.map(Number).filter((n) => !Number.isNaN(n));
      if (min === 0 && max === 10) {
        const promoters = numbers.filter((n) => n >= 9).length;
        const critics = numbers.filter((n) => n <= 6).length;
        return {
          ...base,
          kind: "nps",
          nps: numbers.length ? Math.round(((promoters - critics) / numbers.length) * 100) : 0,
          bars: [
            { label: "9–10", count: promoters, tone: "good" },
            { label: "7–8", count: numbers.length - promoters - critics, tone: "mid" },
            { label: "0–6", count: critics, tone: "bad" },
          ],
        };
      }
      const scale = Array.isArray(el.rateValues)
        ? (el.rateValues as Choice[]).map((c) => Number(choiceValue(c)))
        : Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
      return {
        ...base,
        kind: "rating",
        average: numbers.length ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0,
        max: scale[scale.length - 1] ?? max,
        bars: [...scale].reverse().map((v) => ({ label: String(v), count: numbers.filter((n) => n === v).length })),
      };
    }
    if (["radiogroup", "dropdown", "checkbox", "tagbox", "ranking", "imagepicker"].includes(q.type)) {
      const choices = (Array.isArray(el.choices) ? (el.choices as Choice[]) : []).filter((c) => !["selectall", "none"].includes(String(choiceValue(c))));
      return { ...base, kind: "choice", bars: choices.map((c) => ({ label: choiceText(c), count: answers.filter((a) => has(a, choiceValue(c))).length })) };
    }
    if (q.type === "boolean")
      return {
        ...base,
        kind: "boolean",
        bars: [
          { label: String(el.labelTrue ?? ""), count: answers.filter((a) => a === true).length },
          { label: String(el.labelFalse ?? ""), count: answers.filter((a) => a === false).length },
        ],
      };
    if (q.type === "comment" || q.type === "text")
      return {
        ...base,
        kind: "text",
        bars: [],
        texts: responses.flatMap((r, at) => (given(r[q.name]) ? [{ at, text: String(r[q.name]) }] : [])),
      };
    return { ...base, kind: "other", bars: [] };
  });
}

/** Ответ одной ячейкой CSV: варианты — их подписями, через запятую. */
function cellText(answer: unknown, el: Record<string, unknown>): string {
  if (!given(answer)) return "";
  const choices = Array.isArray(el.choices) ? (el.choices as Choice[]) : [];
  const label = (v: unknown) => {
    const found = choices.find((c) => choiceValue(c) === v);
    return found ? choiceText(found) : typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  return Array.isArray(answer) ? answer.map(label).join(", ") : label(answer);
}

/**
 * CSV ответов — `csv()` прототипа: сотрудник, дата, по колонке на вопрос.
 * BOM — чтобы Excel узнал UTF-8 и не исказил кириллицу.
 */
export function responsesCsv(definition: Definition, rows: { who: string; at: string; answers: Answers }[], header: [string, string]) {
  const byName = elements(definition);
  const list = questions(definition);
  const table = [
    [...header, ...list.map((q) => q.title)],
    ...rows.map((r) => [r.who, r.at, ...list.map((q) => cellText(r.answers[q.name], byName.get(q.name) ?? {}))]),
  ];
  return "﻿" + table.map((line) => line.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

/** `answers` приходит строкой (поле JSON) или объектом. */
export const parseAnswers = (value: unknown): Answers => parseDefinition(value) as Answers;
