// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
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

describe("SessionsUnsortedView, Follow suggestions", () => {
  it("moves each ticked row to its own suggested session, one write per session", async () => {
    const w = mountPage();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(true);
    await boxes[2].setValue(true);
    await w.findAll("button").find((b) => b.text() === "Follow suggestions")!.trigger("click");
    await flushPromises();

    const calls = mutateAsync.mock.calls.map(([arg]) => ({
      sessionId: arg.sessionId,
      keys: arg.entries.map((e: LearnedEntry) => e.key),
    }));
    expect(calls).toEqual([
      { sessionId: "s14", keys: ["a"] },
      { sessionId: "s15", keys: ["c"] },
    ]);
  });
});
