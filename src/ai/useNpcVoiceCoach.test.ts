import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Npc } from "@/types/npc.types";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

const { useNpcVoiceCoach } = await import("./useNpcVoiceCoach");
const npc = { id: "n1", campaign_id: "c1", name: "Johnny" } as Npc;

describe("useNpcVoiceCoach keys", () => {
  beforeEach(() => invoke.mockReset());

  // Bug caught: a key attached to the wrong line when the parse drops an empty one, so Speak aloud spoke line 3 under line 2's proof.
  it("keeps each line's own key through the parse that drops empty lines", async () => {
    invoke.mockResolvedValue({ data: { lines: [{ text: " A ", reveals: false }, { text: "  ", reveals: false }, { text: "C", reveals: true }], keys: ["ka", "kb", "kc"] }, error: null });
    const coach = useNpcVoiceCoach();
    await coach.suggest(npc, "x");
    expect(coach.lines.value).toEqual(["A", "C"]);
    expect(coach.keys.value).toEqual(["ka", "kc"]);
  });

  // Bug caught: a reply with a wrong-length keys list pairing keys to the wrong lines instead of offering none.
  it("gives no line a key when keys is missing or the wrong length", async () => {
    invoke.mockResolvedValue({ data: { lines: [{ text: "A", reveals: false }, { text: "B", reveals: false }], keys: ["ka"] }, error: null });
    const coach = useNpcVoiceCoach();
    await coach.suggest(npc, "x");
    expect(coach.keys.value).toEqual([null, null]);
    invoke.mockResolvedValue({ data: { lines: [{ text: "A", reveals: false }] }, error: null });
    await coach.suggest(npc, "x");
    expect(coach.keys.value).toEqual([null]);
  });
});
