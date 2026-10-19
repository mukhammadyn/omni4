import { expect, test } from "vitest";
import { expiry, splitUpload, UPLOAD_MAX } from "./document";

test("expiry", () => {
  expect(expiry("", "2026-10-19")).toBe("");
  expect(expiry("2026-10-18", "2026-10-19")).toBe("expired");
  expect(expiry("2026-10-19", "2026-10-19")).toBe("soon");
  expect(expiry("2026-11-18", "2026-10-19")).toBe("soon");
  expect(expiry("2026-12-31", "2026-10-19")).toBe("");
});

test("splitUpload", () => {
  const { ok, bad } = splitUpload([
    { name: "a.PDF", size: 10 },
    { name: "b.exe", size: 10 },
    { name: "noext", size: 10 },
    { name: "c.png", size: UPLOAD_MAX + 1 },
  ]);
  expect(ok.map((f) => f.name)).toEqual(["a.PDF"]);
  expect(bad).toEqual([
    { name: "b.exe", reason: "type" },
    { name: "noext", reason: "type" },
    { name: "c.png", reason: "size" },
  ]);
});
