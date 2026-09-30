import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/*
 * Контрасты палитры в обеих темах. Палитра — прототип с отклонениями
 * ради 4.5:1 (docs/REDESIGN.md, шаг 1); без этой проверки следующая
 * правка цвета снова сверялась бы на глаз.
 *
 * Фон задаётся стопкой снизу вверх: ["surface", "danger-subtle"] —
 * полупрозрачная подложка поверх контента. Полупрозрачный текст
 * сводится с верхним слоем фона.
 */

// Не `?raw`: vitest подменяет любой CSS пустой строкой.
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

type Rgba = [number, number, number, number];

function tokens(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const light = tokens(css.slice(css.indexOf("@theme {"), css.indexOf("\n}\n", css.indexOf("@theme {"))));
const darkStart = css.indexOf(".dark {");
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf("\n  }\n", darkStart))) };

function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    const n = (i: number) => parseInt(hex[1]!.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  }
  const rgba = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(value);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  throw new Error(`не цвет: ${value}`);
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba) {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(theme: Record<string, string>, fg: string, stack: string[]) {
  const color = (name: string) => parse(theme[name] ?? `нет токена ${name}`);
  const base = stack.map(color).reduce((below, layer) => over(layer, below), [255, 255, 255, 1]);
  const [a, b] = [luminance(over(color(fg), base)), luminance(base)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

const HUES = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink", "brown"];

const PAIRS: [fg: string, stack: string[], min: number][] = [
  ["fg", ["surface"], 4.5],
  ["fg", ["bg"], 4.5],
  ["fg-muted", ["surface"], 4.5],
  ["fg-muted", ["bg"], 4.5],
  ["fg-muted", ["surface", "surface-hover"], 4.5],
  ["fg-muted", ["bg", "surface-hover"], 4.5],
  // Решено оставить как в прототипе (2.49). Порог — чтобы не опустился ниже.
  ["fg-subtle", ["surface"], 2.4],
  ["accent-fg", ["accent-solid"], 4.5],
  ["accent-fg", ["accent-solid-hover"], 4.5],
  ["accent-text", ["surface"], 4.5],
  ["accent-text", ["surface", "accent-subtle"], 4.5],
  ...(["success", "warning", "danger"] as const).flatMap((role): [string, string[], number][] => [
    [role, ["surface"], 4.5],
    [role, ["surface", `${role}-subtle`], 4.5],
  ]),
  ...HUES.map((hue): [string, string[], number] => [`chip-${hue}-fg`, [`chip-${hue}-bg`], 4.5]),
];

test("высота строки грида совпадает с --spacing-row", () => {
  // Импорт DataGrid тянет за собой полприложения — число берётся из текста.
  const grid = readFileSync(new URL("../features/item/ui/DataGrid.tsx", import.meta.url), "utf8");
  const js = /const ROW_HEIGHT = (\d+);/.exec(grid)?.[1];
  const token = /--spacing-row:\s*(\d+)px/.exec(css)?.[1];
  expect(js).toBe(token);
});

test.each([
  ["светлая", light],
  ["тёмная", dark],
] as const)("%s тема: контраст пар палитры", (_, theme) => {
  const failed = PAIRS.map(([fg, stack, min]) => ({
    pair: `${fg} на ${stack.join(" + ")}`,
    ratio: Number(contrast(theme, fg, stack).toFixed(2)),
    min,
  })).filter(({ ratio, min }) => ratio < min);

  expect(failed).toEqual([]);
});
