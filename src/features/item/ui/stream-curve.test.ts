import { expect, test } from "vitest";
import { wave } from "./ChartView";

/** Все y-координаты (концы и ручки) кривой. */
const ys = (d: string) =>
  d
    .split(/[ C]+/)
    .filter(Boolean)
    .map((pair) => Number(pair.split(",")[1]));

test("лента не выходит за значения соседних стадий и проходит через каждую", () => {
  const d = wave([0, 25, 50, 75, 100], [10, 90, 30, 70, 20]);
  const all = ys(d);

  expect(Math.max(...all)).toBeLessThanOrEqual(90);
  expect(Math.min(...all)).toBeGreaterThanOrEqual(10);
  expect(d).toContain("25,90");
  expect(d.endsWith("100,20")).toBe(true);
});
