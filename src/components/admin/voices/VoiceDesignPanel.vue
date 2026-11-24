<template>
  <section class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3" data-testid="voice-design-panel">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-label text-muted-foreground">Design on</span>
        <SegmentedControl v-model="service" :options="serviceOptions" size="sm" />
      </div>
      <AppButton variant="primary" size="sm" :icon="IconGenerate" label="Design voices" :loading="studio.design.isPending.value" :disabled="problem !== null" @click="design" />
    </div>
    <p v-if="problem" class="text-caption text-muted-foreground">{{ problem }}</p>
    <p v-if="studio.design.isError.value" role="alert" class="text-body text-destructive">{{ errorText(studio.design.error.value) }}</p>

    <ul v-if="previews.length > 0" class="flex flex-col divide-y divide-border">
      <li v-for="(preview, i) in previews" :key="preview.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2" :data-testid="`preview-${i}`">
        <AppButton variant="outline" size="sm" :icon="playingId === preview.id ? IconPause : IconPlay" :label="`Preview ${i + 1}`" @click="toggle(preview)" />
        <span v-if="kept[preview.id]" class="text-label text-muted-foreground">Kept in {{ kept[preview.id] }}</span>
        <div class="ml-auto flex flex-wrap gap-1">
          <AppButton v-if="slot" variant="subtle" size="sm" label="Keep in this slot" :loading="busyId === preview.id" :disabled="busyId !== null" @click="keepInSlot(preview)" />
          <AppButton variant="subtle" size="sm" label="Keep as a new slot" :disabled="busyId !== null" @click="askNewName(preview)" />
        </div>
      </li>
    </ul>

    <VoiceConfirmDialog
      :open="replacing !== null"
      title="Replace this slot's voice?"
      :message="`${slot?.name ?? 'This slot'} already has a voice. Keeping this one replaces it everywhere it is cast.`"
      confirm-label="Replace voice"
      :check-label="slot?.origin === 'designed' ? `Also delete the old voice from ${serviceName(slot.service)}` : undefined"
      danger
      @confirm="(ticked) => replacing && doKeepInSlot(replacing, ticked)"
      @cancel="replacing = null"
    />

    <AppModal :open="namingFor !== null" size="sm" label="Keep as a new slot" @close="namingFor = null">
      <form class="flex flex-col gap-3 p-5" @submit.prevent="keepAsNew">
        <h2 class="text-heading-sm font-semibold text-foreground">Keep as a new slot</h2>
        <p class="text-caption text-muted-foreground">The other fields are copied from this slot's form. Change them afterwards in the new slot.</p>
        <AppInput v-model="newName" maxlength="80" aria-label="Name of the new slot" />
        <div class="flex justify-end gap-2">
          <AppButton variant="outline" label="Cancel" @click="namingFor = null" />
          <AppButton type="submit" variant="primary" label="Keep" :disabled="newName.trim() === ''" />
        </div>
      </form>
    </AppModal>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import { bindingService, designProblem, nextSlotName, type useVoiceStudio } from "@/composables/admin/useVoiceStudio";
import { useAudioToggle } from "@/composables/voices/useSpeechVoices";
import { useToast } from "@/composables/useToast";
import { IconGenerate, IconPause, IconPlay } from "@/lib/icons";
import type { DesignedPreview, SpeechService, SpeechVoice, SpeechVoiceFields } from "@/types/speechVoice.types";
import VoiceConfirmDialog from "./VoiceConfirmDialog.vue";

const { slot, fields, studio } = defineProps<{
  /** The saved slot being designed for; null while a new slot is still being written (it can only keep as new). */
  slot: SpeechVoice | null;
  /** The form as it stands, unsaved edits included: what is sent, and what a new slot copies. */
  fields: SpeechVoiceFields;
  studio: ReturnType<typeof useVoiceStudio>;
}>();
const emit = defineEmits<{ (e: "kept", voice: SpeechVoice): void }>();
const service = defineModel<SpeechService>("service", { required: true });

