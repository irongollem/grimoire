<template>
  <AppModal :open="open" size="lg" panel-class="max-h-[92vh]" :label="voice ? `Edit ${voice.name}` : 'New slot'" @close="emit('close')">
    <!-- The body scrolls, never the panel: a scrolled panel slides its rows under its own see-through torn edge. -->
    <div class="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
      <h2 class="text-heading-sm font-semibold text-foreground">{{ voice ? voice.name : "New slot" }}</h2>
      <VoiceFieldsForm v-model="draft" prompts :binding="voice?.binding ?? null" />
      <div class="flex items-center gap-2">
        <ToggleSwitch v-model="active" aria-label="Active" />
        <span class="text-body text-foreground">Active</span>
        <span class="text-caption text-muted-foreground">An inactive slot is never cast.</span>
      </div>
      <p v-if="saveError" role="alert" class="text-body text-destructive">{{ saveError }}</p>
      <div class="flex justify-end gap-2">
        <AppButton variant="outline" :label="dirty ? 'Cancel' : 'Done'" @click="emit('close')" />
        <AppButton variant="primary" label="Save slot" :loading="studio.saveSlot.isPending.value" :disabled="draft.name.trim() === ''" @click="save" />
      </div>
      <VoiceDesignPanel v-model:service="service" :slot="voice" :fields="draft" :studio="studio" @kept="(v) => emit('kept', v)" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import { bindingService, fieldsOf, type useVoiceStudio } from "@/composables/admin/useVoiceStudio";
import { useToast } from "@/composables/useToast";
import type { SpeechService, SpeechVoice, SpeechVoiceFields } from "@/types/speechVoice.types";
import VoiceDesignPanel from "./VoiceDesignPanel.vue";
import VoiceFieldsForm from "./VoiceFieldsForm.vue";

const { open, voice, studio } = defineProps<{
  open: boolean;
  /** The slot being edited; null for a new one. */
  voice: SpeechVoice | null;
  studio: ReturnType<typeof useVoiceStudio>;
}>();
const emit = defineEmits<{ (e: "close"): void; (e: "kept", voice: SpeechVoice): void }>();

const toast = useToast();
const BLANK: SpeechVoiceFields = { name: "", description: "", design_prompt: null, preview_text: null, sex: null, age: null, kind: "cast" };

const draft = ref<SpeechVoiceFields>({ ...BLANK });
const active = ref(true);
const service = ref<SpeechService>("elevenlabs");
const saveError = ref<string | null>(null);

// Opening the editor starts from the slot as saved; editing never leaks from the last one opened.
watch(
  () => [open, voice?.id] as const,
  () => {
    if (!open) return;
    draft.value = voice ? fieldsOf(voice) : { ...BLANK };
    active.value = voice?.active ?? true;
    service.value = bindingService(voice?.binding ?? null) ?? voice?.service ?? "elevenlabs";
    saveError.value = null;
  },
  { immediate: true },
);

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(voice ? fieldsOf(voice) : BLANK) || active.value !== (voice?.active ?? true));

async function save(): Promise<void> {
  saveError.value = null;
  try {
    await studio.saveSlot.mutateAsync({ id: voice?.id, fields: draft.value, active: active.value });
    toast.success("Slot saved.");
    emit("close");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "The slot could not be saved.";
  }
}
</script>
