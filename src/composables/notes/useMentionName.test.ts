import { describe, it, expect, vi } from "vitest";
import { computed, effectScope, ref } from "vue";

/**
 * `useMentionName` picks DM vs player entirely from `isPlayerArea(route.path)`
 * (`src/router/lens.ts`, not re-implemented here), so each case sets the
 * mocked route before running the composable inside a fresh scope. `vue-router`
 * is mocked; `@/router/lens` is the real module — `isPlayerArea` is a pure
 * string check and exercising the real one is the point of the `/play` (no
 * trailing slash) case below.
 */
const route = { path: "/npcs/npc-1" };
vi.mock("vue-router", () => ({ useRoute: () => route }));

const partyData = ref<Array<{ id: string; name: string }>>([]);
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: partyData }),
}));

const npcsData = ref<Array<{ id: string; name: string }>>([]);
const sharedNpcsData = ref<Array<{ id: string; name: string | null }>>([]);
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: npcsData }),
  useSharedNpcs: () => ({ data: sharedNpcsData }),
}));

const locationsData = ref<Array<{ id: string; name: string }>>([]);
const sharedLocationsData = ref<Array<{ id: string; name: string }>>([]);
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: locationsData }),
  useSharedLocations: () => ({ data: sharedLocationsData }),
}));

const factionsData = ref<Array<{ id: string; name: string }>>([]);
const playerFactionsData = ref<Array<{ id: string; name: string }>>([]);
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: factionsData }),
  usePlayerVisibleFactions: () => ({ data: playerFactionsData }),
}));

const playerVisibleMonstersData = ref<Array<{ id: string; name: string }>>([]);
const askedMonsterIds: string[][] = [];
vi.mock("@/composables/monsters/usePlayerMonstersByIds", () => ({
  usePlayerMonstersByIds: (ids: () => readonly string[]) => ({
    data: computed(() => {
      const wanted = ids();
      askedMonsterIds.push([...wanted]);
      return new Map(playerVisibleMonstersData.value.filter((m) => wanted.includes(m.id)).map((m) => [m.id, m]));
    }),
  }),
}));

const playerDiscoveriesData = ref<Array<{ monster_id: string | null; library_monster_id: string | null }>>([]);
vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({
  usePlayerDiscoveries: () => ({ data: playerDiscoveriesData }),
}));

/** Models the DM-side per-id monster-name query: `data` is whatever this id
 *  maps to, keyed exactly on `["mention-monster-name", id]` (no shared
 *  requested-ids set — see useMonsterNameCache's removal). */
const MONSTER_NAMES: Record<string, string> = { "mon-1": "Owlbear" };
vi.mock("@tanstack/vue-query", () => ({
  useQuery: (options: { queryKey: readonly [string, string] }) => ({
    data: computed(() => {
      const [, id] = options.queryKey;
      return MONSTER_NAMES[id] ?? null;
    }),
  }),
}));

const companionsData = ref<Array<{ id: string; name: string }>>([]);
vi.mock("@/composables/encounters/useCompanions", () => ({
  useCompanions: () => ({ data: companionsData }),
}));

