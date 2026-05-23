import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import { useAllCampaignCharacterClasses } from "@/composables/useCharacterClasses";
import { totalLevel } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { calculateDifficulty, crToXp } from "@/types/encounter.types";
import type { CombatantDef, FactionDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { Companion } from "@/types/companion.types";
import type { Trap } from "@/types/trap.types";
import type { PartyMember } from "@/types/party.types";

export interface EnemyEntry {
  id: string;
  name: string;
  cr: string;
  count: number;
  xpEach: number;
}

export interface ThresholdTier {
  label: string;
  value: number;
  color: string;
  pct: number;
}

export function useEncounterDifficulty(params: {
  combatants: Ref<CombatantDef[]> | ComputedRef<CombatantDef[]>;
  factions: Ref<FactionDef[]> | ComputedRef<FactionDef[]>;
  partyMemberIds: Ref<string[]> | ComputedRef<string[]>;
  companionIds: Ref<string[]> | ComputedRef<string[]>;
  trapIds: Ref<string[]> | ComputedRef<string[]>;
  monsters: Ref<Monster[]> | ComputedRef<Monster[]>;
  npcs: Ref<Npc[]> | ComputedRef<Npc[]>;
  party: Ref<PartyMember[] | null | undefined> | ComputedRef<PartyMember[] | null | undefined>;
  companions: Ref<Companion[] | null | undefined> | ComputedRef<Companion[] | null | undefined>;
  allTraps: Ref<Trap[] | null | undefined> | ComputedRef<Trap[] | null | undefined>;
}) {
  const {
    combatants,
    factions,
    partyMemberIds,
    companionIds,
    trapIds,
    monsters,
    npcs,
    party,
    companions,
    allTraps,
  } = params;

  const monsterMap = computed(
    () => new Map(monsters.value.map((m) => [m.id, m])),
  );
  const npcMap = computed(
    () => new Map(npcs.value.map((n) => [n.id, n])),
  );

  function monsterCr(monsterId: string | null): string {
    if (!monsterId) return "0";
    return monsterMap.value.get(monsterId)?.stat_block.challenge_rating ?? "0";
  }
  function crXp(monsterId: string | null): number {
    if (!monsterId) return 0;
    return crToXp(monsterMap.value.get(monsterId)?.stat_block.challenge_rating);
  }
  function npcCr(npcId: string | null): string {
    if (!npcId) return "0";
    return npcMap.value.get(npcId)?.stat_block?.challenge_rating ?? "0";
  }
  function npcCrXp(npcId: string | null): number {
    if (!npcId) return 0;
    return crToXp(npcMap.value.get(npcId)?.stat_block?.challenge_rating);
  }
  function combatantLabel(entry: CombatantDef): string {
    if (entry.npc_id)
      return entry.custom_name || (npcMap.value.get(entry.npc_id)?.name ?? "Unknown");
    return entry.custom_name || (monsterMap.value.get(entry.monster_id ?? "")?.name ?? "Unknown");
  }

  const enemyFactionIds = computed(() => {
    const ids = new Set<string>(["enemy"]);
    factions.value.forEach((f) => {
      if (f.hostile_to.includes("players")) ids.add(f.id);
    });
    return ids;
  });

  const enemyEntries = computed<EnemyEntry[]>(() =>
    combatants.value
      .filter((c) => enemyFactionIds.value.has(c.faction_id))
      .map((c) => ({
        id: c.id,
        name: combatantLabel(c),
        cr: c.npc_id ? npcCr(c.npc_id) : monsterCr(c.monster_id),
        count: c.count,
        xpEach: c.npc_id ? npcCrXp(c.npc_id) : crXp(c.monster_id),
      })),
  );

  const { data: allCharacterClasses } = useAllCampaignCharacterClasses();
  const classesByMember = computed(() => {
    const m = new Map<string, CharacterClass[]>();
    for (const cc of allCharacterClasses.value ?? []) {
      const list = m.get(cc.party_member_id) ?? [];
      list.push(cc);
      m.set(cc.party_member_id, list);
    }
    return m;
  });

  function memberLevelDisplay(memberId: string, legacyLevel: number): number {
    const list = classesByMember.value.get(memberId) ?? [];
    return list.length > 0 ? totalLevel(list) : legacyLevel;
  }

  const partyLevels = computed(() => {
    const members = party.value ?? [];
    return partyMemberIds.value.map((id) => {
      const m = members.find((mem) => mem.id === id);
      if (!m) return 1;
      return memberLevelDisplay(m.id, m.level);
    });
  });

  const allyFactionIds = computed(() => {
    const ids = new Set<string>();
    for (const faction of factions.value) {
      if (faction.id === "players") continue;
      if (faction.hostile_to.some((id) => enemyFactionIds.value.has(id))) {
        ids.add(faction.id);
      }
    }
    return ids;
  });

  const allyEntries = computed(() => {
    const entries: { cr: string | null | undefined; count: number }[] = [];
    for (const c of combatants.value.filter((c) =>
      allyFactionIds.value.has(c.faction_id),
    )) {
      const cr = c.npc_id ? npcCr(c.npc_id) : monsterCr(c.monster_id);
      entries.push({ cr, count: c.count });
    }
    for (const compId of companionIds.value) {
      const comp = (companions.value ?? []).find((c) => c.id === compId);
      if (!comp) continue;
      let cr: string | null = null;
      if (comp.source_monster_id) {
        cr = monsterMap.value.get(comp.source_monster_id)?.stat_block.challenge_rating ?? null;
      } else if (comp.source_npc_id) {
        cr = npcMap.value.get(comp.source_npc_id)?.stat_block?.challenge_rating ?? null;
      }
      entries.push({ cr, count: 1 });
    }
    return entries;
  });

  const trapMap = computed(
    () => new Map((allTraps.value ?? []).map((t) => [t.id, t])),
  );

  const hazardXp = computed(() =>
    trapIds.value.reduce((sum, id) => {
      const trap = trapMap.value.get(id);
      return sum + crToXp(trap?.cr);
    }, 0),
  );

  const difficulty = computed(() =>
    calculateDifficulty(
      enemyEntries.value.map((e) => ({ cr: e.cr, count: e.count })),
      partyLevels.value.length ? partyLevels.value : [3],
      allyEntries.value,
      hazardXp.value,
    ),
  );

  const thresholdTiers = computed<ThresholdTier[]>(() => {
    const t = difficulty.value.partyThresholds;
    const max = t.deadly * 1.5 || 1;
    return [
      { label: "Easy",   value: t.easy,   color: "#16A34A", pct: Math.min(100, (t.easy   / max) * 100) },
      { label: "Medium", value: t.medium, color: "#CA8A04", pct: Math.min(100, (t.medium / max) * 100) },
      { label: "Hard",   value: t.hard,   color: "#EA580C", pct: Math.min(100, (t.hard   / max) * 100) },
      { label: "Deadly", value: t.deadly, color: "#DC2626", pct: Math.min(100, (t.deadly / max) * 100) },
    ];
  });

  return { difficulty, thresholdTiers, enemyEntries };
}
