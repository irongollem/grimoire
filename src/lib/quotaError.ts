/**
 * Returns true when the error came from the enforce_quota DB trigger.
 * PostgreSQL RAISE EXCEPTION 'quota_exceeded' surfaces as message = 'quota_exceeded'.
 */
export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as Record<string, unknown>)["message"] === "quota_exceeded";
}
