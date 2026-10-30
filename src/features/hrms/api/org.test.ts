import { describe, expect, it } from "vitest";
import { managerByPosition, type Person } from "./org";

const p = (id: string, positionId: string, managerId = "") => ({ id, positionId, managerId }) as Person;

describe("managerByPosition", () => {
  const parent = new Map([["mobile", "chapter"], ["chapter", "cto"], ["cto", "ceo"], ["ceo", ""]]);

  it("берёт свой руководитель, иначе ближайшего по должности выше", () => {
    const ceo = p("1", "ceo");
    const dev = p("2", "mobile");
    const own = p("3", "mobile", "9");
    const of = managerByPosition([ceo, dev, own], parent);
    expect(of(dev)).toBe("1");
    expect(of(own)).toBe("9");
    expect(of(ceo)).toBeUndefined();
  });

  it("не зацикливается на цикле должностей", () => {
    const of = managerByPosition([p("1", "a")], new Map([["a", "b"], ["b", "a"]]));
    expect(of(p("2", "a"))).toBe("1");
    expect(of(p("1", "a"))).toBeUndefined();
  });
});
