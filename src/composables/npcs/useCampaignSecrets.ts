import { computed, provide, ref, toValue, type MaybeRefOrGetter } from "vue";
import { SECRET_DISCLOSURES_KEY } from "@/lib/tiptap/secretDisclosures";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CAMPAIGN_SECRETS_KEY, NPC_MEMORIES_KEY } from "@/lib/campaignLiveSync/registry";
import { disclosedSecretLabels, type DisclosureMemory } from "@/lib/npcs/disclosedSecrets";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useCampaignStore } from "@/stores/campaign";
import type { CampaignSecret } from "@/types/npcMemory.types";

export { CAMPAIGN_SECRETS_KEY };

/** Every [secret] block in the campaign's text, for the memory picker. DM only: the RPC refuses anyone else. */
export function useCampaignSecrets(enabled?: MaybeRefOrGetter<boolean>) {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CAMPAIGN_SECRETS_KEY, campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, cid] }): Promise<CampaignSecret[]> => {
      if (cid === null) throw new Error("useCampaignSecrets fetched without a campaign");
      const { data, error } = await supabase.rpc("list_campaign_secrets", { p_campaign_id: cid });
      if (error) throw error;
      return data as CampaignSecret[];
    },
    enabled: () => !!campaign.activeCampaignId && (enabled === undefined || toValue(enabled)),
  });
}

/** secret_id to a label for the first memory that disclosed it ("known since Session 14 (Bram)"). */
export function useDisclosedSecrets(enabled?: MaybeRefOrGetter<boolean>) {
  const campaign = useCampaignStore();
  const on = () => enabled === undefined || toValue(enabled);
  // All three reads wait on `enabled`: the labels need the log and the names
  // only once something on screen holds a disclosed secret.
  const sessions = useCampaignSessions({ enabled: on });
  const npcs = useNpcs(on);
  const memories = useQuery({
    queryKey: computed(() => [NPC_MEMORIES_KEY, "disclosed", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<DisclosureMemory[]> => {
      if (cid === null) throw new Error("useDisclosedSecrets fetched without a campaign");
      const { data, error } = await supabase
        .from("npc_memories")
        .select("secret_id, npc_id, session_id, created_at")
        .eq("campaign_id", cid)
        .not("secret_id", "is", null);
      if (error) throw error;
      return data as DisclosureMemory[];
    },
    enabled: () => !!campaign.activeCampaignId && on(),
  });
  const labels = computed<ReadonlyMap<string, string>>(() => {
    const rows = memories.data.value;
    const log = sessions.data.value;
    const people = npcs.data.value;
    if (!rows || !log || !people) return new Map();
    const names = new Map<string, string>();
    for (const npc of people) {
      const name = getNpcDisplayName(npc);
      if (name) names.set(npc.id, name);
    }
    return disclosedSecretLabels(rows, log, (id) => names.get(id));
  });
  return { labels, isLoading: computed(() => memories.isLoading.value) };
}

/**
 * Provides the DM's disclosure labels to every rich-text viewer under the DM
 * layout (src/lib/tiptap/secretDisclosures.ts): one read of the disclosed
 * memories, made only while some viewer showing a secret asks for it.
 */
export function provideSecretDisclosures(isDm: () => boolean): void {
  const wanted = ref(0);
  const { labels } = useDisclosedSecrets(() => isDm() && wanted.value > 0);
  provide(SECRET_DISCLOSURES_KEY, {
    labels,
    want() {
      wanted.value++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        wanted.value--;
      };
    },
  });
}
