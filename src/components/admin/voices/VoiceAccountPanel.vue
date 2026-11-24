<template>
  <!-- Voices that already exist somewhere, to fill a slot with: one found by its ElevenLabs ID (pasted from their
       website), and the ones on the accounts that no slot holds yet (the maintainer's earlier designs). -->
  <section class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="voice-account">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">Voices that already exist</h2>
      <p class="mt-0.5 text-caption text-muted-foreground italic">
        Paste a voice's ID from the ElevenLabs website, or import one already on your accounts. Nothing is designed or paid for, and a Voice Library voice uses no custom slot.
      </p>
    </div>

    <form class="flex flex-wrap items-center gap-2" @submit.prevent="look">
      <AppInput v-model="pasted" size="sm" :block="false" class="min-w-56 flex-1" placeholder="Paste an ElevenLabs voice ID" aria-label="ElevenLabs voice ID" />
      <AppButton type="submit" variant="outline" size="sm" label="Look up" :icon="IconSearch" :loading="looking" :disabled="pasted.trim() === ''" />
    </form>
    <p v-if="lookupNote" class="text-caption text-muted-foreground" role="status">{{ lookupNote }}</p>
    <p v-if="lookupError" class="text-caption text-destructive" role="alert">{{ lookupError }}</p>

    <ul v-if="voices.length > 0" class="flex flex-col divide-y divide-border">
      <li v-for="v in voices" :key="`${v.service}:${v.voiceId}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-body font-semibold text-foreground">{{ v.name }}</span>
          <span class="truncate text-caption text-muted-foreground">{{ v.service === "inworld" ? "Inworld" : "ElevenLabs" }} · {{ v.category }}</span>
        </div>
        <AppButton
          v-if="v.previewUrl"
          variant="ghost"
          size="sm"
          :icon="preview.playing.value === v.previewUrl ? IconPause : IconPlay"
          :label="preview.playing.value === v.previewUrl ? 'Stop' : 'Listen'"
          @click="preview.toggle(v.previewUrl)"
        />
        <AppButton variant="outline" size="sm" label="Import" @click="importing = v" />
      </li>
    </ul>

    <VoiceSlotFieldsDialog
      :open="importing !== null"
      title="Import this voice"
      confirm-label="Import"
      :initial="importInitial"
      :preview-url="importing?.previewUrl ?? null"
      :saving="studio.importVoice.isPending.value"
      :error="importError"
      @close="importing = null"
      @save="doImport"
    />
    <VoiceSlotFieldsDialog
      :open="found !== null"
      :title="found?.inAccount ? 'Add this voice' : 'Add from the Voice Library'"
      :confirm-label="found?.inAccount ? 'Add to the registry' : 'Add from the Library'"
      :note="foundNote"
      :initial="foundInitial"
      :preview-url="found?.previewUrl ?? null"
      :saving="studio.importVoice.isPending.value || studio.addFromLibrary.isPending.value"
      :error="importError"
      @close="found = null"
      @save="addFound"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { ageOfLabel, sexOfLabel, type useVoiceStudio } from "@/composables/admin/useVoiceStudio";
import { useToast } from "@/composables/useToast";
import { useUrlPreview } from "@/composables/voices/useSpeechVoices";
import { IconPause, IconPlay, IconSearch } from "@/lib/icons";
import type { AccountVoice, LookedUpVoice, SpeechVoiceFields, VoiceAge, VoiceSex } from "@/types/speechVoice.types";
import VoiceSlotFieldsDialog from "./VoiceSlotFieldsDialog.vue";

const { voices, studio } = defineProps<{ voices: AccountVoice[]; studio: ReturnType<typeof useVoiceStudio> }>();
const toast = useToast();
const preview = useUrlPreview();
const importing = ref<AccountVoice | null>(null);
const importError = ref<string | null>(null);

const pasted = ref("");
const looking = ref(false);
const lookupError = ref<string | null>(null);
const lookupNote = ref<string | null>(null);
const found = ref<LookedUpVoice | null>(null);

const blankFields = (name: string, description: string, sex: VoiceSex | null, age: VoiceAge | null): SpeechVoiceFields => ({
  name, description, design_prompt: null, preview_text: null, sex, age, kind: "cast",
});

const importInitial = computed<SpeechVoiceFields>(() => blankFields(importing.value?.name ?? "", importing.value?.description ?? "", null, null));
const foundInitial = computed<SpeechVoiceFields>(() =>
  found.value === null ? blankFields("", "", null, null) : blankFields(found.value.name, found.value.description, sexOfLabel(found.value.gender), ageOfLabel(found.value.age)),
);
const foundNote = computed(() =>
  found.value !== null && found.value.rate !== null ? "This is a paid voice: each character spoken costs more than the speech rate you charge for." : undefined,
);

async function look(): Promise<void> {
  const id = pasted.value.trim();
  if (id === "") return;
  looking.value = true;
  lookupError.value = null;
  lookupNote.value = null;
  try {
    const voice = await studio.lookupVoice(id);
    if (voice.inRegistry) lookupNote.value = `${voice.name} already fills a slot.`;
    else found.value = voice;
  } catch (e) {
    lookupError.value = e instanceof Error ? e.message : "That voice could not be looked up.";
  } finally {
    looking.value = false;
  }
}

async function addFound(slot: SpeechVoiceFields): Promise<void> {
  const voice = found.value;
  if (!voice) return;
  importError.value = null;
  try {
    if (voice.inAccount) {
      await studio.importVoice.mutateAsync({ voice: { service: "elevenlabs", voiceId: voice.voiceId }, slot, origin: voice.category === "premade" ? "stock" : "imported" });
    } else if (voice.publicOwnerId !== null) {
      await studio.addFromLibrary.mutateAsync({ voice: { publicOwnerId: voice.publicOwnerId, voiceId: voice.voiceId }, slot });
    } else {
      importError.value = "That voice is not shared in the Voice Library, so it cannot be added from here. Add it to My Voices on ElevenLabs first.";
      return;
    }
    found.value = null;
    pasted.value = "";
    toast.success(`${slot.name} added.`);
  } catch (e) {
    importError.value = e instanceof Error ? e.message : "The voice could not be added.";
  }
}

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
