import { describe, expect, it } from "vitest";
import { builderPreviewLimit } from "./builder-preview";
describe("builder preview row limit", () => {
  it("defaults invalid or empty input to ten", () => {
    for (const value of ["", " ", "NaN", "bad", Infinity]) expect(builderPreviewLimit(value)).toBe(10);
  });
  it("clamps valid input to 1..1000 without changing chart pagination", () => {
    expect(builderPreviewLimit("1001")).toBe(1000);
    expect(builderPreviewLimit(-2)).toBe(1);
    expect(builderPreviewLimit("25.7")).toBe(26);
    expect(builderPreviewLimit("10")).toBe(10);
  });
});
