import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
// The open session the log read returns: refetchCampaignSession asks for the
// campaign's one started, unended row.
let openRow: CampaignSession | null = null;
const sessionRead = {
  select: () => sessionRead,
  eq: () => sessionRead,
  not: () => sessionRead,
  is: () => sessionRead,
  maybeSingle: () => Promise.resolve({ data: openRow, error: null }),
};
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args), from: () => sessionRead },
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));
const announce = vi.fn();
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({
  sendCampaignAnnouncement: (...args: unknown[]) => announce(...args),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({ QUEST_RUNTIME_QUERY_KEYS: [] }));

import { createApp, defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { useAppUiStore } from "@/stores/ui/app";
import {
  dropLoggedSession,
  ensureCampaignSession,
  formatSessionElapsed,
  isSessionStale,
  refetchCampaignSession,
  STALE_SESSION_HOURS,
  useCampaignSession,
} from "./useCampaignSession";
import type { CampaignSession } from "@/types/session.types";

/** Reads the live session the way a ring or a reconcile does. */
async function readSession(open: CampaignSession | null): Promise<void> {
  openRow = open;
  await refetchCampaignSession("campaign-1");
}

beforeEach(async () => {
  setActivePinia(createPinia());
  rpc.mockReset();
  announce.mockReset();
  // Clear the module's live session through the real API: the log has no open row.
  await readSession(null);
});

const AT = (iso: string) => Date.parse(iso);

function row(patch: Partial<CampaignSession> = {}): CampaignSession {
  return {
    id: "session-1",
    campaign_id: "campaign-1",
    user_id: "dm-1",
    number: null,
    title: null,
    played_on: null,
    started_at: "2026-08-22T19:00:00.000Z",
    ended_at: null,
    created_at: "2026-08-22T19:00:00.000Z",
    updated_at: "2026-08-22T19:00:00.000Z",
    ...patch,
  };
}

describe("formatSessionElapsed", () => {
  it("reads as a duration, not a wall clock", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T20:47:00.000Z"))).toBe("1:47");
  });

  it("pads minutes but not hours", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T19:05:00.000Z"))).toBe("0:05");
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-23T07:03:00.000Z"))).toBe("12:03");
  });

  // A session started 40 seconds ago is still 0:00 — the clock ticks once a
  // minute, so rounding down is what keeps the rendered value and the timer in
  // step rather than showing a minute that has not finished.
  it("floors to the minute", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T19:00:40.000Z"))).toBe("0:00");
  });

  // Clock skew between the DM's browser and Postgres can put `started_at` a
  // moment in the future. A negative duration is never the right thing to show.
  it("never renders a negative duration", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T18:58:00.000Z"))).toBe("0:00");
  });

  it("has nothing to say without a start", () => {
    expect(formatSessionElapsed(null)).toBe("");
    expect(formatSessionElapsed("not a date")).toBe("");
  });
});

