// What an NPC and the party have told each other (#1019, table npc_memories).
//
// The kinds live here rather than in src/types because the Voice Coach's edge
// function formats memories for its prompt and a Deno function cannot resolve
// `@/*`; the app imports them through `@edge-shared/npcMemories`. The list must
// match the table's CHECK constraint (migration 20261012105632).

import type { SupabaseClient } from "@supabase/supabase-js";

export const NPC_MEMORY_KINDS = [
  "revealed",
  "learned",
  "promise",
  "deceived",
  "attitude",
  "event",
] as const;

export type NpcMemoryKind = (typeof NPC_MEMORY_KINDS)[number];

// ── Prompt formatting ─────────────────────────────────────────────────────────
//
// One formatter for every model that speaks as an NPC: the Voice Coach edge
// function calls it on the server, and the client's BYOK path imports the very
// same function, so the two can never disagree about what the model is told.
// It stays pure (no Deno or https imports) for that reason.

/** How each kind reads inside a prompt line. */
export const NPC_MEMORY_PROMPT_LABELS: Record<NpcMemoryKind, string> = {
  revealed: "They told the party",
  learned: "The party told them",
  promise: "Promise",
  deceived: "Deception (a lie told and believed)",
  attitude: "Attitude",
  event: "Event",
};

/** A memory body longer than this is cut with an ellipsis; bounds prompt cost. */
export const MEMORY_BODY_CHAR_LIMIT = 280;

/** How many memories a prompt carries. Callers take the newest N, oldest first. */
export const MEMORY_PROMPT_LIMIT = 12;

export interface PromptNpcMemory {
  kind: NpcMemoryKind;
  body: string;
  created_at: string;
  /** "Session 14" or the session's title; null when the memory has no session. */
  sessionLabel: string | null;
  /** Names of the party members who were present. */
  present: string[];
}

export interface NpcMemoryIdentity {
  name: string;
  disguise_name: string | null;
  is_revealed: boolean;
}

const MEMORY_HEADER =
  "What has already passed between them and the party (oldest first; stay consistent with it, never contradict it, and do not repeat what was already said as if new):";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Disguise rule: while the NPC is disguised and unrevealed, the true name must
 * not reach the model in any form, and a DM-written memory ("Bram admitted...")
 * is exactly where it would leak from.
 */
function maskTrueName(body: string, identity: NpcMemoryIdentity): string {
  if (!identity.disguise_name || identity.is_revealed) return body;
  const trueName = identity.name.trim();
  if (!trueName) return body;
  // The full name first, then each 3+ character part of it ("bram sold the map"
  // exposes a "Bram Ashford" just as surely as the whole name), longest first.
  const parts = trueName.split(/\s+/).filter((t) => t.length >= 3);
  const variants = [...new Set([trueName, ...parts])].sort((x, y) => y.length - x.length);
  const alternation = variants.map(escapeRegExp).join("|");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternation})(?![\\p{L}\\p{N}_])`, "giu");
  return body.replace(pattern, identity.disguise_name);
}

function capBody(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MEMORY_BODY_CHAR_LIMIT) return oneLine;
  return `${oneLine.slice(0, MEMORY_BODY_CHAR_LIMIT - 1).trimEnd()}…`;
}

/**
 * The memory block for an NPC prompt, or "" when there is nothing to say.
 * `memories` must already be oldest first and limited to MEMORY_PROMPT_LIMIT.
 */
export function formatNpcMemories(memories: PromptNpcMemory[], identity: NpcMemoryIdentity): string {
  if (memories.length === 0) return "";
  const lines = memories.map((m) => {
    const session = m.sessionLabel ? `[${m.sessionLabel}] ` : "";
    const present = m.present.length > 0 ? ` (${m.present.join(", ")} present)` : "";
    const body = capBody(maskTrueName(m.body, identity));
    return `- ${session}${NPC_MEMORY_PROMPT_LABELS[m.kind]}${present}: ${body}`;
  });
  return `${MEMORY_HEADER}\n${lines.join("\n")}`;
}

// ── Loading ───────────────────────────────────────────────────────────────────

interface MemoryRow {
  kind: NpcMemoryKind;
  body: string;
  created_at: string;
  session_id: string | null;
  party_member_ids: string[];
}

/** "Session 14", else the session's title, else nothing: sessionShortLabel's rule, which Deno cannot import. */
function promptSessionLabel(number: number | null, title: string | null): string | null {
  if (number !== null) return `Session ${number}`;
  return title?.trim() || null;
}

/**
 * The newest MEMORY_PROMPT_LIMIT memories of an NPC, oldest first, with session
 * labels and the names of who was present resolved within the campaign. The
 * edge function passes its service-role client and the BYOK path the user's,
 * so both send the model the same thing. Failure is logged and answered with no
 * memories: the Voice Coach is felt live at the table.
 */
export async function loadPromptMemories(
  client: SupabaseClient,
  npcId: string,
  campaignId: string,
): Promise<PromptNpcMemory[]> {
  try {
    const { data, error } = await client
      .from("npc_memories")
      .select("kind, body, created_at, session_id, party_member_ids")
      .eq("npc_id", npcId)
      .order("created_at", { ascending: false })
      .limit(MEMORY_PROMPT_LIMIT);
    if (error) throw error;
    const rows = (data as MemoryRow[]).reverse();
    if (rows.length === 0) return [];

    const sessionIds = [...new Set(rows.flatMap((r) => (r.session_id ? [r.session_id] : [])))];
    const memberIds = [...new Set(rows.flatMap((r) => r.party_member_ids))];
    const [sessions, members] = await Promise.all([
      sessionIds.length
        ? client.from("campaign_sessions").select("id, number, title").in("id", sessionIds).eq("campaign_id", campaignId)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length
        ? client.from("party_members").select("id, name").in("id", memberIds).eq("campaign_id", campaignId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sessions.error) throw sessions.error;
    if (members.error) throw members.error;

    const labels = new Map(
      (sessions.data as { id: string; number: number | null; title: string | null }[]).map(
        (row) => [row.id, promptSessionLabel(row.number, row.title)] as const,
      ),
    );
    const names = new Map((members.data as { id: string; name: string }[]).map((m) => [m.id, m.name] as const));

    return rows.map((r) => ({
      kind: r.kind,
      body: r.body,
      created_at: r.created_at,
      sessionLabel: r.session_id ? (labels.get(r.session_id) ?? null) : null,
      present: r.party_member_ids.flatMap((id) => {
        const name = names.get(id);
        return name ? [name] : [];
      }),
    }));
  } catch (e) {
    console.error("NPC voice: memory read failed, continuing without memories:", e);
    return [];
  }
}
