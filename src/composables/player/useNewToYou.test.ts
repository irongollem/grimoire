import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { toNewToYouItem, useNewToYou } from "@/composables/player/useNewToYou";
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

describe("toNewToYouItem privacy", () => {
  const withFields = (fields: string[]): PlayerNpc =>
    ({
      ...fresh,
      portrait_url: "https://img.test/face.webp",
      portrait_focal_point: { x: 0.2, y: 0.3 },
      player_visible_fields: fields,
    }) as unknown as PlayerNpc;

  it("keeps the portrait hidden when only the name is visible", () => {
    const { person } = toNewToYouItem({ npc: withFields(["name"]), kind: "new" }, null);
    expect(person.name).toBe("fresh");
    expect(person.portraitUrl).toBeNull();
    expect(person.focalPoint).toBeNull();
  });

  it("keeps the name hidden when only the portrait is visible", () => {
    const { person } = toNewToYouItem({ npc: withFields(["portrait"]), kind: "new" }, null);
    expect(person.name).toBeNull();
    expect(person.portraitUrl).toBe("https://img.test/face.webp");
    expect(person.focalPoint).toEqual({ x: 0.2, y: 0.3 });
  });
});
