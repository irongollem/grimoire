import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeSessionStorage } from "@/lib/safeLocalStorage";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import type { User } from "@supabase/supabase-js";

const { fake, confirm } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), confirm: vi.fn() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm }) }));

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useTableUiStore } from "@/stores/ui/table";
import TableStoryView from "./TableStoryView.vue";

const fact = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  campaign_id: "c1",
  session_id: null,
  body: `Fact ${id}`,
  known_to_player: true,
  supersedes_id: null,
  source: "table",
  kept_at: null,
  struck_at: null,
  created_at: `2026-11-10T10:00:0${id.length}Z`,
  ...over,
});

function setUp(role: "dm" | "player") {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: "u1" } as User;
  auth.membership = { role } as typeof auth.membership;
  useCampaignStore().activeCampaignId = "c1";
}

async function mountView(): Promise<VueWrapper> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/table", component: { template: "<div />" } },
      { path: "/table/story", component: { template: "<div />" } },
      { path: "/:rest(.*)*", component: { template: "<div />" } },
    ],
  });
  await router.push("/table/story");
  const wrapper = mount(TableStoryView, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await vi.waitFor(() => expect(wrapper.find('[data-testid="record-fact"]').exists() || wrapper.find('[data-testid="record-empty"]').exists()).toBe(true));
  await flushPromises();
  return wrapper;
}

const button = (w: VueWrapper, label: string) => w.findAll("button, a").find((b) => b.text() === label);
const texts = (w: VueWrapper) => w.findAll('[data-testid="record-fact"] p').map((p) => p.text());

beforeEach(() => {
  // The played character's lens is kept for the tab: one test's seat must not carry into the next.
  safeSessionStorage().clear();
  fake.reset();
  confirm.mockReset();
});

