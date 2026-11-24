// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskItem } from "@/composables/ask/useAskConversation";
import AskThread from "./AskThread.vue";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const proposal: AskProposal = { proposalId: "p1", generator: "npc", concept: "a ferryman", inputs: {} };
const adapters = { adapterFor: () => undefined, screenFor: () => undefined };
const stubs = { AskQuoteCard: { template: '<section data-testid="ask-quote" />' }, AskResultCard: { template: '<section data-testid="ask-result" />' } };

function thread(items: AskItem[]) {
  return mount(AskThread, { props: { items, adapters }, global: { stubs } });
}

describe("AskThread", () => {
  // Bug caught: a confirmed run drawn as a live quote (a second press, or no sign it is under way).
  it("holds a running proposal's place with the pending block, not the quote", () => {
    const w = thread([{ kind: "proposal", id: 1, proposal, state: "running", choices: {} }]);
    expect(w.find('[data-testid="ask-pending"]').exists()).toBe(true);
    expect(w.find('[data-testid="ask-quote"]').exists()).toBe(false);
  });

  it("draws a proposal still waiting for the DM as its quote", () => {
    const w = thread([{ kind: "proposal", id: 1, proposal, state: "quote", choices: {} }]);
    expect(w.find('[data-testid="ask-quote"]').exists()).toBe(true);
  });

  // Bug caught: "See it below" scrolling nowhere, or to the wrong block.
  it("names where a finished run landed and scrolls down to that block", async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute("data-ask-item") ?? "");
    };
    const w = thread([
      { kind: "proposal", id: 1, proposal, state: "done", choices: {}, landedAt: 3 },
      { kind: "user", id: 2, text: "who else lives at the inn?" },
      { kind: "result", id: 3, name: "Bram Perf", noun: "NPC", review: false, record: null, route: "/npcs/b", parts: [] },
    ]);
    expect(w.get('[data-testid="ask-landed"]').text()).toContain("Bram Perf is ready.");
    await w.get('[data-testid="ask-landed-jump"]').trigger("click");
    expect(scrolled).toEqual(["3"]);
  });

  // Bug caught: Again's price read from the wrong place (or never), so the button named a stale or empty cost.
  it("draws a held generation as its preview card, with Again priced by the adapter's quote of the inputs now", async () => {
    const held = {
      id: "encounter", quote: () => ({ lines: [], total: 3, block: null }), preview: async () => { throw new Error("not called"); },
    };
    const w = mount(AskThread, {
      props: {
        items: [
          { kind: "proposal", id: 1, proposal: { ...proposal, generator: "encounter" }, state: "previewing", choices: {}, credits: 3 },
          { kind: "preview", id: 2, proposalItemId: 1, phase: "ready", shown: { title: "Road Ambush", sections: [] } },
        ] satisfies AskItem[],
        adapters: { adapterFor: () => held, screenFor: () => undefined },
      },
      global: { stubs },
    });
    expect(w.get('[data-testid="ask-fold"]').text()).toContain("Create encounter");
    expect(w.get('[data-testid="ask-preview-again"]').text()).toBe("Again · 3 credits");
    await w.get('[data-testid="ask-preview-create"]').trigger("click");
    await w.get('[data-testid="ask-preview-again"]').trigger("click");
    await w.get('[data-testid="ask-preview-discard"]').trigger("click");
    expect(w.emitted("create")).toEqual([[2]]);
    expect(w.emitted("again")).toEqual([[2]]);
    expect(w.emitted("discard")).toEqual([[2]]);
  });

  // Bug caught: a card a button opened leaving focus on the button, so a keyboard user had to hunt for the dock.
  it("moves focus into a card a button opened, to its concept box first", async () => {
    const w = mount(AskThread, {
      props: { items: [] as AskItem[], adapters },
      global: { stubs: { AskQuoteCard: { template: '<section><h3>Create</h3><textarea data-testid="concept" /><button>Cancel</button></section>' }, AskResultCard: true } },
      attachTo: document.body,
    });
    // Cards open at the top, so scrolling is not under test here.
    Element.prototype.scrollIntoView = () => undefined;
    await w.setProps({ items: [{ kind: "proposal", id: 1, proposal, state: "quote", choices: {}, origin: "button" }] });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.getAttribute("data-testid")).toBe("concept");
    w.unmount();
  });

  // Bug caught: the report card's press not reaching the panel with the draft, so the form opens empty.
  it("draws a report as its card and passes the draft up on review", async () => {
    const report = { kind: "bug", where: "Atlas", action: "a", expected: "b", actual: "c" } as const;
    const w = thread([{ kind: "report", id: 1, report }]);
    await w.get('[data-testid="ask-report-review"]').trigger("click");
    expect(w.emitted("review")?.[0]).toEqual([report]);
  });
});
