import { describe, expect, it } from "vitest";
import { SDK_LANGUAGES, sdkCode } from "./sdk";

describe("sdkCode", () => {
  it.each(SDK_LANGUAGES.map((language) => language.id))(
    "%s: адрес таблицы, вход ключом и тело у удаления",
    (language) => {
      const code = sdkCode(language, "https://api.test/", "deal", "P-key");

      // Слэш на конце адреса не удваивается.
      expect(code).toContain("https://api.test/v2/items/deal");
      expect(code).not.toContain("test//v2");
      expect(code).toContain("API-KEY");
      expect(code).toContain("P-key");
      expect(code).toMatch(/DELETE|delete/);
      expect(code).toMatch(/body: "\{\}"|json=\{\}|-d '\{\}'/);
    },
  );
});