describe("TableStoryView", () => {
  // Bug caught: the page reading every campaign's facts because it relied on RLS to narrow the read.
  it("shows only the active campaign's facts", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a"), fact("b", { campaign_id: "other", body: "Somewhere else" })]);
    const w = await mountView();
    expect(texts(w)).toEqual(["Fact a"]);
  });

  // Bug caught: a closed fact dropped from view, or its successor listed apart from it.
  it("shows a struck-through fact directly followed by the one that overtook it", async () => {
    setUp("dm");
    fake.seed("story_facts", [
      fact("a", { body: "The bridge stands" }),
      fact("bb", { body: "The bridge burned", supersedes_id: "a", source: "correction" }),
    ]);
    const w = await mountView();
    expect(texts(w)).toEqual(["The bridge stands", "The bridge burned"]);
    const rows = w.findAll('[data-testid="record-fact"]');
    expect(rows[0]!.attributes("data-closed")).toBe("true");
    expect(rows[1]!.attributes("data-closed")).toBeUndefined();
    expect(rows[1]!.text()).toContain("Corrected by the player");
  });

  // Bug caught: a fact the DM struck (it never happened) still read as true on the story page, or offered Correct and Reveal.
  it("shows a struck fact struck through as removed with nothing to do to it, and keeps it from a player at the table", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a", { body: "The guild master was hanged", struck_at: "2026-11-20T10:00:00Z" })]);
    const w = await mountView();
    expect(texts(w)).toEqual(["The guild master was hanged"]);
    expect(w.find('[data-testid="record-struck"]').text()).toContain("never happened");
    expect(button(w, "Correct this")).toBeUndefined();
    w.unmount();

    setUp("player");
    useAppUiStore().tablePlay = { sessionId: "s1" } as never;
    const asPlayer = await mountView();
    expect(texts(asPlayer)).toEqual([]);
    asPlayer.unmount();
  });

  // Bug caught: a player being offered writes the database would refuse (or, worse, ones it would allow).
  it("offers a player no Correct, Reveal or add field", async () => {
    setUp("player");
    fake.seed("story_facts", [fact("a")]);
    const w = await mountView();
    expect(texts(w)).toEqual(["Fact a"]);
    expect(button(w, "Correct this")).toBeUndefined();
    expect(button(w, "Reveal")).toBeUndefined();
    expect(w.find('[data-testid="record-add"]').exists()).toBe(false);
  });

  // Bug caught (#1255 item 23): the DM able to Keep and Strike on the Canon page but not here, or offered them on a line they wrote themselves.
  it("offers the DM Keep and Strike on a fact the table added, and neither on a fact the DM wrote", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a"), fact("bb", { source: "dm", body: "Mine" })]);
    const w = await mountView();
    const [table, mine] = w.findAll('[data-testid="record-fact"]');
    const labels = (row: typeof table) => row!.findAll("button, a").map((b) => b.text());
    expect(labels(table)).toEqual(expect.arrayContaining(["Keep", "Strike"]));
    expect(labels(mine)).not.toContain("Keep");
    expect(labels(mine)).not.toContain("Strike");
    w.unmount();
  });

  // Bug caught: the DM's account, sitting at the table as the played character (it is the DM's account there), offered a review that is not the player's.
  it("offers nobody at the played seat Keep or Strike, though the account is the DM's", async () => {
    setUp("dm");
    useAppUiStore().tablePlay = { sessionId: "s1" } as never;
    fake.seed("story_facts", [fact("a")]);
    const w = await mountView();
    expect(button(w, "Keep")).toBeUndefined();
    expect(button(w, "Strike")).toBeUndefined();
    w.unmount();
  });

  // Bug caught: Strike stamping the wrong fact or leaving the line without a way back; Undo giving back a keep that was there.
  it("strikes a fact, and Undo gives the earlier keep back", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a", { kept_at: "2026-11-11T10:00:00Z" })]);
    const w = await mountView();
    await button(w, "Strike")!.trigger("click");
    await vi.waitFor(() => expect(fake.rows("story_facts")[0]!["struck_at"]).not.toBeNull());
    expect(fake.rows("story_facts")[0]!["kept_at"]).toBeNull();
    await vi.waitFor(() => expect(button(w, "Undo")).toBeDefined());
    await button(w, "Undo")!.trigger("click");
    await vi.waitFor(() => expect(fake.rows("story_facts")[0]!["struck_at"]).toBeNull());
    expect(fake.rows("story_facts")[0]!["kept_at"]).toBe("2026-11-11T10:00:00Z");
    w.unmount();
  });

  // Bug caught: a correction rewriting the original row, or losing its hidden state, sitting or ties.
  it("files a correction as a new fact that keeps the original's hidden state, sitting and ties, and never updates the original", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a", { body: "The key is brass", known_to_player: false, session_id: "s1" })]);
    fake.seed("story_fact_links", [
      { id: "l1", fact_id: "a", campaign_id: "c1", kind: "npc", npc_id: "n1", location_id: null, quest_id: null, quest_beat_id: null, item_id: null, monster_id: null },
    ]);
    const w = await mountView();
    await button(w, "Correct this")!.trigger("click");
    await flushPromises();
    const field = document.body.querySelector<HTMLInputElement>("[role='dialog'] input[maxlength='600']")!;
    field.value = "The key is silver";
    field.dispatchEvent(new Event("input"));
    await flushPromises();
    document.body.querySelector<HTMLButtonElement>("[role='dialog'] button[type='submit']")!.click();
    await vi.waitFor(() => expect(fake.rows("story_facts")).toHaveLength(2));

    const original = fake.rows("story_facts").find((r) => r["id"] === "a")!;
    expect(original["body"]).toBe("The key is brass");
    expect(fake.calls.some((c) => c.target === "story_facts" && c.op === "update")).toBe(false);
    const made = fake.rows("story_facts").find((r) => r["id"] !== "a")!;
    expect(made).toMatchObject({
      body: "The key is silver",
      supersedes_id: "a",
      source: "correction",
      known_to_player: false,
      session_id: "s1",
      campaign_id: "c1",
    });
    const copied = fake.rows("story_fact_links").find((r) => r["fact_id"] === made["id"]);
    expect(copied).toMatchObject({ kind: "npc", npc_id: "n1", campaign_id: "c1" });
    w.unmount();
  });

  // Bug caught: saving a "correction" identical to the original, which overtakes a fact with a copy of itself.
  it("will not save a correction equal to the original", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a", { body: "The key is brass" })]);
    const w = await mountView();
    await button(w, "Correct this")!.trigger("click");
    await flushPromises();
    expect(document.body.querySelector("[role='dialog'] button[type='submit']")!.hasAttribute("disabled")).toBe(true);
    document.body.querySelector("[role='dialog'] form")!.dispatchEvent(new Event("submit"));
    await flushPromises();
    expect(fake.rows("story_facts")).toHaveLength(1);
    w.unmount();
  });

  // Bug caught: Reveal telling the party on a single stray click, which cannot be undone in play.
  it("reveals a hidden fact only after the DM confirms, and a cancelled confirm changes nothing", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a", { known_to_player: false })]);
    const w = await mountView();
    expect(w.text()).toContain("The party does not know this yet");

    confirm.mockResolvedValueOnce(false);
    await button(w, "Reveal")!.trigger("click");
    await flushPromises();
    expect(fake.rows("story_facts")[0]!["known_to_player"]).toBe(false);

    confirm.mockResolvedValueOnce(true);
    await button(w, "Reveal")!.trigger("click");
    await vi.waitFor(() => expect(fake.rows("story_facts")[0]!["known_to_player"]).toBe(true));
  });

  // Bug caught: a hand-added fact filed outside the running sitting, or visible when the DM marked it hidden.
  it("adds a fact by hand to the open sitting, hidden when asked", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a")]);
    fake.seed("campaign_sessions", [
      { id: "s9", campaign_id: "c1", number: 9, title: null, played_on: null, started_at: "2026-11-10T09:00:00Z", ended_at: null },
      { id: "s8", campaign_id: "c1", number: 8, title: null, played_on: null, started_at: "2026-11-01T09:00:00Z", ended_at: "2026-11-01T12:00:00Z" },
    ]);
    const w = await mountView();
    const add = w.find('[data-testid="record-add"]');
    await add.find("input[type='text'], input:not([type])").setValue("The cellar is flooded");
    await add.find("input[type='checkbox']").setValue(true);
    await add.trigger("submit");
    await vi.waitFor(() => expect(fake.rows("story_facts")).toHaveLength(2));
    expect(fake.rows("story_facts").find((r) => r["id"] !== "a")).toMatchObject({
      body: "The cellar is flooded",
      source: "dm",
      known_to_player: false,
      session_id: "s9",
      campaign_id: "c1",
    });
  });

  // Bug caught: the search box hiding the facts but leaving no way to see why the page looks empty.
  it("filters by text and offers Clear while a search is active", async () => {
    setUp("dm");
    fake.seed("story_facts", [fact("a", { body: "The innkeeper is Mara" }), fact("bb", { body: "The mill burned" })]);
    const w = await mountView();
    useTableUiStore().storyRecordSearch = "mill";
    await flushPromises();
    expect(texts(w)).toEqual(["The mill burned"]);
    await button(w, "Clear")!.trigger("click");
    expect(texts(w)).toHaveLength(2);
  });

  // Bug caught: an empty record showing a blank page with no hint of what will fill it.
  it("says what will appear when nothing is on record", async () => {
    setUp("player");
    const w = await mountView();
    expect(w.find('[data-testid="record-empty"]').text()).toMatch(/kept here as they happen/);
  });
});

describe("TableStoryView at the table", () => {
  // Bug caught: the DM's own read (every fact, hidden ones included) drawn for someone who is playing a character.
  it("shows a player at the table only what the party knows, with no Reveal and no field to file facts, but a way to correct", async () => {
    setUp("dm");
    useAppUiStore().enterTablePlay("m1", "s9");
    fake.seed("story_facts", [fact("a", { body: "The key is brass" }), fact("bb", { body: "HIDDEN-MARK the duke is the lich", known_to_player: false })]);
    const wrapper = await mountView();
    expect(texts(wrapper)).toEqual(["The key is brass"]);
    expect(wrapper.html()).not.toContain("HIDDEN-MARK");
    expect(button(wrapper, "Reveal")).toBeUndefined();
    expect(wrapper.text()).not.toContain("Put something on the record");
    expect(button(wrapper, "Correct this")).toBeDefined();
    expect(button(wrapper, "Back to the story")!.attributes("href")).toBe("/play/table/s9");
  });
});
