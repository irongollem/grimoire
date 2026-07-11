import { ref, computed } from "vue";

const RATING_KEY = "player_npc_rating:";

// Module-level reactive tick so all consumers share the same state
const ratingTick = ref(0);

// Only needs each NPC's id, so accept any id-bearing row (Npc or PlayerNpc).
export function usePlayerNpcRatings(npcs?: () => { id: string }[]) {
  function getRating(npcId: string): number {
    return parseInt(localStorage.getItem(RATING_KEY + npcId) ?? "0", 10);
  }

  function setRating(npcId: string, value: number) {
    if (getRating(npcId) === value) {
      localStorage.removeItem(RATING_KEY + npcId);
    } else {
      localStorage.setItem(RATING_KEY + npcId, String(value));
    }
    ratingTick.value++;
  }

  // Reactive map: npcId → rating (only entries with rating > 0)
  const ratingMap = computed<Map<string, number>>(() => {
    void ratingTick.value;
    const m = new Map<string, number>();
    for (const npc of npcs?.() ?? []) {
      const r = getRating(npc.id);
      if (r > 0) m.set(npc.id, r);
    }
    return m;
  });

  return { getRating, setRating, ratingMap, ratingTick };
}
