/**
 * PostgREST access for the scripts that write a book's content into one
 * campaign (`import-statblocks.ts`, `scriptorium-book.ts`; epic #1115). The
 * target (local stack or production, and its service key) comes from
 * `resolveServiceTarget` in `lib/dev-stack.ts`; everything here only talks to it.
 * Errors carry the status and PostgREST's message, never a response body,
 * which could echo row content.
 */
import { type ServiceTarget as Target, serviceHeaders as headers } from "./dev-stack.ts";
import { normalizeName } from "./name-matching.ts";

export async function request(
  target: Target,
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(`${target.origin}/rest/v1/${path}`, {
    method,
    headers: headers(target, { "Content-Type": "application/json", Prefer: "return=representation", ...extra }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const parsed = JSON.parse(await response.text()) as { message?: string };
      if (parsed.message) message += ` ${parsed.message}`;
    } catch {
      // Not JSON: status alone.
    }
    throw new Error(`${method} ${path.split("?")[0]} failed (${message}).`);
  }
  // `return=minimal` and 204 answers have no body.
  const text = await response.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

/** Every row of a filtered GET, a page at a time; `path` already holds its `?` filters. */
export async function readAll<T>(target: Target, path: string): Promise<T[]> {
  const rows: T[] = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const batch = (await request(target, "GET", `${path}&order=id&limit=${page}&offset=${offset}`)) as T[];
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

/** Refuses a campaign that does not exist on the target or that `userId` does not own. */
export async function assertCampaignOwner(target: Target, campaignId: string, userId: string): Promise<void> {
  const rows = (await request(target, "GET", `campaigns?id=eq.${campaignId}&select=id,user_id`)) as { id: string; user_id: string }[];
  if (rows.length === 0) throw new Error(`Campaign ${campaignId} does not exist on ${target.label}.`);
  if (rows[0].user_id !== userId) throw new Error(`Campaign ${campaignId} is not owned by ${userId} on ${target.label}.`);
}

/** Portrait URL by normalised NPC name; a name shared by NPCs with different portraits is left out as ambiguous. */
export async function loadNpcPortraits(
  target: Target,
  campaignId: string,
): Promise<{ portraits: Map<string, string>; ambiguous: Set<string> }> {
  const rows = await readAll<{ name: string; portrait_url: string | null }>(target, `npcs?campaign_id=eq.${campaignId}&select=id,name,portrait_url`);
  const portraits = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    if (!row.portrait_url) continue;
    const key = normalizeName(row.name);
    if (portraits.has(key) && portraits.get(key) !== row.portrait_url) ambiguous.add(key);
    portraits.set(key, row.portrait_url);
  }
  for (const key of ambiguous) portraits.delete(key);
  return { portraits, ambiguous };
}
