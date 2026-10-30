import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcript";

describe("parseTranscript", () => {
  it("merges both channels into one dialog by time", () => {
    const doc = JSON.stringify({
      source: "stereo",
      tracks: [
        { speaker: "operator", segments: [{ from: 0, text: "Здравствуйте" }, { from: 4000, text: "Слушаю" }] },
        { speaker: "client", segments: [{ from: 2000, text: "Добрый день" }] },
      ],
    });
    expect(parseTranscript(doc).map((l) => `${l.speaker}:${l.text}`)).toEqual([
      "operator:Здравствуйте",
      "client:Добрый день",
      "operator:Слушаю",
    ]);
  });

  it("falls back to track text, survives junk", () => {
    expect(parseTranscript({ tracks: [{ speaker: "x", text: " всё " }] })).toEqual([
      { speaker: "unknown", text: "всё", from: 0 },
    ]);
    expect(parseTranscript("not json")).toEqual([]);
    expect(parseTranscript(null)).toEqual([]);
  });
});
