import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeLocalStorage";
import { computed } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import type { User } from "@supabase/supabase-js";
import type { Campaign } from "@/types/campaign.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({
  supabase: Object.assign(fake.client, { auth: { getSession: async () => ({ data: { session: { access_token: "token" } }, error: null }) } }),
  getCurrentUser: () => ({ id: "u1" }),
}));

// The layout is a JS branch (`useAbove`), and the test DOM answers one fixed width for every query: say which screen it is.
const { screen } = await vi.hoisted(async () => {
  const { reactive } = await import("vue");
  return { screen: reactive({ width: 30 }) };
});
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAbove: (bp: "md" | "lg") => computed(() => screen.width >= (bp === "md" ? 48 : 64)),
}));

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useTableDisclosure } from "@/composables/table/useTableDisclosure";
import { useAppUiStore } from "@/stores/ui/app";
import TableView from "./TableView.vue";

const enc = new TextEncoder();
const sse = (...events: object[]) =>
  new Response(new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(enc.encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""))); c.close(); } }), {
    headers: { "content-type": "text/event-stream" },
  });

// A party row as the database returns it: the sheet reads every one of these.
const MEMBER = {
  id: "m1", campaign_id: "c1", name: "Inkling", class: "Rogue", level: 3, current_hp: 24, max_hp: 27, temp_hp: 0, speed: 30,
  str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 10, proficiency_bonus: 2, skill_proficiencies: { perception: "proficient" },
  saving_throw_proficiencies: [], conditions: [], spell_slots: [], wildshape_state: null, ruleset: "2014", initiative_bonus: 0,
};

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function setUp(userId: string) {
  setActivePinia(createPinia());
  useAuthStore().user = { id: userId } as User;
  const campaign = useCampaignStore();
  campaign.activeCampaignId = "c1";
  campaign.activeCampaign = { id: "c1", user_id: userId, name: "Sugarwell", ai_enabled: true } as Campaign;
}

async function mountTable(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/table", component: { template: "<div />" } },
      { path: "/play/character", component: { template: "<div />" } },
      { path: "/encounters/:id/run", component: { template: "<div />" } },
      { path: "/play/table/story", component: { template: "<div />" } },
      { name: "table-session", path: "/play/table/:sessionId", component: TableView },
    ],
  });
  await router.push(path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = mount(TableView, {
    attachTo: document.body,
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient }]],
      // The fight itself (its map, the run store, the server's fight function) is the stage's own business and
      // has its own tests: here it only matters whether the table puts a fight on, and which.
      stubs: { SoloFightStage: { props: ["encounterId"], template: '<div data-testid="solo-fight-stage" :data-encounter="encounterId" />' } },
    },
  });
  await flushPromises();
  return { wrapper, router, queryClient };
}

async function say(wrapper: Awaited<ReturnType<typeof mountTable>>["wrapper"], text: string, alt = false) {
  const field = wrapper.get("textarea");
  await field.setValue(text);
  await field.trigger("keydown", { key: "Enter", altKey: alt });
  await flushPromises();
}

beforeEach(() => {
  // The played character's lens is kept for the tab: one test's seat must not carry into the next.
  safeSessionStorage().clear();
  screen.width = 30;
  fake.reset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fake.seed("party_members", [{ ...MEMBER }]);
  fake.seed("character_classes", []);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("TableView: the disclosure", () => {
  // Bug caught: sitting an account down at an AI with no notice (AI Act Art. 50), or nagging them on every visit.
  it("is shown the first time an account sits down, kept once accepted, and not shown again", async () => {
    setUp("first-timer");
    const first = await mountTable("/play/table/new?character=m1");
    expect(document.body.textContent).toContain("Before you sit down");
    // Bug caught: the opening scene asked of the model before the player has been told who answers.
    expect(fetchMock).not.toHaveBeenCalled();
    const accept = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Sit down")!;
    accept.click();
    await flushPromises();
    expect(document.body.textContent).not.toContain("Before you sit down");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ opening: true, message: "", characterId: "m1" });
    first.wrapper.unmount();

    setUp("first-timer");
    await mountTable("/play/table/new?character=m1");
    expect(document.body.textContent).not.toContain("Before you sit down");
  });
});

