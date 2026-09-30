import { expect, test } from "vitest";
import { emojiImage, toEmoji } from "./emoji";

test("в выбор идут только эмодзи с картинкой Apple, без служебных и устаревших, по порядку набора", () => {
  const list = toEmoji([
    { image: "b.png", name: "B", short_names: ["b"], category: "Objects", sort_order: 2, has_img_apple: true },
    { image: "a.png", name: "A", short_names: ["a"], category: "Smileys & Emotion", sort_order: 1, has_img_apple: true },
    { image: "skin.png", category: "Component", sort_order: 0, has_img_apple: true },
    { image: "old.png", category: "Objects", sort_order: 3, has_img_apple: true, obsoleted_by: "1F600" },
    { image: "noimg.png", category: "Objects", sort_order: 4, has_img_apple: false },
  ]);

  expect(list.map((item) => item.image)).toEqual(["a.png", "b.png"]);
  // Смайлы и люди — один раздел, как у Notion.
  expect(list[0]?.section).toBe("people");
});

test("оттенок кожи берётся, только если у эмодзи он есть, и только одиночный", () => {
  const [hand, rocket] = toEmoji([
    {
      image: "270b.png",
      category: "People & Body",
      has_img_apple: true,
      skin_variations: {
        "1F3FB": { image: "270b-1f3fb.png", has_img_apple: true },
        "1F3FB-1F3FC": { image: "pair.png", has_img_apple: true },
      },
    },
    { image: "1f680.png", category: "Travel & Places", has_img_apple: true },
  ]);

  expect(emojiImage(hand!, "1F3FB")).toBe("270b-1f3fb.png");
  expect(emojiImage(hand!, "1F3FC")).toBe("270b.png");
  expect(emojiImage(rocket!, "1F3FB")).toBe("1f680.png");
});
