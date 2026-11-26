import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { WALK_SKIPPABLE, type WalkStepId, type WalkStopRef } from "@/lib/canon/canonWalk";
import { PITCH, fakeWalkPorts } from "@/test/askWalkPorts";
import { canonEntry } from "@/test/canonEntry";
import type { AskItem } from "./askItems";
import { NO_ANSWER_STEER, introText } from "./useAskWalk";
import { useAskConversation } from "./useAskConversation";

/** Fifteen words or more: a full answer, which opens the block without a follow-up. */
const FULL = "Debts and the sea taking things back, and what it costs a kind person to stay kind when nobody is watching";
const section = (step: WalkStepId): WalkStopRef => ({ step, memberId: null, memberName: null });
const member = (id: string, name: string) => ({ id, name });

function setup(opts: Parameters<typeof fakeWalkPorts>[0] = {}) {
  const fake = fakeWalkPorts(opts);
  const transport = vi.fn(async () => new Response("data: {\"type\":\"done\",\"end\":\"done\",\"routed\":false,\"free\":true,\"credits\":0,\"freeLeft\":3}\n\n", { headers: { "content-type": "text/event-stream" } }));
  const campaign = ref<string | null>("c1");
  const convo = useAskConversation({
    campaignId: () => campaign.value,
    campaignName: () => "Kind Country",
    context: () => ({ route: "/canon" }),
    adapters: { adapterFor: () => undefined, hasAdapter: () => false, loadAdapter: async () => undefined, screenFor: () => undefined },
    routePath: () => "/canon",
    walk: fake.ports,
    transport,
  });
  const kinds = <K extends AskItem["kind"]>(kind: K) => convo.items.value.filter((i): i is Extract<AskItem, { kind: K }> => i.kind === kind);
  const lastBlock = () => {
    const block = kinds("walk-block").at(-1);
    if (!block) throw new Error("no block");
    return block;
  };
  const lastQuestion = () => kinds("walk-question").at(-1);
  return { ...fake, convo, transport, campaign, kinds, lastBlock, lastQuestion, walk: convo.walk };
}

/** A walk begun on a canon with a pitch, answered once so a block is open on "Themes". */
async function openBlock(opts: Parameters<typeof fakeWalkPorts>[0] = { withPitch: true }) {
  const s = setup(opts);
  await s.walk.start();
  await s.convo.send(FULL);
  return s;
}

describe("the walk: starting", () => {
  // Bug caught: the walk opening on a step the canon already holds (the pitch) instead of the first one still to do.
  it("asks the first stop still to do", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    expect(s.lastQuestion()).toMatchObject({ stop: { step: "themes" }, answered: false });
    expect(s.kinds("reply")).toHaveLength(1);
    expect(s.walk.active.value).toBe(true);
    expect(s.walk.awaiting.value).toMatchObject({ step: "themes" });
  });

  // Bug caught: a walk on a finished canon asking the pitch again, or never ending.
  it("closes at once when every stop is written or skipped", async () => {
    const s = setup({ withPitch: true });
    s.set({ skipped: new Set(WALK_SKIPPABLE) });
    await s.walk.start();
    expect(s.kinds("walk-question")).toHaveLength(0);
    expect(s.walk.active.value).toBe(false);
    expect(s.kinds("reply")).toHaveLength(2);
  });

  // Bug caught: the first question asked while the canon was still loading, so every step read as empty.
  it("waits for the canon before it asks", async () => {
    const s = setup({ withPitch: true });
    s.state.loaded = false;
    const started = s.walk.start();
    await Promise.resolve();
    expect(s.kinds("walk-question")).toHaveLength(0);
    s.state.loaded = true;
    s.set({});
    await started;
    expect(s.kinds("walk-question")).toHaveLength(1);
  });

  // Bug caught: a second Design it with me press making a second walk beside the first.
  it("starts once", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.walk.start();
    expect(s.kinds("walk-question")).toHaveLength(1);
  });
});