describe("TableView: playing", () => {
  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
  });

  // Bug caught: the address staying /table/new after the conversation exists, so a reload starts a different story;
  // or becoming the id by remounting, which drops the story that is streaming in.
  it("draws the turn as it streams, and replaces /table/new with the real id without losing the story", async () => {
    fetchMock
      // The Narrator opens the scene the moment the sitting is opened: no words of the player's.
      .mockResolvedValueOnce(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "The lane smells of rain." }, { type: "done", end: "end_turn", credits: 0, tokens: 5 }))
      .mockResolvedValueOnce(
        sse(
          { type: "session", sessionId: "s1" },
          { type: "line", line: { kind: "spoken", speaker: { id: null, name: "Honeycomb" }, text: "Come on, then." } },
          { type: "done", end: "end_turn", credits: 1, tokens: 5 },
        ),
      );
    const { wrapper, router } = await mountTable("/play/table/new?character=m1");
    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("The lane smells of rain.");
    expect(router.currentRoute.value.path).toBe("/play/table/s1");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ campaignId: "c1", opening: true, message: "", characterId: "m1" });

    await say(wrapper, "Who are you?");
    const story = wrapper.get('[data-testid="solo-story"]').text();
    expect(story).toContain("The lane smells of rain.");
    expect(story).toContain("Who are you?");
    expect(story).toContain("Come on, then.");
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(body).toMatchObject({ campaignId: "c1", mode: "say", message: "Who are you?", sessionId: "s1" });
    expect(body.opening).toBeUndefined();
    expect(wrapper.text()).toContain("1 credit this sitting");
  });

  // Bug caught: a failed turn losing the player's words, or Send again resending in the default mode.
  it("after a refusal keeps the player's line and Send again resends the same message in the same mode", async () => {
    fetchMock
      .mockResolvedValueOnce(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "The lane." }, { type: "done", end: "end_turn", credits: 0, tokens: 1 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 503, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "Done." }, { type: "done", end: "end_turn", credits: 0, tokens: 1 }));
    const { wrapper } = await mountTable("/play/table/new?character=m1");
    await say(wrapper, "I draw my knife.", true);

    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("I draw my knife.");
    expect(wrapper.get('[role="alert"]').text()).toContain("The table is resting");
    await wrapper.findAll("button").find((b) => b.text() === "Send again")!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toMatchObject({ mode: "do", message: "I draw my knife." });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("Done.");
  });

  // Bug caught: a new sitting with nobody chosen opening a story about no one.
  it("goes back to choosing when a new sitting names no character", async () => {
    const { router } = await mountTable("/play/table/new");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/table");
  });
});

