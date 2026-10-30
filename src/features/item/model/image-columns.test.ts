import { expect, test } from "vitest";
import type { Field } from "@/features/table";
import { mergeImageColumns } from "./image-columns";

const f = (id: string, type: string) => ({ id, slug: id, type }) as Field;

test("image joins the nearest text column, right one on a tie", () => {
  const { columns, imageOf } = mergeImageColumns([f("photo", "PHOTO"), f("name", "SINGLE_LINE"), f("age", "NUMBER")]);
  expect(columns.map((c) => c.id)).toEqual(["name", "age"]);
  expect(imageOf.get("name")?.id).toBe("photo");

  const tie = mergeImageColumns([f("title", "SINGLE_LINE"), f("logo", "PHOTO"), f("name", "SINGLE_LINE")]);
  expect(tie.imageOf.get("name")?.id).toBe("logo");
});

test("no text column — image stays a column", () => {
  const { columns, imageOf } = mergeImageColumns([f("photo", "PHOTO"), f("age", "NUMBER")]);
  expect(columns.map((c) => c.id)).toEqual(["photo", "age"]);
  expect(imageOf.size).toBe(0);
});
