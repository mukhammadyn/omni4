/** Сколько дней до конца срока документ считается «истекает». */
export const SOON_DAYS = 30;

/** Типы и размер загрузки — как в прототипе (uploadModal). */
export const UPLOAD_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"];
export const UPLOAD_MAX = 20 * 1024 * 1024;

/** Срок действия на дату `today` (оба — YYYY-MM-DD): истёк, истекает или в порядке. */
export function expiry(validUntil: string, today: string): "expired" | "soon" | "" {
  if (!validUntil) return "";
  if (validUntil < today) return "expired";
  const days = (Date.parse(validUntil) - Date.parse(today)) / 86_400_000;
  return days <= SOON_DAYS ? "soon" : "";
}

/** Что из выбранного можно загрузить, а что — нет и почему. */
export function splitUpload(files: { name: string; size: number }[]) {
  const ok: typeof files = [];
  const bad: { name: string; reason: "type" | "size" }[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!file.name.includes(".") || !UPLOAD_EXT.includes(ext)) bad.push({ name: file.name, reason: "type" });
    else if (file.size > UPLOAD_MAX) bad.push({ name: file.name, reason: "size" });
    else ok.push(file);
  }
  return { ok, bad };
}
