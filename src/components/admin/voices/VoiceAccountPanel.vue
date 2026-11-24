<template>
  <!-- Voices already on the accounts that no slot holds: the maintainer's earlier designs, to import. -->
  <section v-if="voices.length > 0" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4" data-testid="voice-account">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">On your accounts</h2>
      <p class="mt-0.5 text-caption text-muted-foreground italic">Voices you made in the services' own tools. Importing one fills a slot; nothing is copied or paid for.</p>
    </div>
    <ul class="flex flex-col divide-y divide-border">
      <li v-for="v in voices" :key="`${v.service}:${v.voiceId}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-body font-semibold text-foreground">{{ v.name }}</span>
          <span class="truncate text-caption text-muted-foreground">{{ v.service === "inworld" ? "Inworld" : "ElevenLabs" }} · {{ v.category }}</span>
        </div>
        <AppButton variant="outline" size="sm" label="Import" @click="importing = v" />
      </li>
    </ul>
    <VoiceSlotFieldsDialog
      :open="importing !== null"
      title="Import this voice"
      confirm-label="Import"
      :initial="initial"
      :saving="studio.importVoice.isPending.value"
      :error="importError"
      @close="importing = null"
      @save="doImport"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { useVoiceStudio } from "@/composables/admin/useVoiceStudio";
import { useToast } from "@/composables/useToast";
import type { AccountVoice, SpeechVoiceFields } from "@/types/speechVoice.types";
import VoiceSlotFieldsDialog from "./VoiceSlotFieldsDialog.vue";

const { voices, studio } = defineProps<{ voices: AccountVoice[]; studio: ReturnType<typeof useVoiceStudio> }>();
const toast = useToast();
const importing = ref<AccountVoice | null>(null);
const importError = ref<string | null>(null);

const initial = computed<SpeechVoiceFields>(() => ({
  name: importing.value?.name ?? "",
  description: importing.value?.description ?? "",
  design_prompt: null,
  preview_text: null,
  sex: null,
  age: null,
  kind: "cast",
}));

async function doImport(slot: SpeechVoiceFields): Promise<void> {
  const voice = importing.value;
  if (!voice) return;
  importError.value = null;
  try {
    await studio.importVoice.mutateAsync({ voice, slot });
    importing.value = null;
    toast.success(`${slot.name} imported.`);
  } catch (e) {
    importError.value = e instanceof Error ? e.message : "The voice could not be imported.";
  }
}
</script>
