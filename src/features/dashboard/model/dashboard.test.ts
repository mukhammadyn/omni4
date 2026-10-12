import { expect, test } from "vitest";
import { findDashboard, patchDashboard, toTree, toTreeAttribute } from "./dashboard";

test("пустой и мусорный ключ — пустое дерево", () => {
  for (const value of [undefined, null, "x", { folders: "x" }, { folders: [null, 1] }]) {
    expect(toTree(value)).toEqual({ folders: [] });
  }
});

const raw = {
  folders: [
    {
      id: "f",
      module_id: "crm",
      title: "Продажи",
      dashboards: [
        {
          id: "d",
          title: "Воронка",
          widgets: [{ kind: "nope", table_slug: "a" }, null, { id: "w", kind: "bar", table_slug: "crm_deals" }],
        },
      ],
    },
  ],
};

test("мусорный виджет пропадает, таблица остаётся при своём графике; круг туда-обратно", () => {
  const tree = toTree(raw);
  const found = findDashboard(tree, "d");

  expect(found?.folder.id).toBe("f");
  expect(found?.dashboard.emoji).toBe("📊");
  expect(found?.dashboard.widgets.map((w) => [w.id, w.tableSlug])).toEqual([["w", "crm_deals"]]);
  expect(toTree(toTreeAttribute(tree))).toEqual(tree);
});

test("null из правки удаляет дашборд", () => {
  expect(findDashboard(patchDashboard(toTree(raw), "d", () => null), "d")).toBeNull();
});
