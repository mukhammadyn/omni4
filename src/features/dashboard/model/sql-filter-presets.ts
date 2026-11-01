export type SqlFilterPreset = { label:string; field:string; op:"is"|"after"|"before"|"contains"; value:string };
export function parseSqlFilterPresets(raw:unknown):SqlFilterPreset[] {
  if(!Array.isArray(raw)) return [];
  return raw.slice(0,8).flatMap(item=>{
    if(!item || typeof item!=="object") return [];
    const v=item as Record<string,unknown>;
    return typeof v.label==="string" && typeof v.field==="string" && typeof v.value==="string" && ["is","after","before","contains"].includes(v.op as string) ? [{label:v.label.slice(0,80),field:v.field.slice(0,200),op:v.op as SqlFilterPreset["op"],value:v.value.slice(0,200)}] : [];
  });
}