describe("TableView: leaving", () => {
  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    fake.seed("agent_sessions", [
      { id: "s1", user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: null },
      { id: "s2", user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: "2026-11-17T00:00:00Z" },
    ]);
  });

  const leaveButton = (wrapper: Awaited<ReturnType<typeof mountTable>>["wrapper"]) => wrapper.findAll("button").find((b) => b.text().includes("Leave the table"))!;

  // Bug caught: the bar's "Leave the table" staying a plain link, so the session it opened ran for ever.
  it("tells the server which sitting is left, then goes to the start page", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ left: true, endedSession: true, noteId: null }), { status: 200, headers: { "content-type": "application/json" } }));
    const { wrapper, router } = await mountTable("/play/table/s1");
    await leaveButton(wrapper).trigger("click");
    await flushPromises();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/functions/v1/agent-leave");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ campaignId: "c1", sessionId: "s1" });
    expect(router.currentRoute.value.path).toBe("/table");
  });

  // Bug caught: a failed leave call keeping the player stuck at the table.
  it("still goes to the start page when the call fails, and says so", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const { wrapper, router } = await mountTable("/play/table/s1");
    await leaveButton(wrapper).trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/table");
    expect(useToast().toasts.value.map((t) => t.message).join(" ")).toContain("could not be recorded");
  });

  // Bug caught: leaving a sitting that never began (no conversation yet) calling the server with no id.
  // Bug caught: getting up from the table and still seeing the campaign as the character, with no DM tools.
  it("goes back to being the Dungeon Master when the table is left", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 503, headers: { "content-type": "application/json" } }));
    const { wrapper } = await mountTable("/play/table/new?character=m1");
    expect(useAppUiStore().tablePlay?.memberId).toBe("m1");
    await leaveButton(wrapper).trigger("click");
    await flushPromises();
    expect(useAppUiStore().tablePlay).toBeNull();
    expect(useAppUiStore().dmPreviewMode).toBe(false);
  });

  it("calls no leave for a sitting whose opening was refused, since no conversation exists to leave", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 503, headers: { "content-type": "application/json" } }));
    const { wrapper, router } = await mountTable("/play/table/new?character=m1");
    await leaveButton(wrapper).trigger("click");
    await flushPromises();
    // The one call is the refused opening; nothing was sent to agent-leave.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe("/table");
  });

  // Bug caught: a left sitting reopened with a composer, so the player types into a table the server refuses.
  it("shows a left sitting without a composer and says it has ended", async () => {
    const { wrapper } = await mountTable("/play/table/s2");
    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.get('[data-testid="solo-left"]').text()).toContain("has ended");
  });

  it("keeps the composer for a sitting still going", async () => {
    const { wrapper } = await mountTable("/play/table/s1");
    expect(wrapper.find("textarea").exists()).toBe(true);
    expect(wrapper.find('[data-testid="solo-left"]').exists()).toBe(false);
  });
});

describe("TableView: when the roll is yours", () => {
  const pending = { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception", dc: 31337 };
  const session = (id: string, over: Record<string, unknown> = {}) => ({
    id, user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: null, pending_roll: pending, ...over,
  });

  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    fake.reset();
    fake.seed("party_members", [{ ...MEMBER }]);
    fake.seed("character_classes", []);
  });

  // Bug caught: a reload losing the card, so the sitting waits on a roll nobody can make; or showing the number to beat.
  it("asks again from the stored sitting, with the sheet's bonus and no number to beat", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    const { wrapper } = await mountTable("/play/table/s1");
    const card = wrapper.get('[data-testid="solo-roll-ask"]');
    expect(card.text()).toContain("Wisdom (Perception)");
    // WIS 14 is +2 and a proficient skill adds +2 (PHB 2014 "Ability Checks").
    expect(card.text()).toContain("d20 + 4");
    expect(wrapper.html()).not.toContain("31337");
  });

  // Bug caught: asking a player who has left to roll for a table the server refuses.
  it("shows no card once the sitting has ended", async () => {
    fake.seed("agent_sessions", [session("s2", { left_at: "2026-11-17T00:00:00Z" })]);
    const { wrapper } = await mountTable("/play/table/s2");
    expect(wrapper.find('[data-testid="solo-roll-ask"]').exists()).toBe(false);
  });

  // Bug caught: the card staying after the player answers in words, or the roll not reaching the server as asked.
  it("sends the typed roll with no words, draws the echo, and the card goes", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    fetchMock.mockResolvedValue(
      sse(
        { type: "session", sessionId: "s1" },
        { type: "rolled", roll: { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: true } },
        { type: "text", delta: "You spot it." },
        { type: "done", end: "end_turn", credits: 0, tokens: 1 },
      ),
    );
    const { wrapper } = await mountTable("/play/table/s1");
    await wrapper.get('[data-testid="solo-roll-ask"] input').setValue(13);
    await wrapper.findAll("button").find((b) => b.text() === "Use my roll")!.trigger("click");
    await flushPromises();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ message: "", roll: { faces: [13], mode: "normal", bonus: 4, atTable: true } });
    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("Inkling rolled Wisdom (Perception)");
    expect(wrapper.find('[data-testid="solo-roll-ask"]').exists()).toBe(false);
  });

  // Bug caught: the composer locked while a roll is asked for, so the player cannot just say something instead.
  it("keeps the composer usable beside the card, and a plain message goes without a roll", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    fetchMock.mockResolvedValue(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "Fine." }, { type: "done", end: "end_turn", credits: 0, tokens: 1 }));
    const { wrapper } = await mountTable("/play/table/s1");
    await say(wrapper, "Actually, I leave.");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).not.toHaveProperty("roll");
    expect(wrapper.find('[data-testid="solo-roll-ask"]').exists()).toBe(false);
  });
});

