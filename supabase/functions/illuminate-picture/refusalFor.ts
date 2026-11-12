/**
 * Why illuminate-picture refuses a caller, as a pure decision so each refusal can be tested without Deno
 * (#1176 story 10). Order matters: a non-DM learns nothing about the campaign's AI setting.
 * `likenessAcknowledged` only matters for the actions that restyle a picture.
 */
import { needsLikenessAck, type IlluminateAction } from "./validateIlluminateRequest.ts";

export interface RefusalInput {
  isDm: boolean;
  aiEnabled: boolean;
  likenessAcknowledged: boolean;
  action: IlluminateAction;
}

export function refusalFor(input: RefusalInput): { error: string; status: number } | null {
  if (!input.isDm) return { error: "forbidden", status: 403 };
  if (!input.aiEnabled) return { error: "ai_disabled", status: 403 };
  if (needsLikenessAck(input.action) && !input.likenessAcknowledged) {
    return { error: "likeness_acknowledgement_required", status: 403 };
  }
  return null;
}
