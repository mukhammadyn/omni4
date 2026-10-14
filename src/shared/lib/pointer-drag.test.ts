import { expect, test, vi } from "vitest";
import { startPointerDrag } from "./pointer-drag";
function environment() {
  const doc = Object.assign(new EventTarget(), { body: { style: { cursor: "default", userSelect: "text" } }, defaultView: new EventTarget(), visibilityState: "visible" });
  let captured: number | null = null;
  const target = Object.assign(new EventTarget(), { ownerDocument: doc, setPointerCapture: (id: number) => { captured = id; }, hasPointerCapture: (id: number) => captured === id, releasePointerCapture: () => { captured = null; } });
  const preview = vi.fn(), commit = vi.fn(), cancel = vi.fn();
  const controller = startPointerDrag(target as unknown as HTMLElement, { pointerId: 7, clientX: 20, clientY: 30, button: 0, isPrimary: true }, { cursor: "col-resize", preview, commit, cancel });
  const fire = (type: string, pointerId = 7, receiver: EventTarget = doc) => receiver.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId, clientX: 60, clientY: 70 }));
  return { doc, target, preview, commit, cancel, controller, fire, captured: () => captured };
}
test("a drag ignores other pointers and commits exactly once, restoring styles", () => {
  const e = environment(); expect(e.captured()).toBe(7);
  e.fire("pointermove", 9); e.fire("pointerup", 9); expect(e.preview).not.toHaveBeenCalled(); expect(e.commit).not.toHaveBeenCalled();
  e.fire("pointermove"); expect(e.preview).toHaveBeenCalledOnce();
  e.fire("pointerup"); e.fire("pointerup"); e.fire("pointermove");
  expect(e.commit).toHaveBeenCalledOnce(); expect(e.cancel).not.toHaveBeenCalled(); expect(e.captured()).toBeNull();
  expect(e.doc.body.style).toEqual({ cursor: "default", userSelect: "text" });
});
test("pointer cancellation, lost capture, blur and Escape cancel without committing", () => {
  for (const interruption of ["pointercancel", "lostpointercapture", "blur", "Escape", "visibility"]) {
    const e = environment();
    if (interruption === "Escape") e.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
    else if (interruption === "visibility") { e.doc.visibilityState = "hidden"; e.doc.dispatchEvent(new Event("visibilitychange")); }
    else e.fire(interruption, 7, interruption === "lostpointercapture" ? e.target : interruption === "blur" ? e.doc.defaultView : e.doc);
    e.fire("pointerup"); expect(e.commit).not.toHaveBeenCalled(); expect(e.cancel).toHaveBeenCalledOnce(); expect(e.doc.body.style.cursor).toBe("default");
  }
});
test("unmount disposal removes listeners without calling state callbacks", () => {
  const e = environment(); e.controller.dispose(); e.fire("pointermove"); e.fire("pointerup");
  expect(e.preview).not.toHaveBeenCalled(); expect(e.commit).not.toHaveBeenCalled(); expect(e.cancel).not.toHaveBeenCalled(); expect(e.captured()).toBeNull();
});