describe("TableView: the sheet", () => {
  const sitting = (id: string, over: Record<string, unknown> = {}) => ({
    id, user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: null, pending_roll: null, ...over,
  });
  const tabButton = (wrapper: Awaited<ReturnType<typeof mountTable>>["wrapper"], label: string) => wrapper.findAll("button").find((b) => b.text() === label);
  const sheetColumn = (wrapper: Awaited<ReturnType<typeof mountTable>>["wrapper"]) => wrapper.get('aside[aria-label="Your character"]');

  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    fake.reset();
    fake.seed("party_members", [{ ...MEMBER }]);
    fake.seed("character_classes", []);
    fake.seed("agent_sessions", [sitting("s1"), sitting("s2", { left_at: "2026-11-17T00:00:00Z" }), sitting("s3", { party_member_id: "gone" })]);
  });

  // Bug caught: the sheet showing a different character than the one sitting at the table, or numbers that are not the row's.
  it("shows the played character's hit points, stats and trained skills on the Sheet tab", async () => {
    const { wrapper } = await mountTable("/play/table/s1");
    await tabButton(wrapper, "Sheet")!.trigger("click");
    const sheet = sheetColumn(wrapper);
    expect(sheet.isVisible()).toBe(true);
    expect(sheet.text()).toContain("of 27");
    expect(sheet.text()).toContain("Level 3");
    expect(sheet.text()).toContain("Perception");
    expect(sheet.text()).toContain("+4");
    expect(sheet.text()).toContain("None");
    expect(sheet.find("a[href='/play/character']").exists()).toBe(true);
  });

  // Bug caught: the asked roll appearing behind the tab the player is reading, so the sitting waits on a card nobody sees.
  it("brings a roll the story asks for back to Story from the Sheet tab", async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));
    const { wrapper } = await mountTable("/play/table/s1");
    await say(wrapper, "I look around.");
    await tabButton(wrapper, "Sheet")!.trigger("click");
    expect(wrapper.get("main").isVisible()).toBe(false);

    answer(sse(
      { type: "session", sessionId: "s1" },
      { type: "ask_roll", roll: { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception", dc: 12 } },
      { type: "done", end: "end_turn", credits: 0, tokens: 1 },
    ));
    await flushPromises();
    expect(wrapper.get("main").isVisible()).toBe(true);
    expect(wrapper.get('[data-testid="solo-roll-ask"]').isVisible()).toBe(true);
  });

  // Bug caught: a sitting whose character cannot be read drawing an empty column and a tab that opens onto nothing.
  it("shows no sheet and no Sheet tab when the character cannot be read", async () => {
    const { wrapper } = await mountTable("/play/table/s3");
    expect(wrapper.find('aside[aria-label="Your character"]').exists()).toBe(false);
    expect(tabButton(wrapper, "Sheet")).toBeUndefined();
  });

  // Bug caught: an ended sitting still offering to change hit points of a character the table has put down.
  it("shows an ended sitting's sheet without Damage or Heal", async () => {
    const live = await mountTable("/play/table/s1");
    expect(sheetColumn(live.wrapper).findAll("button").map((b) => b.text())).toEqual(expect.arrayContaining(["Damage", "Heal"]));
    live.wrapper.unmount();
    const ended = await mountTable("/play/table/s2");
    expect(sheetColumn(ended.wrapper).text()).toContain("of 27");
    expect(ended.wrapper.findAll("button").map((b) => b.text())).not.toContain("Damage");
  });

  // Bug caught: a wide screen hiding the sheet behind a tab, or squeezing a tab bar in beside three columns.
  it("lays the sheet, story and scene side by side from lg up, with no tabs", async () => {
    screen.width = 70;
    const { wrapper } = await mountTable("/play/table/s1");
    expect(sheetColumn(wrapper).isVisible()).toBe(true);
    expect(wrapper.get("main").isVisible()).toBe(true);
    expect(wrapper.get('aside[aria-label="The scene"]').isVisible()).toBe(true);
    expect(tabButton(wrapper, "Sheet")).toBeUndefined();
  });

  // Bug caught: a tablet's story squeezed beside both the sheet and the scene, narrower than it can be read.
  it("on a tablet keeps story with scene and puts the sheet behind its own tab", async () => {
    screen.width = 55;
    const { wrapper } = await mountTable("/play/table/s1");
    expect(tabButton(wrapper, "Scene")).toBeUndefined();
    expect(sheetColumn(wrapper).isVisible()).toBe(false);
    expect(wrapper.get('aside[aria-label="The scene"]').isVisible()).toBe(true);
    await tabButton(wrapper, "Sheet")!.trigger("click");
    expect(sheetColumn(wrapper).isVisible()).toBe(true);
    expect(wrapper.get("main").isVisible()).toBe(false);
    expect(wrapper.get('aside[aria-label="The scene"]').isVisible()).toBe(false);
  });

  // Bug caught: a window widened (or a tablet turned) while on the Sheet or Scene tab, leaving the story hidden behind a tab that no longer exists.
  it("never leaves the page blank when the window outgrows the tab that was open", async () => {
    const { wrapper } = await mountTable("/play/table/s1");
    await tabButton(wrapper, "Sheet")!.trigger("click");
    screen.width = 70;
    await flushPromises();
    expect(wrapper.get("main").isVisible()).toBe(true);

    screen.width = 30;
    await flushPromises();
    await tabButton(wrapper, "Scene")!.trigger("click");
    screen.width = 55;
    await flushPromises();
    expect(wrapper.get("main").isVisible()).toBe(true);
  });

  // Bug caught: the character vanishing from the party (removed, or the read failing) while the Sheet tab is open, leaving nothing on screen.
  it("returns to Story when the character can no longer be read while the Sheet tab is open", async () => {
    const { wrapper, queryClient } = await mountTable("/play/table/s1");
    await tabButton(wrapper, "Sheet")!.trigger("click");
    fake.seed("party_members", []);
    fake.reset();
    fake.seed("agent_sessions", [sitting("s1")]);
    await queryClient.invalidateQueries();
    await flushPromises();
    expect(wrapper.get("main").isVisible()).toBe(true);
  });

  // Bug caught: the phone bar hiding the character's hit points on the Story tab.
  it("puts the character's hit points in the bar", async () => {
    const { wrapper } = await mountTable("/play/table/s1");
    expect(wrapper.get('[data-testid="solo-bar-who"]').text()).toBe("Inkling · 24 of 27 hit points");
  });

  // Bug caught: a non-caster's sheet carrying an empty "Spell slots" heading.
  it("draws spell slots for a caster and none for a character without any", async () => {
    const plain = await mountTable("/play/table/s1");
    expect(sheetColumn(plain.wrapper).text()).not.toContain("Spell slots");
    plain.wrapper.unmount();
    fake.reset();
    fake.seed("party_members", [{ ...MEMBER, spell_slots: [{ level: 1, max: 2, used: 1 }] }]);
    fake.seed("character_classes", []);
    fake.seed("agent_sessions", [sitting("s1")]);
    const caster = await mountTable("/play/table/s1");
    expect(sheetColumn(caster.wrapper).text()).toContain("Spell slots");
    expect(sheetColumn(caster.wrapper).text()).toContain("1 / 2");
  });
});

