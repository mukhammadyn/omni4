import { afterEach, expect, test } from "vitest";
import { browserTimeZone, setTimeZone, timeZone } from "@/shared/lib/date-value";
import { bucketKey } from "./chart";
import { fromDateInput, toDateInput } from "./cell-value";

afterEach(() => setTimeZone(undefined));

test("момент показывается и вводится в поясе пользователя, а не браузера", () => {
  setTimeZone("Asia/Tashkent");

  expect(toDateInput("2026-01-05T09:00:00Z", "datetime")).toBe("2026-01-05T14:00");
  expect(fromDateInput("2026-01-05T14:00", "datetime")).toBe("2026-01-05T09:00:00.000Z");
  expect(bucketKey("2026-01-05T21:00:00Z", "datetime", "day")).toBe("2026-01-06");
});

test("летнее время: смещение берётся на сам момент", () => {
  setTimeZone("America/New_York");

  expect(fromDateInput("2026-01-15T09:00", "datetime")).toBe("2026-01-15T14:00:00.000Z");
  expect(fromDateInput("2026-07-15T09:00", "datetime")).toBe("2026-07-15T13:00:00.000Z");
  expect(toDateInput("2026-07-15T13:00:00Z", "datetime")).toBe("2026-07-15T09:00");
});

test("значения без пояса пояс пользователя не трогает", () => {
  setTimeZone("Pacific/Kiritimati");

  expect(toDateInput("2026-01-05", "date")).toBe("2026-01-05");
  expect(toDateInput("2026-01-05T08:30:00Z", "datetime_naive")).toBe("2026-01-05T08:30");
});

test("неизвестный или пустой пояс — пояс браузера", () => {
  setTimeZone("Mars/Olympus");
  expect(timeZone()).toBe(browserTimeZone());

  setTimeZone("");
  expect(timeZone()).toBe(browserTimeZone());
});
