import { expect, test } from "vitest";
import ru from "@/locales/ru.json";
import { tenure } from "./GradeMatrix";

const t = (key: string, o: { n: string }) => (ru as Record<string, string>)[key]!.replace("{{n}}", o.n);

test("стаж словами — как в прототипе", () => {
  expect([0, 6, 12, 18, 24, 60, null].map((m) => tenure(m, "ru", t))).toEqual(["0 мес", "6 мес", "1 год", "1,5 года", "2 года", "5 лет", ""]);
});
