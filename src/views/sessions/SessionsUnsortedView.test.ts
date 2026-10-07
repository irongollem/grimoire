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
});