describe("the walk: routing what the DM types", () => {
  // Bug caught: an answer to the walk's question going to the model as a chat turn (and costing a question).
  it("turns an answer into a block and starts no turn", async () => {
    const s = await openBlock();
    expect(s.transport).not.toHaveBeenCalled();
    expect(s.lastBlock()).toMatchObject({ stop: { step: "themes" }, answer: FULL, phase: "open" });
    expect(s.kinds("user")).toHaveLength(1);
    expect(s.lastQuestion()?.answered).toBe(true);
    expect(s.walk.awaiting.value).toBeNull();
  });

  // Bug caught: the walk swallowing every message for good: with no question waiting, typing is a normal turn.
  it("sends a normal turn when no question is waiting", async () => {
    const s = setup({ withPitch: true });
    await s.convo.send("what is a force?");
    expect(s.transport).toHaveBeenCalledTimes(1);
  });

  // Bug caught: words typed over a draft starting a chat turn instead of changing the draft.
  it("turns words typed over a drafted block into a change to the draft", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    expect(s.lastBlock().phase).toBe("drafted");
    await s.convo.send("make them darker");
    expect(s.transport).not.toHaveBeenCalled();
    expect(s.draft).toHaveBeenCalledTimes(2);
    expect(s.draft.mock.calls[1]?.[0]).toMatchObject({ steer: `${FULL}\nChange: make them darker` });
  });

  // Bug caught: a draft left behind after the walk ended still capturing the DM's next message.
  it("stops taking words as changes once the walk has left", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    s.walk.leave();
    await s.convo.send("hello");
    expect(s.transport).toHaveBeenCalledTimes(1);
  });

  // Bug caught: "you decide" making a block holding the question or a placeholder as the DM's words.
  it("lets the DM decide: an empty answer that Enhance drafts from the pitch alone", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    s.walk.youDecide();
    expect(s.lastBlock().answer).toBe("");
    expect(s.kinds("user")).toHaveLength(0);
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft.mock.calls[0]?.[0]).toMatchObject({ steer: NO_ANSWER_STEER });
  });
});

