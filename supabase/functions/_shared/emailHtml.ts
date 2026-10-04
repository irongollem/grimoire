/**
 * The one HTML escaper for every email template. Pure, no Deno imports, so
 * vitest covers it directly. Every string that came from a user, or that a
 * link is built from, goes through this before it lands in an HTML body.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
