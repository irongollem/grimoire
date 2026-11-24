/**
 * An NPC's line in the campaign chat (#1270): a `chat` message whose metadata names the NPC who said it, so it is drawn
 * as the NPC's speech bubble (portrait, name, the line) rather than a plain bubble.
 *
 * The portrait's URL travels in the message on purpose. The reader is a player, and the NPC record may be one RLS
 * hides from them (not yet met, concealed): the message shows the face the DM chose to put in the chat and nothing
 * else of the record. Metadata is untrusted jsonb, so it is read through `readNpcSpeech`, which draws a picture only
 * for an http(s) URL and otherwise leaves the avatar to fall back to the initial.
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

function readFocal(value: unknown): { x: number; y: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** The NPC a chat line speaks for, or null for any line that is not an NPC's (a missing or non-string id is not one). */
export function readNpcSpeech(metadata: unknown): NpcSpeech | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.for_npc_id !== "string" || m.for_npc_id === "") return null;
  return {
    npcId: m.for_npc_id,
    portrait: safePortraitUrl(m.speaker_portrait_url),
    focal: readFocal(m.speaker_portrait_focal),
    ai: m.ai === true,
  };
}

/** The metadata of a line an NPC says. `ai` and its provenance ride along when a model wrote the line. */
export function npcSpeechMetadata(npcId: string, face: NpcSpeechFace, ai?: { provenance: AiProvenance | null }): NpcSpeechMetadata {
  return {
    for_npc_id: npcId,
    ...(face.portrait ? { speaker_portrait_url: face.portrait } : {}),
    ...(face.focal ? { speaker_portrait_focal: face.focal } : {}),
    ...(ai ? { ai: true, ...(ai.provenance ? { ai_provenance: ai.provenance } : {}) } : {}),
  };
}