describe("the walk: Enhance with AI", () => {
  // Bug caught: a gated draft (AI off, short balance) still calling the helper, and so spending.
  it("never calls the helper when the gate blocks, and says why", async () => {
    const s = await openBlock();
    s.state.blocked = "This costs 4 credits and your balance is short.";
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft).not.toHaveBeenCalled();
    expect(s.lastBlock()).toMatchObject({ phase: "failed", error: "This costs 4 credits and your balance is short." });
  });

  // Bug caught: a price not yet known being treated as free and drafted anyway.
  it("does not draft while the price is unknown", async () => {
    const s = await openBlock();
    s.state.total = null;
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft).not.toHaveBeenCalled();
    expect(s.lastBlock().phase).toBe("failed");
  });

  // Bug caught: a second generation starting beside one already running somewhere in the app.
  it("refuses with a sentence while another generation runs", async () => {
    const s = await openBlock();
    s.state.busy = true;
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft).not.toHaveBeenCalled();
    expect(s.lastBlock().error).toMatch(/Another generation/);
  });

  // Bug caught: a draft before the pitch, written cold; and a step with no helper (habitats) calling one anyway.
  it("holds the draft before the pitch is written, and where there is no helper", async () => {
    const cold = setup();
    await cold.walk.start();
    cold.walk.jump(section("truths"));
    await cold.convo.send(FULL);
    await cold.walk.enhance(cold.lastBlock().id);
    expect(cold.lastBlock().error).toMatch(/pitch first/);

    const s = setup({ withPitch: true });
    await s.walk.start();
    s.walk.jump(section("habitats"));
    await s.convo.send(FULL);
    await s.walk.enhance(s.lastBlock().id);
    expect(s.lastBlock().error).toMatch(/being reworked/);
    expect(cold.draft).not.toHaveBeenCalled();
    expect(s.draft).not.toHaveBeenCalled();
  });

  // Bug caught: the pitch drafted from the DM's words, which is the wizard's first promise, being held until a pitch
  // exists; and an emptied pitch answer sent anyway, so the helper offered the walk's own steer as the DM's pitch.
  it("drafts the pitch from the DM's words before any pitch exists, and never from none", async () => {
    const s = setup();
    await s.walk.start();
    await s.convo.send("A river town where the dead keep the ferries, and a ferryman who has never once been paid in coin or in kind");
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft.mock.calls[0]?.[0]).toMatchObject({ draft: { mode: "premise", kinds: ["pitch"] }, steer: "A river town where the dead keep the ferries, and a ferryman who has never once been paid in coin or in kind" });

    const e = setup();
    await e.walk.start();
    await e.convo.send(FULL);
    await e.walk.enhance(e.lastBlock().id, "  ");
    expect(e.lastBlock().error).toMatch(/Tell me about your campaign/);
    expect(e.draft).not.toHaveBeenCalled();
  });

  // Bug caught: a premise step drafting every premise kind (the kinds not passed), or a character's draft sharing the section's key.
  it("asks a premise step for its own kinds and a character's draft under their own scope", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft.mock.calls[0]?.[0]).toMatchObject({ draft: { mode: "premise", kinds: ["theme"] }, scope: "walk:themes" });

    const c = setup({ withPitch: true, party: [member("m1", "Ada")] });
    await c.walk.start();
    c.walk.jump({ step: "backstories", memberId: "m1", memberName: "Ada" });
    await c.convo.send(FULL);
    await c.walk.enhance(c.lastBlock().id);
    expect(c.draft.mock.calls[0]?.[0]).toMatchObject({ draft: { mode: "backstory" }, scope: "walk:backstories:m1", stop: { memberId: "m1" } });
  });

  // Bug caught: a helper's failure shown as a draft ready to review, or charged to the block.
  it("fails the block with the helper's error and counts no credits", async () => {
    const s = await openBlock();
    s.draft.mockResolvedValueOnce({ ok: false, error: "No usable suggestions. Try again." });
    await s.walk.enhance(s.lastBlock().id);
    expect(s.lastBlock()).toMatchObject({ phase: "failed", error: "No usable suggestions. Try again." });
    expect(s.lastBlock().credits).toBeUndefined();
  });

  // Bug caught: each Again forgetting what the earlier drafts cost, so the block's price line under-reports.
  it("adds each draft's price to the block", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    await s.walk.again(s.lastBlock().id);
    expect(s.lastBlock()).toMatchObject({ phase: "drafted", credits: 8 });
    // The walk's running total, which the progress line shows in place of a price on every cheap button.
    expect(s.walk.spent.value).toBe(8);
  });

  // Bug caught: with the price gone from cheap buttons, the DM never told what a draft costs; or the walk claiming a
  // price it does not know.
  it("says once, as it starts, what a draft costs", () => {
    expect(introText(1)).toContain("Each draft I write costs 1 credit");
    expect(introText(null)).not.toContain("costs");
  });

  // Bug caught: a second press while the draft is out starting a second paid call.
  it("drafts once while a draft is already out", async () => {
    const s = await openBlock();
    let release: (v: { ok: true }) => void = () => {};
    s.draft.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const first = s.walk.enhance(s.lastBlock().id);
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await first;
    expect(s.lastBlock().phase).toBe("drafted");
  });

  // Bug caught: a second block's Enhance starting while the first block's draft is still out (the app-wide busy flag
  // has not risen yet), so two helper calls overlap.
  it("refuses a second block's draft while another block is drafting", async () => {
    const s = await openBlock();
    let release: (v: { ok: true }) => void = () => {};
    s.draft.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const first = s.walk.enhance(s.lastBlock().id);
    s.walk.jump(section("table"));
    await s.convo.send(FULL);
    await s.walk.enhance(s.lastBlock().id);
    expect(s.draft).toHaveBeenCalledTimes(1);
    expect(s.lastBlock().error).toMatch(/Another generation/);
    release({ ok: true });
    await first;
  });

  // Bug caught: Again carrying only the last change, so the first correction is forgotten.
  it("keeps every change in the steer of the next draft", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    await s.walk.again(s.lastBlock().id, "darker");
    await s.walk.again(s.lastBlock().id, "shorter");
    expect(s.draft.mock.calls[2]?.[0].steer).toBe(`${FULL}\nChange: darker\nChange: shorter`);
  });
});