describe("TableView: what you are after", () => {
  const session = (id: string, over: Record<string, unknown> = {}) => ({
    id, user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: null, pending_roll: null, ...over,
  });
  const quest = (id: string, title: string) => ({ id, title, status: "active", updated_at: "2026-11-17T00:00:00Z" });

  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    fake.reset();
    fake.seed("party_members", [{ ...MEMBER }]);
    fake.seed("character_classes", []);
    // What the character may see, and what only a wider view (the DM's own, or nobody's) would return.
    fake.onRpc("get_player_visible_quests", (args) =>
      args?.p_preview_party_member_id === "m1" ? [quest("q1", "KNOWN-QUEST")] : [quest("q2", "UNSEEN-QUEST")],
    );
    fake.onRpc("get_player_visible_quest_beats", () => []);
  });

  // Bug caught: the scene column reading quests with the DM's own eyes, so it lists a quest the character never heard of.
  it("lists the quests as the played character sees them", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    const { wrapper } = await mountTable("/play/table/s1");
    await vi.waitFor(() => expect(wrapper.find('[data-testid="solo-after"]').exists()).toBe(true));
    expect(wrapper.get('[data-testid="solo-after"]').text()).toContain("KNOWN-QUEST");
    expect(wrapper.html()).not.toContain("UNSEEN-QUEST");
  });

  // Bug caught: a sitting whose character cannot be read falling back to whatever the unscoped read returns.
  it("lists nothing when the character cannot be read", async () => {
    fake.seed("agent_sessions", [session("s1", { party_member_id: "gone" })]);
    const { wrapper } = await mountTable("/play/table/s1");
    await flushPromises();
    await flushPromises();
    expect(wrapper.html()).not.toContain("UNSEEN-QUEST");
    expect(wrapper.find('[data-testid="solo-after"]').exists()).toBe(false);
  });
});

