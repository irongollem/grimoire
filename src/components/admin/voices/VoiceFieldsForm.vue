<template>
  <!-- The fields of a slot. The design prompt and the preview text are sent to the voice designer exactly as written
       here, so they are native text areas (an AI prompt box takes no markup). -->
  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-1">
      <span class="text-label text-muted-foreground">Name</span>
      <AppInput v-model="fields.name" maxlength="80" placeholder="Shady guy" aria-label="Slot name" />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-label text-muted-foreground">Who it fits</span>
      <AppInput v-model="fields.description" maxlength="1000" placeholder="A fence or informant who speaks low and never quite looks at you" aria-label="Who it fits" />
      <span class="text-caption text-muted-foreground">Casting matches a character's record against this, so write it as you would describe the person.</span>
    </label>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label class="flex flex-col gap-1">
        <span class="text-label text-muted-foreground">Sex</span>
        <AppSelect v-model="sex" aria-label="Sex">
          <option value="">Not set</option>
          <option v-for="o in VOICE_SEX_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-label text-muted-foreground">Age</span>
        <AppSelect v-model="age" aria-label="Age">
          <option value="">Not set</option>
          <option v-for="o in VOICE_AGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
      </label>
      <div v-if="binding === null" class="flex flex-col gap-1">
        <span class="text-label text-muted-foreground">Used for</span>
        <SegmentedControl v-model="fields.kind" :options="KIND_OPTIONS" size="sm" block />
      </div>
    </div>
    <template v-if="prompts">
      <label class="flex flex-col gap-1">
        <span class="text-label text-muted-foreground">Design prompt</span>
        <textarea
          :value="fields.design_prompt ?? ''"
          rows="4"
          maxlength="1000"
          placeholder="A gravelly, hushed man in his forties, wary, like he is passing you a secret in an alley"
          class="w-full resize-y rounded border border-border bg-muted px-2.5 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="fields.design_prompt = ($event.target as HTMLTextAreaElement).value"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="flex items-baseline justify-between gap-2">
          <span class="text-label text-muted-foreground">{{ binding === "familiar" ? "Greeting (what the Familiar opens with)" : "Preview text" }}</span>
          <span class="text-caption" :class="previewLengthOk ? 'text-muted-foreground' : 'text-ink-caution'" data-testid="preview-counter">
            {{ previewLength }} / {{ ELEVENLABS_PREVIEW_MAX }} characters (ElevenLabs needs at least {{ ELEVENLABS_PREVIEW_MIN }})
          </span>
        </span>
        <textarea
          :value="fields.preview_text ?? ''"
          rows="4"
          maxlength="1000"
          placeholder="The words each preview will say. Read them in the voice you are asking for."
          class="w-full resize-y rounded border border-border bg-muted px-2.5 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="fields.preview_text = ($event.target as HTMLTextAreaElement).value"
        />
      </label>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { ELEVENLABS_PREVIEW_MAX, ELEVENLABS_PREVIEW_MIN } from "@/composables/admin/useVoiceStudio";
import { VOICE_AGE_OPTIONS, VOICE_SEX_OPTIONS, type SpeechVoiceFields, type VoiceAge, type VoiceBinding, type VoiceKind, type VoiceSex } from "@/types/speechVoice.types";

const { prompts = false, binding = null } = defineProps<{ prompts?: boolean; binding?: VoiceBinding | null }>();
const fields = defineModel<SpeechVoiceFields>({ required: true });

const KIND_OPTIONS: { value: VoiceKind; label: string }[] = [
  { value: "cast", label: "Cast pool" },
  { value: "own", label: "Signature voice" },
];

// A select speaks in strings; the column is null when nothing is chosen.
const sex = computed<string>({
  get: () => fields.value.sex ?? "",
  set: (v) => {
    fields.value.sex = v === "" ? null : (v as VoiceSex);
  },
});
const age = computed<string>({
  get: () => fields.value.age ?? "",
  set: (v) => {
    fields.value.age = v === "" ? null : (v as VoiceAge);
  },
});

const previewLength = computed(() => (fields.value.preview_text ?? "").trim().length);
const previewLengthOk = computed(() => previewLength.value >= ELEVENLABS_PREVIEW_MIN && previewLength.value <= ELEVENLABS_PREVIEW_MAX);
</script>
