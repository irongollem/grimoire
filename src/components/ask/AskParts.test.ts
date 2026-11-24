// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";

const order: string[] = [];
const push = vi.fn(async (to: string) => { order.push(`push ${to}`); });
vi.mock("vue-router", async (original) => ({ ...(await original<typeof import("vue-router")>()), useRouter: () => ({ push }) }));
import AskReply from "./AskReply.vue";
import AskResultCard from "./AskResultCard.vue";
import AskUpsell from "./AskUpsell.vue";
import AskComposer from "./AskComposer.vue";
import AskResultNotice from "./AskResultNotice.vue";
import AskIdeas from "./AskIdeas.vue";
import AskPending from "./AskPending.vue";

const stubs = { RouterLink: { template: "<a><slot /></a>" } };

describe("AskReply", () => {
  // Bug caught: chips staying pressable after the DM answered, so one question is answered twice.
  it("disables the chips once answered", () => {
    const w = mount(AskReply, { props: { text: "Paint her?", choices: [{ label: "Yes", reply: "y", note: "3 credits" }], answered: true } });
    expect(w.get("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("3 credits");
  });

  // Bug caught: replies printed literal ** and "- " because the text was drawn raw.
  it("draws bold, italic and lists as elements, without the markdown characters", () => {
    const w = mount(AskReply, { props: { text: "A **bold** and *soft* word\n\n- one\n- two\n\n1. first" } });
    expect(w.find("strong").text()).toBe("bold");
    expect(w.find("em").text()).toBe("soft");
    expect(w.findAll("ul li")).toHaveLength(2);
    expect(w.findAll("ol li")).toHaveLength(1);
    expect(w.text()).not.toContain("*");
    expect(w.get('[data-testid="ask-reply-text"]').text()).not.toContain("- one");
  });

  // Bug caught: model markup run as HTML. A script or image tag must be shown as text.
  it("shows raw HTML from the model as text and creates no element for it", () => {
    const w = mount(AskReply, { props: { text: '<script>window.x=1</script> <img src=x onerror=alert(1)>' } });
    expect(w.find("script").exists()).toBe(false);
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("<script>window.x=1</script>");
  });

  // Bug caught: the who line missing the generator a proposal names.
  it("names the generator in the who line", () => {
    expect(mount(AskReply, { props: { text: "x", who: "NPC generator" } }).text()).toContain("Familiar · NPC generator");
  });
});

describe("AskResultCard", () => {
  const item = (over: object = {}) => ({
    kind: "result" as const,
    id: 1,
    name: "Mara",
    noun: "NPC",
    review: false,
    record: null,
    route: "/npcs/n1",
    parts: [
      { label: "NPC", ok: true, credits: 4 },
      { label: "Portrait", ok: false, credits: 0, error: "No picture came back.", retry: { credits: 3, run: async () => ({ label: "Portrait", ok: true, credits: 3 }) } },
    ],
    ...over,
  });

  // Bug caught: the extra ways in (View quest, Build flow) dropped, so a result with several places to go offered only one.
  it("draws each extra link beside the main Open", () => {
    const w = mount(AskResultCard, { props: { item: item({ links: [{ label: "View Hook 1", route: "/quests/a" }, { label: "View Hook 2", route: "/quests/b" }] }) }, global: { stubs } });
    expect(w.findAll('[data-testid="ask-result-link"]').map((l) => l.text())).toEqual(["View Hook 1", "View Hook 2"]);
    expect(w.text()).toContain("Open NPC");
    const none = mount(AskResultCard, { props: { item: item({ route: null, links: undefined }) }, global: { stubs } });
    expect(none.find('[data-testid="ask-result-link"]').exists()).toBe(false);
  });

  // Bug caught: a failed part shown as success, or its retry offered without its price.
  it("marks a failed part with its error and a priced retry", () => {
    const w = mount(AskResultCard, { props: { item: item() }, global: { stubs } });
    expect(w.text()).toContain("No picture came back.");
    expect(w.get('[data-testid="ask-retry"]').text()).toBe("Retry Portrait · 3 credits");
  });

  // Bug caught: Retry not reaching the conversation with the right part, or Leave it still leaving Retry on screen.
  it("emits retry for the failed part and hides it after Leave it", async () => {
    const w = mount(AskResultCard, { props: { item: item() }, global: { stubs } });
    await w.get('[data-testid="ask-retry"]').trigger("click");
    expect(w.emitted("retry")).toEqual([[1]]);
    await w.setProps({ item: item({ parts: [{ label: "Portrait", ok: false, credits: 0, error: "x", left: true, retry: { credits: 3, run: async () => ({ label: "Portrait", ok: true, credits: 3 }) } }] }) });
    expect(w.find('[data-testid="ask-retry"]').exists()).toBe(false);
  });

  // Bug caught: suggestions held in a page's own panel opened before the page is there (so nothing shows), or never.
  it("goes to the page first, then opens its panel, for a result that lives in the page's review", async () => {
    order.length = 0;
    const open = vi.fn(() => { order.push("open"); });
    const w = mount(AskResultCard, { props: { item: item({ review: true, route: "/quests", open, parts: [] }) }, global: { stubs } });
    await w.get("button").trigger("click");
    await flushPromises();
    expect(order).toEqual(["push /quests", "open"]);
  });

  // Bug caught: the portrait a run painted never shown in the chat.
  it("shows the run's picture, and a repainted part's picture in its place", async () => {
    const w = mount(AskResultCard, { props: { item: item({ picture: "https://img/first.webp" }) }, global: { stubs: { ...stubs, AiImageBadge: true } } });
    expect(w.get('[data-testid="ask-result-picture"]').attributes("src")).toBe("https://img/first.webp");
    // Marked as AI like every other picture (#611): the badge looks the picture up by its URL.
    expect(w.findComponent({ name: "AiImageBadge" }).props("src")).toBe("https://img/first.webp");
    await w.setProps({ item: item({ picture: "https://img/first.webp", parts: [{ label: "Portrait", ok: true, credits: 3, picture: "https://img/again.webp" }] }) });
    expect(w.get('[data-testid="ask-result-picture"]').attributes("src")).toBe("https://img/again.webp");
    await w.setProps({ item: item() });
    expect(w.find('[data-testid="ask-result-picture"]').exists()).toBe(false);
  });

  // Bug caught: a review generator opening "Open NPC" instead of the page's own review.
  it("says Review suggestions for a review generator", () => {
    const w = mount(AskResultCard, { props: { item: item({ review: true, noun: "quest" }) }, global: { stubs } });
    expect(w.text()).toContain("Review suggestions");
  });
});

describe("AskPending", () => {
  // Bug caught: a creation under way looking finished, or a finished one leaving no way down to its result.
  it("shows the flag while running, then a link to where it landed", async () => {
    const w = mount(AskPending, { props: { state: "running", action: "Create NPC" } });
    expect(w.get('[data-testid="ask-pending"]').text()).toContain("Create NPC");
    expect(w.find('[data-testid="ask-landed-jump"]').exists()).toBe(false);
    await w.setProps({ state: "done", landedAt: 7, landedName: "Mara" });
    expect(w.text()).toContain("Mara is ready.");
    await w.get('[data-testid="ask-landed-jump"]').trigger("click");
    expect(w.emitted("jump")).toEqual([[7]]);
  });

  // Bug caught: the folded line not saying what was asked or what it cost, so a run's price is invisible once it folds.
  it("folds a held generation to one line of what was asked and its cost, and opens the options on request", async () => {
    const w = mount(AskPending, {
      props: { state: "previewing", action: "Create encounter", asked: "Goblin ambush", credits: 2, editable: true },
      slots: { options: '<div data-testid="the-options" />' },
    });
    expect(w.get('[data-testid="ask-landed"]').text()).toContain("Create encounter: Goblin ambush · 2 credits");
    expect(w.find('[data-testid="the-options"]').exists()).toBe(false);
    await w.get('[data-testid="ask-fold-change"]').trigger("click");
    expect(w.find('[data-testid="the-options"]').exists()).toBe(true);
  });

  // Bug caught: a free run (Quick create) saying "0 credits", or a finished run losing its price.
  it("says what a finished run cost, and nothing for a free one", () => {
    expect(mount(AskPending, { props: { state: "done", action: "Create NPC", landedName: "Mara", credits: 1 } }).text()).toContain("Mara is ready. · 1 credit");
    expect(mount(AskPending, { props: { state: "done", action: "Create NPC", landedName: "Mara", credits: 0 } }).text()).not.toContain("credit");
  });

  it("says a discarded generation saved nothing, with what it cost", () => {
    expect(mount(AskPending, { props: { state: "discarded", action: "Create encounter", credits: 1 } }).text()).toContain("discarded. Nothing was saved. · 1 credit");
  });

  it("says a failed run did not finish", () => {
    const w = mount(AskPending, { props: { state: "failed", action: "Create NPC", landedAt: 3 } });
    expect(w.text()).toContain("Create NPC did not finish.");
  });
});

describe("AskUpsell", () => {
  // Bug caught: the upsell offering no way to buy, or not saying when the free ones return.
  it("offers both ways forward and says the free five come back", async () => {
    const w = mount(AskUpsell);
    expect(w.text()).toContain("That was today's five free questions.");
    expect(w.text()).toContain("The free five come back tomorrow.");
    await w.findAll("button").find((b) => b.text() === "Get credits")?.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Upgrade to Pro")?.trigger("click");
    expect(w.emitted("credits")).toHaveLength(1);
    expect(w.emitted("upgrade")).toHaveLength(1);
  });
});

describe("AskComposer", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: Enter inserting a newline, or Shift+Enter sending half a thought.
  it("sends on Enter, keeps the line break on Shift+Enter, and ignores an empty box", async () => {
    const w = mount(AskComposer, { props: { line: "5 of 5 free questions left today" } });
    const field = w.get("textarea");
    await field.trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")).toBeUndefined();
    await field.setValue("who is Mara");
    await field.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(w.emitted("send")).toBeUndefined();
    await field.trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")).toEqual([["who is Mara"]]);
    expect((field.element as HTMLTextAreaElement).value).toBe("");
    expect(w.get('[data-testid="ask-allowance"]').text()).toBe("5 of 5 free questions left today");
  });

  // Bug caught: a second question sent while the first is still being answered.
  it("does not send while a turn is running", async () => {
    const w = mount(AskComposer, { props: { running: true } });
    await w.get("textarea").setValue("again");
    await w.get("textarea").trigger("keydown", { key: "Enter" });
    expect(w.emitted("send")).toBeUndefined();
  });

  // Bug caught: the DM's own words set in print instead of the hand (the data-hand mark is what Vellum keys on).
  it("marks the box as the DM's hand", () => {
    expect(mount(AskComposer).get("textarea").attributes("data-hand")).toBeDefined();
  });
});

describe("AskResultNotice", () => {
  const notice = { name: "Mara", noun: "NPC", review: false, route: "/npcs/n1", credits: 4, campaign: "Kind Country" };

  // Bug caught: the notice losing which campaign or what it cost, the two things a DM away from the panel needs.
  it("names the thing, the campaign and the price, and is a polite status slip", () => {
    const w = mount(AskResultNotice, { props: { notice } });
    const el = w.get('[data-testid="ask-notice"]');
    expect(el.attributes("role")).toBe("status");
    expect(el.attributes("data-slip")).toBeDefined();
    expect(el.text()).toContain("Mara is ready.");
    expect(el.text()).toContain("NPC in Kind Country · 4 credits");
  });

  // Bug caught: Open going nowhere, or Stay here doing more than dismissing.
  it("opens the result's route or just dismisses", async () => {
    const w = mount(AskResultNotice, { props: { notice } });
    await w.findAll("button").find((b) => b.text() === "Open NPC")?.trigger("click");
    await w.findAll("button").find((b) => b.text() === "Stay here")?.trigger("click");
    expect(w.emitted("open")).toEqual([["/npcs/n1"]]);
    expect(w.emitted("dismiss")).toHaveLength(1);
  });
});

describe("AskIdeas", () => {
  const ideas = [{ title: "The baker", lines: [{ canon: true, text: "She trades with", refs: [{ type: "npc" as const, id: "n1", name: "Orin" }] }, { canon: false, text: "She hides a map", refs: [] }], handoff: { generator: "npc", concept: "c", inputs: {} } }];

  // Bug caught: canon and new lines indistinguishable, so invented material reads as established fact.
  it("tags each line Canon or New idea and links refs with their kind", () => {
    const w = mount(AskIdeas, { props: { ideas, handedOff: [] }, global: { stubs } });
    expect(w.text()).toContain("Canon");
    expect(w.text()).toContain("New idea");
    expect(w.text()).toContain("Orin");
    expect(w.text()).toContain("NPC");
  });

  // Bug caught: the handoff button reading "Make this a NPC", or staying pressable after it was used.
  it("offers Make this an NPC and disables it once used", async () => {
    const w = mount(AskIdeas, { props: { ideas, handedOff: [] }, global: { stubs } });
    const button = w.findAll("button").find((b) => b.text() === "Make this an NPC");
    await button?.trigger("click");
    expect(w.emitted("hand-off")).toEqual([[0]]);
    await w.setProps({ handedOff: [0] });
    expect(w.findAll("button").find((b) => b.text() === "Make this an NPC")?.attributes("disabled")).toBeDefined();
  });
});
