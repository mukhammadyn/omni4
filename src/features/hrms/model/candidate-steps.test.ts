import { describe, expect, it } from "vitest";
import { candidateSteps } from "./candidate-steps";

const stages = ["a", "b", "c"].map((guid) => ({ guid, name: guid.toUpperCase(), color: "" }));

describe("candidateSteps", () => {
  it("пройдены этапы до текущего, оценка — средняя по этапу, дата — последний вход", () => {
    const steps = candidateSteps(
      stages,
      { hr_recruiting_stages_id: "b", status: "active", stage_changed_at: "2026-10-02" },
      [
        { hr_recruiting_stages_id: "a", moved_at: "2026-09-01" },
        { hr_recruiting_stages_id: "a", moved_at: "2026-09-05" },
      ],
      [
        { hr_recruiting_stages_id: "a", score: 7 },
        { hr_recruiting_stages_id: "a", score: 8 },
        { hr_recruiting_stages_id: "a", comment: "без оценки" },
      ],
    );
    expect(steps.map((s) => [s.done, s.current])).toEqual([
      [true, false],
      [true, true],
      [false, false],
    ]);
    expect(steps[0]).toMatchObject({ score: 7.5, since: "2026-09-05" });
    expect(steps[1]).toMatchObject({ score: undefined, since: "2026-10-02" });
  });

  it("у нанятого пройдены все, текущего нет", () => {
    const steps = candidateSteps(stages, { hr_recruiting_stages_id: "a", status: "hired" }, [], []);
    expect(steps.every((s) => s.done && !s.current)).toBe(true);
  });
});
