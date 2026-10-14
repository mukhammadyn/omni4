import { describe, expect, it } from "vitest";
import { nextStages } from "./candidates-table";

describe("nextStages", () => {
  it("ведёт к следующему этапу своей воронки по sort_order", () => {
    const next = nextStages([
      { guid: "b2", hr_recruiting_pipelines_id: "B", sort_order: 2 },
      { guid: "a2", hr_recruiting_pipelines_id: "A", sort_order: 2 },
      { guid: "a1", hr_recruiting_pipelines_id: "A", sort_order: 1 },
      { guid: "b1", hr_recruiting_pipelines_id: "B", sort_order: 1 },
    ]);
    expect(next.get("a1")).toBe("a2");
    expect(next.get("b1")).toBe("b2");
    // Последний этап воронки — дальше некуда, в чужую воронку не перескакивает.
    expect(next.has("a2")).toBe(false);
    expect(next.has("b2")).toBe(false);
  });
});
