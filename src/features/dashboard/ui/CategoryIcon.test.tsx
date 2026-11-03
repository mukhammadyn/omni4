import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryIcon, DashNav } from "./DashNav";
import { toTree, toTreeAttribute } from "../model/dashboard";
import type { MenuNode } from "@/features/sidebar";
test("report categories use distinct semantic icons and preserve saved custom icons", () => {
  const folders = ["Кадровые отчеты", "Посещаемость", "Рекрутинг", "Задачи", "Финансы"].map((title, index) => ({ id: String(index), moduleId: "module", title, dashboards: [] }));
  const icons = folders.map(folder => renderToStaticMarkup(<CategoryIcon folder={folder} />));
  expect(new Set(icons).size).toBe(5); expect(icons.join("")).not.toContain("lucide-folder");
  const saved = { ...folders[0]!, icon: "https://example.test/custom-category.svg" };
  expect(renderToStaticMarkup(<CategoryIcon folder={saved} />)).toContain(saved.icon);
  expect(toTree(toTreeAttribute({ folders: [saved] })).folders[0]?.icon).toBe(saved.icon);
});
test("embedded module icon is resolved from the same metadata as top module tabs", () => {
  const module = { id: "module", label: "My ERP", type: "FOLDER", icon: "https://example.test/module.svg", isModule: true } as MenuNode;
  const html = renderToStaticMarkup(<DashNav embedded tree={{ folders: [] }} modules={[module]} currentId="" favorites={[]} closed={new Set()} canEdit={false} onToggle={()=>{}} onOpen={()=>{}} onNewDashboard={()=>{}} onNewFolder={()=>""} onRenameFolder={()=>{}} onRemoveFolder={()=>{}} onRenameDashboard={()=>{}} onRemoveDashboard={()=>{}} onFavorite={()=>{}} onHide={()=>{}} />);
  expect(html).toContain(module.icon); expect(html).not.toContain("lucide-folder");
});
