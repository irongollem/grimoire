// Opening the sitting (#1205): the conversation the turn belongs to, made if it is new, with the play session it sits
// in and, for the campaign's very first sitting, its opening quest.

import { startPlace, type Prologue } from "../_shared/agent/prologue.ts";
import { safely } from "./turnSupport.ts";
import type { TurnScope } from "./turnScope.ts";
import type { SessionRow } from "./turnTypes.ts";

export async function openSitting(scope: TurnScope): Promise<{ session: SessionRow; prologue: Prologue | null }> {
  const { userId, deps, body, campaign, existing, provider } = scope;
  // The campaign's very first sitting begins at its opening quest. Read for a new conversation only; a
  // failure is logged and the sitting begins as any other does.
  let prologue: Prologue | null = null;
  if (!existing) {
    try {
      prologue = await deps.loadPrologue(campaign.id);
    } catch (error) {
      console.error("agent-turn: reading the campaign's opening failed:", error);
    }
  }
  // Only a new conversation opens a session: one conversation is one sitting, and it keeps the session it began in.
  let playSession: { id: string; opened: boolean } | null = null;
  if (!existing) {
    try {
      playSession = await deps.openPlaySession(campaign.id);
    } catch (error) {
      console.error("agent-turn: opening the play session failed:", error);
    }
  }
  const session = existing ?? await deps.createSession({
    userId,
    campaignId: campaign.id,
    provider: provider.provider,
    model: provider.model,
    sceneLocationId: startPlace(body.startLocationId, prologue),
    campaignSessionId: playSession === null ? null : playSession.id,
    openedPlaySession: playSession !== null && playSession.opened,
    partyMemberId: body.characterId === undefined ? null : body.characterId,
    narratorVoice: body.narratorVoice === undefined ? null : body.narratorVoice,
  });
  // Before the quests are read for this turn, so the narrator sees the opening quest in play. Idempotent, so
  // a first turn that is not kept and is sent again does not open it twice.
  if (prologue !== null) {
    const opening = prologue;
    await safely(() => deps.beginPrologue(campaign.id, opening));
  }
  return { session, prologue };
}
