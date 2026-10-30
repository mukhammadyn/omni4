import { describe, expect, it } from "vitest";
import { matchingPolicies, type PenaltyAssignment } from "./penalty";

const a = (id: string, scope: PenaltyAssignment["scope"], targetId: string, extra: Partial<PenaltyAssignment> = {}): PenaltyAssignment => ({
  id,
  scope,
  targetId,
  target: "",
  policyId: id,
  from: "2026-01-01",
  to: "",
  active: true,
  excluded: [],
  ...extra,
});
const person = { id: "e1", name: "", departmentId: "d1", locationId: "l1" };

describe("matchingPolicies", () => {
  it("берёт самое точное: сотрудник → отдел → филиал → все", () => {
    const all = [a("all", "all_locations", ""), a("loc", "location", "l1"), a("dep", "department", "d1"), a("emp", "employee", "e1")];
    expect(matchingPolicies(person, all, "2026-10-22").map((x) => x.id)).toEqual(["emp", "dep", "loc", "all"]);
    expect(matchingPolicies(person, all.slice(0, 3), "2026-10-22")[0]?.id).toBe("dep");
    expect(matchingPolicies(person, all.slice(0, 2), "2026-10-22")[0]?.id).toBe("loc");
    expect(matchingPolicies(person, all.slice(0, 1), "2026-10-22")[0]?.id).toBe("all");
  });

  it("пропускает выключенные, будущие, истёкшие и исключённых", () => {
    const list = [
      a("off", "employee", "e1", { active: false }),
      a("later", "department", "d1", { from: "2026-12-01" }),
      a("over", "location", "l1", { to: "2026-06-01" }),
      a("skip", "all_locations", "", { excluded: ["e1"] }),
    ];
    expect(matchingPolicies(person, list, "2026-10-22")).toEqual([]);
  });
});
