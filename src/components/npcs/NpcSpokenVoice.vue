<template>
  <section v-if="aiOn" class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3.5" data-testid="npc-spoken-voice">
    <p class="text-label-lg font-semibold text-muted-foreground">SPOKEN VOICE</p>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <template v-if="current">
          <p class="text-body font-semibold text-foreground" data-testid="voice-name">{{ current.name }}</p>
          <p class="text-caption text-muted-foreground">{{ current.description }}</p>
        </template>
        <template v-else>
          <p class="text-body font-semibold text-foreground" data-testid="voice-name">Cast at the table</p>
          <p class="text-caption text-muted-foreground">
            The table picks a voice that fits the first time they speak, and keeps it. You can change it here afterwards.
          </p>
        </template>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <AppButton
          v-if="current"
          variant="outline"
          size="sm"
          :icon="playing === current.id ? IconStop : IconPlay"
          :loading="loading === current.id"
          :label="playing === current.id ? 'Stop' : 'Listen'"
          @click="sample.toggle(current.id)"
        />
        <AppButton variant="outline" size="sm" label="Change" :disabled="saving" data-testid="voice-change" @click="changing = true" />
      </div>
    </div>

    <p v-if="problem" class="text-caption text-destructive" role="alert">{{ problem }}</p>

    <NpcVoiceBrowser
      :open="changing"
      :voices="usable"
      :current-id="current?.id ?? null"
      :playing="playing"
      :loading="loading"
      :saving="saving"
      @close="closeBrowser"
      @listen="sample.toggle"
      @pick="write"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import NpcVoiceBrowser from "@/components/npcs/NpcVoiceBrowser.vue";
import { useUpdateNpc } from "@/composables/npcs/useNpcs";
import { useSpeechVoices, useVoiceSample } from "@/composables/voices/useSpeechVoices";
import { useToast } from "@/composables/useToast";
import { IconPlay, IconStop } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import type { Npc } from "@/types/npc.types";

// Which voice reads this character aloud at the AI table (#1272). It saves itself on every pick, like the reveal
// control: the sheet's Save/Cancel editor is not involved.

const { npc } = defineProps<{ npc: Pick<Npc, "id" | "speech_voice_id"> }>();

const toast = useToast();
// Only where the campaign has AI on: the voice is heard at the AI table and nowhere else, so elsewhere the control
// would be a choice that does nothing. Off, it renders nothing and the registry is never read.
const campaignStore = useCampaignStore();
const aiOn = computed(() => campaignStore.isAiEnabled);
const { data: voices } = useSpeechVoices(aiOn);
const update = useUpdateNpc();
const sample = useVoiceSample();
const { playing, loading } = sample;
const problem = computed(() => sample.problem.value);

const changing = ref(false);
const saving = computed(() => update.isPending.value);

// Only a filled, active slot can be spoken in; a slot that is only planned or was retired is not offered.
const usable = computed(() => (voices.value ?? []).filter((v) => v.active && v.voice_id !== null && v.service !== null));
// A retired or unreadable slot reads as uncast: the table will recast.
const current = computed(() => usable.value.find((v) => v.id === npc.speech_voice_id) ?? null);

async function write(slotId: string | null): Promise<void> {
  try {
    await update.mutateAsync({ id: npc.id, update: { speech_voice_id: slotId } });
  } catch (error) {
    toast.error(toast.fromError(error, "That voice could not be saved."));
    return;
  }
  closeBrowser();
}

/** Closing the browser stops whatever voice it was playing. */
function closeBrowser(): void {
  sample.stop();
  changing.value = false;
}
</script>
