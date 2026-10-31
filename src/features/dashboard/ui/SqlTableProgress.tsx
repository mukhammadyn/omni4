/** A numeric table cell with a bounded visual bar and an unbounded actual label. */
export function SqlTableProgress({ value, maximum = 100, suffix = "", language }: { value: unknown; maximum?: number | undefined; suffix?: string | undefined; language: string }) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number) || !Number.isFinite(maximum) || maximum <= 0) return <span>—</span>;
  const percent = Math.max(0, Math.min(100, number / maximum * 100));
  const label = `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(number)}${suffix}`;
  return <span className="inline-flex w-full min-w-0 items-center gap-2"><span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.max(0, Math.min(maximum, number))} aria-valuetext={label} className="h-1.5 min-w-4 max-w-20 flex-1 overflow-hidden rounded-full bg-surface-hover"><span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></span><span className="shrink-0 tabular-nums">{label}</span></span>;
}
