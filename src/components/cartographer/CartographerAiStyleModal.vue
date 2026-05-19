<template>
  <!-- AI Style — Preset Picker modal -->
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="showPicker"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4"
        @mousedown.self="$emit('closePicker')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          class="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <div class="px-5 pt-5 pb-3">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide mb-1">✦ AI Map Style</h2>
            <p class="font-fell text-sm text-muted-foreground mb-4">
              Re-render this map in an artistic style. The result is a new image — your tile map is unchanged.
            </p>
            <!-- Preset grid -->
            <div class="grid grid-cols-3 gap-2 mb-4">
              <button
                v-for="preset in presets"
                :key="preset.id"
                type="button"
                :title="preset.description"
                :class="[
                  'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors',
                  selectedPresetId === preset.id
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                    : 'border-border bg-background text-muted-foreground hover:border-amber-500/30 hover:text-foreground',
                ]"
                @click="$emit('update:selectedPresetId', preset.id)"
              >
                <span class="text-lg leading-none">{{ preset.icon }}</span>
                <span class="font-cinzel text-[10px] font-semibold tracking-wider leading-tight">{{ preset.label }}</span>
                <span class="font-fell text-[9px] leading-tight opacity-70">{{ preset.description }}</span>
              </button>
            </div>
            <!-- Freeform suffix -->
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mb-1">
              Additional details <span class="normal-case">(optional)</span>
            </label>
            <textarea
              :value="promptSuffix"
              rows="2"
              maxlength="300"
              placeholder="e.g. 'flooded corridors, green bioluminescent fungus, caved-in east wing'"
              class="w-full bg-background border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              @input="$emit('update:promptSuffix', ($event.target as HTMLTextAreaElement).value)"
            />
            <p v-if="error" class="mt-2 font-fell text-xs text-destructive">{{ error }}</p>
          </div>
          <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
            <button
              type="button"
              class="px-4 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
              @click="$emit('closePicker')"
            >Cancel</button>
            <button
              type="button"
              :disabled="generating"
              class="px-4 py-1.5 rounded-md font-cinzel text-xs font-semibold tracking-wider bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
              @click="$emit('generate')"
            >{{ generating ? "Generating…" : "Generate" }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- AI Style — Result preview modal -->
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="showResult"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4"
        @mousedown.self="$emit('closeResult')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          class="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <div class="px-5 pt-5 pb-3">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide mb-3">✦ Styled Result</h2>
            <!-- Preview image -->
            <div class="mb-4 rounded-lg overflow-hidden border border-border bg-black aspect-square">
              <img
                v-if="resultUrl"
                :src="resultUrl"
                alt="AI-styled map"
                class="w-full h-full object-contain"
              />
            </div>
            <!-- Save to Atlas inline -->
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mb-1">
              Save to location
            </label>
            <EntityCombobox
              v-model="atlasLocationId"
              :options="locationOptions"
              placeholder="Search locations…"
            />
            <p v-if="atlasTargetHasMap" class="mt-2 font-fell text-xs text-amber-500">This location already has a map — saving will replace it.</p>
            <p v-if="atlasError" class="mt-2 font-fell text-xs text-destructive">{{ atlasError }}</p>
          </div>
          <div class="flex flex-wrap justify-between gap-2 px-5 pb-5 pt-2">
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
                @click="$emit('retry')"
              >Retry</button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
                @click="$emit('backToPicker')"
              >Back</button>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors tracking-wider"
                @click="$emit('downloadStyled')"
              >↓ Download</button>
              <button
                type="button"
                :disabled="!atlasLocationId || atlasSaving"
                class="px-4 py-1.5 rounded-md font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                @click="$emit('saveToAtlas', atlasLocationId)"
              >{{ atlasSaving ? "Saving…" : "Save to Atlas" }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import EntityCombobox from "@/components/common/EntityCombobox.vue";

interface Preset {
  id: string;
  icon: string;
  label: string;
  description: string;
}

interface LocationOption {
  id: string;
  name: string;
}

const {
  showPicker,
  showResult,
  presets,
  selectedPresetId,
  promptSuffix,
  generating,
  error,
  resultUrl,
  locationOptions,
  atlasTargetHasMap,
  atlasError,
  atlasSaving,
} = defineProps<{
  showPicker: boolean;
  showResult: boolean;
  presets: Preset[];
  selectedPresetId: string;
  promptSuffix: string;
  generating: boolean;
  error: string | null;
  resultUrl: string | null;
  locationOptions: LocationOption[];
  atlasTargetHasMap: boolean;
  atlasError: string | null;
  atlasSaving: boolean;
}>();

defineEmits<{
  closePicker: [];
  closeResult: [];
  generate: [];
  retry: [];
  backToPicker: [];
  downloadStyled: [];
  saveToAtlas: [locationId: string];
  "update:selectedPresetId": [id: string];
  "update:promptSuffix": [value: string];
}>();

const atlasLocationId = defineModel<string>("atlasLocationId", { default: "" });
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.15s ease; }
.dialog-fade-enter-active .relative,
.dialog-fade-leave-active .relative { transition: transform 0.15s ease, opacity 0.15s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
.dialog-fade-enter-from .relative,
.dialog-fade-leave-to .relative { transform: scale(0.95); opacity: 0; }
</style>
