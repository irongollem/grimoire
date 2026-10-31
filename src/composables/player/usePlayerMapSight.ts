// What the player's own token can see on the battle map (#1073 story 5): the lit map through their eyes, by the rules.
import { computed, type ComputedRef, type Ref } from "vue";
import { liveState } from "@/composables/encounters/useEncounterLive";
import { useParty } from "@/composables/party/useParty";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { sameDoorStates } from "@/lib/battlemap/doors";
import { AMBIENT, NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { NO_DOOR_STATES, occludersOf } from "@/lib/battlemap/occlusion";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import type { LitScene, Viewer } from "@/lib/battlemap/vision";
import { characterSenses } from "@/rules/characterSenses";
import { useAuthStore } from "@/stores/auth";
import type { MapLiveDoorState, MapLive } from "@/types/mapLive.types";

export function usePlayerMapSight(live: Ref<MapLive | null>, ownInstanceId: ComputedRef<string | null>) {
  const auth = useAuthStore();
  // Senses are the better of the species' darkvision and the character's own senses field (`characterSenses`).
  const { data: party } = useParty();
  const ownMember = computed(() =>
    auth.linkedPartyMemberId ? (party.value?.find((m) => m.id === auth.linkedPartyMemberId) ?? null) : null,
  );
  const { data: speciesById } = useSpeciesByIds(() => [ownMember.value?.species_id]);
  const ownSenses = computed(() => {
    const member = ownMember.value;
    const species = member?.species_id ? speciesById.value.get(member.species_id) : undefined;
    return characterSenses({ species, subrace: member?.subrace, senses: member?.senses });
  });
  // Spheres of magical darkness the DM placed (story 10), from the player-safe projection of the live row.
  const zones = computed<readonly DarknessZone[]>(() => (liveState.value ? liveState.value.magical_darkness : NO_ZONES));
  // Doors the DM opened or shut this fight, from the same projection. A re-read hands a fresh array of equal content;
  // the previous one is kept so the occluders memoised on its identity are not rebuilt.
  const doorStates = computed<readonly MapLiveDoorState[]>((prev) => {
    const next = liveState.value ? liveState.value.door_states : NO_DOOR_STATES;
    return prev && sameDoorStates(prev, next) ? prev : next;
  });
  // Only a dark or dim map, or one with a sphere of magical darkness, has sight to apply: in plain daylight everything is
  // seen, so there is no scene and no viewers.
  // Viewers are the own token's centre; a player with no token on the map sees only what is lit.
  const sight = computed<{ scene: LitScene; viewers: Viewer[] } | null>(() => {
    if (!live.value || (live.value.darkness === "daylight" && zones.value.length === 0)) return null;
    const scene: LitScene = {
      ambient: AMBIENT[live.value.darkness],
      sources: live.value.lights,
      occluders: occludersOf(live.value, doorStates.value),
      zones: zones.value,
    };
    const own = liveState.value?.combatants_live?.find((c) => c.instance_id === ownInstanceId.value);
    if (!own?.position) return { scene, viewers: [] };
    const half = combatantFootprint(own) / 2;
    const { darkvision, blindsight, truesight, devilsSight } = ownSenses.value;
    const viewer: Viewer = {
      x: own.position.x + half,
      y: own.position.y + half,
      darkvisionFeet: darkvision,
      blindsightFeet: blindsight,
      truesightFeet: truesight,
      devilsSightFeet: devilsSight,
    };
    return { scene, viewers: [viewer] };
  });
  const viewers = computed<Viewer[] | null>(() => (sight.value ? sight.value.viewers : null));

  return { zones, doorStates, sight, viewers };
}
