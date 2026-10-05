import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useNewToYou } from "@/composables/play/useNewToYou";
import type { PlayerNpc } from "@/types/npc.types";

const npc = (id: string, revealedAt: string | null): PlayerNpc =>
  ({
    id,
    name: id,
    revealed_at: revealedAt,
    unmasked_at: null,
    player_visible_fields: ["name"],
    relationship: "friendly",
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: false,
  }) as unknown as PlayerNpc;

const fresh = npc("fresh", "2026-10-07T10:00:00Z");
const old = npc("old", "2026-05-01T10:00:00Z");

describe("useNewToYou", () => {
  it("renders nothing until the read map has loaded", () => {
    const map = ref<Map<string, Date> | undefined>(undefined);
    const { ready, entries, ledger } = useNewToYou(ref([fresh, old]), map);
    expect(ready.value).toBe(false);
    expect(entries.value).toEqual([]);
    expect(ledger.value).toEqual([]);
  });

  it("puts an unread new person in the strip and keeps them there once turned and read", () => {
    const map = ref<Map<string, Date> | undefined>(new Map());
    const { entries, ledger, turn } = useNewToYou(ref([fresh, old]), map);
    expect(entries.value.map((e) => e.npc.id)).toEqual(["fresh"]);
    expect(ledger.value.map((n) => n.id)).toEqual(["old"]);

    turn("fresh");
    map.value = new Map([["fresh", new Date()]]);

    expect(entries.value.map((e) => [e.npc.id, e.kind])).toEqual([["fresh", "new"]]);
    expect(ledger.value.map((n) => n.id).sort()).toEqual(["fresh", "old"]);
  });
});
