// Leaving the AI table (#1021): the player gets up, and that is a real act. No Deno and no Supabase in here;
// everything with I/O comes in through `AgentLeaveDeps`, so the rules are tested against an in-memory store
// (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// Gate order, like `agent-turn`: the caller from the token (in index.ts), then the conversation is the caller's own,
// then work. A model is never called: the record of the sitting is the plain facts the narrator already filed.

import { unfinishedBusiness, type Unfinished } from "../_shared/agent/unfinished.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import { noteDocument } from "./note.ts";
import { UUID_RE } from "../_shared/agent/parse.ts";

export interface LeaveRefusal {
  status: number;
  error: string;
}

export interface LeaveSession {
  id: string;
  user_id: string;
  campaign_id: string;
  provider: string;
  model: string;
  /** The play session this conversation is a sitting of; null when it could not be opened. */
  campaign_session_id: string | null;
  opened_play_session: boolean;
  party_member_id: string | null;
}

export interface AgentLeaveDeps {
  /** By id alone: the handler decides whether it belongs to the caller. */
  loadSession(sessionId: string): Promise<LeaveSession | null>;
  /**
   * Marks the conversation left. False when it already was, which is how two leaves at once tell who got there
   * first: only the one that gets true goes on to end the session and write the note.
   */
  markLeft(sessionId: string): Promise<boolean>;
  /**
   * Ends the pressure the scene was under: the conversation lets go of its clock, and a clock the table itself
   * made is deleted with it. A clock still counting after the player got up would count for nobody.
   */
  endPressure(sessionId: string, campaignId: string): Promise<void>;
  /** The campaign's open play session, as the caller sees it. Null when none is running. */
  openPlaySessionId(campaignId: string): Promise<string | null>;
  /** Ends the campaign's open session. Runs as the caller: the database checks they are the campaign's DM. */
  endPlaySession(campaignId: string): Promise<void>;
  /** The conversation's stored messages, for what its characters still had to say. */
  loadTurns(sessionId: string): Promise<StoredTurn[]>;
  /** Writes what characters were left wanting to say into their own memories. Only characters of the campaign. */
  keepUnfinished(session: LeaveSession, unfinished: Unfinished[]): Promise<void>;
  /** Every fact this conversation filed, in the order they were filed. The handler keeps only what the party knows. */
  loadFacts(sessionId: string): Promise<Array<{ body: string; known_to_player: boolean }>>;
  /** The played character's name, or null when there is none or it is not of this campaign. */
  characterName(campaignId: string, characterId: string): Promise<string | null>;
  /** Says on the sitting which note it left, so the sitting can be told as a story from that note later. */
  linkNote(sessionId: string, noteId: string): Promise<void>;
  /** Writes the session note as the caller (the DM's own RLS) and answers its id. */
  writeNote(input: {
    campaignId: string;
    playSessionId: string | null;
    title: string;
    content: string;
    provenance: AiProvenance;
    /**
     * The party members the note is shared with: the played character, so the sitting lands in their journal. The
     * note holds only facts the party knows, which is what makes it theirs to read. Empty when nobody was played.
     */
    visibleTo: string[];
  }): Promise<string>;
}

export const LEAVE_MESSAGES = {
  badBody: "The request is not valid.",
  notFound: "That conversation was not found.",
} as const;

export interface LeaveResult {
  left: true;
  endedSession: boolean;
  noteId: string | null;
}


export function parseLeaveBody(raw: unknown): { campaignId: string; sessionId: string } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.campaignId !== "string" || !UUID_RE.test(r.campaignId)) return null;
  if (typeof r.sessionId !== "string" || !UUID_RE.test(r.sessionId)) return null;
  return { campaignId: r.campaignId, sessionId: r.sessionId };
}

export async function leaveTable(input: {
  userId: string;
  body: unknown;
  deps: AgentLeaveDeps;
}): Promise<{ ok: true; result: LeaveResult } | { ok: false; refusal: LeaveRefusal }> {
  const { userId, deps } = input;
  const refuse = (status: number, error: string) => ({ ok: false as const, refusal: { status, error } });

  const body = parseLeaveBody(input.body);
  if (!body) return refuse(400, LEAVE_MESSAGES.badBody);

  // Someone else's conversation, or one in another campaign, is "not found": a 403 would say it exists.
  const session = await deps.loadSession(body.sessionId);
  if (!session || session.user_id !== userId || session.campaign_id !== body.campaignId) {
    return refuse(404, LEAVE_MESSAGES.notFound);
  }

  // Leaving twice is not an error and does nothing twice: no second end, no second note. The conditional write is
  // the one guard, so two leaves at once cannot both pass it either.
  if (!(await deps.markLeft(session.id))) return { ok: true, result: { left: true, endedSession: false, noteId: null } };

  // From here on nothing undoes leaving: the player is already up from the table.
  try {
    await deps.endPressure(session.id, session.campaign_id);
  } catch (error) {
    console.error("agent-leave: ending the pressure failed:", error);
  }
  let endedSession = false;
  if (session.opened_play_session && session.campaign_session_id !== null) {
    try {
      // Only the session this conversation started, and only while it is still the one running. A DM who ended it and
      // began another evening must not have that one closed by a sitting from the night before.
      const running = await deps.openPlaySessionId(session.campaign_id);
      if (running === session.campaign_session_id) {
        await deps.endPlaySession(session.campaign_id);
        endedSession = true;
      }
    } catch (error) {
      console.error("agent-leave: ending the play session failed:", error);
    }
  }

  // What a character was about to say and never got to goes into their own memory, so it is still on their mind
  // the next time the party meets them (`unfinished.ts`). A failure costs that, never the leaving.
  try {
    const unfinished = unfinishedBusiness(await deps.loadTurns(session.id));
    if (unfinished.length > 0) await deps.keepUnfinished(session, unfinished);
  } catch (error) {
    console.error("agent-leave: keeping what was left unsaid failed:", error);
  }

  let noteId: string | null = null;
  try {
    // A hidden fact is the narrator's secret: it is dropped here, whatever the read returned.
    const facts = (await deps.loadFacts(session.id)).filter((f) => f.known_to_player).map((f) => f.body);
    if (facts.length > 0) {
      let name: string | null = null;
      if (session.party_member_id !== null) {
        try {
          name = await deps.characterName(session.campaign_id, session.party_member_id);
        } catch (error) {
          console.error("agent-leave: reading the character's name failed:", error);
        }
      }
      noteId = await deps.writeNote({
        campaignId: session.campaign_id,
        playSessionId: session.campaign_session_id,
        title: name === null ? "At the AI table" : `At the AI table: ${name}`,
        content: noteDocument(facts),
        visibleTo: session.party_member_id === null ? [] : [session.party_member_id],
        // The facts were filed by the AI narrator, so the note carries the mark every AI-made note carries.
        provenance: {
          generatorType: "agent_table_record",
          provider: session.provider,
          model: session.model,
          generatedAt: new Date().toISOString(),
          edited: false,
        },
      });
    }
  } catch (error) {
    console.error("agent-leave: writing the note failed:", error);
    noteId = null;
  }
  // The note leads back to the sitting; without the link the note is still the note, only not tellable as a story.
  if (noteId !== null) {
    try {
      await deps.linkNote(session.id, noteId);
    } catch (error) {
      console.error("agent-leave: linking the note to the sitting failed:", error);
    }
  }

  return { ok: true, result: { left: true, endedSession, noteId } };
}
