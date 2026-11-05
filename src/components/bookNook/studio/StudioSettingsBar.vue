<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-2">
      <span id="studio-breathing" class="text-label uppercase tracking-wider text-muted-foreground">Breathing</span>
      <SegmentedControl
        :model-value="breathing"
        :options="BREATHING_OPTIONS"
        size="sm"
        aria-labelledby="studio-breathing"
        @update:model-value="(v) => v !== 'custom' && emit('breathing', v)"
      />
    </div>
    <label class="flex items-center gap-2">
      <span class="text-label uppercase tracking-wider text-muted-foreground">Mood</span>
      <AppSelect :model-value="mood" size="sm" aria-label="Mood" @update:model-value="(v) => v !== 'custom' && emit('mood', v)">
        <option v-for="m in MOODS" :key="m.id" :value="m.id">{{ m.label }}</option>
        <option v-if="mood === 'custom'" value="custom" disabled>Custom</option>
      </AppSelect>
    </label>
    <label class="flex items-center gap-2">
      <span class="text-label uppercase tracking-wider text-muted-foreground">Frame</span>
      <!-- Frames from the stock shelf, one choice per style (its tall and wide shapes together); shown in full screen only. -->
      <AppSelect :model-value="frameStyle" size="sm" aria-label="Frame" @update:model-value="pickFrame">
        <option value="none">None</option>
        <option v-for="f in frames" :key="f.style" :value="f.style">{{ f.name }}</option>
      </AppSelect>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { breathingOf, type Breathing } from "@/lib/bookNook/edit";
import { MOODS, moodOf, type MoodId } from "@/lib/bookNook/moods";
import type { Scene } from "@/lib/bookNook/scene";
import { useLibraryNookParts } from "@/composables/bookNook/useLibraryNookParts";
import { framePairs, type FramePair } from "@/lib/bookNook/frames";

/** The picture-wide settings besides the loop: breathing (Still, Gentle, Deep), a mood, and the frame. */
const { camera, grade, frame } = defineProps<{ camera: Scene["camera"]; grade: Scene["grade"]; frame: Scene["frame"] }>();
const emit = defineEmits<{ breathing: [value: Breathing]; mood: [value: MoodId]; frame: [value: FramePair | null] }>();

const { data: parts } = useLibraryNookParts();
const frames = computed(() => framePairs(parts.value ?? []));
const frameStyle = computed(() => frame?.style ?? "none");
function pickFrame(style: string) {
  emit("frame", style === "none" ? null : (frames.value.find((f) => f.style === style) ?? null));
}

const BREATHING_OPTIONS = [
  { value: "still", label: "Still" },
  { value: "gentle", label: "Gentle" },
  { value: "deep", label: "Deep" },
] as const;

const breathing = computed(() => breathingOf(camera));
const mood = computed(() => moodOf(grade));
</script>
