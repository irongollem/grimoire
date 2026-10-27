import { describe, expect, it, beforeEach, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const mocks = vi.hoisted(() => ({
  campaignStore: { activeCampaignId: null as string | null },
  selects: [] as string[],
  limits: [] as number[],
  /** When set, the next windowed read starts now but answers only when this resolves. */
  hold: null as Promise<void> | null,
  sent: 0,
}));

type Chain = { [key: string]: unknown };

/**
 * The fake, with the two request-shape facts #999 pins (which columns, which
 * window size) recorded, and the ability to hold one windowed read back so a
 * refresh can be in flight while something else happens.
 */
function wrap(builder: object): Chain {
  return new Proxy(builder as Chain, {
    get(target, prop) {
      const value = target[prop as string];
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (prop === "select") mocks.selects.push(String(args[0]));
        // The database stamps these; the fake does not.
        if (prop === "insert") args[0] = { id: `sent-${++mocks.sent}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 10 + mocks.sent)).toISOString(), ...(args[0] as object) };
        const result = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (prop === "limit") {
          mocks.limits.push(Number(args[0]));
          const held = mocks.hold;
          mocks.hold = null;
          if (held) {
            const snapshot = Promise.resolve(wrap(target));
            return held.then(() => snapshot);
          }
        }
        return result === target ? wrap(target) : result;
      };
    },
  });
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => wrap(fake.client.from(table) as object), rpc: vi.fn() },
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaignStore }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { id: "u1" }, isDM: false, profile: null }),
}));
vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => ({ dmPreviewMode: false }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/party/useSpeaker", () => ({
  useSpeaker: () => ({
    speaker: (c: { name: string }) => ({ name: c.name, forPartyMemberId: null }),
    forPartyMemberIdOfName: () => null,
  }),
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: { value: [] } }),
}));

import { useCampaignMessages } from "./useCampaignMessages";

const msg = (id: string, created_at: string, over: Record<string, unknown> = {}) => ({
  id, campaign_id: "c-ring", user_id: "u2", recipient_user_id: null, type: "chat",
  sender_name: "x", message: id, metadata: null, created_at, ...over,
});
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  fake.reset();
  mocks.hold = null;
  mocks.sent = 0;
  mocks.selects.length = 0;
  mocks.limits.length = 0;
});

describe("useCampaignMessages write errors", () => {
  beforeEach(() => {
    mocks.campaignStore.activeCampaignId = "c1";
  });

  it("sendMessage throws a refused insert instead of vanishing", async () => {
    const { sendMessage, messages } = useCampaignMessages();
    await flush();
    fake.failNext("campaign_messages", { message: "new row violates row-level security policy", code: "42501" });
    await expect(sendMessage("psst", "u2")).rejects.toMatchObject({ code: "42501" });
    expect(messages.value).toHaveLength(0);
    expect(fake.rows("campaign_messages")).toEqual([]);
  });

  it("deleteMessage throws a refused delete", async () => {
    const { deleteMessage } = useCampaignMessages();
    await flush();
    fake.failNext("campaign_messages", { message: "denied" });
    await expect(deleteMessage("m1")).rejects.toMatchObject({ message: "denied" });
  });

  it("sendMessage files the trimmed line under this campaign and the sender, and sends nothing for blank text", async () => {
    const { sendMessage } = useCampaignMessages();
    await sendMessage("   ");
    expect(fake.rows("campaign_messages")).toEqual([]);
    await sendMessage("  hello  ", "u2");
    expect(fake.rows("campaign_messages")).toMatchObject([
      { campaign_id: "c1", user_id: "u1", recipient_user_id: "u2", message: "hello", type: "chat" },
    ]);
  });
});

describe("useCampaignMessages history (#999)", () => {
  it("reads only a narrow probe while the chat has never been opened, then the full window once", async () => {
    mocks.campaignStore.activeCampaignId = "c-probe";
    // The watcher is module-level and starts once; take a fresh module for it.
    vi.resetModules();
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    useCampaignMessages();
    await flush();
    expect(mocks.selects).toHaveLength(1);
    expect(mocks.selects[0]).not.toBe("*");
    expect(mocks.limits).toEqual([20]);

    loadChatHistory();
    loadChatHistory();
    await flush();
    expect(mocks.selects.filter((c) => c === "*")).toHaveLength(1);
    expect(mocks.limits).toEqual([20, 100]);
  });

  it("loads this campaign's lines only, never another campaign's", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [msg("here", "2026-01-01T00:00:01Z"), msg("elsewhere", "2026-01-01T00:00:02Z", { campaign_id: "other" })]);
    vi.resetModules();
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    const { messages } = useCampaignMessages();
    loadChatHistory();
    await flush();
    expect(messages.value.map((m) => m.id)).toEqual(["here"]);
  });

  it("opens a line named by id only if it belongs to this campaign", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [msg("mine", "2026-01-01T00:00:01Z"), msg("foreign", "2026-01-01T00:00:02Z", { campaign_id: "other" })]);
    vi.resetModules();
    const { useCampaignMessages } = await import("./useCampaignMessages");
    const { messages, ensureMessage } = useCampaignMessages();
    await ensureMessage("foreign");
    await ensureMessage("mine");
    expect(messages.value.map((m) => m.id)).toEqual(["mine"]);
  });
});

describe("useCampaignMessages rings (#999 4.2)", () => {
  it("a foreign ring re-reads the window and drops a row another client deleted", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [msg("a", "2026-01-01T00:00:01Z"), msg("b", "2026-01-01T00:00:02Z")]);
    vi.resetModules();
    const rings = await import("@/lib/campaignLiveSync/rings");
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    const { messages } = useCampaignMessages();
    loadChatHistory();
    await flush();
    expect(messages.value.map((m) => m.id)).toEqual(["a", "b"]);

    fake.reset();
    fake.seed("campaign_messages", [msg("a", "2026-01-01T00:00:01Z")]);
    rings.emitCampaignRing("c-ring", { table: "campaign_messages" });
    await flush();
    expect(messages.value.map((m) => m.id)).toEqual(["a"]);
  });

  it("shows a player only the lines meant for them: public ones, whispers to or from them, never someone else's whisper or a DM-only roll", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [
      msg("public", "2026-01-01T00:00:01Z"),
      msg("to-me", "2026-01-01T00:00:02Z", { recipient_user_id: "u1" }),
      msg("from-me", "2026-01-01T00:00:03Z", { user_id: "u1", recipient_user_id: "u2" }),
      msg("between-others", "2026-01-01T00:00:04Z", { user_id: "u2", recipient_user_id: "u3" }),
      msg("dm-roll", "2026-01-01T00:00:05Z", { type: "dm_roll", user_id: "u1", recipient_user_id: "dm" }),
    ]);
    vi.resetModules();
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    const { messages } = useCampaignMessages();
    loadChatHistory();
    await flush();
    expect(messages.value.map((m) => m.id)).toEqual(["public", "to-me", "from-me"]);
  });

  it("ignores other campaigns' rings, but reconcile re-reads", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [msg("a", "2026-01-01T00:00:01Z")]);
    vi.resetModules();
    const rings = await import("@/lib/campaignLiveSync/rings");
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    useCampaignMessages();
    loadChatHistory();
    await flush();
    mocks.limits.length = 0;
    rings.emitCampaignRing("other", { table: "campaign_messages" });
    await flush();
    expect(mocks.limits).toEqual([]);
    rings.emitCampaignReconcile("c-ring");
    await flush();
    expect(mocks.limits).toEqual([100]);
  });

  it("a refresh that began before my send cannot drop my message", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [msg("a", "2026-01-01T00:00:01Z")]);
    vi.resetModules();
    const rings = await import("@/lib/campaignLiveSync/rings");
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    const { messages, sendMessage } = useCampaignMessages();
    loadChatHistory();
    await flush();

    // A refresh starts and answers late; its snapshot predates my send.
    let release: () => void = () => {};
    mocks.hold = new Promise<void>((resolve) => { release = resolve; });
    rings.emitCampaignRing("c-ring", { table: "campaign_messages" });
    await flush();

    await sendMessage("hello");
    expect(messages.value.map((m) => m.message)).toEqual(["a", "hello"]);

    release();
    await flush();
    expect(messages.value.map((m) => m.message)).toEqual(["a", "hello"]);
  });

  it("a refresh that began before a delete cannot bring the deleted line back", async () => {
    mocks.campaignStore.activeCampaignId = "c-ring";
    fake.seed("campaign_messages", [msg("a", "2026-01-01T00:00:01Z"), msg("b", "2026-01-01T00:00:02Z")]);
    vi.resetModules();
    const rings = await import("@/lib/campaignLiveSync/rings");
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    const { messages, deleteMessage } = useCampaignMessages();
    loadChatHistory();
    await flush();

    let release: () => void = () => {};
    mocks.hold = new Promise<void>((resolve) => { release = resolve; });
    rings.emitCampaignRing("c-ring", { table: "campaign_messages" });
    await flush();

    await deleteMessage("b");
    expect(messages.value.map((m) => m.id)).toEqual(["a"]);
    expect(fake.rows("campaign_messages").map((m) => m.id)).toEqual(["a"]);
    release();
    await flush();
    expect(messages.value.map((m) => m.id)).toEqual(["a"]);
  });
});