const questsData = ref<Array<{ id: string; title: string }>>([]);
vi.mock("@/composables/quests/useQuests", () => ({
  usePlayerVisibleQuests: () => ({ data: questsData }),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { mentionTypeForNote, monsterNameTable, useMentionName } from "./useMentionName";

function run<T>(fn: () => T): T {
  const scope = effectScope();
  const result = scope.run(fn)!;
  scope.stop();
  return result;
}

describe("useMentionName — DM", () => {
  it("resolves real names from the campaign lists", () => {
    route.path = "/npcs/npc-1";
    npcsData.value = [{ id: "npc-1", name: "Elminster" }];
    locationsData.value = [{ id: "loc-1", name: "Shadowdale" }];
    factionsData.value = [{ id: "fac-1", name: "The Harpers" }];
    partyData.value = [{ id: "pm-1", name: "Aria" }];

    expect(run(() => useMentionName("npc", "npc-1")).value).toBe("Elminster");
    expect(run(() => useMentionName("location", "loc-1")).value).toBe("Shadowdale");
    expect(run(() => useMentionName("faction", "fac-1")).value).toBe("The Harpers");
    expect(run(() => useMentionName("player", "pm-1")).value).toBe("Aria");
  });

  it("resolves the party sentinel to 'Party'", () => {
    route.path = "/npcs/npc-1";
    expect(run(() => useMentionName("party", "party-group")).value).toBe("Party");
  });

  it("returns null for an id not in the list (stale mention)", () => {
    route.path = "/npcs/npc-1";
    npcsData.value = [];
    expect(run(() => useMentionName("npc", "npc-ghost")).value).toBeNull();
  });

  it("resolves a monster name via a plain per-id query, not the whole library", () => {
    route.path = "/npcs/npc-1";
    expect(run(() => useMentionName("monster", "mon-1")).value).toBe("Owlbear");
    expect(run(() => useMentionName("monster", "mon-unknown")).value).toBeNull();
  });
});

describe("useMentionName — player portal", () => {
  it("resolves a disguised NPC to its cover name, exactly as the server projection returns it", () => {
    route.path = "/play/party";
    sharedNpcsData.value = [{ id: "npc-1", name: "Old Man Henry" }];
    expect(run(() => useMentionName("npc", "npc-1")).value).toBe("Old Man Henry");
  });

  it("resolves a nameless (unshared) NPC to null, never the true name", () => {
    route.path = "/play/party";
    sharedNpcsData.value = [{ id: "npc-2", name: null }];
    expect(run(() => useMentionName("npc", "npc-2")).value).toBeNull();
  });

  it("resolves an undiscovered monster to null and a discovered one to its name", () => {
    route.path = "/play/party";
    playerVisibleMonstersData.value = [
      { id: "mon-1", name: "Owlbear" },
      { id: "mon-2", name: "Displacer Beast" },
    ];
    playerDiscoveriesData.value = [{ monster_id: null, library_monster_id: "mon-1" }];

    expect(run(() => useMentionName("monster", "mon-1")).value).toBe("Owlbear");
    askedMonsterIds.length = 0;
    expect(run(() => useMentionName("monster", "mon-2")).value).toBeNull();
    // Undiscovered: no id is asked for at all.
    expect(askedMonsterIds.flat()).toEqual([]);
  });

  it("resolves the party sentinel to 'Party', same as the DM side", () => {
    route.path = "/play/party";
    expect(run(() => useMentionName("party", "party-group")).value).toBe("Party");
  });

  it("never reads the DM's NPC list — a DM-only npc id resolves to null even though it exists there", () => {
    route.path = "/play/party";
    npcsData.value = [{ id: "npc-dm-only", name: "Secret Villain" }];
    sharedNpcsData.value = [];
    expect(run(() => useMentionName("npc", "npc-dm-only")).value).toBeNull();
  });

  it("treats the bare /play root as the player portal too, not just /play/*", () => {
    route.path = "/play";
    sharedNpcsData.value = [{ id: "npc-1", name: "Old Man Henry" }];
    npcsData.value = [{ id: "npc-1", name: "The True Villain" }];
    // If this ran the DM branch it would see the DM's npc list instead.
    expect(run(() => useMentionName("npc", "npc-1")).value).toBe("Old Man Henry");
  });
});

describe("monsterNameTable", () => {
  it("looks a uuid up in the DM's monsters and a text id in the library", () => {
    expect(monsterNameTable("0f8a2c4e-1b3d-4e5f-8a9b-0c1d2e3f4a5b")).toBe("monsters");
    expect(monsterNameTable("srd_owlbear")).toBe("library_monsters");
  });
});

describe("useMentionName — note-only types", () => {
  it("resolves a companion and a player-visible quest, and null for one the player cannot see", () => {
    route.path = "/play";
    companionsData.value = [{ id: "co-1", name: "Biscuit" }];
    questsData.value = [{ id: "q-1", title: "The Flooded Mine" }];
    expect(run(() => useMentionName("companion", "co-1")).value).toBe("Biscuit");
    expect(run(() => useMentionName("quest", "q-1")).value).toBe("The Flooded Mine");
    expect(run(() => useMentionName("quest", "q-hidden")).value).toBeNull();
  });

  it("resolves an unmapped note type to null without reading anything", () => {
    route.path = "/play";
    expect(run(() => useMentionName(null, "x")).value).toBeNull();
  });
});

describe("mentionTypeForNote", () => {
  it("maps entity_notes literals onto mention types", () => {
    expect(mentionTypeForNote("party_member")).toBe("player");
    expect(mentionTypeForNote("npc")).toBe("npc");
    expect(mentionTypeForNote("quest")).toBe("quest");
    expect(mentionTypeForNote("companion")).toBe("companion");
    expect(mentionTypeForNote("dragon")).toBeNull();
  });
});
