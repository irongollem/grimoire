<template>
  <div class="max-w-lg">
    <div class="border border-destructive/40 rounded-lg p-5 space-y-4">
      <p class="text-label-lg font-semibold text-destructive">DELETE CAMPAIGN</p>
      <p class="text-body text-muted-foreground">
        This permanently deletes
        <span class="text-foreground font-semibold">{{ campaign?.name }}</span>.
        Your notes, NPCs, party members, calendar events, and encounters will have their campaign link removed but will not be deleted.
        <span v-if="hasHomebrew">Campaign-scoped homebrew is different — choose what happens to it below.</span>
      </p>

      <div v-if="hasHomebrew" class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-2.5">
        <p class="text-caption text-amber-700 dark:text-amber-400">
          This campaign has <span class="font-semibold">{{ homebrewSummary }}</span> scoped exclusively to it.
          Choose what happens to that homebrew:
        </p>
        <div class="space-y-2">
          <label class="flex items-start gap-2.5 cursor-pointer group">
            <input
              v-model="disposition"
              type="radio"
              value="promote"
              class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
            />
            <div>
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Make available in all campaigns
              </span>
              <p class="text-caption text-muted-foreground italic">
                It becomes universal homebrew — the same as homebrew that was never campaign-scoped.
              </p>
            </div>
          </label>
          <label class="flex items-start gap-2.5 cursor-pointer group">
            <input
              v-model="disposition"
              type="radio"
              value="delete"
              class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
            />
            <div>
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Delete it with the campaign
              </span>
              <p class="text-caption text-muted-foreground italic">
                Permanently removes it too. Export a backup first if you want to keep it.
              </p>
            </div>
          </label>
        </div>
      </div>

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
        :disabled="!canDelete || isDeleting"
        class="w-full px-4 py-2 text-label-lg font-semibold bg-destructive text-destructive-foreground rounded-md hover:opacity-90 disabled:opacity-30 transition-opacity"
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
import { useDeleteCampaign, useCampaigns, useCampaignScopedHomebrewCounts } from "@/composables/useCampaigns";
import {
  hasScopedHomebrew,
  summarizeHomebrewCounts,
  EMPTY_HOMEBREW_COUNTS,
  type HomebrewDisposition,
} from "@/lib/campaignHomebrewDisposition";

const campaignStore = useCampaignStore();
const { data: campaignList } = useCampaigns();
const { mutateAsync: deleteCampaign, isPending: isDeleting } = useDeleteCampaign();
const router = useRouter();

const campaign = computed(() => campaignStore.activeCampaign);
const deleteConfirmInput = ref("");
const disposition = ref<HomebrewDisposition | null>(null);

const campaignId = computed(() => campaign.value?.id ?? null);
const { data: homebrewCounts } = useCampaignScopedHomebrewCounts(() => campaignId.value);
// Query hasn't settled yet — treat as "nothing scoped" rather than showing
// the choice prematurely; it corrects itself the moment the count arrives.
const counts = computed(() => homebrewCounts.value ?? EMPTY_HOMEBREW_COUNTS);
const hasHomebrew = computed(() => hasScopedHomebrew(counts.value));
const homebrewSummary = computed(() => summarizeHomebrewCounts(counts.value));

// The DM must explicitly pick a disposition whenever there's homebrew it
// would actually affect; otherwise the dialog behaves exactly as before.
const canDelete = computed(() =>
  !!campaign.value &&
  deleteConfirmInput.value === campaign.value.name &&
  (!hasHomebrew.value || disposition.value !== null),
);

async function doDelete() {
  if (!campaign.value || !canDelete.value) return;
  const deletedId = campaign.value.id;
  // canDelete already guarantees disposition.value is set whenever it would
  // matter (hasHomebrew); when there's nothing scoped either value is a
  // no-op, so "delete" here never touches anything.
  await deleteCampaign({ id: deletedId, disposition: disposition.value ?? "delete" });
  const remaining = (campaignList.value ?? []).filter((c) => c.id !== deletedId);
  if (remaining.length > 0) {
    campaignStore.switchToCampaign(remaining[0]);
  } else {
    campaignStore.clearActiveCampaign();
  }
  router.push("/dashboard");
}
</script>
