import { describe, expect, it } from "vitest";
import { colorOf, initials, mostCommon } from "./PeopleGallery";

describe("PeopleGallery", () => {
  it("hides the status most people share", () => {
    expect(mostCommon(["active", "probation", "active", undefined])).toBe("active");
    expect(mostCommon([undefined])).toBeUndefined();
  });

  it("draws initials and a stable non-gray colour", () => {
    expect(initials("Иванов Пётр Сергеевич")).toBe("ИП");
    expect(initials("  zafar ")).toBe("Z");
    expect(colorOf("Иванов Пётр")).toBe(colorOf("Иванов Пётр"));
    expect(colorOf("")).not.toBe("gray");
  });
});
