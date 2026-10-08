import { expect, test } from "vitest";
import { stageHistoryRow } from "./stage-history";

test("переход: «с этапа» — второе поле, «на этап» — первое; автор — если известен", () => {
  expect(
    stageHistoryRow({ candidate: "c", vacancy: "v", from: "s1", to: "s2", status: "active", by: "me", at: "T" }),
  ).toEqual({
    hr_candidates_id: "c",
    hr_vacancies_id: "v",
    hr_recruiting_stages_id_2: "s1",
    hr_recruiting_stages_id: "s2",
    status: "active",
    moved_at: "T",
    employees_id: "me",
  });

  expect(
    stageHistoryRow({ candidate: "c", vacancy: "v", from: null, to: "s1", status: "active", by: undefined, at: "T" }),
  ).not.toHaveProperty("employees_id");
});
