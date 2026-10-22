import { computed, type ComputedRef } from "vue";
import { useNpcs, useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { useKinLinks } from "@/composables/kinship/useKinLinks";
import { usePlayerVisibleKin } from "@/composables/kinship/usePlayerKin";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { buildKinGraph, type KinEdgeInput, type KinGraph, type KinPerson } from "@/lib/kinship/graph";
import { linkEnds, personKey } from "@/lib/kinship/keys";
import type { KinLink, PersonKey, PlayerVisibleKin } from "@/types/kinship.types";

/** A person as a family surface draws them: the graph's facts plus what a card shows. */
export interface KinPersonView extends KinPerson {
  portraitUrl: string | null;
  /** One short line under the name: occupation for an NPC, class for a PC. */
  subtitle: string | null;
  /** Where tapping the person goes, or null when this viewer has nowhere to go. */
  to: string | null;
}

export interface KinGraphSource {
  graph: ComputedRef<KinGraph>;
  people: ComputedRef<Map<PersonKey, KinPersonView>>;
  /** The stored rows, for editing. Empty for a player, who never reads kin_links. */
  links: ComputedRef<KinLink[]>;
  /** Houses the viewer knows and their members (player only; the DM reads faction membership directly). */
  houses: ComputedRef<PlayerVisibleKin["houses"]>;
  isLoading: ComputedRef<boolean>;
}

function edgesOf(links: KinLink[]): KinEdgeInput[] {
  return links.map((l) => ({ id: l.id, ...linkEnds(l), kind: l.kind, parent_role: l.parent_role, adoptive: l.adoptive }));
}

/** The DM's view: every NPC and PC in the campaign and every kin link. */
export function useDmKinGraph(): KinGraphSource {
  const npcs = useNpcs();
  const party = useParty();
  const kin = useKinLinks();

  const people = computed(() => {
    const map = new Map<PersonKey, KinPersonView>();
    for (const n of npcs.data.value ?? []) {
      const key = personKey("npc", n.id);
      map.set(key, {
        key,
        name: n.name,
        bornYear: n.born_year,
        dead: n.status === "dead",
        isPc: false,
        portraitUrl: n.portrait_url,
        subtitle: n.occupation,
        to: `/npcs/${n.id}`,
      });
    }
    for (const p of party.data.value ?? []) {
      const key = personKey("pc", p.id);
      map.set(key, {
        key,
        name: p.name,
        bornYear: p.born_year ?? null,
        dead: false,
        isPc: true,
        portraitUrl: p.portrait_url,
        subtitle: p.class,
        to: `/party/${p.id}`,
      });
    }
    return map;
  });

  const links = computed(() => kin.data.value ?? []);
  const graph = computed(() => buildKinGraph([...people.value.values()], edgesOf(links.value)));

  return {
    graph,
    people,
    links,
    houses: computed(() => []),
    isLoading: computed(() => npcs.isLoading.value || party.isLoading.value || kin.isLoading.value),
  };
}

/**
 * A player's view: only people the projections show, and only the links between
 * two of them (get_player_visible_kin decides that server-side). Birth years are
 * the DM's, so a player's tree orders by links alone.
 */
export function usePlayerKinGraph(): KinGraphSource {
  const campaign = useCampaignStore();
  const appUi = useAppUiStore();
  const npcs = useSharedNpcs();
  const party = useParty();
  const previewMemberId = computed(() => (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : null));
  const kin = usePlayerVisibleKin(() => campaign.activeCampaignId, previewMemberId);

  const people = computed(() => {
    const map = new Map<PersonKey, KinPersonView>();
    for (const n of npcs.data.value ?? []) {
      if (n.name === null) continue;
      const key = personKey("npc", n.id);
      map.set(key, {
        key,
        name: n.name,
        bornYear: null,
        dead: n.status === "dead",
        isPc: false,
        portraitUrl: n.portrait_url,
        subtitle: n.occupation,
        to: null,
      });
    }
    for (const p of party.data.value ?? []) {
      const key = personKey("pc", p.id);
      map.set(key, {
        key,
        name: p.name,
        bornYear: null,
        dead: false,
        isPc: true,
        portraitUrl: p.portrait_url,
        subtitle: p.class,
        to: null,
      });
    }
    return map;
  });

  const graph = computed(() =>
    buildKinGraph(
      [...people.value.values()],
      (kin.data.value?.links ?? []).map((l) => ({
        id: l.id,
        from: l.from,
        to: l.to,
        kind: l.kind,
        parent_role: l.parent_role,
        adoptive: l.adoptive,
      })),
    ),
  );

  return {
    graph,
    people,
    links: computed(() => []),
    houses: computed(() => kin.data.value?.houses ?? []),
    isLoading: computed(() => npcs.isLoading.value || party.isLoading.value || kin.isLoading.value),
  };
}