describe("the walk: Write it myself", () => {
  // Bug caught: a saved section not moving on, or moving on to the stop just written (the canon has not refetched yet).
  it("saves the answer, marks the block saved and asks the next stop", async () => {
    const s = await openBlock();
    await s.walk.writeMyself(s.lastBlock().id, "Debts\nThe sea");
    expect(s.write).toHaveBeenCalledWith(section("themes"), "Debts\nThe sea", { replace: false });
    expect(s.kinds("walk-block")[0]).toMatchObject({ phase: "saved", answer: "Debts\nThe sea" });
    expect(s.lastQuestion()).toMatchObject({ stop: { step: "table" } });
  });

  // Bug caught: a failed write reported as saved, and the walk moving on over words that were lost.
  it("keeps the block failed, with the reason, and asks nothing next", async () => {
    const s = await openBlock();
    s.write.mockRejectedValueOnce(new Error("boom"));
    await s.walk.writeMyself(s.lastBlock().id, "Debts");
    expect(s.lastBlock()).toMatchObject({ phase: "failed", error: "boom" });
    expect(s.kinds("walk-question")).toHaveLength(1);
  });

  // Bug caught: a double press writing every line twice.
  it("writes once however many times the button is pressed", async () => {
    const s = await openBlock();
    const id = s.lastBlock().id;
    await Promise.all([s.walk.writeMyself(id, "Debts"), s.walk.writeMyself(id, "Debts")]);
    expect(s.write).toHaveBeenCalledTimes(1);
  });

  // Bug caught: the pitch's replace flag lost on the way, so a written pitch can never be replaced from the walk.
  it("passes replace through", async () => {
    const s = await openBlock();
    await s.walk.writeMyself(s.lastBlock().id, "New", { replace: true });
    expect(s.write).toHaveBeenCalledWith(expect.anything(), "New", { replace: true });
  });
});

describe("the walk: skipping and moving on", () => {
  // Bug caught: the pitch being skippable, which would leave every later draft with nothing to be written from.
  it("cannot skip the pitch", async () => {
    const s = setup();
    await s.walk.start();
    await s.walk.skip(section("pitch"));
    expect(s.skip).not.toHaveBeenCalled();
    expect(s.kinds("walk-question")).toHaveLength(1);
  });

  // Bug caught: Skip forgetting to store the skip (the section is asked again next visit) or to move on.
  it("stores a section's skip, marks its block skipped and asks the next stop", async () => {
    const s = await openBlock();
    await s.walk.skip(section("themes"));
    expect(s.skip).toHaveBeenCalledWith("themes");
    expect(s.kinds("walk-block")[0]?.phase).toBe("skipped");
    expect(s.lastQuestion()).toMatchObject({ stop: { step: "table" } });
  });

  // Bug caught: a skip that failed to store still moving on, so the section comes back next time with no explanation.
  it("says so and stays when the skip cannot be stored", async () => {
    const s = await openBlock();
    s.skip.mockRejectedValueOnce(new Error("offline"));
    await s.walk.skip(section("themes"));
    expect(s.kinds("error")).toHaveLength(1);
    expect(s.kinds("walk-block")[0]?.phase).toBe("open");
    expect(s.kinds("walk-question")).toHaveLength(1);
  });

  // Bug caught: skipping one character storing a skip for every character's backstory.
  it("stores no skip for one character and moves to the next", async () => {
    const s = setup({ withPitch: true, party: [member("a", "Ada"), member("b", "Bo")] });
    s.set({ skipped: new Set(WALK_SKIPPABLE.filter((x) => x !== "backstories")) });
    await s.walk.start();
    expect(s.lastQuestion()?.stop).toMatchObject({ step: "backstories", memberId: "a" });
    await s.walk.skip(s.lastQuestion()!.stop);
    expect(s.skip).not.toHaveBeenCalled();
    expect(s.lastQuestion()?.stop).toMatchObject({ memberId: "b" });
  });

  // Bug caught: next landing on a stop that is filled or skipped, or never ending the walk.
  it("passes over filled and skipped stops, and ends when none remain", async () => {
    const s = setup({ withPitch: true });
    s.set({ skipped: new Set(WALK_SKIPPABLE.filter((x) => x !== "themes" && x !== "voice")) });
    await s.walk.start();
    expect(s.lastQuestion()?.stop.step).toBe("themes");
    s.walk.next();
    expect(s.lastQuestion()?.stop.step).toBe("voice");
    s.walk.next();
    // The wrap finds themes again (still to do, the DM has not answered it), then there is nothing else.
    expect(s.lastQuestion()?.stop.step).toBe("themes");
    await s.walk.skip(section("themes"));
    await s.walk.skip(section("voice"));
    expect(s.walk.active.value).toBe(false);
    expect(s.kinds("reply").at(-1)?.text).toMatch(/written or skipped/);
  });

  // Bug caught: Jump asking the right question but leaving the old one waiting, so the DM's next words answer the wrong stop.
  it("jumps to a stop and answers it, not the question that was waiting", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    const first = s.lastQuestion();
    s.walk.jump(section("forces"));
    expect(first?.answered).toBe(true);
    await s.convo.send(FULL);
    expect(s.lastBlock().stop.step).toBe("forces");
  });
});