describe("TableView: the story turns into a fight", () => {
  const session = (id: string, over: Record<string, unknown> = {}) => ({
    id, user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: null, pending_roll: null, fight_encounter_id: null, ...over,
  });

  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    fake.reset();
    fake.seed("party_members", [{ ...MEMBER }]);
    fake.seed("character_classes", []);
    fake.seed("encounters", [
      { id: "e1", campaign_id: "c1", name: "The cellar rats" },
      { id: "e2", campaign_id: "c2", name: "ELSEWHERE-FIGHT" },
    ]);
  });

  // Bug caught: a fight started by the story that the table does not put on, or loses on a reload; or the player
  // sent off to the Dungeon Master's fight screen, with its tools and its stat blocks, to fight it.
  it("puts the fight a reopened sitting is waiting on onto the table itself, as the played character", async () => {
    fake.seed("agent_sessions", [session("s1", { fight_encounter_id: "e1" })]);
    const { wrapper, router } = await mountTable("/play/table/s1");
    expect(wrapper.get('[data-testid="solo-fight-stage"]').attributes("data-encounter")).toBe("e1");
    expect(router.currentRoute.value.path).toBe("/play/table/s1");
    // Still played as the character: the lens stays on through the fight.
    expect(useAppUiStore().tablePlay).not.toBeNull();
  });

  // Bug caught: a fight of another campaign named on this table because the read went by id alone.
  it("offers no fight for an encounter that is not this campaign's", async () => {
    fake.seed("agent_sessions", [session("s1", { fight_encounter_id: "e2" })]);
    const { wrapper } = await mountTable("/play/table/s1");
    expect(wrapper.find('[data-testid="solo-fight-stage"]').exists()).toBe(false);
    expect(wrapper.html()).not.toContain("ELSEWHERE-FIGHT");
  });

  // Bug caught: the fight staying on the table after its aftermath was told, or never coming out when the story starts one.
  it("puts the fight on when the story starts one and takes it off once its aftermath is told", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    fetchMock
      .mockResolvedValueOnce(sse({ type: "session", sessionId: "s1" }, { type: "fight", fight: { encounterId: "e1", name: "The cellar rats" } }, { type: "done", end: "end_turn", credits: 0, tokens: 1 }))
      .mockResolvedValueOnce(sse({ type: "session", sessionId: "s1" }, { type: "fight", fight: null }, { type: "done", end: "end_turn", credits: 0, tokens: 1 }));
    const { wrapper } = await mountTable("/play/table/s1");
    await say(wrapper, "I draw my sword.", true);
    expect(wrapper.find('[data-testid="solo-fight-stage"]').exists()).toBe(true);
    await say(wrapper, "What now?");
    expect(wrapper.find('[data-testid="solo-fight-stage"]').exists()).toBe(false);
  });
});

