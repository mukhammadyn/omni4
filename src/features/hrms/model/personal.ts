/**
 * ПИНФЛ → дата рождения и пол (`epPinfl` прототипа). Первая цифра —
 * век и пол: 1–2 — 1800-е, 3–4 — 1900-е, 5–6 — 2000-е; нечётная — мужчина.
 * Дальше ДДММГГ. Не 14 цифр или несуществующая дата — null.
 */
export function parsePinfl(value: string): { birth: string; gender: "male" | "female" } | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  const code = Number(digits[0]);
  if (code < 1 || code > 6) return null;
  const century = code <= 2 ? 1800 : code <= 4 ? 1900 : 2000;
  const birth = `${century + Number(digits.slice(5, 7))}-${digits.slice(3, 5)}-${digits.slice(1, 3)}`;
  const date = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== birth) return null;
  return { birth, gender: code % 2 ? "male" : "female" };
}

/**
 * «Разобрать»: первое слово — фамилия, второе — имя, остальное — отчество.
 * Наше `full_name` — «Фамилия Имя», отчества в нём обычно нет: нет хвоста —
 * отчество не трогаем, а не стираем.
 */
export function splitFullName(full: string): Record<string, string> {
  const [last = "", first = "", ...rest] = full.trim().split(/\s+/).filter(Boolean);
  return rest.length
    ? { last_name: last, first_name: first, middle_name: rest.join(" ") }
    : { last_name: last, first_name: first };
}
