import { describe, expect, it } from "vitest";
import { leaveTable, LEAVE_MESSAGES, type AgentLeaveDeps, type LeaveSession } from "./handler";
import { A, B, spoke } from "../_shared/agent/speechTestKit";
import type { StoredTurn } from "../_shared/agent/transcript";
import type { Unfinished } from "../_shared/agent/unfinished";

const DM = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CAMPAIGN = "00000000-0000-4000-8000-0000000000c2";
const SESSION = "00000000-0000-4000-8000-0000000000a1";
const PLAY = "00000000-0000-4000-8000-0000000000b1";
const ANOTHER_PLAY = "00000000-0000-4000-8000-0000000000b2";
const BRAM = "00000000-0000-4000-8000-0000000000d1";

function harness(over: Partial<LeaveSession> = {}) {
  const session: LeaveSession = {
    id: SESSION,
    user_id: DM,
    campaign_id: CAMPAIGN,
    provider: "openai",
    model: "m1",
    campaign_session_id: PLAY,
    opened_play_session: true,
    party_member_id: null,
    ...over,
  };
  const h = {
    session,
    left: false,
    running: PLAY as string | null,
    facts: [] as Array<{ body: string; known_to_player: boolean }>,
    endThrows: false,
    noteThrows: false,
    ended: [] as string[],
    pressureEnded: [] as Array<{ sessionId: string; campaignId: string }>,
    pressureThrows: false,
    notes: [] as Array<Parameters<AgentLeaveDeps["writeNote"]>[0]>,
    linked: [] as Array<{ sessionId: string; noteId: string }>,
    turns: [] as StoredTurn[],
    turnsThrow: false,
    unfinished: [] as Unfinished[],
    deps: undefined as unknown as AgentLeaveDeps,
  };
  h.deps = {
    loadSession: async (id) => (id === h.session.id ? { ...h.session } : null),
    markLeft: async () => {
      if (h.left) return false;
      h.left = true;
      return true;
    },
    endPressure: async (sessionId, campaignId) => {
      if (h.pressureThrows) throw new Error("db down");
      h.pressureEnded.push({ sessionId, campaignId });
    },
    openPlaySessionId: async () => h.running,
    endPlaySession: async (campaignId) => {
      if (h.endThrows) throw new Error("not the DM");
      h.ended.push(campaignId);
    },
    loadTurns: async () => {
      if (h.turnsThrow) throw new Error("db down");
      return h.turns;
    },
    keepUnfinished: async (_session, unfinished) => {
      h.unfinished.push(...unfinished);
    },
    loadFacts: async () => h.facts,
    characterName: async (_c, id) => (id === BRAM ? "Bram" : null),
    linkNote: async (sessionId, noteId) => {
      h.linked.push({ sessionId, noteId });
    },
    writeNote: async (input) => {
      if (h.noteThrows) throw new Error("rls");
      h.notes.push(input);
      return "note-1";
    },
  };
  return h;
}

const leave = (h: ReturnType<typeof harness>, over: { userId?: string; body?: unknown } = {}) =>
  leaveTable({
    userId: over.userId ?? DM,
    body: over.body ?? { campaignId: CAMPAIGN, sessionId: SESSION },
    deps: h.deps,
  });