describe("TableView: the characters' voices", () => {
  const session = (id: string) => ({
    id, user_id: "u1", campaign_id: "c1", party_member_id: "m1", scene_location_id: null, credits_spent: 0, left_at: null, pending_roll: null, fight_encounter_id: null,
  });
  // As the server sends a spoken line where voices are on: with the character's cue and the key for voicing it.
  const spoken = (text: string) => ({ type: "line", line: { kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text, how: "wary" }, voice: `key:${text}` });
  const turnWith = (text: string) => sse({ type: "session", sessionId: "s1" }, spoken(text), { type: "line", line: { kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "Nods." } }, { type: "done", end: "end_turn", credits: 0, tokens: 1 });
  const audio = () => new Response(JSON.stringify({ audio: "AAAA", mime: "audio/mpeg" }), { status: 200, headers: { "content-type": "application/json" } });
  const voiceCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("/functions/v1/table-voice")).map((c) => JSON.parse(String(c[1].body)));

  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    fake.reset();
    fake.seed("party_members", [{ ...MEMBER }]);
    fake.seed("character_classes", []);
    fake.seed("agent_sessions", [session("s1")]);
    safeLocalStorage().removeItem("grimoire:ai-table-voices");
    // The test DOM has no sound: a clip that is over the moment it starts stands in for the browser's player.
    vi.stubGlobal(
      "Audio",
      class {
        addEventListener(type: string, done: () => void) {
          if (type === "ended") queueMicrotask(done);
        }
        play() {
          return Promise.resolve();
        }
        pause() {}
        dispatchEvent() {
          return true;
        }
      },
    );
  });

  // Bug caught: the page asking for (and paying for) speech nobody switched on.
  it("asks for no voice while voices are off", async () => {
    fetchMock.mockResolvedValueOnce(turnWith("Come on, then."));
    const { wrapper } = await mountTable("/play/table/s1");
    await say(wrapper, "Who are you?");
    expect(voiceCalls()).toEqual([]);
  });

  // Bug caught: the narrator's switch reading the characters too (or nothing at all), or narration asked for under
  // a character's role, which the server refuses.
  it("with only the narrator switched on, reads the narration under the narrator's role and not the character's line", async () => {
    const narrated = () => sse(
      { type: "session", sessionId: "s1" },
      spoken("Come on, then."),
      { type: "text", delta: "Rain starts." },
      { type: "voice", role: "narrator", text: "Rain starts.", voice: "key:rain" },
      { type: "done", end: "end_turn", credits: 0, tokens: 0 },
    );
    fetchMock.mockImplementation(async (url: string) => (String(url).includes("table-voice") ? audio() : narrated()));
    const { wrapper } = await mountTable("/play/table/s1");
    await wrapper.get('[data-testid="solo-voice-narrator"]').trigger("click");
    await say(wrapper, "Who are you?");
    await flushPromises();
    expect(voiceCalls()).toEqual([{ campaignId: "c1", sessionId: "s1", role: "narrator", speakerId: null, speakerName: "The Narrator", text: "Rain starts.", how: null, key: "key:rain" }]);
  });

  // Bug caught: a deed read aloud, a line spoken twice on the next turn, or a line sent without the cue and key it came with
  // (the server refuses that one, so the character would stay silent).
  it("reads what a character said, once, with its cue and key, and leaves the deed as text", async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).includes("table-voice") ? audio() : turnWith(fetchMock.mock.calls.filter((c) => String(c[0]).includes("agent-turn")).length === 1 ? "Come on, then." : "This way.")));
    const { wrapper } = await mountTable("/play/table/s1");
    await wrapper.get('[data-testid="solo-voice-characters"]').trigger("click");
    await say(wrapper, "Who are you?");
    await flushPromises();
    expect(voiceCalls()).toEqual([{ campaignId: "c1", sessionId: "s1", role: "character", speakerId: "n1", speakerName: "Honeycomb", text: "Come on, then.", how: "wary", key: "key:Come on, then." }]);
    await say(wrapper, "Lead on.");
    await flushPromises();
    expect(voiceCalls().map((c) => c.text)).toEqual(["Come on, then.", "This way."]);
  });
});

