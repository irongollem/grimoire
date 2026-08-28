<template>
  <PageHeader title="Party Tracker" description="Track your heroes' HP, initiative, and passive skills">
    <template #title-suffix>
      <ManualHelpLink page="party-tracker" />
    </template>

    <template #actions>
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

    <PartyTracker ref="tracker" />

    <!-- Group Portrait -->
    <div class="mt-6 rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <div>
          <span class="text-label-lg font-semibold text-muted-foreground">Group Portrait</span>
          <p class="text-caption text-muted-foreground italic mt-0.5">
            Use <span class="font-cinzel text-2xs font-bold">@Party</span> in Chronicler scenes to reference this shot instead of individual portraits — saves tokens and effort.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <input ref="uploadInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
          <AppButton
            variant="subtle"
            size="sm"
            class="bg-background"
            :disabled="generating"
            :icon="IconUpload"
            label="Upload"
            tooltip="Upload your own art"
            @click="uploadInput?.click()"
          />
          <AppButton
            variant="subtle"
            size="sm"
            class="bg-background"
            :disabled="generating || !hasPartyMembers"
            :tooltip="!hasPartyMembers ? 'Add party members first' : groupPortraitUrl ? 'Regenerate group portrait' : 'Generate group portrait'"
            @click="generateGroupPortrait"
          >
            <template #icon><IconGenerate class="h-3.5 w-3.5" :class="generating ? 'animate-pulse' : ''" /></template>
            {{ generating ? 'Generating…' : groupPortraitUrl ? 'Regenerate' : 'Generate' }}
          </AppButton>
        </div>
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
import { IconAdd, IconBeast, IconGenerate, IconUpload } from '@/lib/icons';
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import PartyTracker from "@/components/party/PartyTracker.vue";
import { useGroupPortrait } from "@/composables/party/useGroupPortrait";

const tracker     = ref<InstanceType<typeof PartyTracker> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

const { groupPortraitUrl, partyMembers, generating, error, generateGroupPortrait, uploadGroupPortrait } = useGroupPortrait();
const hasPartyMembers = computed(() => (partyMembers.value?.length ?? 0) > 0);

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void uploadGroupPortrait(file);
}
</script>
