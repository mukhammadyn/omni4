import { expect, test } from "vitest";
import { iconValue, toGlyphs } from "./lucide";

test("иконки идут по имени и сразу нашей толщины линии", () => {
  const glyphs = toGlyphs({
    icons: {
      zap: { body: '<path stroke-width="2" d="M1"/>' },
      anchor: { body: '<path stroke-width="2" d="M2"/>' },
      broken: {},
    },
  });

  expect(glyphs.map((glyph) => glyph.name)).toEqual(["anchor", "zap"]);
  expect(glyphs[0]?.body).toBe('<path stroke-width="1.8" d="M2"/>');
});

test("без цвета сохраняется имя Iconify, с цветом — адрес картинки", () => {
  expect(iconValue("zap", "")).toBe("lucide:zap");
  expect(iconValue("zap", "#d44c47")).toBe("https://api.iconify.design/lucide/zap.svg?color=%23d44c47");
});
