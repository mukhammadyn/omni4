import { describe, expect, it, vi } from "vitest";
import { newChart } from "@/features/item";
import type { Field } from "@/features/table";
import type { Widget } from "./dashboard";
import { BUILDER_FIELD_MIME, fieldRole, startFieldDrag, overFieldSlot, dropField } from "./builder-drag";
const text = { slug: "status", type: "SINGLE_LINE" } as Field;
const date = { slug: "date", type: "DATE" } as Field;
const amount = { slug: "amount", type: "NUMBER" } as Field;
const fields = [text, date, amount];
const draft = (): Widget => ({ ...newChart(), tableSlug: "events", filters: {}, answers: {} });
function event(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
    get types() { return [...values.keys()]; },
    getData: vi.fn((type: string) => values.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => { values.set(type, value); }),
    effectAllowed: "uninitialized" as DataTransfer["effectAllowed"], dropEffect: "none" as DataTransfer["dropEffect"],
  } };
}
describe("chart builder drag handlers used by BuilderFields and BuilderSlots", () => {
  it("writes a scoped payload and permits copy during protected dragover without reading data", () => {
    const widget = draft(), e = event();
    startFieldDrag(e, widget, date, false);
    expect(JSON.parse(e.dataTransfer.getData(BUILDER_FIELD_MIME))).toMatchObject({ version: 1, field: "date" });
    expect(e.dataTransfer.effectAllowed).toBe("copy");
    e.dataTransfer.getData.mockClear();
    overFieldSlot(e, widget, "group", false);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.dataTransfer.dropEffect).toBe("copy");
    expect(e.dataTransfer.getData).not.toHaveBeenCalled();
  });
  it("updates only grouping/date bucket through the real drop callback", () => {
    const widget = { ...draft(), title: "Keep title", filters: { status: { op: "any" as const, values: ["Done"] } } };
    const e = event(); startFieldDrag(e, widget, date, false);
    let state: Widget = widget; const change = vi.fn((patch: Partial<Widget>) => { state = { ...state, ...patch }; });
    dropField(e, widget, fields, "group", false, change);
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledWith({ groupSlug: "date", groupBucket: "month" });
    expect(state).toMatchObject({ groupSlug: "date", groupBucket: "month", title: "Keep title", filters: widget.filters });
  });
  it("keeps dimensions draggable when the click destination is Measure", () => {
    const widget = draft();
    expect(fieldRole(widget, text, "value", false)).toBe("group");
    const e = event(); startFieldDrag(e, widget, text, false);
    expect(e.dataTransfer.types).toContain(BUILDER_FIELD_MIME);
    const change = vi.fn(); dropField(e, widget, fields, "group", false, change);
    expect(change).toHaveBeenCalledWith({ groupSlug: "status", groupBucket: "" });
  });
  it("rejects foreign, malformed, wrong-source and removed-field payloads", () => {
    const widget = draft(), change = vi.fn();
    for (const payload of [event({ "text/plain": "status" }), event({ [BUILDER_FIELD_MIME]: "{" }), event({ [BUILDER_FIELD_MIME]: "null" })]) dropField(payload, widget, fields, "group", false, change);
    const e = event(); startFieldDrag(e, widget, text, false);
    dropField(e, { ...widget, tableSlug: "other" }, fields, "group", false, change);
    dropField(e, widget, [], "group", false, change);
    dropField(e, widget, fields, "group", true, change);
    expect(change).not.toHaveBeenCalled();
  });
  it("rejects invalid target roles and text measures, but accepts numeric values", () => {
    const widget = draft(), change = vi.fn(), e = event();
    startFieldDrag(e, widget, text, false); dropField(e, widget, fields, "value", false, change);
    dropField(e, { ...widget, kind: "stat" }, fields, "group", false, change);
    expect(change).not.toHaveBeenCalled();
    startFieldDrag(e, widget, amount, false); dropField(e, widget, fields, "value", false, change);
    expect(change).toHaveBeenCalledWith({ valueSlug: "amount", aggregation: "sum" });
    const foreign = event({ "text/plain": "amount" }); overFieldSlot(foreign, widget, "value", false);
    expect(foreign.preventDefault).not.toHaveBeenCalled();
  });
  it("prevents record-column duplicates and allows ordering returned SQL columns", () => {
    const widget: Widget = { ...draft(), type: "records", columns: ["status"] }, e = event(), change = vi.fn();
    startFieldDrag(e, widget, text, false); dropField(e, widget, fields, "columns", false, change);
    expect(change).toHaveBeenCalledWith({ columns: ["status"] });
    const sql = event(); startFieldDrag(sql, widget, text, true);
    expect(sql.preventDefault).not.toHaveBeenCalled();
    expect(sql.dataTransfer.types).toContain(BUILDER_FIELD_MIME);
    change.mockClear();
    dropField(sql, widget, fields, "columns", true, change);
    expect(change).toHaveBeenCalledWith({ columns: ["status"] });
    change.mockClear();
    dropField(sql, widget, fields, "columns", false, change);
    expect(change).not.toHaveBeenCalled();
  });
});
