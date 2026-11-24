// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { mount } from "@vue/test-utils";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import AskQuoteCard from "./AskQuoteCard.vue";

const push = vi.fn();
vi.mock("@/ai/ask/askSceneMentions", () => ({ useAskSceneMentions: () => ({ mentionItems: { value: [] } }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }), RouterLink: { template: "<a><slot /></a>" } }));

const proposal: AskProposal = { proposalId: "p1", generator: "npc", concept: "a baker", inputs: {} };
const ready: AskQuote = { lines: [{ label: "NPC", value: "a baker", credits: 4 }], total: 4, block: null };

function adapters(quote: AskQuote | null, screen = false): AskAdapters {
  const adapter: AskAdapter | undefined = quote ? { id: "npc", quote: () => quote, run: vi.fn() } : undefined;
  return {
    adapterFor: () => adapter,
    hasAdapter: () => false, loadAdapter: async () => undefined, screenFor: () => (screen ? { id: "npc", route: () => "/quests/design?from=ask" } : undefined),
  };
}

function card(quote: AskQuote | null, over: { state?: "quote" | "running" | "cancelled"; screen?: boolean; button?: boolean; concept?: string; quick?: boolean } = {}) {
  const wrapped = adapters(quote, over.screen);
  if (over.quick) {
    const base = wrapped.adapterFor("npc");
    if (base) wrapped.adapterFor = () => ({ ...base, quick: vi.fn() });
  }
  return mount(AskQuoteCard, {
    props: {
      item: { kind: "proposal", id: 1, proposal: { ...proposal, concept: over.concept ?? proposal.concept }, state: over.state ?? "quote", choices: {}, ...(over.button ? { origin: "button" as const } : {}) },
      adapters: wrapped,
    },
    global: { stubs: { RouterLink: true } },
  });
}

// The form reads this campaign's lists through composables that need an app; the card's own job is only to host it.
vi.mock("@/ai/ask/askOptions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/ai/ask/askOptions")>(),
  ASK_LISTS: {},
  useAskRecordOptions: () => ({ npc: computed(() => []), party_member: computed(() => []), faction: computed(() => []), location: computed(() => []) }),
}));
vi.mock("@/composables/items/useItemIndex", () => ({ useItemIndex: () => ({ data: { value: [] } }) }));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({ useAskLinkRecords: () => ({ names: computed(() => undefined), loading: computed(() => false), failed: computed(() => false) }) }));

