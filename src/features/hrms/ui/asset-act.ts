import i18n from "@/shared/lib/i18n";
import { money, totals } from "../model/asset";

export type ActLine = { name: string; inventory: string; serial: string; cost: unknown; currency: string; issued: string };

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * «Акт приёма-передачи» — кнопка `#aAct` вкладки «Имущество» прототипа
 * (там заглушка «сформирован (PDF)»). Отдельное окно с печатной
 * разметкой и печатью браузера: PDF — «Сохранить как PDF».
 *
 * Цвета — чёрный по белому, не токены приложения: это бумага, у неё
 * нет тёмной темы.
 *
 * ponytail: печать из окна, без хранения. С разделом «Документы» акт
 * переедет на `hr_document_templates` и будет ложиться в `hr_documents`.
 */
export function printAct({ employee, department, lines, date }: { employee: string; department: string; lines: ActLine[]; date: string }) {
  const t = i18n.t.bind(i18n);
  const number = date.replaceAll(".", "").replaceAll("-", "");
  const sum = totals(lines.map((l) => ({ cost: l.cost, currency: l.currency })))
    .map((x) => `${money(x.sum)} ${x.currency}`)
    .join(" · ");
  const rows = lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.inventory)}</td><td>${esc(l.serial)}</td><td class="r">${
          l.cost ? `${money(l.cost)} ${esc(l.currency)}` : ""
        }</td><td>${esc(l.issued)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="${i18n.language}"><head><meta charset="utf-8"><title>${esc(t("asset.act.title"))} — ${esc(employee)}</title>
<style>
body{font:13px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#000;background:#fff;margin:32px auto;max-width:760px;padding:0 16px}
h1{font-size:18px;text-align:center;margin:0 0 4px}.sub{text-align:center;margin:0 0 24px}
p{margin:4px 0}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #000;padding:5px 7px;text-align:left;vertical-align:top}
th{font-weight:600}.r{text-align:right;white-space:nowrap}.sign{display:flex;gap:48px;margin-top:48px}.sign div{flex:1}
.line{border-bottom:1px solid #000;height:28px;margin-bottom:4px}small{font-size:11px}
@media print{body{margin:0 auto}}
</style></head><body>
<h1>${esc(t("asset.act.title"))} № ${esc(number)}</h1>
<p class="sub">${esc(t("asset.act.from", { date }))}</p>
<p>${esc(t("asset.act.text", { employee }))}</p>
${department ? `<p>${esc(t("asset.act.department"))}: ${esc(department)}</p>` : ""}
<table><thead><tr><th>№</th><th>${esc(t("asset.name"))}</th><th>${esc(t("asset.inventory"))}</th><th>${esc(t("asset.serial"))}</th><th class="r">${esc(
    t("asset.cost"),
  )}</th><th>${esc(t("asset.issueDate"))}</th></tr></thead><tbody>${rows}</tbody></table>
${sum ? `<p><b>${esc(t("asset.total"))}</b> ${esc(sum)}</p>` : ""}
<div class="sign"><div><b>${esc(t("asset.act.gave"))}</b><div class="line"></div><small>${esc(t("asset.act.signHint"))}</small></div>
<div><b>${esc(t("asset.act.took"))}</b><div class="line"></div><small>${esc(employee)}</small></div></div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
