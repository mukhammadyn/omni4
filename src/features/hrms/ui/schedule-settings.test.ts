import { expect, test } from "vitest";
import { groupRows, regionSubtree } from "./schedule-settings";

const row = (departmentId: string) => ({ departmentId, locationId: "", positionId: "" });

test("группы: крупные первыми, пустое поле — в конце", () => {
  const rows = [row("a"), row(""), row("b"), row("b")];
  const groups = groupRows(rows, "dept", (r) => r, (_, id) => id.toUpperCase());
  expect(groups.map((g) => [g.label, g.rows.length])).toEqual([["B", 2], ["A", 1], ["—", 1]]);
  expect(groupRows(rows, "none", (r) => r, () => "")).toEqual([{ id: "", label: "", rows }]);
});

test("regionSubtree: регион со всеми вложенными, без соседей", () => {
  const rows = [
    { guid: "uz" },
    { guid: "tas", core_regions_id: "uz" },
    { guid: "yunus", core_regions_id: "tas" },
    { guid: "kz" },
    { guid: "ala", core_regions_id: "kz" },
  ];
  expect([...regionSubtree(rows, "uz")].sort()).toEqual(["tas", "uz", "yunus"]);
  expect([...regionSubtree(rows, "yunus")]).toEqual(["yunus"]);
});