describe("the walk: settling a section as it moves on", () => {
  // Bug caught (live run, 26 Nov 2026): the Pitch's block kept its Again, Next and proposals while the Familiar asked
  // about Themes, so two sections looked open at once; and typed words could still be taken as a change to it.
  it("settles a drafted block as kept once its section is filled, and as left when nothing was kept", async () => {
    const kept = await openBlock();
    await kept.walk.enhance(kept.lastBlock().id);
    expect(kept.lastBlock().phase).toBe("drafted");
    const block = kept.lastBlock();
    // The DM accepted a theme from the draft: the canon now holds one, so Themes is filled.
    kept.set({ entries: [PITCH, canonEntry({ id: "t", part: "premise", premise_kind: "theme", title: "Debts" })] });
    kept.walk.next();
    expect(block.phase).toBe("saved");

    const left = await openBlock();
    await left.walk.enhance(left.lastBlock().id);
    const draftedBlock = left.lastBlock();
    left.walk.jump(section("lore"));
    expect(draftedBlock.phase).toBe("left");
    expect(left.walk.draftedBlock.value).toBeNull();
  });

  // Bug caught: an answered block the DM walked away from (no write, no draft) still offering its three answers.
  it("settles an open block when the walk asks another question or is left", async () => {
    const s = await openBlock();
    const open = s.lastBlock();
    expect(open.phase).toBe("open");
    s.walk.leave();
    expect(open.phase).toBe("left");
  });
});

describe("the walk: ending", () => {
  // Bug caught: a new conversation leaving the walk running, so the next typed words are swallowed as an answer.
  it("ends with a new conversation", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    s.convo.newConversation();
    expect(s.walk.active.value).toBe(false);
    expect(s.walk.awaiting.value).toBeNull();
    await s.convo.send("hello");
    expect(s.transport).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a campaign switch carrying a question about one campaign's canon into another's.
  it("ends when the campaign changes", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    s.campaign.value = "c2";
    await Promise.resolve();
    expect(s.walk.active.value).toBe(false);
  });

  // Bug caught: the progress line reading only the canon, so a stop just written shows to do until the refetch lands.
  it("shows a stop written in this walk as filled before the canon says so", async () => {
    const s = await openBlock();
    await s.walk.writeMyself(s.lastBlock().id, "Debts");
    const themes = s.walk.progress.value.find((p) => p.step === "themes");
    expect(themes?.state).toBe("filled");
    expect(s.walk.progress.value.find((p) => p.current)?.step).toBe("table");
  });
});

const THIN = "Debts and the sea";