describe("AskQuoteCard", () => {
  // Bug caught: the gilt button not carrying the price, so the DM confirms without seeing what it costs.
  it("shows the generator's action and price on the button, and confirms on press", async () => {
    const w = card(ready);
    expect(w.get('[data-testid="ask-confirm"]').text()).toBe("Create NPC · 4 credits");
    expect(w.get('[data-testid="ask-total"]').text()).toContain("4 credits");
    await w.get('[data-testid="ask-confirm"]').trigger("click");
    expect(w.emitted("confirm")).toHaveLength(1);
  });

  // Bug caught: adapters load on demand, so a card drawn before its file arrived said "I can't run that one" for a generator that can.
  it("waits with a reading line while its adapter is still loading, and says no only when there is none", async () => {
    const w = card(null);
    expect(w.text()).toContain("I can't run that one from here yet.");
    const waiting = mount(AskQuoteCard, {
      props: {
        item: { kind: "proposal", id: 1, proposal, state: "quote", choices: {} },
        adapters: { adapterFor: () => undefined, hasAdapter: () => true, loadAdapter: async () => undefined, screenFor: () => undefined },
      },
      global: { stubs: { RouterLink: true } },
    });
    expect(waiting.find('[data-testid="ask-loading"]').exists()).toBe(true);
    expect(waiting.text()).not.toContain("I can't run that one");
    expect(waiting.find('[data-testid="ask-confirm"]').exists()).toBe(false);
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
  it("lists the generator's form under Adjust and emits an edit", async () => {
    const w = card(ready);
    await w.findAll("button").find((b) => b.text() === "Adjust")?.trigger("click");
    expect(w.get('[data-testid="ask-form"]').text().toLowerCase()).toContain("portrait");
    await w.get('[data-testid="ask-form"] [role="switch"]').trigger("click");
    expect(w.emitted("adjust")?.[0]?.[0]).toMatchObject({ portrait: true });
  });

  describe("opened by a button", () => {
    const missing: AskQuote = { ...ready, total: 4, block: { reason: "missing", message: "Say what this NPC is like first." } };

    // Bug caught: the concept shown as a caption, so a DM who pressed Generate had nowhere to say what to make.
    it("makes the concept the first field and emits what is typed", async () => {
      const w = card(ready, { button: true, concept: "" });
      const box = w.get('[data-testid="ask-concept"] textarea');
      expect(box.attributes("placeholder")).toContain("tiefling bard");
      await box.setValue("A baker");
      expect(w.emitted("concept")).toEqual([["A baker"]]);
    });

    // Bug caught: the ledger pushing the form down, so the DM filled in a card whose inputs were below a list of prices.
    it("reads concept, form, ledger, total, buttons; a model proposal keeps ledger, total, buttons", () => {
      const at = (w: ReturnType<typeof card>, id: string) => w.html().indexOf(`data-testid="${id}"`);
      const w = card(ready, { button: true, concept: "x" });
      expect(at(w, "ask-concept")).toBeLessThan(at(w, "ask-form"));
      expect(at(w, "ask-form")).toBeLessThan(w.html().indexOf("<dl"));
      expect(w.html().indexOf("<dl")).toBeLessThan(at(w, "ask-total"));
      expect(at(w, "ask-total")).toBeLessThan(at(w, "ask-confirm"));
      const model = card(ready);
      expect(model.html().indexOf("<dl")).toBeLessThan(at(model, "ask-total"));
      expect(at(model, "ask-total")).toBeLessThan(at(model, "ask-confirm"));
    });

    // Bug caught: the line that only repeats the concept staying under a box that already shows it.
    it("drops the line that repeats the concept on a button card only", () => {
      const lines = [{ label: "Who", value: "As the description says", credits: null, repeatsConcept: true as const }, { label: "Campaign", value: "K", credits: null }];
      expect(card({ ...ready, lines }, { button: true }).text()).not.toContain("As the description says");
      expect(card({ ...ready, lines }).text()).toContain("As the description says");
    });

    // Bug caught: the model's own description of an input shown to the DM as its placeholder.
    it("shows the DM's placeholder in a field, and none when the contract gives none", () => {
      const w = card(ready, { button: true });
      const fields = w.findAll<HTMLInputElement>('[data-testid="ask-form"] input[type="text"], [data-testid="ask-form"] input:not([type])');
      const placeholders = fields.map((f) => f.element.placeholder).filter((p) => p !== "");
      expect(placeholders).toContain("Leave blank and one is chosen");
      expect(placeholders.join()).not.toContain("A name the DM gave");
    });

    // Bug caught: the model's own proposal getting an editable box, so the DM rewrites what Ask already understood.
    it("leaves a proposal from the model as a caption", () => {
      const w = card(ready);
      expect(w.find('[data-testid="ask-concept"]').exists()).toBe(false);
      expect(w.text()).toContain("a baker");
    });

    // Bug caught: pressing Adjust being required to see the form on a card the DM opened to fill in.
    it("shows the form without pressing Adjust, and has no Adjust", () => {
      const w = card(ready, { button: true });
      expect(w.find('[data-testid="ask-form"]').exists()).toBe(true);
      expect(w.findAll("button").some((b) => b.text() === "Adjust")).toBe(false);
    });

    // Bug caught: an empty required concept leaving a live gilt button (a charge for no description) or a wall of alert text.
    it("disables the gilt button while the required concept is empty, with no alert", async () => {
      const w = card(missing, { button: true, concept: "" });
      const button = w.get('[data-testid="ask-confirm"]');
      expect(button.attributes("disabled")).toBeDefined();
      await button.trigger("click");
      expect(w.emitted("confirm")).toBeUndefined();
      expect(w.find('[data-testid="ask-block"]').exists()).toBe(false);
    });

    // Bug caught: the concept rule hiding a real block (out of credits) behind a disabled button.
    it("still shows a credit block while the concept is empty", () => {
      const w = card({ ...ready, block: { reason: "credits", message: "You are 2 credits short." } }, { button: true, concept: "" });
      expect(w.get('[data-testid="ask-block"]').text()).toContain("2 credits short");
    });

    // Bug caught: Quick create pressed emitting nothing, or shown on a card whose generator has no such route.
    it("offers Quick create only where the generator has one, and emits it", async () => {
      expect(card(ready, { button: true }).find('[data-testid="ask-quick"]').exists()).toBe(false);
      const w = card(ready, { button: true, quick: true });
      await w.get('[data-testid="ask-quick"]').trigger("click");
      expect(w.emitted("quick")).toHaveLength(1);
    });

    // Bug caught: Quick create pressed while the people and places the card names were still loading, which dropped them.
    it("holds Quick create while the quote is still reading, but not for a credit block, and not for an empty concept", async () => {
      const loading = card({ ...ready, block: { reason: "missing", message: "Still reading this campaign's people." }, reading: true }, { button: true, quick: true, concept: "a baker" });
      expect(loading.get('[data-testid="ask-quick"]').attributes("disabled")).toBeDefined();
      // Bug caught: an over-long concept, or a model-proposed card with an empty one, both "missing" blocks that are not
      // loads, disabling the free Quick create for good.
      const tooLong = card({ ...ready, block: { reason: "missing", message: "Shorten the description to 2000 characters." } }, { button: true, quick: true, concept: "a baker" });
      expect(tooLong.get('[data-testid="ask-quick"]').attributes("disabled")).toBeUndefined();
      const empty = card({ ...ready, block: { reason: "missing", message: "Say who it is." } }, { quick: true, concept: "" });
      expect(empty.get('[data-testid="ask-quick"]').attributes("disabled")).toBeUndefined();
      const broke = card({ ...ready, block: { reason: "credits", message: "Short." } }, { button: true, quick: true, concept: "a baker" });
      expect(broke.get('[data-testid="ask-quick"]').attributes("disabled")).toBeUndefined();
    });
  });
});
