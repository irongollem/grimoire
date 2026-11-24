// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskItem } from "@/composables/ask/useAskConversation";
import AskPreviewCard from "./AskPreviewCard.vue";

type Preview = Extract<AskItem, { kind: "preview" }>;

const item = (over: Partial<Preview> = {}): Preview => ({
  kind: "preview", id: 4, proposalItemId: 2, phase: "ready", rows: {},
  shown: {
    title: "Road Ambush",
    badge: "Hard for the party",
    sections: [
      { heading: "Combatants", rows: [{ label: "4 × Goblin", detail: "CR 1/4" }, { label: "1 × Goblin Boss", detail: "CR 1" }] },
      { rows: [{ label: "Twist", detail: "A bridge" }] },
    ],
    note: "Not in your Bestiary, to add by hand: 1 × Dragon",
  },
  ...over,
});
const again = { price: 1, blocked: false };
const card = (over: Partial<Preview> = {}, a = again) => mount(AskPreviewCard, { props: { item: item(over), action: "Create encounter", again: a }, global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });

describe("AskPreviewCard", () => {
  // Bug caught: the preview drawn without what makes it worth a decision: the line-up with CRs, the difficulty, the note.
  it("draws the title, the badge, each row and the note, and says it is not saved", () => {
    const w = card();
    expect(w.text()).toContain("Ready · not saved yet");
    expect(w.get('[data-testid="ask-preview-title"]').text()).toBe("Road Ambush");
    expect(w.get('[data-testid="ask-preview-badge"]').text()).toBe("Hard for the party");
    expect(w.text()).toContain("4 × Goblin");
    expect(w.text()).toContain("CR 1/4");
    expect(w.text()).toContain("Twist");
    expect(w.get('[data-testid="ask-preview-note"]').text()).toContain("1 × Dragon");
  });

  // Bug caught: Again not naming its price, so a second charge is a surprise.
  it("names what Again costs, and Create says the generator's action", () => {
    const w = card({}, { price: 3, blocked: false });
    expect(w.get('[data-testid="ask-preview-again"]').text()).toBe("Again · 3 credits");
    expect(w.get('[data-testid="ask-preview-create"]').text()).toBe("Create encounter");
  });

  it("each button emits its own press", async () => {
    const w = card();
    await w.get('[data-testid="ask-preview-create"]').trigger("click");
    await w.get('[data-testid="ask-preview-again"]').trigger("click");
    await w.get('[data-testid="ask-preview-discard"]').trigger("click");
    expect([w.emitted("create")?.length, w.emitted("again")?.length, w.emitted("discard")?.length]).toEqual([1, 1, 1]);
  });

  // Bug caught: Create, Again or Discard pressable while one of them is under way.
  it.each(["saving", "again"] as const)("disables every button while %s", (phase) => {
    const w = card({ phase });
    for (const id of ["create", "again", "discard"]) expect(w.get(`[data-testid="ask-preview-${id}"]`).attributes("disabled")).toBeDefined();
  });

  // Bug caught: Again offered with a gate saying no (credits short).
  it("disables Again when a gate says no, and leaves Create and Discard", () => {
    const w = card({}, { price: 4, blocked: true });
    expect(w.get('[data-testid="ask-preview-again"]').attributes("disabled")).toBeDefined();
    expect(w.get('[data-testid="ask-preview-create"]').attributes("disabled")).toBeUndefined();
  });

  // Bug caught: a save that failed showing nothing, so the DM stares at a card that did nothing.
  it("shows why a save or a second generation did not work", () => {
    expect(card({ error: "You have reached your limit of encounters on this plan." }).get('[data-testid="ask-preview-error"]').text()).toContain("limit of encounters");
  });

  // Bug caught: a row's version choice not drawn, or a pick not reported with its key (so Create saved the default).
  it("draws a row's choice under it and reports a pick with the choice's key", async () => {
    const w = mount(AskPreviewCard, {
      props: {
        item: item({ shown: { title: "T", sections: [{ heading: "Combatants", hint: "More than one book.", rows: [{ label: "2 × Goblin", detail: "CR 1/4", choice: { key: "0", label: "Version", options: [{ id: "a", name: "Core · CR 1/4" }, { id: "b", name: "Kobold · CR 1/2" }], value: "a" } }] }] } }),
        action: "Create encounter", again,
      },
      global: { stubs: { EntityCombobox: { props: ["modelValue", "options"], emits: ["update:modelValue"], template: '<button data-testid="combo" @click="$emit(\'update:modelValue\', \'b\')">{{ modelValue }}</button>' } } },
    });
    expect(w.text()).toContain("More than one book.");
    await w.get('[data-testid="combo"]').trigger("click");
    expect(w.emitted("pick")).toEqual([["0", "b"]]);
  });

  // Bug caught: the per-row press not drawn, or reported without its place, so a hook's Create quest built the wrong one.
  it("draws a row's own button and reports its section and row", async () => {
    const run = async () => ({ label: "Q", ok: true as const, credits: 0 });
    const w = mount(AskPreviewCard, { props: { item: item({ shown: { title: "T", sections: [{ rows: [{ label: "A", detail: "", action: { label: "Create quest", doneLabel: "Created", run } }] }, { rows: [{ label: "B", detail: "", action: { label: "Create quest", doneLabel: "Created", run } }] }] } }), action: "Done", again } });
    await w.get('[data-testid="ask-preview-row-1-0"] button').trigger("click");
    expect(w.emitted("act")).toEqual([[1, 0]]);
  });

  // Bug caught: a done row still offering its button (a second quest), or its link and note missing.
  it("a done row says what it did, offers its links and its note, and has no button", () => {
    const run = async () => ({ label: "Q", ok: true as const, credits: 0 });
    const w = card({
      shown: { title: "T", sections: [{ rows: [{ label: "A", detail: "", action: { label: "Create quest", doneLabel: "Created", run } }] }] },
      rows: { "0:0": { phase: "done", doneLabel: "Created", links: [{ label: "View quest", route: "/quests/q1" }], error: "It has no story beats yet." } },
    });
    expect(w.get('[data-testid="ask-preview-row-done"]').text()).toBe("Created");
    expect(w.get('[data-testid="ask-preview-row-link"]').text()).toBe("View quest");
    expect(w.get('[data-testid="ask-preview-row-note"]').text()).toContain("no story beats");
    expect(w.find('[data-testid="ask-preview-row-action"]').exists()).toBe(false);
  });

  // Bug caught: a failed row losing its error, or its button, so the DM could not try again.
  it("a failed row shows why and keeps its button; a running row blocks every button", () => {
    const run = async () => ({ label: "Q", ok: true as const, credits: 0 });
    const shown = { title: "T", sections: [{ rows: [{ label: "A", detail: "", action: { label: "Said it", doneLabel: "Said", run } }] }] };
    const failed = card({ shown, rows: { "0:0": { phase: "failed", error: "Could not be kept: db down" } } });
    expect(failed.get('[data-testid="ask-preview-row-error"]').text()).toContain("db down");
    expect(failed.get('[data-testid="ask-preview-row-action"]').attributes("disabled")).toBeUndefined();
    const running = card({ shown, rows: { "0:0": { phase: "running" } } });
    for (const id of ["create", "discard"]) expect(running.get(`[data-testid="ask-preview-${id}"]`).attributes("disabled")).toBeDefined();
  });

  // Bug caught: a draft's prose drawn as one hint line per paragraph (or raw), losing its headings and emphasis.
  it("draws the body through the sanitized viewer, before the rows", () => {
    const w = card({ shown: { title: "T", body: "The **Duke** fell.\n\n<img src=x onerror=alert(1)>", sections: [{ rows: [{ label: "Tags", detail: "Heist" }] }] } });
    const body = w.get('[data-testid="ask-preview-body"]');
    expect(body.find("strong").text()).toBe("Duke");
    // Typed markup is text in the viewer, never an element that could run.
    expect(body.find("img").exists()).toBe(false);
  });

  // Bug caught: a saved preview staying on screen beside the result card, two cards for one encounter.
  it("is gone once saved, and says discarded once discarded", () => {
    expect(card({ phase: "saved" }).find('[data-testid="ask-preview"]').exists()).toBe(false);
    const gone = card({ phase: "discarded" });
    expect(gone.get('[data-testid="ask-preview-discarded"]').text()).toBe("Discarded. Nothing was saved.");
    expect(gone.find('[data-testid="ask-preview-create"]').exists()).toBe(false);
  });

  // Bug caught: a save of unknown outcome offering Create again, which could make a second record.
  it("offers no buttons after a save of unknown outcome", () => {
    expect(card({ phase: "failed", error: "Check the list." }).find('[data-testid="ask-preview-foot"]').exists()).toBe(false);
  });
});
