import { describe, expect, it } from "vitest";
import { parsePinfl, splitFullName } from "./personal";

describe("parsePinfl", () => {
  it("reads birth date and gender", () => {
    expect(parsePinfl("3 1205 88 1234567")).toEqual({ birth: "1988-05-12", gender: "male" });
    expect(parsePinfl("62402060000000")).toEqual({ birth: "2006-02-24", gender: "female" });
  });
  it("rejects bad input", () => {
    expect(parsePinfl("123")).toBeNull();
    expect(parsePinfl("33102880000000")).toBeNull();
    expect(parsePinfl("73105880000000")).toBeNull();
  });
});

describe("splitFullName", () => {
  it("splits into parts", () => {
    expect(splitFullName(" Ne'matov  Diyorbek Dadajon o'g'li ")).toEqual({
      last_name: "Ne'matov",
      first_name: "Diyorbek",
      middle_name: "Dadajon o'g'li",
    });
  });
  it("keeps middle name when there is none in the full name", () => {
    expect(splitFullName("Ne'matov Diyorbek")).toEqual({ last_name: "Ne'matov", first_name: "Diyorbek" });
  });
});
