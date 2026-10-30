/**
 * Текст разговора из `pbx_calls.transcript`. Пишет его воркер
 * pbx-transcript-worker (cmd/worker/transcribe.go, `Transcript`): JSON
 * (бывает строкой) с дорожкой на канал — `speaker` operator / client /
 * unknown, сегменты с `from` в мс от начала записи. Каналы распознаются
 * порознь, диалог собираем сами: сегменты всех дорожек по времени.
 * У дорожки без сегментов — её сплошной текст одной репликой.
 */
export type TranscriptLine = { speaker: "operator" | "client" | "unknown"; text: string; from: number };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function parseTranscript(value: unknown): TranscriptLine[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  const tracks = record(raw)?.["tracks"];
  if (!Array.isArray(tracks)) return [];

  return tracks
    .flatMap((entry): TranscriptLine[] => {
      const track = record(entry);
      if (!track) return [];
      const name = text(track["speaker"]);
      const speaker = name === "operator" || name === "client" ? name : "unknown";
      const segments = Array.isArray(track["segments"]) ? track["segments"] : [];
      const lines = segments.flatMap((item): TranscriptLine[] => {
        const segment = record(item);
        const line = text(segment?.["text"]);
        const from = Number(segment?.["from"]);
        return line ? [{ speaker, text: line, from: Number.isFinite(from) ? from : 0 }] : [];
      });
      const whole = text(track["text"]);
      return lines.length ? lines : whole ? [{ speaker, text: whole, from: 0 }] : [];
    })
    .sort((a, b) => a.from - b.from);
}
