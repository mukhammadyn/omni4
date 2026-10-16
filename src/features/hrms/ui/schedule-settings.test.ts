import { expect, test } from "vitest";
import { groupRows } from "./schedule-settings";

const row = (departmentId: string) => ({ departmentId, locationId: "", positionId: "" });

test("группы: крупные первыми, пустое поле — в конце", () => {
  const rows = [row("a"), row(""), row("b"), row("b")];
  const groups = groupRows(rows, "dept", (r) => r, (_, id) => id.toUpperCase());
  expect(groups.map((g) => [g.label, g.rows.length])).toEqual([["B", 2], ["A", 1], ["—", 1]]);
  expect(groupRows(rows, "none", (r) => r, () => "")).toEqual([{ id: "", label: "", rows }]);
});
