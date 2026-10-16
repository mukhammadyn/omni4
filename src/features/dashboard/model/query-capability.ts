/** An endpoint from another project/environment or protocol cannot enable execution. */
export function queryCapability(value: unknown, projectId: string | null | undefined, environmentId: string | null | undefined, menuId: string): { enabled: boolean; limit: number } {
  if (!value || typeof value !== "object") return { enabled: false, limit: 1000 };
  const caps = value as Record<string, unknown>;
  const valid = Boolean(projectId && environmentId && menuId) && caps["protocol_version"] === 3 && caps["project_id"] === projectId && caps["environment_id"] === environmentId && caps["menu_id"] === menuId && typeof caps["row_limit"] === "number" && Number.isInteger(caps["row_limit"]) && caps["row_limit"] >= 1 && caps["row_limit"] <= 1000 && caps["statement_timeout_ms"] === 5000;
  return { enabled: valid && caps["enabled"] === true, limit: valid ? caps["row_limit"] as number : 1000 };
}
