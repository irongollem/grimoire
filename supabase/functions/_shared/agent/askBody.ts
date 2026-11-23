// The request Ask accepts (#1253), checked field by field: the body comes from a browser, so nothing in it is trusted
// until it has been read here. Ids are checked against the campaign later (`askTurn.ts`); here only their shape.

import type { AskContext, AskRecordType, AskTurnBody } from "./askContract.ts";
import { ASK_MESSAGE_MAX } from "./askTypes.ts";
import { UUID_RE } from "../uuid.ts";

/** Every record kind a context may name; the contract's `AskRecordType`, as values. */
export const ASK_RECORD_TYPES: readonly AskRecordType[] = [
  "npc", "monster", "item", "spell", "location", "faction", "quest", "quest_beat", "encounter", "deity",
  "party_member", "note", "canon", "room",
];

export function isAskRecordType(value: unknown): value is AskRecordType {
  return typeof value === "string" && (ASK_RECORD_TYPES as readonly string[]).includes(value);
}

const ROUTE_MAX = 200;

function parseContext(raw: unknown): AskContext | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const { route, record } = raw as Record<string, unknown>;
  if (typeof route !== "string" || route.length > ROUTE_MAX) return null;
  if (record === undefined || record === null) return { route };
  if (typeof record !== "object" || Array.isArray(record)) return null;
  const { type, id } = record as Record<string, unknown>;
  // A record the contract does not know is not an error worth a refusal: the page asked about where it is, and the
  // route says that. It is dropped, never read.
  if (!isAskRecordType(type) || typeof id !== "string" || !UUID_RE.test(id)) return { route };
  return { route, record: { type, id } };
}

export type ParsedAskBody = { ok: true; body: AskTurnBody } | { ok: false };

export function parseAskBody(raw: unknown): ParsedAskBody {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false };
  const b = raw as Record<string, unknown>;
  if (typeof b.campaignId !== "string" || !UUID_RE.test(b.campaignId)) return { ok: false };
  if (b.sessionId !== undefined && (typeof b.sessionId !== "string" || !UUID_RE.test(b.sessionId))) return { ok: false };
  if (typeof b.message !== "string") return { ok: false };
  const message = b.message.trim();
  if (message === "" || message.length > ASK_MESSAGE_MAX) return { ok: false };
  const context = parseContext(b.context);
  if (context === null) return { ok: false };
  return {
    ok: true,
    body: {
      campaignId: b.campaignId,
      ...(b.sessionId === undefined ? {} : { sessionId: b.sessionId as string }),
      message,
      ...(context === undefined ? {} : { context }),
    },
  };
}
