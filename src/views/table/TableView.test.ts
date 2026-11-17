import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useTableDisclosure } from "@/composables/table/useTableDisclosure";
import TableView from "./TableView.vue";

const enc = new TextEncoder();
const sse = (...events: object[]) =>
  new Response(new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(enc.encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""))); c.close(); } }), {
    headers: { "content-type": "text/event-stream" },
  });

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
      { name: "table-session", path: "/table/:sessionId", component: TableView },
    ],
  });
  await router.push(path);
  const wrapper = mount(TableView, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await flushPromises();
  return { wrapper, router };
}

async function say(wrapper: Awaited<ReturnType<typeof mountTable>>["wrapper"], text: string, alt = false) {
  const field = wrapper.get("textarea");
  await field.setValue(text);
  await field.trigger("keydown", { key: "Enter", altKey: alt });
  await flushPromises();
}

beforeEach(() => {
  fake.reset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fake.seed("party_members", [{ id: "m1", campaign_id: "c1", name: "Inkling", class: "Rogue", level: 3 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("TableView: the disclosure", () => {
  // Bug caught: sitting an account down at an AI with no notice (AI Act Art. 50), or nagging them on every visit.
  it("is shown the first time an account sits down, kept once accepted, and not shown again", async () => {
    setUp("first-timer");
    const first = await mountTable("/table/new?character=m1");
    expect(document.body.textContent).toContain("Before you sit down");
    const accept = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Sit down")!;
    accept.click();
    await flushPromises();
    expect(document.body.textContent).not.toContain("Before you sit down");
    first.wrapper.unmount();

    setUp("first-timer");
    await mountTable("/table/new?character=m1");
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
    fetchMock.mockResolvedValue(
      sse(
        { type: "session", sessionId: "s1" },
        { type: "text", delta: "The lane smells of rain." },
        { type: "line", line: { kind: "spoken", speaker: { id: null, name: "Honeycomb" }, text: "Come on, then." } },
        { type: "done", end: "end_turn", credits: 1, tokens: 5 },
      ),
    );
    const { wrapper, router } = await mountTable("/table/new?character=m1");
    await say(wrapper, "Who are you?");

    const story = wrapper.get('[data-testid="solo-story"]').text();
    expect(story).toContain("Who are you?");
    expect(story).toContain("The lane smells of rain.");
    expect(story).toContain("Come on, then.");
    expect(router.currentRoute.value.path).toBe("/table/s1");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ campaignId: "c1", mode: "say", message: "Who are you?", characterId: "m1" });
    expect(wrapper.text()).toContain("1 credit this sitting");
  });

  // Bug caught: a failed turn losing the player's words, or Send again resending in the default mode.
  it("after a refusal keeps the player's line and Send again resends the same message in the same mode", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 503, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(sse({ type: "session", sessionId: "s1" }, { type: "text", delta: "Done." }, { type: "done", end: "end_turn", credits: 0, tokens: 1 }));
    const { wrapper } = await mountTable("/table/new?character=m1");
    await say(wrapper, "I draw my knife.", true);

    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("I draw my knife.");
    expect(wrapper.get('[role="alert"]').text()).toContain("The table is resting");
    await wrapper.findAll("button").find((b) => b.text() === "Send again")!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({ mode: "do", message: "I draw my knife." });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="solo-story"]').text()).toContain("Done.");
  });

  // Bug caught: a new sitting with nobody chosen opening a story about no one.
  it("goes back to choosing when a new sitting names no character", async () => {
    const { router } = await mountTable("/table/new");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/table");
  });
});