describe("leaving the table", () => {
  it("answers 404 and writes nothing for another account's conversation, so a 403 never says it exists", async () => {
    const h = harness();
    h.facts = [{ body: "A fact.", known_to_player: true }];
    const out = await leave(h, { userId: OTHER });
    expect(out).toEqual({ ok: false, refusal: { status: 404, error: LEAVE_MESSAGES.notFound } });
    expect(h.left).toBe(false);
    expect(h.ended).toEqual([]);
    expect(h.notes).toEqual([]);
  });

  it("answers 404 for a conversation named under another campaign", async () => {
    const h = harness();
    const out = await leave(h, { body: { campaignId: OTHER_CAMPAIGN, sessionId: SESSION } });
    expect(out).toMatchObject({ ok: false, refusal: { status: 404 } });
    expect(h.left).toBe(false);
  });

  it("refuses a body that is not two uuids", async () => {
    const h = harness();
    expect(await leave(h, { body: { campaignId: CAMPAIGN } })).toMatchObject({ ok: false, refusal: { status: 400 } });
  });

  it("ends the session when this conversation opened it, or the evening keeps running after the player left", async () => {
    const h = harness();
    const out = await leave(h);
    expect(out).toEqual({ ok: true, result: { left: true, endedSession: true, noteId: null } });
    expect(h.ended).toEqual([CAMPAIGN]);
    expect(h.left).toBe(true);
  });

  it("leaves a session someone else opened running, or leaving would close a DM's evening under them", async () => {
    const h = harness({ opened_play_session: false });
    const out = await leave(h);
    expect(out).toMatchObject({ ok: true, result: { left: true, endedSession: false } });
    expect(h.ended).toEqual([]);
    expect(h.left).toBe(true);
  });

  it("leaves a different open session running, or last night's sitting would close tonight's evening", async () => {
    const h = harness();
    h.running = ANOTHER_PLAY;
    const out = await leave(h);
    expect(out).toMatchObject({ ok: true, result: { endedSession: false } });
    expect(h.ended).toEqual([]);
  });

  it("ends nothing when no session is running any more", async () => {
    const h = harness();
    h.running = null;
    expect(await leave(h)).toMatchObject({ ok: true, result: { endedSession: false } });
    expect(h.ended).toEqual([]);
  });

  it("leaving twice ends nothing twice and writes no second note", async () => {
    const h = harness();
    h.facts = [{ body: "The gate was barred.", known_to_player: true }];
    await leave(h);
    const again = await leave(h);
    expect(again).toEqual({ ok: true, result: { left: true, endedSession: false, noteId: null } });
    expect(h.ended).toHaveLength(1);
    expect(h.notes).toHaveLength(1);
  });

  it("still leaves when ending the session fails, and says it did not end", async () => {
    const h = harness();
    h.endThrows = true;
    const out = await leave(h);
    expect(out).toEqual({ ok: true, result: { left: true, endedSession: false, noteId: null } });
    expect(h.left).toBe(true);
  });

  it("still leaves when the note cannot be written, and still ends the session", async () => {
    const h = harness();
    h.facts = [{ body: "A fact.", known_to_player: true }];
    h.noteThrows = true;
    const out = await leave(h);
    expect(out).toEqual({ ok: true, result: { left: true, endedSession: true, noteId: null } });
    expect(h.left).toBe(true);
  });

  it("keeps hidden facts out of the note, or the narrator's secrets are printed in the DM's session log", async () => {
    const h = harness();
    h.facts = [
      { body: "The miller is a spy.", known_to_player: false },
      { body: "The gate was barred.", known_to_player: true },
    ];
    await leave(h);
    expect(h.notes).toHaveLength(1);
    expect(h.notes[0].content).toContain("The gate was barred.");
    expect(h.notes[0].content).not.toContain("miller");
  });

  it("writes no note when only hidden facts exist, or when there are none", async () => {
    const hidden = harness();
    hidden.facts = [{ body: "A secret.", known_to_player: false }];
    expect(await leave(hidden)).toMatchObject({ result: { noteId: null } });
    expect(hidden.notes).toEqual([]);
    const none = harness();
    await leave(none);
    expect(none.notes).toEqual([]);
  });

  it("writes one session note for the play session, titled with the character, facts in the order filed, marked as AI-made", async () => {
    const h = harness({ party_member_id: BRAM });
    h.facts = [
      { body: "First thing.", known_to_player: true },
      { body: "Second thing.", known_to_player: true },
    ];
    const out = await leave(h);
    expect(out).toEqual({ ok: true, result: { left: true, endedSession: true, noteId: "note-1" } });
    const note = h.notes[0];
    expect(note).toMatchObject({
      campaignId: CAMPAIGN,
      playSessionId: PLAY,
      title: "At the AI table: Bram",
      provenance: { generatorType: "agent_table_record", provider: "openai", model: "m1", edited: false },
    });
    const doc = JSON.parse(note.content);
    expect(doc.content[0].content[0].text).toBe("What went on the record at the AI table.");
    expect(doc.content[1].type).toBe("bulletList");
    expect(doc.content[1].content.map((li: { content: { content: { text: string }[] }[] }) => li.content[0].content[0].text)).toEqual([
      "First thing.",
      "Second thing.",
    ]);
  });

  it("titles the note plainly when no character was played", async () => {
    const h = harness();
    h.facts = [{ body: "A fact.", known_to_player: true }];
    await leave(h);
    expect(h.notes[0].title).toBe("At the AI table");
  });

  it("ends the pressure of the conversation that is left, once, and not for a second leave", async () => {
    const h = harness();
    await leave(h);
    await leave(h);
    expect(h.pressureEnded).toEqual([{ sessionId: SESSION, campaignId: CAMPAIGN }]);
  });

  it("ends no pressure for a conversation that is not the caller's", async () => {
    const h = harness();
    await leave(h, { userId: OTHER });
    expect(h.pressureEnded).toEqual([]);
  });

  it("still ends the play session when ending the pressure fails, so a stray clock never keeps a session live", async () => {
    const h = harness();
    h.pressureThrows = true;
    const out = await leave(h);
    expect(out.ok && out.result.endedSession).toBe(true);
  });

  it("shares the sitting's note with the character who was played, so it lands in their journal", async () => {
    const h = harness({ party_member_id: BRAM });
    h.facts = [{ body: "Bram found the key.", known_to_player: true }];
    await leave(h);
    expect(h.notes[0].visibleTo).toEqual([BRAM]);
  });

  it("shares the note with nobody when no character was played", async () => {
    const h = harness();
    h.facts = [{ body: "The key was found.", known_to_player: true }];
    await leave(h);
    expect(h.notes[0].visibleTo).toEqual([]);
  });
});

