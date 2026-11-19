import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFake } from "@/test/supabaseFake";
import { EARLIER_ROWS_IN_REACH, loadTurnsInReach } from "./turnsInReach";

const fake = createSupabaseFake();
// The fake implements the slice of the client this module calls.
const admin = fake.client as unknown as SupabaseClient;

const row = (session: string, seq: number) => ({ session_id: session, seq, role: seq % 2 === 1 ? "user" : "assistant", blocks: [{ type: "text", text: `line ${seq}` }] });

beforeEach(() => fake.reset());

describe("loadTurnsInReach", () => {
  // Bug caught: a table left running for months read whole on every turn (the maintainer's laptop that never
  // sleeps), or the reach cutting into what the summary has not folded yet, so the model loses part of the scene.
  it("reads everything the summary has not folded and only a fixed run from before it, oldest first", async () => {
    const total = 2000;
    const through = 1900;
    fake.seed("agent_turns", [...Array.from({ length: total }, (_, i) => row("s1", i + 1)), row("other", 1)]);
    const seqs = (await loadTurnsInReach(admin, "s1", through)).map((r) => r.seq);
    expect(seqs).toHaveLength(EARLIER_ROWS_IN_REACH + (total - through));
    expect(seqs[0]).toBe(through - EARLIER_ROWS_IN_REACH + 1);
    expect(seqs[seqs.length - 1]).toBe(total);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  // Bug caught: a short table losing rows to the reach, or reading another table's.
  it("reads a short table whole, and never another table's rows", async () => {
    fake.seed("agent_turns", [row("s1", 1), row("s1", 2), row("s1", 3), row("other", 4)]);
    expect((await loadTurnsInReach(admin, "s1", 2)).map((r) => r.seq)).toEqual([1, 2, 3]);
    expect((await loadTurnsInReach(admin, "s1", 0)).map((r) => r.seq)).toEqual([1, 2, 3]);
  });
});
