import { expect, test } from "vitest";
import { findDashboard, folderForNew, newDashboard, newFolder, openedDashboard, patchDashboard, toTree, toTreeAttribute } from "./dashboard";

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

/* CRM без дашбордов, у HRMS — папка с одним (как в проекте omni4 на 2026-10-13). */
const hrmsFolder = { ...newFolder("hrms", "Люди"), dashboards: [newDashboard("Штат")] };
const twoModules = { folders: [hrmsFolder] };

test("вход из модуля без дашбордов открывает пустой модуль, а не чужой дашборд", () => {
  expect(openedDashboard(twoModules, "", "crm", true)).toBeNull();
  // Модуль не назван — показать хоть что-то лучше, чем пустой экран.
  expect(openedDashboard(twoModules, "", "crm", false)?.folder).toBe(hrmsFolder);
  // Названный дашборд открывается из любого модуля.
  const id = hrmsFolder.dashboards[0]!.id;
  expect(openedDashboard(twoModules, id, "crm", true)?.dashboard.id).toBe(id);
});

test("«+» у модуля кладёт в этот модуль, даже когда открыт дашборд другого", () => {
  // В CRM папок нет — её заведут в CRM, а не положат в открытую папку HRMS.
  expect(folderForNew(twoModules, { moduleOf: "crm", opened: hrmsFolder, home: "hrms" })).toEqual({ folder: undefined, module: "crm" });
  // Без модуля — как было: в папку открытого дашборда.
  expect(folderForNew(twoModules, { opened: hrmsFolder, home: "crm" }).folder).toBe(hrmsFolder);
  // Пустой CRM из адреса, открытого нет — в CRM.
  expect(folderForNew(twoModules, { home: "crm" })).toEqual({ folder: undefined, module: "crm" });
  // Заданная папка важнее всего.
  expect(folderForNew(twoModules, { folderId: hrmsFolder.id, moduleOf: "crm", home: "crm" }).folder).toBe(hrmsFolder);
});