const toast = useToast();
const SERVICE_OPTIONS = [
  { value: "elevenlabs" as const, label: "ElevenLabs" },
  { value: "inworld" as const, label: "Inworld" },
];
// A bound slot is refilled on its binding's service only: the code asks each binding of one service.
const serviceOptions = computed(() => {
  const only = bindingService(slot?.binding ?? null);
  return only === null ? SERVICE_OPTIONS : SERVICE_OPTIONS.filter((o) => o.value === only);
});
const serviceName = (s: SpeechService | null): string => (s === "inworld" ? "Inworld" : "ElevenLabs");
const errorText = (e: unknown): string => (e instanceof Error ? e.message : "The designer did not answer.");

const previews = ref<DesignedPreview[]>([]);
/** preview id -> the name of the slot it was kept in, so a kept preview is marked and several can be kept. */
const kept = ref<Record<string, string>>({});
const busyId = ref<string | null>(null);
const replacing = ref<DesignedPreview | null>(null);
const namingFor = ref<DesignedPreview | null>(null);
const newName = ref("");

const problem = computed(() => designProblem(service.value, fields.design_prompt ?? "", fields.preview_text ?? ""));

async function design(): Promise<void> {
  releaseAudio();
  kept.value = {};
  // Sent verbatim: the prompt and the text are exactly what the maintainer wrote in the form.
  previews.value = await studio.design.mutateAsync({ service: service.value, prompt: fields.design_prompt ?? "", previewText: fields.preview_text ?? "" }).catch(() => []);
}

// ── listening ──────────────────────────────────────────────────────────────────────────────────────────────────
// The previews are already in memory: the player only needs them by id.
const player = useAudioToggle(async (id) => {
  const preview = previews.value.find((p) => p.id === id);
  if (preview === undefined) throw new Error("That preview is gone. Design again.");
  return preview;
});
const playingId = player.playing;
const toggle = (preview: DesignedPreview): Promise<void> => player.toggle(preview.id);
const releaseAudio = (): void => player.reset();

// ── keeping ────────────────────────────────────────────────────────────────────────────────────────────────────
function keepInSlot(preview: DesignedPreview): void {
  if (!slot) return;
  // A slot that already has a voice is replaced only after the admin agrees.
  if (slot.voice_id !== null) replacing.value = preview;
  else void doKeepInSlot(preview, false);
}

async function doKeepInSlot(preview: DesignedPreview, retireOld: boolean): Promise<void> {
  if (!slot) return;
  replacing.value = null;
  busyId.value = preview.id;
  try {
    const voice = await studio.keep.mutateAsync({ service: service.value, preview, slot, retireOld });
    // Then the slot keeps the prompt and fields its voice was designed from, unsaved edits included: otherwise a
    // later redesign starts from the old prompt. Only once the voice is in: a keep that failed must not leave the
    // slot describing a voice it does not hold (casting matches characters on that description).
    await studio.saveSlot.mutateAsync({ id: slot.id, fields });
    kept.value = { ...kept.value, [preview.id]: voice.name };
    toast.success(`Kept in ${voice.name}.`);
    emit("kept", voice);
  } catch (e) {
    toast.error(errorText(e));
  } finally {
    busyId.value = null;
  }
}

function askNewName(preview: DesignedPreview): void {
  newName.value = nextSlotName(fields.name);
  namingFor.value = preview;
}

async function keepAsNew(): Promise<void> {
  const preview = namingFor.value;
  if (!preview) return;
  namingFor.value = null;
  busyId.value = preview.id;
  try {
    const voice = await studio.keep.mutateAsync({ service: service.value, preview, newSlot: { ...fields, name: newName.value } });
    kept.value = { ...kept.value, [preview.id]: voice.name };
    toast.success(`Kept as ${voice.name}.`);
    emit("kept", voice);
  } catch (e) {
    toast.error(errorText(e));
  } finally {
    busyId.value = null;
  }
}
</script>