describe("the walk: a follow-up for a thin answer (#1282)", () => {
  // Bug caught: a thin answer opening the block at once, so the helper drafts from four words and the DM gets a random idea.
  it("asks the follow-up and opens no block when the answer is thin", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.convo.send(THIN);
    expect(s.kinds("walk-block")).toHaveLength(0);
    expect(s.lastQuestion()).toMatchObject({ stop: { step: "themes" }, followUp: true, answered: false });
    expect(s.walk.awaiting.value).toMatchObject({ step: "themes" });
    expect(s.transport).not.toHaveBeenCalled();
  });

  // Bug caught: the follow-up's answer replacing the first (or not joined), so the block holds half of what the DM said.
  it("joins the follow-up's answer to the first with a blank line and opens the block with both", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.convo.send(THIN);
    await s.convo.send("Mostly what a kindness costs");
    expect(s.lastBlock()).toMatchObject({ answer: `${THIN}\n\nMostly what a kindness costs`, phase: "open" });
    expect(s.walk.awaiting.value).toBeNull();
  });

  // Bug caught: the follow-up asked again after a second thin answer, so the DM is quizzed in a loop.
  it("asks one follow-up only: a second thin answer opens the block", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.convo.send(THIN);
    await s.convo.send("Ok");
    expect(s.kinds("walk-question").filter((q) => q.followUp === true)).toHaveLength(1);
    expect(s.lastBlock().answer).toBe(`${THIN}\n\nOk`);
  });

  // Bug caught: a stop asked a second time in the same walk (a jump back) getting its follow-up again.
  it("does not ask a stop's follow-up twice in one walk", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.convo.send(THIN);
    await s.convo.send("Ok");
    s.walk.jump(section("themes"));
    await s.convo.send(THIN);
    expect(s.lastBlock().answer).toBe(THIN);
  });

  // Bug caught: an answer of exactly fifteen words still counted thin.
  it("treats fifteen words as enough", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.convo.send(Array.from({ length: 15 }, (_, i) => `w${i}`).join(" "));
    expect(s.kinds("walk-block")).toHaveLength(1);
  });

  // Bug caught: the pitch, drafted from the DM's words alone, skipping its follow-up.
  it("asks a thin pitch its follow-up too", async () => {
    const s = setup();
    await s.walk.start();
    await s.convo.send("A drowned kingdom");
    expect(s.lastQuestion()).toMatchObject({ stop: { step: "pitch" }, followUp: true });
    expect(s.kinds("walk-block")).toHaveLength(0);
  });

  // Bug caught: "Just give me ideas" dropping what the DM said, or leaving the follow-up waiting for words.
  it("opens the block at once with what was said when the DM asks for ideas", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    await s.convo.send(THIN);
    s.walk.justIdeas();
    expect(s.lastBlock()).toMatchObject({ answer: THIN, phase: "open" });
    expect(s.lastQuestion()?.answered).toBe(true);
    expect(s.walk.awaiting.value).toBeNull();
  });

  // Bug caught: the follow-up counting as the same question as the first, so the composer is not given the focus again.
  it("makes the follow-up a new awaited question", async () => {
    const s = setup({ withPitch: true });
    await s.walk.start();
    const first = s.walk.awaitingId.value;
    await s.convo.send(THIN);
    expect(s.walk.awaitingId.value).not.toBeNull();
    expect(s.walk.awaitingId.value).not.toBe(first);
  });
});

describe("the walk: Next section declares the section done (#1282)", () => {
  // Bug caught: Next leaving an unfilled section to come round again on every wrap of the walk.
  it("stores the skip of a section nothing was kept in, and asks the next stop", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    await s.walk.done(s.lastBlock().id);
    expect(s.skip).toHaveBeenCalledWith("themes");
    expect(s.lastQuestion()?.stop.step).toBe("table");
  });

  // Bug caught: Next storing a skip over a section the DM kept proposals in.
  it("stores nothing for a section the canon already holds", async () => {
    const s = await openBlock();
    await s.walk.enhance(s.lastBlock().id);
    s.set({ entries: [PITCH, canonEntry({ part: "premise", premise_kind: "theme", title: "Debts" })] });
    await s.walk.done(s.lastBlock().id);
    expect(s.skip).not.toHaveBeenCalled();
    expect(s.lastQuestion()?.stop.step).toBe("table");
  });

  // Bug caught: a character stop storing a section skip that would silence the whole backstories step.
  it("stores nothing for a character stop and moves to the next character", async () => {
    const s = setup({ withPitch: true, party: [member("a", "Ada"), member("b", "Bo")] });
    await s.walk.start();
    s.walk.jump({ step: "backstories", memberId: "a", memberName: "Ada" });
    await s.convo.send(FULL);
    await s.walk.done(s.lastBlock().id);
    expect(s.skip).not.toHaveBeenCalled();
    expect(s.lastQuestion()?.stop).toMatchObject({ memberId: "b" });
  });

  // Bug caught: the pitch declared done while empty, so every later draft is written with no pitch to go on.
  it("never stores a skip for an empty pitch: it asks the follow-up first", async () => {
    const s = setup();
    await s.walk.start();
    await s.convo.send(FULL);
    await s.walk.done(s.lastBlock().id);
    expect(s.skip).not.toHaveBeenCalled();
    expect(s.lastQuestion()).toMatchObject({ stop: { step: "pitch" }, followUp: true, answered: false });
  });

  // Bug caught: with the follow-up already asked, Next on an empty pitch moving on (or storing a skip) instead of staying.
  it("says the pitch is needed and stays when its follow-up was already asked", async () => {
    const s = setup();
    await s.walk.start();
    await s.convo.send("A drowned kingdom");
    await s.convo.send("Ok");
    await s.walk.done(s.lastBlock().id);
    expect(s.skip).not.toHaveBeenCalled();
    expect(s.lastBlock()).toMatchObject({ phase: "open", notice: expect.stringMatching(/pitch is needed/) });
    expect(s.walk.awaiting.value).toBeNull();
  });
});
