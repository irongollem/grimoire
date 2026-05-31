<template>
  <!--
    Mobile-only (<md) spell edit screen. Rendered by SpellDetail when
    useMediaQuery("(max-width: 767px)") is true; the desktop multi-column form
    is shown otherwise (byte-identical to before).

    SpellDetail owns every field as its own ref — those refs are the single
    source of truth. This layer is pure presentation: it receives the current
    values as props and emits `update:*` back, the same props-down / emit-up
    contract the existing SpellTimingSection / SpellComponentsSection /
    SpellClassesSection already use (and which we reuse verbatim here).

    Layout top → bottom:
      1. sticky app bar (Cancel · title · overflow ⋮ sheet)
      2. stacked section cards — Identity / Casting / Components / Description /
         Higher Levels / Classes / Tags
      3. fixed bottom save bar (Cancel · Save/Create)

    SRD spells are art-only: a read-only banner explains, the editable fields are
    hidden, and only the parent's portrait/art block (rendered by SpellDetail
    desktop) applies — mirroring the desktop "SRD spell — art only" behaviour.
  -->
  <div class="flex min-h-dvh flex-col bg-background md:hidden">
    <!-- ── 1. App bar ─────────────────────────────────────────────────────── -->
    <header
      class="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur"
    >
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-2 font-fell text-sm text-muted-foreground active:text-foreground"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <h1 class="min-w-0 flex-1 truncate text-center font-cinzel text-base font-bold text-foreground">
        {{ title }}
      </h1>
      <button
        v-if="!isNew && !isSrd"
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        aria-label="More actions"
        @click="showMenu = true"
      >
        <!-- vertical ellipsis -->
        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      <span v-else class="size-10 shrink-0" aria-hidden="true" />
    </header>

    <!-- ── 2. Scroll body ─────────────────────────────────────────────────── -->
    <main class="flex-1 space-y-3 overflow-y-auto p-3 pb-28">
      <!-- Read-only SRD banner: spells are art-only (no clone/customize path) -->
      <section
        v-if="isSrd"
        class="rounded-xl border border-border bg-muted/50 px-4 py-3"
      >
        <p class="font-fell text-sm italic text-muted-foreground">
          Read-only SRD reference — only its card art can be customised (from the
          desktop editor).
        </p>
      </section>

      <template v-else>
        <!-- Identity card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Identity</h3>
          <label class="block">
            <span class="field-label">Name</span>
            <input
              :value="name"
              class="field-input w-full"
              placeholder="Spell name…"
              @input="emit('update:name', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="field-label">Level</span>
              <select
                :value="level"
                class="field-input w-full"
                @change="emit('update:level', Number(($event.target as HTMLSelectElement).value))"
              >
                <option :value="0">Cantrip (0)</option>
                <option v-for="n in 9" :key="n" :value="n">{{ n }}{{ levelSuffix(n) }}-Level</option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">School</span>
              <select
                :value="school"
                class="field-input w-full capitalize"
                @change="emit('update:school', ($event.target as HTMLSelectElement).value as SpellSchool)"
              >
                <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
              </select>
            </label>
          </div>
        </section>

        <!-- Casting card (timing + components, reusing the shared sections) -->
        <section class="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Casting</h3>
          <SpellTimingSection
            :casting-time="castingTime"
            :casting-time-custom="castingTimeCustom"
            :range="range"
            :range-custom="rangeCustom"
            :duration="duration"
            :duration-custom="durationCustom"
            :concentration="concentration"
            :ritual="ritual"
            @update:casting-time="emit('update:castingTime', $event)"
            @update:casting-time-custom="emit('update:castingTimeCustom', $event)"
            @update:range="emit('update:range', $event)"
            @update:range-custom="emit('update:rangeCustom', $event)"
            @update:duration="emit('update:duration', $event)"
            @update:duration-custom="emit('update:durationCustom', $event)"
            @update:concentration="emit('update:concentration', $event)"
            @update:ritual="emit('update:ritual', $event)"
          />
          <SpellComponentsSection
            :components="components"
            :material="material"
            @update:components="emit('update:components', $event)"
            @update:material="emit('update:material', $event)"
          />
        </section>

        <!-- Description card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Description</h3>
          <RichTextEditor
            :model-value="description"
            placeholder="Describe the spell's effects…"
            min-height="160px"
            @update:model-value="emit('update:description', $event)"
          />
        </section>

        <!-- Higher Levels card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">At Higher Levels</h3>
          <textarea
            :value="higherLevels"
            rows="3"
            placeholder="e.g. When cast using a slot of 3rd level or higher, the damage increases by 1d6 for each slot level above 2nd…"
            class="field-input w-full resize-y"
            @input="emit('update:higherLevels', ($event.target as HTMLTextAreaElement).value)"
          />
        </section>

        <!-- Classes card -->
        <section class="rounded-xl border border-border bg-card p-4">
          <SpellClassesSection
            :classes="classes"
            @update:classes="emit('update:classes', $event)"
          />
        </section>

        <!-- Tags card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Tags</h3>
          <TagInput
            :model-value="tags"
            @update:model-value="emit('update:tags', $event)"
          />
        </section>
      </template>
    </main>

    <!-- ── 3. Fixed bottom save bar (editable spells only) ────────────────── -->
    <footer
      v-if="!isSrd"
      class="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-border bg-background/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
    >
      <button
        type="button"
        class="min-h-11 shrink-0 basis-28 rounded-lg border border-border px-4 font-cinzel text-sm font-bold tracking-wider text-muted-foreground active:bg-muted"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="min-h-11 flex-1 rounded-lg bg-primary px-4 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90 disabled:opacity-50"
        :disabled="isSaving || !canSave"
        @click="emit('save')"
      >
        {{ isSaving ? "Saving…" : isNew ? "Create" : "Save Changes" }}
      </button>
    </footer>
  </div>

  <!-- Overflow ⋮ sheet (existing custom spells) — secondary actions -->
  <MobileSheet v-model:open="showMenu" title="Actions">
    <div class="flex flex-col gap-1 pb-2">
      <button
        v-if="isAiEnabled"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50"
        @click="runAction('generate')"
      >
        <IconGenerate class="size-4 shrink-0 text-primary" /> Generate with AI
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        :disabled="isSendingToScriptorium"
        @click="runAction('scriptorium')"
      >
        <IconScrollText class="size-4 shrink-0 text-muted-foreground" />
        {{ isSendingToScriptorium ? "Exporting…" : "Send to Scriptorium" }}
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10 disabled:opacity-50"
        :disabled="isDeleting"
        @click="runAction('delete')"
      >
        <IconDelete class="size-4 shrink-0" /> Delete spell
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import SpellTimingSection from "./SpellTimingSection.vue";
import SpellComponentsSection from "./SpellComponentsSection.vue";
import SpellClassesSection from "./SpellClassesSection.vue";
import { IconDelete, IconGenerate, IconScrollText } from "@/lib/icons";
import { SPELL_SCHOOLS } from "@/types/spell.types";
import type { SpellSchool } from "@/types/spell.types";

