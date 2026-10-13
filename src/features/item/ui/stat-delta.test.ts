import { expect, test } from "vitest";
import { statDelta } from "./ChartView";

test("изменение к прошлому периоду", () => {
  expect(statDelta(112, 100)).toEqual({ sign: 1, text: "+12%" });
  expect(statDelta(97, 100)).toEqual({ sign: -1, text: "−3%" });
  expect(statDelta(5, 0)).toEqual({ sign: 1, text: "+5" });
  expect(statDelta(0, 0)).toEqual({ sign: 0, text: "0" });
});
