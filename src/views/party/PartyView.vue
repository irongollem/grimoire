<template>
  <PageHeader title="Party Tracker" description="Track your heroes' HP, initiative, and passive skills">
    <template #actions>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        @click="tracker?.openCompanionForm(null)"
      >
        <PawPrint class="h-3.5 w-3.5" />
        Add Companion
      </button>
      <RouterLink
        to="/play/character/create"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <Plus class="h-3.5 w-3.5" />
        Add Hero
      </RouterLink>
    </template>

    <!-- Group Portrait -->
    <div class="mb-6 rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <div>
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Group Portrait</span>
          <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
            Use <span class="font-cinzel text-[10px] font-bold">@Party</span> in Chronicler scenes to reference this shot instead of individual portraits — saves tokens and effort.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <input ref="uploadInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
          <button
            type="button"
            :disabled="generating"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Upload your own art"
            @click="uploadInput?.click()"
          >
            <Upload class="h-3.5 w-3.5" />
            Upload
          </button>
          <button
            type="button"
            :disabled="generating || !hasPartyMembers"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :title="!hasPartyMembers ? 'Add party members first' : groupPortraitUrl ? 'Regenerate group portrait' : 'Generate group portrait'"
            @click="generateGroupPortrait"
          >
            <Sparkles class="h-3.5 w-3.5" :class="generating ? 'animate-pulse' : ''" />
            {{ generating ? 'Generating…' : groupPortraitUrl ? 'Regenerate' : 'Generate' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="px-4 py-2">
        <p class="font-fell text-xs text-destructive">{{ error }}</p>
      </div>

      <div v-if="groupPortraitUrl" class="p-4 flex justify-center">
        <img
          :src="groupPortraitUrl"
          alt="Party group portrait"
          class="w-full max-w-3xl rounded-md object-cover"
        />
      </div>
      <div v-else-if="!generating" class="px-4 py-6 text-center">
        <p class="font-fell text-sm text-muted-foreground italic">No group portrait yet.</p>
      </div>
      <div v-else class="px-4 py-6 text-center">
        <p class="font-fell text-sm text-muted-foreground italic animate-pulse">Generating group portrait…</p>
      </div>
    </div>

    <PartyTracker ref="tracker" />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { Plus, PawPrint, Sparkles, Upload } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import PartyTracker from "@/components/party/PartyTracker.vue";
import { useGroupPortrait } from "@/composables/useGroupPortrait";

const tracker     = ref<InstanceType<typeof PartyTracker> | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

const { groupPortraitUrl, partyMembers, generating, error, generateGroupPortrait, uploadGroupPortrait } = useGroupPortrait();
const hasPartyMembers = computed(() => (partyMembers.value?.length ?? 0) > 0);

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void uploadGroupPortrait(file);
}
</script>
