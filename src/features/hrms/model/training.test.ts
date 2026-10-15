import { expect, test } from "vitest";
import { homeworkCounts, homeworkStatusFor, participantsDiff } from "./training";

test("счётчики ДЗ: «сдали» — всё, кроме несданного", () => {
  expect(homeworkCounts(["not_submitted", "submitted", "accepted", "accepted", "rejected"])).toEqual({
    total: 5,
    submitted: 4,
    review: 1,
    accepted: 2,
    rejected: 1,
  });
  expect(homeworkCounts([])).toEqual({ total: 0, submitted: 0, review: 0, accepted: 0, rejected: 0 });
});

test("ДЗ включили — ждём файл, но сданное и проверенное не стирается", () => {
  expect(homeworkStatusFor(true, "not_required")).toBe("not_submitted");
  expect(homeworkStatusFor(true, null)).toBe("not_submitted");
  expect(homeworkStatusFor(true, "accepted")).toBe("accepted");
  expect(homeworkStatusFor(false, "accepted")).toBe("not_required");
});

test("участники: новые добавляются, снятые удаляются, оставшиеся не трогаются", () => {
  const current = [
    { id: "p1", employeeId: "e1" },
    { id: "p2", employeeId: "e2" },
  ];
  expect(participantsDiff(current, ["e2", "e3"])).toEqual({ add: ["e3"], remove: ["p1"] });
  expect(participantsDiff(current, ["e1", "e2"])).toEqual({ add: [], remove: [] });
});
