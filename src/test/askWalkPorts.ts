import { vi } from "vitest";
import { reactive } from "vue";
import { walkStops, walkSteps, type WalkInput, type WalkMember, type WalkStop } from "@/lib/canon/canonWalk";
import type { AskWalkPorts } from "@/composables/ask/useAskWalk";

/** A pitch's entry as the walk reads it, so a canon "with a pitch" is one line in a test. */
export const PITCH = {
  id: "pitch", part: "premise", premise_kind: "pitch", title: "", party_member_id: null,
  body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A drowned kingdom" }] }] }),
} as unknown as WalkInput["entries"][number];

export interface FakeWalk {
  ports: AskWalkPorts;
  /** Change what the canon holds; the next read of `stops` sees it. */
  set: (over: Partial<Pick<WalkInput, "entries" | "skipped" | "notedIds">>) => void;
  state: { loaded: boolean; busy: boolean; total: number | null; blocked: string | null };
  skip: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  draft: ReturnType<typeof vi.fn>;
}

/** The walk's ports over an in-memory canon: nothing is fetched, and each call is a spy the test can fail or resolve. */
export function fakeWalkPorts({ withPitch = false, party = [] }: { withPitch?: boolean; party?: WalkMember[] } = {}): FakeWalk {
  let input: WalkInput = { entries: withPitch ? [PITCH] : [], clues: [], arcCount: 0, peopleCount: 0, habitatCount: 0, party, notedIds: new Set(), skipped: new Set() };
  // Reactive, as the real canon queries are: a walk that waits for the load wakes when it flips.
  const state = reactive({ loaded: true, busy: false, total: 4 as number | null, blocked: null as string | null });
  const stops = (): WalkStop[] => walkStops(walkSteps(input), input.party, input.notedIds);
  const skip = vi.fn(async () => {});
  const write = vi.fn(async () => {});
  const draft = vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; error: string });
  const ports: AskWalkPorts = {
    stops,
    loaded: () => state.loaded,
    pitchWritten: () => stops().find((s) => s.step === "pitch")?.state === "filled",
    skip,
    write,
    price: () => state.total,
    blockedBy: () => state.blocked,
    busy: () => state.busy,
    draft,
  };
  return { ports, set: (over) => { input = { ...input, ...over }; }, state, skip, write, draft };
}
