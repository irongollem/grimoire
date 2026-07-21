<template>
  <div class="max-w-lg">
    <div class="border border-destructive/40 rounded-lg p-5 space-y-4">
      <p class="font-cinzel text-xs font-semibold tracking-wider text-destructive">DELETE CAMPAIGN</p>
      <p class="font-fell text-sm text-muted-foreground">
        This permanently deletes
        <span class="text-foreground font-semibold">{{ campaign?.name }}</span>.
        Your notes, NPCs, party members, calendar events, and encounters will have their campaign link removed but will not be deleted.
      </p>
      <p class="text-eyebrow font-semibold text-muted-foreground">
        TYPE <span class="text-foreground">{{ campaign?.name }}</span> TO CONFIRM
      </p>
      <input
        v-model="deleteConfirmInput"
        type="text"
        autocomplete="off"
        :placeholder="campaign?.name ?? ''"
        class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
      />
      <button
        type="button"
        :disabled="deleteConfirmInput !== campaign?.name || isDeleting"
        class="w-full px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-destructive text-destructive-foreground rounded-md hover:opacity-90 disabled:opacity-30 transition-opacity"
        @click="doDelete"
      >
        {{ isDeleting ? "Deleting…" : "Delete Campaign" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import { useDeleteCampaign, useCampaigns } from "@/composables/useCampaigns";

const campaignStore = useCampaignStore();
const { data: campaignList } = useCampaigns();
const { mutateAsync: deleteCampaign, isPending: isDeleting } = useDeleteCampaign();
const router = useRouter();

const campaign = computed(() => campaignStore.activeCampaign);
const deleteConfirmInput = ref("");

async function doDelete() {
  if (!campaign.value || deleteConfirmInput.value !== campaign.value.name) return;
  const deletedId = campaign.value.id;
  await deleteCampaign(deletedId);
  const remaining = (campaignList.value ?? []).filter((c) => c.id !== deletedId);
  if (remaining.length > 0) {
    campaignStore.switchToCampaign(remaining[0]);
  } else {
    campaignStore.clearActiveCampaign();
  }
  router.push("/dashboard");
}
</script>
