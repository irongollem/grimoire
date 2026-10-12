import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMORY_BODY_CHAR_LIMIT,
  NPC_MEMORY_KINDS,
  NPC_MEMORY_PROMPT_LABELS,
  formatNpcMemories,
  loadPromptMemories,
  type NpcMemoryIdentity,
  type PromptNpcMemory,
} from "./npcMemories.ts";

const open: NpcMemoryIdentity = { name: "Bram Voss", disguise_name: null, is_revealed: false };

function memory(over: Partial<PromptNpcMemory> = {}): PromptNpcMemory {
  return { kind: "revealed", body: "The vault key is under the bell.", created_at: "2026-10-01T10:00:00Z", sessionLabel: null, present: [], ...over };
}

describe("formatNpcMemories", () => {
  it("returns an empty string for no memories", () => {
    expect(formatNpcMemories([], open)).toBe("");
  });

  it("labels every kind", () => {
    for (const kind of NPC_MEMORY_KINDS) expect(NPC_MEMORY_PROMPT_LABELS[kind]).toBeTruthy();
  });

  it("writes one line per memory with session and present clauses", () => {
    const out = formatNpcMemories(
      [
        memory({ sessionLabel: "Session 14", present: ["Wren", "Tomas"] }),
        memory({ kind: "promise", body: "Owes Wren a favour." }),
      ],
      open,
    );
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^What has already passed between them and the party/);
    expect(lines[1]).toBe("- [Session 14] They told the party (Wren, Tomas present): The vault key is under the bell.");
    expect(lines[2]).toBe("- Promise: Owes Wren a favour.");
  });

  it("caps long bodies with an ellipsis", () => {
    const out = formatNpcMemories([memory({ body: "a".repeat(600) })], open);
    const line = out.split("\n")[1];
    expect(line.endsWith("…")).toBe(true);
    expect(line.length).toBeLessThanOrEqual("- They told the party: ".length + MEMORY_BODY_CHAR_LIMIT);
  });

  it("never lets the true name through while disguised", () => {
    const disguised: NpcMemoryIdentity = { name: "Bram Voss", disguise_name: "Old Tobin", is_revealed: false };
    const out = formatNpcMemories(
      [
        memory({ body: "bram voss admitted the debt. BRAM VOSS laughed; Bram Voss's ring is gold." }),
        memory({ body: "Told them about Bram Voss." }),
      ],
      disguised,
    );
    expect(out).not.toMatch(/bram voss/i);
    expect(out).toContain("Old Tobin admitted the debt. Old Tobin laughed");
  });

  it("masks each part of a multi-word true name where it is written as a name", () => {
    const disguised: NpcMemoryIdentity = { name: "Bram Ashford", disguise_name: "Old Tam", is_revealed: false };
    const out = formatNpcMemories(
      [
        memory({ body: "Bram sold the map" }),
        memory({ body: "Ashford owes a debt" }),
        memory({ body: "BRAM and ASHFORD met; Bram's ring; bram ashford's seal" }),
      ],
      disguised,
    );
    expect(out).not.toMatch(/bram|ashford/i);
    expect(out).toContain("Old Tam sold the map");
    expect(out).toContain("Old Tam owes a debt");
    expect(out).toContain("Old Tam and Old Tam met; Old Tam's ring; Old Tam's seal");
  });

  it("does not rewrite ordinary words that are part of the name", () => {
    const bold: NpcMemoryIdentity = { name: "Bram the Bold", disguise_name: "Old Tobin", is_revealed: false };
    const out = formatNpcMemories([memory({ body: "Bram admitted the debt to the guard, a bold move. Bram the Bold left." })], bold);
    expect(out).toContain("Old Tobin admitted the debt to the guard, a bold move. Old Tobin left.");

    const lord: NpcMemoryIdentity = { name: "Lord Neverember", disguise_name: "The Envoy", is_revealed: false };
    const lordOut = formatNpcMemories([memory({ body: "The lord's guard saw Neverember; Lord Neverember paid." })], lord);
    expect(lordOut).toContain("The lord's guard saw The Envoy; The Envoy paid.");
  });

  it("takes the disguise name literally", () => {
    const odd: NpcMemoryIdentity = { name: "Bram", disguise_name: "Mister $& $$", is_revealed: false };
    const out = formatNpcMemories([memory({ body: "Bram waved." })], odd);
    expect(out).toContain("Mister $& $$ waved.");
    expect(out).not.toContain("Bram");
  });

  it("leaves the name alone once revealed, and inside longer words", () => {
    const revealed: NpcMemoryIdentity = { name: "Bram", disguise_name: "Old Tobin", is_revealed: true };
    expect(formatNpcMemories([memory({ body: "Bram smiled." })], revealed)).toContain("Bram smiled.");
    const disguised: NpcMemoryIdentity = { name: "Bram", disguise_name: "Old Tobin", is_revealed: false };
    expect(formatNpcMemories([memory({ body: "Bramble grows." })], disguised)).toContain("Bramble grows.");
  });
});

// ── loadPromptMemories ─────────────────────────────────────────────────────────

type Result = { data: unknown; error: unknown };

/** A client whose every table answers with a fixed result, recording the limit asked for. */
function fakeClient(results: Record<string, Result>, limit = vi.fn()) {
  const from = (table: string) => {
    const result = () => results[table];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => (table === "npc_memories" ? chain : Promise.resolve(result()));
    chain.in = () => chain;
    chain.order = () => chain;
    chain.limit = (n: number) => {
      limit(n);
      return Promise.resolve(result());
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const memoryRow = (over: Partial<{ body: string; session_id: string | null; party_member_ids: string[] }>) => ({
  kind: "revealed",
  body: "x",
  created_at: "2026-10-01T00:00:00Z",
  session_id: null,
  party_member_ids: [],
  ...over,
});

describe("loadPromptMemories", () => {
  it("returns the newest few oldest first, with session labels and present names resolved", async () => {
    const limit = vi.fn();
    const client = fakeClient(
      {
        npc_memories: {
          data: [
            memoryRow({ body: "newer", session_id: "s2", party_member_ids: ["m1", "gone"] }),
            memoryRow({ body: "older", session_id: "s1" }),
          ],
          error: null,
        },
        campaign_sessions: {
          data: [
            { id: "s1", number: 3, title: "Mere" },
            { id: "s2", number: null, title: " Into the Dark " },
          ],
          error: null,
        },
        party_members: { data: [{ id: "m1", name: "Wren" }], error: null },
      },
      limit,
    );

    const out = await loadPromptMemories(client, "npc-1", "c1");
    expect(limit).toHaveBeenCalledWith(12);
    expect(out.map((m) => m.body)).toEqual(["older", "newer"]);
    expect(out[0].sessionLabel).toBe("Session 3");
    expect(out[1].sessionLabel).toBe("Into the Dark");
    expect(out[1].present).toEqual(["Wren"]);
  });

  it("returns nothing when the NPC remembers nothing", async () => {
    const client = fakeClient({ npc_memories: { data: [], error: null } });
    expect(await loadPromptMemories(client, "npc-1", "c1")).toEqual([]);
  });

  it("logs and continues without memories when the read fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = fakeClient({ npc_memories: { data: null, error: new Error("boom") } });
    expect(await loadPromptMemories(client, "npc-1", "c1")).toEqual([]);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
