import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { AskAdapter, AskRunResult } from "@/lib/ask/askAdapter";
import type { AskBind, AskBinder } from "@/lib/ask/askBind";
import { fakeWalkPorts } from "@/test/askWalkPorts";
import { useAskConversation, type AskItem } from "./useAskConversation";

const bind: AskBind = { kind: "species_form", formId: "f1", formLabel: "Young" };
const made = (type: "monster" | "npc"): AskRunResult => ({ record: { type, id: "r1", name: "Rime cub" }, route: "/monsters/r1", parts: [{ label: "Monster", ok: true, credits: 5 }] });

async function ran({ result = made("monster"), binder, withBind = true }: { result?: AskRunResult; binder?: AskBinder; withBind?: boolean } = {}) {
  const adapter: AskAdapter = { id: "monster", quote: () => ({ lines: [], total: 5, block: null }), run: vi.fn(async () => result) };
  const convo = useAskConversation({
    campaignId: () => "c1",
    campaignName: () => "Kind Country",
    context: () => ({ route: "/canon/species" }),
    adapters: { adapterFor: () => adapter, hasAdapter: () => false, loadAdapter: async () => adapter, screenFor: () => undefined },
    routePath: () => "/canon/species",
    walk: fakeWalkPorts().ports,
    ...(binder ? { bind: binder } : {}),
  });
  convo.openGenerator({ generatorId: "monster", concept: "a cub", ...(withBind ? { bind } : {}) });
  const card = convo.items.value.find((i): i is Extract<AskItem, { kind: "proposal" }> => i.kind === "proposal")!;
  await convo.confirm(card.id);
  await flushPromises();
  const resultCard = () => convo.items.value.find((i): i is Extract<AskItem, { kind: "result" }> => i.kind === "result");
  return { convo, card, resultCard };
}

describe("a card that asks for its record to be tied to the page that opened it", () => {
  // Bug caught: the monster made and never tied to the form (the bind lost between the button and the landed record).
  it("calls the binder once with the bind and the record, and tells the result card", async () => {
    const binder = vi.fn<AskBinder>(async () => ({ ok: true, text: "Bound to Young." }));
    const { resultCard } = await ran({ binder });
    expect(binder).toHaveBeenCalledExactlyOnceWith(bind, { type: "monster", id: "r1", name: "Rime cub" });
    expect(resultCard()?.bound).toEqual({ ok: true, text: "Bound to Young." });
  });

  // Bug caught: a record of another type (an NPC from a card with a stat-block bind) written into the form's monster column.
  it("binds nothing for a record of another type", async () => {
    const binder = vi.fn<AskBinder>(async () => ({ ok: true, text: "x" }));
    const { resultCard } = await ran({ binder, result: made("npc") });
    expect(binder).not.toHaveBeenCalled();
    expect(resultCard()?.bound).toBeUndefined();
  });

  // Bug caught: every card binding (or a plain page-opened card calling the binder with nothing to bind to).
  it("binds nothing for a card with no bind", async () => {
    const binder = vi.fn<AskBinder>(async () => ({ ok: true, text: "x" }));
    const { resultCard } = await ran({ binder, withBind: false });
    expect(binder).not.toHaveBeenCalled();
    expect(resultCard()?.bound).toBeUndefined();
  });

  // Bug caught: a binder that fails undoing the result (no card) or going unreported, so the DM thinks it is tied.
  it("reports a failed bind on the card and leaves the monster made", async () => {
    const refused = await ran({ binder: async () => ({ ok: false, text: "Rime cub was made, but could not be tied to Young." }) });
    expect(refused.resultCard()).toMatchObject({ name: "Rime cub", bound: { ok: false } });
    const thrown = await ran({ binder: async () => { throw new Error("boom"); } });
    expect(thrown.resultCard()?.bound).toMatchObject({ ok: false, text: expect.stringContaining("could not be tied to Young") });
  });
});
