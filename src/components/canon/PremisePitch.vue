<template>
  <CanonBlock title="The pitch" data-testid="premise-pitch">
    <PitchEditor v-for="pitch in pitches" :key="pitch.id" :entry="pitch" />
    <div v-if="pitches.length === 0" class="flex flex-wrap items-center gap-2">
      <AppButton
        v-if="worldLabel !== null"
        variant="outline"
        :icon="IconGlobe"
        icon-size="xs"
        :label="`Start from ${worldLabel}`"
        :loading="isPending"
        @click="startFromWorld"
      />
      <AppButton
        variant="outline"
        :icon="IconAdd"
        icon-size="xs"
        label="Write the pitch"
        :loading="isPending"
        @click="writeBlank"
      />
      <p class="basis-full text-caption text-muted-foreground">
        A few lines on what the campaign is like. It is what every AI suggestion starts from; players read it only if you share it.
      </p>
    </div>
  </CanonBlock>
</template>

<script setup lang="ts">
/**
 * The pitch, or the two ways to begin one: from the named world's own default text (once, to edit), or blank.
 * "Start from" appears only while there is no pitch, so it can never overwrite one.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import PitchEditor from "./PitchEditor.vue";
import { plainTextToTiptap } from "@/lib/canon/canonParts";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useSettingContent } from "@/composables/campaign/useSettingContent";
import { IconAdd, IconGlobe } from "@/lib/icons";
import { getSetting } from "@/settings/index";
import type { CanonEntry } from "@/types/canon.types";

const { pitches, calendarId } = defineProps<{
  pitches: readonly CanonEntry[];
  /** The campaign's calendar id, which is also its named world's id (null or "custom" for none). */
  calendarId: string | null;
}>();

const { mutate: create, isPending } = useCreateCanonEntry();
const meta = computed(() => (calendarId === null ? undefined : getSetting(calendarId)));
const { data: content } = useSettingContent(() => (meta.value ? meta.value.id : null));

const startText = computed(() => {
  const text = content.value ? content.value.defaultAiPrompt.trim() : "";
  return text === "" ? null : text;
});
// The button needs both the world's name and the text to start from.
const worldLabel = computed(() => (meta.value && startText.value !== null ? meta.value.label : null));

function startFromWorld() {
  if (startText.value === null) return;
  create({ part: "premise", premise_kind: "pitch", body: plainTextToTiptap(startText.value), player_visible_to: [] });
}

function writeBlank() {
  create({ part: "premise", premise_kind: "pitch", body: null, player_visible_to: [] });
}
</script>
