<template>
  <!--
    Mobile-only (<md) Hall of Heroes edit/create screen. Rendered by
    HeroEditorView when useMediaQuery("(max-width: 767px)") is true and the
    current user is an app admin. The desktop form is shown otherwise
    (byte-identical to before).

    Layout top → bottom:
      1. sticky app bar (Cancel · title · overflow ⋮ for existing heroes)
      2. stacked section cards (portrait / identity / status / tags / lore)
      3. fixed bottom save bar (Cancel · Save/Create)
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
        v-if="!isNew"
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        aria-label="More actions"
        @click="showMenu = true"
      >
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
      <!-- Portrait card -->
      <section class="overflow-hidden rounded-xl border border-border bg-card">
        <ImageUpload
          v-model="form.portrait_url"
          v-model:focal-point="form.portrait_focal_point"
          bucket="npc-portraits"
          aspect="portrait"
          :show-focal-point="true"
          placeholder="Drop portrait or click to upload"
        />
      </section>

      <!-- Identity card -->
      <section class="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Identity</h3>

        <!-- Name -->
        <div>
          <label class="field-label">Name *</label>
          <input
            v-model="form.name"
            required
            type="text"
            class="field-input"
            placeholder="Hero name…"
          />
        </div>

        <!-- Setting -->
        <div>
          <label class="field-label">Setting</label>
          <select v-model="form.setting" class="field-input">
            <option v-for="s in SETTINGS" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </div>

        <!-- Species -->
        <div>
          <label class="field-label">Species</label>
          <input
            v-model="form.race"
            type="text"
            class="field-input"
            placeholder="e.g. Human, Elf…"
          />
        </div>

        <!-- Alignment -->
        <div>
          <label class="field-label">Alignment</label>
          <select v-model="form.alignment" class="field-input">
            <option :value="null">—</option>
            <option v-for="a in ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>

        <!-- Occupation -->
        <div>
          <label class="field-label">Occupation</label>
          <input
            v-model="form.occupation"
            type="text"
            class="field-input"
            placeholder="e.g. Wizard, Fighter…"
          />
        </div>

        <!-- Age -->
        <div>
          <label class="field-label">Age</label>
          <input
            v-model="form.age"
            type="text"
            class="field-input"
            placeholder="e.g. 34, Ancient…"
          />
        </div>
      </section>

      <!-- Status card (4-col chip grid) -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Status</h3>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="s in STATUS_OPTIONS"
            :key="s.value"
            type="button"
            class="rounded-md border py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors"
            :style="form.status === s.value
              ? { borderColor: s.color, backgroundColor: s.color + '22', color: s.color }
              : {}"
            :class="form.status !== s.value ? 'border-border text-muted-foreground' : ''"
            @click="form.status = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </section>

      <!-- Tags card -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Tags</h3>
        <TagInput
          :model-value="form.tags"
          @update:model-value="form.tags = $event"
        />
      </section>

      <!-- Lore card (collapsible) -->
      <MobileAccordionSection v-model:open="loreOpen" title="Lore">
        <div class="flex flex-col gap-4">
          <div>
            <label class="field-label">Appearance</label>
            <RichTextEditor
              v-model="form.appearance"
              placeholder="Describe how this character looks…"
              min-height="5rem"
            />
          </div>
          <div>
            <label class="field-label">Personality</label>
            <RichTextEditor
              v-model="form.personality"
              placeholder="Their traits, ideals, and mannerisms…"
              min-height="5rem"
            />
          </div>
          <div>
            <label class="field-label">Backstory</label>
            <RichTextEditor
              v-model="form.backstory"
              placeholder="Their history and origins…"
              min-height="8rem"
            />
          </div>
          <div>
            <label class="field-label">DM Notes</label>
            <RichTextEditor
              v-model="form.notes"
              placeholder="Private notes…"
              min-height="5rem"
            />
          </div>
        </div>
      </MobileAccordionSection>
    </main>

    <!-- ── 3. Fixed bottom save bar ───────────────────────────────────────── -->
    <footer
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
        :disabled="isSaving"
        @click="emit('save')"
      >
        {{ isSaving ? "Saving…" : isNew ? "Create Hero" : "Save Changes" }}
      </button>
    </footer>
  </div>

  <!-- Overflow ⋮ sheet (existing heroes) — secondary actions -->
  <MobileSheet v-model:open="showMenu" title="Actions">
    <div class="flex flex-col gap-1 pb-2">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10"
        @click="runDelete"
      >
        <IconDelete class="size-4 shrink-0" /> Delete Hero
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { HallOfHeroInsert } from "@/types/npc.types";
import type { NpcStatus } from "@/types/npc.types";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import MobileAccordionSection from "@/components/common/MobileAccordionSection.vue";
import { IconDelete } from "@/lib/icons";
import { DND_SETTINGS } from "@/data/dndSettings";

const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
] as const;

const SETTINGS = DND_SETTINGS;

const STATUS_OPTIONS: { value: NpcStatus; label: string; color: string }[] = [
  { value: "alive", label: "Alive", color: "#22c55e" },
  { value: "dead", label: "Dead", color: "#ef4444" },
  { value: "missing", label: "Missing", color: "#f59e0b" },
  { value: "unknown", label: "?", color: "#6b7280" },
];

const {
  form,
  isNew = false,
  isSaving = false,
} = defineProps<{
  form: HallOfHeroInsert;
  isNew?: boolean;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  save: [];
  cancel: [];
  delete: [];
}>();

const showMenu = ref(false);
const loreOpen = ref(true);

const title = computed(() => {
  if (isNew) return "New Hero";
  return form.name?.trim() || "Edit Hero";
});

function runDelete() {
  showMenu.value = false;
  emit("delete");
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