describe("isSessionStale", () => {
  const started = "2026-08-22T19:00:00.000Z";

  it("leaves a long evening alone", () => {
    expect(isSessionStale(row({ started_at: started }), AT("2026-08-23T00:30:00.000Z"))).toBe(false);
  });

  // The failure this exists for: a DM closed the laptop on Thursday and every
  // NPC they reveal while prepping on Sunday announces itself to players who
  // are not at the table.
  it("flags a session nobody ended", () => {
    expect(isSessionStale(row({ started_at: started }), AT("2026-08-25T14:00:00.000Z"))).toBe(true);
  });

  it("turns over exactly at the threshold", () => {
    const boundary = AT(started) + STALE_SESSION_HOURS * 60 * 60 * 1000;
    expect(isSessionStale(row({ started_at: started }), boundary)).toBe(false);
    expect(isSessionStale(row({ started_at: started }), boundary + 1)).toBe(true);
  });

  // Only a *running* session can be stale. An ended one keeps its started_at so
  // it still describes a span, and reading that as staleness would prompt the
  // DM about a session they already closed.
  it("ignores a session that has ended", () => {
    expect(
      isSessionStale(
        row({ started_at: started, ended_at: "2026-08-22T23:00:00.000Z" }),
        AT("2026-08-25T14:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("treats an absent or unparseable start as not stale", () => {
    expect(isSessionStale(null)).toBe(false);
    expect(isSessionStale(row({ started_at: null }))).toBe(false);
    expect(isSessionStale(row({ started_at: "whenever" }))).toBe(false);
  });
});

describe("the live session is the open log row", () => {
  it("adopts an open row and mirrors it as running", async () => {
    await readSession(row({ id: "s15", number: 15 }));
    expect(useAppUiStore().sessionRunning).toBe(true);
  });

  it("clears once the log has no open row", async () => {
    await readSession(row({ id: "s15", number: 15 }));
    await readSession(null);
    expect(useAppUiStore().sessionRunning).toBe(false);
  });

  it("never treats a hand-logged past session as running", async () => {
    await readSession(row({ id: "past", started_at: null, played_on: "2026-09-01" }));
    expect(useAppUiStore().sessionRunning).toBe(false);
  });

  it("ignores a read that answers for a campaign the DM has already left", async () => {
    openRow = row({ id: "other-campaigns-session", campaign_id: "campaign-2" });
    await refetchCampaignSession("campaign-2");
    expect(useAppUiStore().sessionRunning).toBe(false);
  });

  it("clears when the open row is deleted", async () => {
    await readSession(row({ id: "s15" }));
    dropLoggedSession("someone-else");
    expect(useAppUiStore().sessionRunning).toBe(true);
    dropLoggedSession("s15");
    expect(useAppUiStore().sessionRunning).toBe(false);
  });
});

/** Each RPC answers as itself, so which one a call chose shows in the session it adopts. */
function answerRpcs(answers: Record<string, unknown>) {
  rpc.mockImplementation(async (name: string) => {
    if (!(name in answers)) throw new Error(`unexpected rpc ${name}`);
    const answer = answers[name];
    return answer instanceof Error ? { data: null, error: answer } : { data: answer, error: null };
  });
}

describe("ensureCampaignSession", () => {
  it("reuses the open session without calling the database", async () => {
    await readSession(row({ id: "s15" }));
    expect(await ensureCampaignSession("campaign-1")).toEqual({ id: "s15", started: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("starts a session when none is open, and says it did", async () => {
    answerRpcs({ start_campaign_session: row({ id: "new" }) });
    expect(await ensureCampaignSession("campaign-1")).toEqual({ id: "new", started: true });
  });

  it("never fails the thing the DM asked for when the session cannot be started", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    answerRpcs({ start_campaign_session: new Error("down") });
    expect(await ensureCampaignSession("campaign-1")).toEqual({ id: null, started: false });
  });
});

/** The composable needs a component and a query client around it. */
function mountSession(): ReturnType<typeof useCampaignSession> {
  let live!: ReturnType<typeof useCampaignSession>;
  const app = createApp(
    defineComponent({
      setup() {
        live = useCampaignSession();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: new QueryClient() });
  app.mount(document.createElement("div"));
  return live;
}

describe("starting and ending a session", () => {
  it("continuing reopens the ended row instead of starting another, and says so to the table (#1058)", async () => {
    const live = mountSession();
    answerRpcs({
      resume_campaign_session: row({ id: "s14", number: 14 }),
      start_campaign_session: row({ id: "wrongly-started" }),
    });
    await live.start({ continueId: "s14", number: 15, title: "ignored" });
    expect(live.session.value?.id).toBe("s14");
    expect(useAppUiStore().sessionRunning).toBe(true);
    expect(announce).toHaveBeenCalledWith("campaign-1", "⚔️ The session continues.");
  });

  it("starts a new one when nothing is continued", async () => {
    const live = mountSession();
    answerRpcs({
      start_campaign_session: row({ id: "s15", number: 15 }),
      resume_campaign_session: row({ id: "wrongly-resumed" }),
    });
    await live.start({ number: 15 });
    expect(live.session.value?.id).toBe("s15");
    expect(announce).toHaveBeenCalledWith("campaign-1", "⚔️ The session begins.");
  });

  it("does not announce a start that hands back the session already open", async () => {
    const live = mountSession();
    await readSession(row({ id: "s15" }));
    answerRpcs({ start_campaign_session: row({ id: "s15" }) });
    await live.start();
    expect(announce).not.toHaveBeenCalled();
  });

  it("a failed start surfaces the error, adopts nothing and can be tried again", async () => {
    const live = mountSession();
    answerRpcs({ start_campaign_session: new Error("denied") });
    await expect(live.start()).rejects.toMatchObject({ message: "denied" });
    expect(useAppUiStore().sessionRunning).toBe(false);
    expect(live.pending.value).toBe(false);
    expect(announce).not.toHaveBeenCalled();
  });

  it("a session still starts when the table cannot be told", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const live = mountSession();
    announce.mockRejectedValue(new Error("chat down"));
    answerRpcs({ start_campaign_session: row({ id: "s16" }) });
    await live.start();
    expect(live.session.value?.id).toBe("s16");
  });

  it("ignores a second start while one is in flight", async () => {
    const live = mountSession();
    let finish!: () => void;
    rpc.mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ data: row({ id: "s17" }), error: null }); }));
    const first = live.start();
    await live.start();
    expect(rpc).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(live.session.value?.id).toBe("s17");
  });

  it("ending reports what the server closed and re-reads the log, so the session is no longer running", async () => {
    const live = mountSession();
    await readSession(row({ id: "s15" }));
    expect(useAppUiStore().sessionRunning).toBe(true);
    openRow = null;
    answerRpcs({ end_campaign_session: { encounters_ended: 2, chains_paused: 1 } });
    expect(await live.end()).toEqual({ encounters_ended: 2, chains_paused: 1 });
    expect(useAppUiStore().sessionRunning).toBe(false);
  });

  it("a failed end leaves the session running", async () => {
    const live = mountSession();
    await readSession(row({ id: "s15" }));
    answerRpcs({ end_campaign_session: new Error("denied") });
    await expect(live.end()).rejects.toMatchObject({ message: "denied" });
    expect(useAppUiStore().sessionRunning).toBe(true);
  });
});
