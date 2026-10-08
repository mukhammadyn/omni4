import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/shared/ui/icon";

/*
 * Части страниц записей HRMS — сотрудника и вакансии: карточки полей,
 * строки «подпись — значение», мета в шапке. Рисунок — `.ecard`,
 * `.erow`, `.side-props` прототипа (employee.html).
 */

export function Meta({ icon, text }: { icon: LucideIcon; text: string }) {
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.25">
      <Icon as={icon} size={14} className="text-fg-subtle" />
      {text}
    </span>
  );
}

/** `.erow`: подпись слева, значение справа, волосяная черта между строками. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9.5 items-center border-b border-border text-sm last:border-b-0">
      <span className="w-50 shrink-0 py-1.5 pr-3 text-fg-muted max-md:w-32.5">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** `.side-props`: подпись капсом над значением. */
export function SideProp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm font-semibold">
      <small className="block text-[11.5px] font-medium tracking-[0.3px] text-fg-subtle uppercase">
        {label}
      </small>
      {children}
    </div>
  );
}

/** `.ecard` прототипа: рамка, шапка со значком, тело. */
export function Card({
  icon,
  title,
  count,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-3.5 rounded-[10px] border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon as={icon} size={16} className="text-fg-muted" />
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {count !== undefined && <span className="text-sm text-fg-subtle">{count}</span>}
      </div>
      <div className="px-4 pt-2 pb-3">{children}</div>
    </section>
  );
}
