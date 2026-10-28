// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import SessionsUnsortedView from "./SessionsUnsortedView.vue";
import type { LearnedEntry } from "@/lib/sessions/learned";
import type { CampaignSession } from "@/types/session.types";

/** A session that ran on the evening of `day` (an ISO date). */
function session(id: string, number: number, day: string): CampaignSession {
  return {
    id,
    campaign_id: "c",
    user_id: "u",
    number,
    title: `Session ${number}`,
    played_on: null,
    started_at: `${day}T19:00:00Z`,
    ended_at: `${day}T23:00:00Z`,
    created_at: `${day}T19:00:00Z`,
    updated_at: `${day}T23:00:00Z`,
  } as CampaignSession;
}

/** Something learned during the evening of `day`, outside any session. */
function learned(key: string, day: string): LearnedEntry {
  return {
    kind: "person",
    key,
    entityId: key,
    name: key,
    detail: "",
    whenIso: `${day}T20:00:00Z`,
    approximate: false,
    sessionId: null,
    recordRefs: [],
  };
}

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const entries = ref<LearnedEntry[]>([learned("a", "2026-10-02"), learned("b", "2026-10-02"), learned("c", "2026-10-04")]);

vi.mock("@/composables/sessions/useSessionLearned", () => ({
  useUnsortedLearned: () => ({ entries, isLoading: ref(false), error: ref(null) }),
  useMoveLearned: () => ({ mutateAsync, isPending: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: vi.fn(), fromError: (_e: unknown, fallback: string) => fallback }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: ref([session("s14", 14, "2026-10-02"), session("s15", 15, "2026-10-04")]) }),
}));

/** Mounts the page with the header and the row links stubbed. */
function mountPage() {
  return mount(SessionsUnsortedView, {
    global: {
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
        PageHeader: { template: "<div><slot /></div>" },
      },
    },
  });
}

/** The session id and entry keys of every move the page asked for, in order. */
function moves() {
  return mutateAsync.mock.calls.map(([arg]) => ({
    sessionId: arg.sessionId,
    keys: arg.entries.map((e: LearnedEntry) => e.key),
  }));
}

/** Presses the "Follow suggestions" button and lets the moves settle. */
async function follow(w: ReturnType<typeof mountPage>) {
  await w.findAll("button").find((b) => b.text() === "Follow suggestions")!.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
});

describe("SessionsUnsortedView, Follow suggestions", () => {
  it("moves each ticked row to its own suggested session, one write per session", async () => {
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    await follow(w);
    expect(moves()).toEqual([
      { sessionId: "s14", keys: ["a"] },
      { sessionId: "s15", keys: ["c"] },
    ]);
  });

  it("follows a row's own picker where the DM changed it from the suggestion", async () => {
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[1].setValue(true);
    // The first select is the bulk "Put them in"; the rows' own pickers follow it in order.
    await w.findAll("select")[1].setValue("s15");
    await follow(w);
    expect(moves()).toEqual([
      { sessionId: "s15", keys: ["a"] },
      { sessionId: "s14", keys: ["b"] },
    ]);
  });

  it("keeps the rows of a destination that failed ticked, and unticks the rest", async () => {
    mutateAsync.mockImplementation(async ({ sessionId }: { sessionId: string }) => {
      if (sessionId === "s15") throw new Error("offline");
    });
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    await follow(w);
    const ticked = w.findAll("input[type=checkbox]").map((b) => (b.element as HTMLInputElement).checked);
    expect(ticked).toEqual([false, false, true]);
  });
  it("disables every other move while its destinations are still being written", async () => {
    let release: () => void = () => {};
    mutateAsync.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    await w.findAll("button").find((b) => b.text() === "Follow suggestions")!.trigger("click");
    await flushPromises();

    const rowMoves = w.findAll("button").filter((b) => b.text() === "Move").slice(1);
    expect(rowMoves.every((b) => b.attributes("disabled") !== undefined)).toBe(true);
    await rowMoves[1].trigger("click");
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    release();
    await flushPromises();
    release();
    await flushPromises();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });
});

describe("SessionsUnsortedView, Move", () => {
  it("moves one row to the session its own picker holds, leaving the other rows alone", async () => {
    const w = mountPage();
    await w.findAll("select")[2].setValue("s15");
    await w.findAll("button").filter((b) => b.text() === "Move")[2].trigger("click");
    await flushPromises();
    expect(moves()).toEqual([{ sessionId: "s15", keys: ["b"] }]);
  });

  it("moves every ticked row into the bulk session and unticks them", async () => {
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    await w.findAll("select")[0].setValue("s15");
    await w.findAll("button").filter((b) => b.text() === "Move")[0].trigger("click");
    await flushPromises();
    expect(moves()).toEqual([{ sessionId: "s15", keys: ["a", "c"] }]);
    expect(w.findAll("input[type=checkbox]").every((b) => !(b.element as HTMLInputElement).checked)).toBe(true);
  });

  it("keeps the ticks when the bulk move fails, so the DM can try again", async () => {
    mutateAsync.mockRejectedValue(new Error("offline"));
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await w.findAll("select")[0].setValue("s15");
    await w.findAll("button").filter((b) => b.text() === "Move")[0].trigger("click");
    await flushPromises();
    expect((w.findAll("input[type=checkbox]")[0].element as HTMLInputElement).checked).toBe(true);
  });

  it("will not bulk-move until a session is picked", async () => {
    const w = mountPage();
    await w.findAll("input[type=checkbox]")[0].setValue(true);
    const bulk = w.findAll("button").filter((b) => b.text() === "Move")[0];
    expect(bulk.attributes("disabled")).toBeDefined();
    await bulk.trigger("click");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
  it("drops the tick of a row that has left the list, so the bulk move cannot act on it", async () => {
    const original = entries.value;
    try {
      const w = mountPage();
      await w.findAll("input[type=checkbox]")[0].setValue(true);
      await w.findAll("select")[0].setValue("s15");
      const bulk = () => w.findAll("button").filter((b) => b.text() === "Move")[0];
      expect(bulk().attributes("disabled")).toBeUndefined();
      entries.value = original.filter((e) => e.key !== "a");
      await flushPromises();
      expect(bulk().attributes("disabled")).toBeDefined();
    } finally {
      entries.value = original;
    }
  });
});