describe("what was left unsaid", () => {
  // Alda spoke; Bren wanted to answer and did not get the floor.
  const withUnsaid = (): StoredTurn[] =>
    spoke(1, { speaker_id: A, happening: "h", present: [B] }, "speak", "Hello.", A).map((row, i) =>
      i === 1 ? { ...row, blocks: [{ ...(row.blocks as Record<string, unknown>[])[0], withheld: [{ speaker: { id: B, name: "Bren" }, text: "I know where the ring went.", to: "Alda" }] }] } : row);

  // Bug caught: what a character was about to say lost when the player gets up.
  it("goes into that character's memory when the player leaves", async () => {
    const h = harness();
    h.turns = withUnsaid();
    await leave(h);
    expect(h.unfinished).toEqual([{ characterId: B, body: 'I meant to say this to Alda and did not get to: "I know where the ring went."' }]);
  });

  // Bug caught: a second leave (a double click, two tabs) writing the same memory twice.
  it("is kept once, however often the table is left", async () => {
    const h = harness();
    h.turns = withUnsaid();
    await leave(h);
    await leave(h);
    expect(h.unfinished).toHaveLength(1);
  });

  // Bug caught: a failure to read the conversation keeping the player at the table.
  it("never stops the player from leaving", async () => {
    const h = harness();
    h.turnsThrow = true;
    expect(await leave(h)).toMatchObject({ ok: true, result: { left: true } });
  });

  // #1021 row 19. Bug caught: the note written but the sitting never told which note it left, so the sitting can
  // never be told as a story from it; or a sitting with nothing on record linked to a note that does not exist.
  it("says on the sitting which note it left, and nothing when no note was written", async () => {
    const h = harness();
    h.facts = [{ body: "Wren found the brass key.", known_to_player: true }];
    const outcome = await leave(h);
    expect(outcome.ok && outcome.result.noteId).toBeTruthy();
    expect(h.linked).toEqual([{ sessionId: SESSION, noteId: outcome.ok ? outcome.result.noteId : "" }]);
    const empty = harness();
    await leave(empty);
    expect(empty.linked).toEqual([]);
  });
});
