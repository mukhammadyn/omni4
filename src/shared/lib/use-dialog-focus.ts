import { useEffect, useRef } from "react";

/** Keep keyboard interactions inside a modal and restore its opener on close. */
export function useDialogFocus(onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex='0']";
    const targets = () => [...(dialog.current?.querySelectorAll<HTMLElement>(selector) ?? [])].filter((element) => element.getClientRects().length > 0);
    (dialog.current?.querySelector<HTMLElement>("[data-autofocus]") ?? targets()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="menu"], [role="listbox"]')) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const list = targets(), first = list[0], last = list.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (opener?.isConnected) opener.focus(); };
  }, []);
  return dialog;
}
