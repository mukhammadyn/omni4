import { expect, test } from "vitest";
import { funnels, type Stage } from "./vacancy-funnel";

const stages: Stage[] = [
  { id: "offer", name: "Оффер", color: "#22A06B", order: 2 },
  { id: "screen", name: "Скрининг", color: "#3B82F6", order: 0 },
];

test("активные — по этапам в их порядке, нанятые и отказы — только в счёте", () => {
  const result = funnels(
    [
      { vacancyId: "v1", stageId: "offer", status: "active" },
      { vacancyId: "v1", stageId: "screen", status: "active" },
      { vacancyId: "v1", stageId: "screen", status: "active" },
      { vacancyId: "v1", stageId: "offer", status: "hired" },
      { vacancyId: "v1", stageId: "screen", status: "rejected" },
      { vacancyId: "v2", stageId: "gone", status: "active" },
    ],
    stages,
  );

  const v1 = result.get("v1")!;
  expect(v1.total).toBe(5);
  expect(v1.hired).toBe(1);
  expect(v1.stages.map((s) => [s.stage.id, s.count])).toEqual([
    ["screen", 2],
    ["offer", 1],
  ]);

  // Этап удалён из справочника — кандидат считается, полоса его не рисует.
  expect(result.get("v2")).toEqual({ total: 1, hired: 0, stages: [] });
  expect(result.has("v3")).toBe(false);
});
