import { computed, type ComputedRef } from "vue";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";

/** Every account that is a DM of the active campaign (#590): the owner plus each
 *  seated co-DM (`campaign_members.role = 'dm'`). Use it to label an author "DM";
 *  to pick a single deterministic DM (a whisper recipient), use the owner. */
export function useCampaignDmIds(): ComputedRef<ReadonlySet<string>> {
  const { activeCampaign } = storeToRefs(useCampaignStore());
  const { data: members } = useCampaignMembers();
  return computed(() => {
    const ids = new Set<string>();
    const ownerId = activeCampaign.value?.user_id;
    if (ownerId) ids.add(ownerId);
    for (const m of members.value ?? []) if (m.role === "dm") ids.add(m.user_id);
    return ids;
  });
}
