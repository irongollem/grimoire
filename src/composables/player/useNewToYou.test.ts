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

describe("an unmasked person", () => {
  // Met under a cover, since unmasked, not opened afterwards: shown as a reveal
  // that carries the cover they were known by.
  const masked = {
    ...npc("spy", "2026-10-07T10:00:00Z"),
    unmasked_at: "2026-10-08T10:00:00Z",
    disguise_name: "Old Henry",
    disguise_portrait_url: "https://img.test/henry.webp",
    disguise_portrait_focal_point: { x: 0.5, y: 0.5 },
  } as unknown as PlayerNpc;

  it("waits in the strip as unmasked, ahead of being treated as merely new", () => {
    const { entries } = useNewToYou(ref([masked]), ref(new Map()));
    expect(entries.value.map((e) => [e.npc.id, e.kind])).toEqual([["spy", "unmasked"]]);
  });

  it("carries the cover it was known by, which a merely new person has no use for", () => {
    const item = toNewToYouItem({ npc: masked, kind: "unmasked" }, "Waterdeep");
    expect(item.cover).toEqual({
      name: "Old Henry",
      portraitUrl: "https://img.test/henry.webp",
      focalPoint: { x: 0.5, y: 0.5 },
    });
    expect(item.place).toBe("Waterdeep");
    expect(toNewToYouItem({ npc: masked, kind: "new" }, null).cover).toBeUndefined();
  });
});

describe("toNewToYouItem privacy", () => {
  const described = (fields: string[]): PlayerNpc =>
    ({ ...fresh, race: "Elf", occupation: "Smith", relationship: "wary", player_visible_fields: fields }) as unknown as PlayerNpc;

  it.each([
    [["name"], null],
    [["race"], "Elf"],
    [["occupation"], "Smith"],
    [["race", "occupation"], "Elf · Smith"],
  ])("with %j visible, shows %j of what they are", (fields, what) => {
    const { person } = toNewToYouItem({ npc: described(fields), kind: "new" }, null);
    expect(person.what).toBe(what);
    expect(person.relationship).toBe("wary");
  });

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
