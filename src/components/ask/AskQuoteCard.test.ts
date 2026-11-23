// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import AskQuoteCard from "./AskQuoteCard.vue";

const push = vi.fn();
vi.mock("vue-router", () => ({ useRouter: () => ({ push }), RouterLink: { template: "<a><slot /></a>" } }));

const proposal: AskProposal = { proposalId: "p1", generator: "npc", concept: "a baker", inputs: {} };
const ready: AskQuote = { lines: [{ label: "NPC", value: "a baker", credits: 4 }], total: 4, byok: false, block: null };

function adapters(quote: AskQuote | null, screen = false): AskAdapters {
  const adapter: AskAdapter | undefined = quote ? { id: "npc", quote: () => quote, run: vi.fn() } : undefined;
  return {
    adapterFor: () => adapter,
    screenFor: () => (screen ? { id: "npc", route: () => "/quests/design?from=ask" } : undefined),
  };
}

function card(quote: AskQuote | null, over: { state?: "quote" | "running" | "cancelled"; screen?: boolean } = {}) {
  return mount(AskQuoteCard, {
    props: { item: { kind: "proposal", id: 1, proposal, state: over.state ?? "quote", choices: {} }, adapters: adapters(quote, over.screen) },
    global: { stubs: { RouterLink: true } },
  });
}

describe("AskQuoteCard", () => {
  // Bug caught: the gilt button not carrying the price, so the DM confirms without seeing what it costs.
  it("shows the generator's action and price on the button, and confirms on press", async () => {
    const w = card(ready);
    expect(w.get('[data-testid="ask-confirm"]').text()).toBe("Create NPC · 4 credits");
    expect(w.get('[data-testid="ask-total"]').text()).toContain("4 credits");
    await w.get('[data-testid="ask-confirm"]').trigger("click");
    expect(w.emitted("confirm")).toHaveLength(1);
  });

  // Bug caught: a button that can be pressed while the price is still unknown, spending on a guess.
  it("disables the button while the price is not known", async () => {
    const w = card({ ...ready, total: null });
    const button = w.get('[data-testid="ask-confirm"]');
    expect(button.attributes("disabled")).toBeDefined();
    await button.trigger("click");
    expect(w.emitted("confirm")).toBeUndefined();
  });

  // Bug caught: a tie to an existing record written with no way for the DM to say no.
  it("draws a line that changes an existing record as a checkbox, and says the DM's answer", async () => {
    const w = card({ ...ready, lines: [
      { label: "Parent of", value: "Tam", credits: null, choice: { key: "related", on: true } },
      { label: "Also parent of", value: "Nella", credits: null, choice: { key: "kin:parent:npc:n", on: false } },
      { label: "NPC", value: "a baker", credits: 4 },
    ] });
    const boxes = w.findAll<HTMLInputElement>('input[data-testid="ask-line-choice"]');
    expect(boxes.map((b) => b.element.checked)).toEqual([true, false]);
    await boxes[1].setValue(true);
    await boxes[0].setValue(false);
    expect(w.emitted("decide")).toEqual([["kin:parent:npc:n", true], ["related", false]]);
  });

  // Bug caught: a one-credit price read "1 credits" on the button and the total.
  it("says 1 credit, not 1 credits", () => {
    const w = card({ ...ready, lines: [{ label: "NPC", value: "a baker", credits: 1 }], total: 1 });
    expect(w.get('[data-testid="ask-confirm"]').text()).toBe("Create NPC · 1 credit");
    expect(w.get('[data-testid="ask-total"]').text()).toMatch(/1 credit$/);
  });

  // Bug caught: a blocked generator (out of credits) still showing a live gilt button.
  it("replaces the button with the block's message and the way past it", async () => {
    const w = card({ ...ready, block: { reason: "credits", message: "You are 2 credits short." } });
    expect(w.find('[data-testid="ask-confirm"]').exists()).toBe(false);
    expect(w.get('[data-testid="ask-block"]').text()).toContain("You are 2 credits short.");
    const credits = w.findAll("button").find((b) => b.text() === "Get credits");
    await credits?.trigger("click");
    expect(w.emitted("credits")).toEqual([[4]]);
  });

  // Bug caught: BYOK shown as a credit price, which the DM is not charged.
  it("says Your own key for a campaign on its own key", () => {
    const w = card({ ...ready, byok: true });
    expect(w.get('[data-testid="ask-total"]').text()).toContain("Your own key");
    expect(w.get('[data-testid="ask-confirm"]').text()).toBe("Create NPC");
  });

  // Bug caught: a generator with no adapter yet pretending it can run.
  it("says it cannot run a generator it has no adapter for", () => {
    const w = card(null);
    expect(w.text()).toContain("I can't run that one from here yet.");
    expect(w.find('[data-testid="ask-confirm"]').exists()).toBe(false);
  });

  // Bug caught: a screen generator showing a price or a Confirm that would run nothing.
  it("offers a screen generator's own screen instead of a quote", async () => {
    const w = card(null, { screen: true });
    expect(w.text()).toContain("This one works in its own screen.");
    await w.findAll("button").find((b) => b.text() === "Open NPC")?.trigger("click");
    expect(push).toHaveBeenCalledWith("/quests/design?from=ask");
  });

  // Bug caught: Cancel leaving a card that still looks live.
  it("collapses to a line once cancelled", () => {
    const w = card(ready, { state: "cancelled" });
    expect(w.text()).toBe("Cancelled. Nothing was spent.");
  });

  // Bug caught: a running card still offering Cancel and Confirm, so a second press races the first.
  it("shows Working… and no other buttons while it runs", () => {
    const w = card(ready, { state: "running" });
    expect(w.get('[data-testid="ask-confirm"]').text()).toBe("Working…");
    expect(w.find('[data-testid="ask-cancel"]').exists()).toBe(false);
  });

  // Bug caught: Adjust not offering the generator's inputs, or an edit not reaching the card's owner to re-quote.
  it("lists the generator's inputs under Adjust and emits an edit", async () => {
    const w = card(ready);
    await w.findAll("button").find((b) => b.text() === "Adjust")?.trigger("click");
    expect(w.get('[data-testid="ask-adjust"]').text().toLowerCase()).toContain("portrait");
    await w.get('[data-testid="ask-adjust"] [role="switch"]').trigger("click");
    expect(w.emitted("adjust")?.[0]?.[0]).toMatchObject({ portrait: true });
  });
});