describe("TableView: watching the characters talk", () => {
  const opened = () => sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "The fire is low." }, { type: "done", end: "done", credits: 0, tokens: 5 });
  const talking = (text: string, floor = true) =>
    sse(
      { type: "session", sessionId: "s1" },
      { type: "line", line: { kind: "spoken", speaker: { id: null, name: "Comfit" }, text } },
      { type: "done", end: "done", credits: 0, tokens: 5, ...(floor ? { floor: "characters" } : {}) },
    );
  const turnBodies = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("agent-turn")).map((c) => JSON.parse(String(c[1].body)));

  beforeEach(() => {
    setUp("u1");
    useTableDisclosure().accept();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Bug caught: the characters stopping after one beat and waiting on a player who only wanted to watch; or the
  // listening turn drawn as a line the player said.
  it("lets them go on by themselves when the turn ends with the floor still theirs", async () => {
    fetchMock.mockResolvedValueOnce(opened()).mockResolvedValueOnce(talking("Who lost the key, then?")).mockResolvedValueOnce(talking("Not me.", false));
    const { wrapper } = await mountTable("/play/table/new?character=m1");
    await say(wrapper, "I sit and listen.", true);
    expect(wrapper.find('[data-testid="solo-going-on"]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
    expect(turnBodies()).toHaveLength(3);
    expect(turnBodies()[2]).toMatchObject({ message: "", listening: true });
    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("Not me.");
    // The floor came back to the player: nothing more goes on by itself.
    expect(wrapper.find('[data-testid="solo-going-on"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(turnBodies()).toHaveLength(3);
  });

  // Bug caught: the characters talking over a player who stepped in, spending a turn they did not want.
  it("does not go on once the player steps in", async () => {
    fetchMock.mockResolvedValueOnce(opened()).mockResolvedValueOnce(talking("Who lost the key, then?"));
    const { wrapper } = await mountTable("/play/table/new?character=m1");
    await say(wrapper, "I sit and listen.", true);
    const stepIn = wrapper.findAll("button").find((b) => b.text() === "Step in")!;
    await stepIn.trigger("click");
    await vi.advanceTimersByTimeAsync(6000);
    await flushPromises();
    expect(turnBodies()).toHaveLength(2);
  });

  // Bug caught: the characters talking over what the player has begun to write.
  it("does not go on while the player is writing", async () => {
    fetchMock.mockResolvedValueOnce(opened()).mockResolvedValueOnce(talking("Who lost the key, then?"));
    const { wrapper } = await mountTable("/play/table/new?character=m1");
    await say(wrapper, "I sit and listen.", true);
    await wrapper.get("textarea").setValue("Wait, I");
    await vi.advanceTimersByTimeAsync(6000);
    await flushPromises();
    expect(turnBodies()).toHaveLength(2);
  });

  // Bug caught: a conversation that runs on for ever on the player's credits.
  it("stops after three turns in a row and waits for the player", async () => {
    fetchMock.mockResolvedValueOnce(opened());
    for (let i = 0; i < 6; i += 1) fetchMock.mockResolvedValueOnce(talking(`Line ${i}.`));
    const { wrapper } = await mountTable("/play/table/new?character=m1");
    await say(wrapper, "I sit and listen.", true);
    for (let i = 0; i < 6; i += 1) {
      await vi.advanceTimersByTimeAsync(3000);
      await flushPromises();
    }
    // The opening, the player's own turn, and three listening turns.
    expect(turnBodies()).toHaveLength(5);
    expect(turnBodies().filter((b) => b.listening === true)).toHaveLength(3);
  });
});
