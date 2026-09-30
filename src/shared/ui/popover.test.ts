import { describe, expect, it } from "vitest";
import { placement } from "./popover";

const view = { width: 1000, height: 800 };

/** Кнопка 200×36 с левым верхним углом в (x, y). */
const anchor = (x: number, y: number, width = 200) => ({
  top: y,
  bottom: y + 36,
  left: x,
  right: x + width,
});

describe("placement", () => {
  it("ставит меню под кнопкой, когда снизу помещается", () => {
    const spot = placement({
      anchor: anchor(100, 100),
      width: 200,
      height: 300,
      view,
      align: "start",
    });

    expect(spot.top).toBe(140);
    expect(spot.bottom).toBeUndefined();
    expect(spot.left).toBe(100);
  });

  it("разворачивает вверх, когда снизу не помещается, а сверху места больше", () => {
    const spot = placement({
      anchor: anchor(100, 600),
      width: 200,
      height: 400,
      view,
      align: "start",
    });

    // Нижним краем к кнопке: 800 - 600 + 4.
    expect(spot.bottom).toBe(204);
    expect(spot.top).toBeUndefined();
    expect(spot.maxHeight).toBe(588);
  });

  it("оставляет меню внизу, когда сверху места ещё меньше", () => {
    const spot = placement({
      anchor: anchor(100, 300),
      width: 200,
      height: 900,
      view,
      align: "start",
    });

    expect(spot.top).toBe(340);
    expect(spot.maxHeight).toBe(452);
  });

  it("подбирает меню внутрь экрана, когда справа не помещается", () => {
    const spot = placement({
      anchor: anchor(900, 100),
      width: 300,
      height: 100,
      view,
      align: "start",
    });

    expect(spot.left).toBe(692);
  });

  it("прижимает правым краем к кнопке при align=end", () => {
    const spot = placement({
      anchor: anchor(400, 100),
      width: 300,
      height: 100,
      view,
      align: "end",
    });

    expect(spot.left).toBe(300);
  });

  it("не даёт меню уехать за левый край", () => {
    const spot = placement({
      anchor: anchor(4, 100, 40),
      width: 300,
      height: 100,
      view,
      align: "end",
    });

    expect(spot.left).toBe(8);
  });

  it("оставляет высоту даже у кнопки, прижатой к низу окна", () => {
    const spot = placement({
      anchor: anchor(100, 780),
      width: 200,
      height: 300,
      view,
      align: "start",
    });

    expect(spot.maxHeight).toBeGreaterThanOrEqual(96);
  });
});

it("с minBelow держится снизу, пока там есть этот минимум, и ужимается по месту", () => {
  const base = {
    anchor: { top: 500, bottom: 536, left: 100, right: 136 },
    width: 400,
    height: 480,
    view: { width: 1440, height: 900 },
    align: "start" as const,
  };

  // Без minBelow: 352 снизу не хватает, сверху 488 — разворот вверх.
  expect(placement(base).bottom).toBeDefined();
  // С minBelow 260: снизу 352 — остаёмся под кнопкой, высота по месту.
  const spot = placement({ ...base, minBelow: 260 });
  expect(spot.top).toBe(540);
  expect(spot.maxHeight).toBe(352);
  // Совсем мало места снизу — всё-таки вверх.
  expect(placement({ ...base, minBelow: 400 }).bottom).toBeDefined();
});