const {
  name,
  level,
  school,
  castingTime,
  castingTimeCustom,
  range,
  rangeCustom,
  duration,
  durationCustom,
  concentration,
  ritual,
  components,
  material,
  description,
  higherLevels,
  classes,
  tags,
  isSrd = false,
  isNew = false,
  isSaving = false,
  isDeleting = false,
  isSendingToScriptorium = false,
  isAiEnabled = false,
  canSave = false,
} = defineProps<{
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  castingTimeCustom: string;
  range: string;
  rangeCustom: string;
  duration: string;
  durationCustom: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  material: string;
  description: string;
  higherLevels: string;
  classes: string[];
  tags: string[];
  isSrd?: boolean;
  isNew?: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  isSendingToScriptorium?: boolean;
  isAiEnabled?: boolean;
  canSave?: boolean;
}>();

const emit = defineEmits<{
  save: [];
  cancel: [];
  delete: [];
  generate: [];
  scriptorium: [];
  "update:name": [value: string];
  "update:level": [value: number];
  "update:school": [value: SpellSchool];
  "update:castingTime": [value: string];
  "update:castingTimeCustom": [value: string];
  "update:range": [value: string];
  "update:rangeCustom": [value: string];
  "update:duration": [value: string];
  "update:durationCustom": [value: string];
  "update:concentration": [value: boolean];
  "update:ritual": [value: boolean];
  "update:components": [value: string[]];
  "update:material": [value: string];
  "update:description": [value: string];
  "update:higherLevels": [value: string];
  "update:classes": [value: string[]];
  "update:tags": [value: string[]];
}>();

const showMenu = ref(false);

const title = computed(() => {
  if (isSrd) return name?.trim() || "Spell";
  if (isNew) return "New Spell";
  return name?.trim() || "Edit Spell";
});

function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

function runAction(action: "generate" | "scriptorium" | "delete") {
  showMenu.value = false;
  if (action === "generate") emit("generate");
  else if (action === "scriptorium") emit("scriptorium");
  else emit("delete");
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>
