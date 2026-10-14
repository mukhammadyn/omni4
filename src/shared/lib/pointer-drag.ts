export type DragPoint = Pick<PointerEvent, "pointerId" | "clientX" | "clientY">;
type DragStart = DragPoint & Pick<PointerEvent, "button" | "isPrimary">;

/** One pointer, one commit. Interruption restores the preview through cancel. */
export function startPointerDrag(target: HTMLElement, start: DragStart, { cursor, preview, commit, cancel }: {
  cursor: string; preview: (point: DragPoint) => void; commit: (point: DragPoint) => void; cancel: () => void;
}): { cancel: () => void; dispose: () => void } {
  if (start.button !== 0 || !start.isPrimary) return { cancel: () => {}, dispose: () => {} };
  const doc = target.ownerDocument, win = doc.defaultView;
  const oldCursor = doc.body.style.cursor, oldSelect = doc.body.style.userSelect;
  let active = true;
  const cleanup = () => {
    if (!active) return false;
    active = false;
    doc.removeEventListener("pointermove", move);
    doc.removeEventListener("pointerup", up);
    doc.removeEventListener("pointercancel", interrupted);
    doc.removeEventListener("keydown", key);
    doc.removeEventListener("visibilitychange", visibility);
    target.removeEventListener("lostpointercapture", interrupted);
    win?.removeEventListener("blur", abort);
    win?.removeEventListener("resize", abort);
    doc.body.style.cursor = oldCursor;
    doc.body.style.userSelect = oldSelect;
    if (target.hasPointerCapture?.(start.pointerId)) target.releasePointerCapture(start.pointerId);
    return true;
  };
  const abort = () => { if (cleanup()) cancel(); };
  const move = (event: Event) => { const point = event as PointerEvent; if (point.pointerId === start.pointerId) preview(point); };
  const up = (event: Event) => { const point = event as PointerEvent; if (point.pointerId === start.pointerId && cleanup()) commit(point); };
  const interrupted = (event: Event) => { if ((event as PointerEvent).pointerId === start.pointerId) abort(); };
  const key = (event: Event) => { if ((event as KeyboardEvent).key === "Escape") { event.preventDefault(); abort(); } };
  const visibility = () => { if (doc.visibilityState === "hidden") abort(); };
  doc.body.style.cursor = cursor; doc.body.style.userSelect = "none";
  doc.addEventListener("pointermove", move);
  doc.addEventListener("pointerup", up);
  doc.addEventListener("pointercancel", interrupted);
  doc.addEventListener("keydown", key);
  doc.addEventListener("visibilitychange", visibility);
  target.addEventListener("lostpointercapture", interrupted);
  win?.addEventListener("blur", abort);
  win?.addEventListener("resize", abort);
  try { target.setPointerCapture(start.pointerId); } catch { /* Document listeners still handle a detached or unsupported target. */ }
  return { cancel: abort, dispose: () => { cleanup(); } };
}
