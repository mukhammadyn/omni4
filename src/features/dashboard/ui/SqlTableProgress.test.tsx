import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SqlTableProgress } from "./SqlTableProgress";
test("table progress preserves actual numeric values and bounds the visual bar", () => {
  const html = renderToStaticMarkup(<SqlTableProgress value="120.5" maximum={100} suffix="%" language="ru" />);
  expect(html).toContain("120,5%");
  expect(html).toContain('width:100%');
  expect(html).toContain('aria-valuenow="100"');
});
test("missing or invalid utilization is not shown as measured zero", () => {
  for (const value of [null, undefined, "", false, "NaN"]) expect(renderToStaticMarkup(<SqlTableProgress value={value} language="ru" />)).toBe("<span>—</span>");
  expect(renderToStaticMarkup(<SqlTableProgress value={0} language="ru" />)).toContain('width:0%');
});
