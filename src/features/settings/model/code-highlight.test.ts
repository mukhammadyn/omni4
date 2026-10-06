import { describe, expect, it } from "vitest";
import { highlightCode } from "./code-highlight";

const kinds = (line: string) =>
  highlightCode(line)[0]!.filter((token) => token.kind !== "plain").map((token) => [token.kind, token.text]);

describe("highlightCode", () => {
  it("красит слова, строки, числа и комментарий", () => {
    expect(kinds(`const limit = 10; // max`)).toEqual([
      ["keyword", "const"],
      ["number", "10"],
      ["comment", "// max"],
    ]);
  });

  it("не путает // в адресе со строкой комментария", () => {
    expect(kinds(`fetch("https://api.test/v2", { headers })`)).toEqual([["string", `"https://api.test/v2"`]]);
  });

  it("собирает строку обратно без потерь", () => {
    const source = "Table deal [note: 'It\\'s'] {\n  guid UUID [pk]\n}";
    const joined = highlightCode(source)
      .map((line) => line.map((token) => token.text).join(""))
      .join("\n");

    expect(joined).toBe(source);
  });
});
