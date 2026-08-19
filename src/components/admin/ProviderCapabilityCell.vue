<template>
  <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
    <div class="flex items-center justify-between">
      <span class="text-eyebrow font-semibold text-muted-foreground">{{ label }}</span>
      <template v-if="model !== null && model !== undefined">
        <ToggleSwitch v-model="enabled" size="md" :aria-label="`Enable ${label}`" />
      </template>
      <span v-else class="text-eyebrow text-muted-foreground/50">N/A</span>
    </div>

    <template v-if="model !== null && model !== undefined">
      <div class="space-y-1">
        <label class="block text-label text-muted-foreground">{{ curated ? 'Models' : 'Model' }}</label>
        <!-- Curated capability with more than one known model: the edge function only
             implements these exact models, so show them as a static list rather than
             inviting a free-text value it can't serve. Mirrors the original audio block. -->
        <template v-if="curated && knownModels.length > 1">
          <div class="space-y-0.5">
            <div
              v-for="m in knownModels"
              :key="m"
              class="font-mono text-2xs text-muted-foreground px-2 py-1 rounded bg-muted/30"
            >{{ m }}</div>
          </div>
        </template>
        <!-- Freely editable: either a non-curated capability backed by a live
             models API (text/image), or a curated capability with 0-1 known models. -->
        <template v-else>
          <AppInput
            v-model="model"
            :list="`${capability}-models-${provider}`"
            type="text"
            size="caption"
            class="font-mono"
            :placeholder="placeholder"
          />
          <datalist :id="`${capability}-models-${provider}`">
            <option v-for="m in knownModels" :key="m" :value="m" />
          </datalist>
        </template>
      </div>

      <slot name="extra" />

      <div v-if="showMultiplier" class="space-y-1">
        <label class="block text-label text-muted-foreground">Multiplier</label>
        <AppInput
          v-model.number="multiplier"
          type="number"
          step="0.1" min="0.1"
          size="caption"
          class="font-mono"
          placeholder="1.0"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
// Shared cell for one AI capability (text / image / audio / embedding) inside a
// provider card in AdminProvidersTab. The four blocks this replaces were
// near-identical: an enabled toggle gated on the model being non-null, a model
// picker (curated static list, or free-text input + datalist), and an optional
// credit multiplier. See CLAUDE.md "Component Granularity" — this is the
// third-or-fourth near-copy where the structure becomes a component.
interface Props {
  /** Section heading, e.g. "Text", "Image", "Audio", "Embedding". */
  label: string;
  /** provider id, used to namespace the datalist element id. */
  provider: string;
  /** capability id, used to namespace the datalist element id (e.g. "text", "embedding"). */
  capability: string;
  /** Known models for this provider+capability. Always offered as datalist suggestions. */
  knownModels?: string[];
  /**
   * True when knownModels is an exhaustive, hand-maintained list of the only
   * models the backend actually supports (audio, embedding) rather than a
   * live models-API result the user can freely pick from (text, image).
   * When true AND more than one model is known, the model picker renders as
   * a static read-only list instead of an editable field.
   */
  curated?: boolean;
  placeholder?: string;
  /**
   * Whether to render the credit multiplier field at all. Defaults to true
   * (text/image/audio all charge a multiplier). Embedding omits it: #595
   * treats embedding cost as a rounding error that rides along with the
   * generation it supports, so it is never charged to users separately.
   */
  showMultiplier?: boolean;
}

const {
  label,
  provider,
  capability,
  knownModels = [],
  curated = false,
  placeholder = "",
  showMultiplier = true,
} = defineProps<Props>();

const model = defineModel<string | null>("model", { required: true });
const enabled = defineModel<boolean>("enabled", { required: true });
const multiplier = defineModel<number | null>("multiplier", { default: null });
</script>
