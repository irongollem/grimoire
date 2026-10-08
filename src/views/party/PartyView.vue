<template>
  <PageHeader title="Party Tracker" description="Track your heroes' HP, initiative, and passive skills">
    <template #title-suffix>
      <ManualHelpLink page="party-tracker" />
    </template>

    <template #actions>
      <AppButton
        to="/party/fallen"
        variant="subtle"
        size="md"
        surface="card"
        :icon="IconNavFallen"
        label="Hall of the Fallen"
      />
      <AppButton
        variant="subtle"
        size="md"
        surface="card"
        :icon="IconBeast"
        label="Add Companion"
        @click="tracker?.openCompanionForm(null)"
      />
      <AppButton
        to="/party/new"
        variant="primary"
        size="md"
        :icon="IconAdd"
        label="Add Hero"
      />
    </template>

    <!-- What is waiting on the DM before a character can play (#943). Renders nothing when empty. -->
    <CharacterApprovalQueue v-if="auth.isDM" class="mb-6" />

    <PartyTracker ref="tracker" />

    <!-- What the party has earned (#853, party_milestones) — written by the
         award_milestone quest consequence, or added here by hand. -->
    <PartyMilestonesPanel class="mt-6" />

    <!-- Group Portrait -->
    <div class="mt-6 rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <div>
          <span class="text-label-lg font-semibold text-muted-foreground">Group Portrait</span>
          <p class="text-caption text-muted-foreground italic mt-0.5">
            Use <span class="text-label font-bold">@Party</span> in Chronicler scenes to reference this shot instead of individual portraits; saves tokens and effort.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <input ref="uploadInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
          <AppButton
            variant="subtle"
            size="sm"
            class="bg-muted/40"
            :disabled="generating"
            :icon="IconUpload"
            label="Upload"
            tooltip="Upload your own art"
            @click="uploadInput?.click()"
          />
          <AppButton
            v-if="isAiEnabled"
            variant="subtle"
            size="sm"
            class="bg-muted/40"
            :disabled="generating || !hasPartyMembers"
            :tooltip="!hasPartyMembers ? 'Add party members first' : groupPortraitUrl ? 'Regenerate group portrait' : 'Generate group portrait'"
            @click="generateGroupPortrait"
          >
            <template #icon><IconGenerate class="h-3.5 w-3.5" :class="generating ? 'animate-pulse' : ''" /></template>
            {{ generating ? 'Generating…' : groupPortraitUrl ? 'Regenerate' : 'Generate' }}
          </AppButton>
        </div>
      </div>

      <div v-if="isAiEnabled && hasPartyMembers && !generating" class="px-4 pt-2 flex justify-end">
        <GenerationCostBadge :credits="groupPortraitCost" :byok="groupPortraitByok" :show-balance="false" />
      </div>

      <div v-if="error" class="px-4 py-2">
        <p class="text-caption text-destructive">{{ error }}</p>
      </div>

      <div v-if="groupPortraitUrl" class="p-4 flex justify-center">
        <img
          :src="groupPortraitUrl"
          alt="Party group portrait"
          class="w-full max-w-3xl rounded-md object-cover"
        />
      </div>
      <div v-else-if="!generating" class="px-4 py-6 text-center">
        <p class="text-body text-muted-foreground italic">No group portrait yet.</p>
      </div>
      <div v-else class="px-4 py-6 text-center">
        <p class="text-body text-muted-foreground italic animate-pulse">Generating group portrait…</p>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconBeast, IconGenerate, IconNavFallen, IconUpload } from '@/lib/icons';
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import CharacterApprovalQueue from "@/components/campaign/CharacterApprovalQueue.vue";
import PartyTracker from "@/components/party/PartyTracker.vue";
import PartyMilestonesPanel from "@/components/party/PartyMilestonesPanel.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useGroupPortrait } from "@/composables/party/useGroupPortrait";

// Hidden, not disabled, while the campaign owner has AI off (the server would 403).
const campaignStore = useCampaignStore();
const auth = useAuthStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

const tracker     = ref<InstanceType<typeof PartyTracker> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

const {
  groupPortraitUrl,
  partyMembers,
  generating,
  error,
  generateGroupPortrait,
  uploadGroupPortrait,
  groupPortraitCost,
  groupPortraitByok,
} = useGroupPortrait();
const hasPartyMembers = computed(() => (partyMembers.value?.length ?? 0) > 0);

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void uploadGroupPortrait(file);
}
</script>
