/**
 * An NPC's line in the campaign chat (#1270): a `chat` message whose metadata names the NPC who said it, so it is drawn
 * as the NPC's speech bubble (portrait, name, the line) rather than a plain bubble.
 *
 * The portrait's URL travels in the message on purpose. The reader is a player, and the NPC record may be one RLS
 * hides from them (not yet met, concealed): the message shows the face the DM chose to put in the chat and nothing
 * else of the record, and that face is what players may see (`getNpcPlayerFace`), never the DM's view of it. Metadata
 * is untrusted jsonb written by any member, so it is read through `readNpcSpeech`: a line draws as an NPC only when a
 * DM of the campaign sent it, and a picture is drawn only from an https address on the app's own image hosts (a player
 * could otherwise forge a bubble, or point the picture at a server of their own and read every viewer's address).
 * Otherwise the avatar falls back to the initial.
 */
import type { AiProvenance } from "@/ai/provenance";
import type { NpcSpeechMetadata } from "@/types/chat.types";

export interface NpcSpeechFace {
  portrait: string | null;
  focal: { x: number; y: number } | null;
}

/** What a chat line carries about the NPC who spoke it, read safely. */
export interface NpcSpeech extends NpcSpeechFace {
  npcId: string;
  ai: boolean;
}

/** The URL of a picture that may be drawn, else null. Only http(s): a `javascript:` or `data:` value is never a source. */
export function safePortraitUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

/** The origins the app serves its own pictures from: the Supabase storage origin and the asset CDN, as configured. */
function ownImageOrigins(): string[] {
  const origins: string[] = [];
  for (const raw of [import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_ASSET_CDN_URL]) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    try {
      origins.push(new URL(raw.trim()).origin);
    } catch {
      // A malformed configured origin allows nothing.
    }
  }
  return origins;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The URL of an NPC's picture in a chat line that may be drawn, else null: https (a configured loopback origin in local
 * development is the one exception) and on one of the app's own image hosts. Any other host, and plain http, is refused.
 */
export function ownHostPortraitUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const secure = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
    return secure && ownImageOrigins().includes(url.origin) ? value : null;
  } catch {
    return null;
  }
}

function readFocal(value: unknown): { x: number; y: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * The NPC a chat line speaks for, or null for any line that is not an NPC's (a missing or non-string id is not one).
 * `fromDm` says the line was sent by a DM of the campaign (the owner or a co-DM): only a DM speaks for an NPC, so a
 * line any other member wrote is an ordinary line whatever its metadata claims.
 */
export function readNpcSpeech(metadata: unknown, fromDm: boolean): NpcSpeech | null {
  if (!fromDm) return null;
  if (typeof metadata !== "object" || metadata === null) return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.for_npc_id !== "string" || m.for_npc_id === "") return null;
  return {
    npcId: m.for_npc_id,
    portrait: ownHostPortraitUrl(m.speaker_portrait_url),
    focal: readFocal(m.speaker_portrait_focal),
    ai: m.ai === true,
  };
}

/** The metadata of a line an NPC says. `ai` and its provenance ride along when a model wrote the line. */
export function npcSpeechMetadata(npcId: string, face: NpcSpeechFace, ai?: { provenance: AiProvenance | null }): NpcSpeechMetadata {
  const portrait = ownHostPortraitUrl(face.portrait);
  return {
    for_npc_id: npcId,
    ...(portrait ? { speaker_portrait_url: portrait } : {}),
    ...(face.focal ? { speaker_portrait_focal: face.focal } : {}),
    ...(ai ? { ai: true, ...(ai.provenance ? { ai_provenance: ai.provenance } : {}) } : {}),
  };
}
