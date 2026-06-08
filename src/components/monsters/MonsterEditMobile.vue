<template>
  <!--
    Mobile-only (<md) monster edit screen. Rendered by MonsterDetail when
    useMediaQuery("(max-width: 767px)") is true; the desktop two-column grid
    form is shown otherwise (byte-identical to before).

    The reactive `form` / `sb` live in MonsterDetail and are passed down here by
    reference, so this layer owns layout + interaction only — the single source
    of truth for form state stays in MonsterDetail. v-model bindings mutate the
    shared reactive objects directly (same pattern as NpcEditMobile); action
    buttons emit back to MonsterDetail's existing handlers.

    Layout top → bottom:
      1. sticky app bar (Cancel · title · overflow ⋮ sheet)
      2. stacked section cards (portrait / identity / tags / stat block /
         description / DM notes)
      3. fixed bottom save bar (Cancel · Save/Create)

    SRD monsters are read-only: the Customize banner clones to an editable copy,
    portrait + focal point stay interactive (SRD art override via the parent's
    onPortraitUrlUpdate / upsertSrdArt), and the rest is disabled via
    fieldset[disabled], mirroring the desktop behaviour.
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
      <!-- Read-only SRD banner (Customize clones to an editable copy) -->
      <section
        v-if="isSrd"
        class="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3"
      >
        <p class="font-fell text-sm italic text-muted-foreground">
          Read-only SRD reference.
        </p>
        <button
          type="button"
          :disabled="isCloning"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground active:opacity-90 disabled:opacity-50"
          @click="emit('customize')"
        >
          <IconCopy class="size-3.5" />
          {{ isCloning ? "Copying…" : "Customize" }}
        </button>
      </section>

      <!-- Portrait card (interactive even for SRD — art override) -->
      <section class="overflow-hidden rounded-xl border border-border bg-card">
        <EntityImageBlock
          :model-value="form.image_url"
          :focal-point="form.portrait_focal_point"
          bucket="monster-images"
          show-focal-point
          ai-kind="monster"
          :ai-target-id="monsterId"
          :ai-context="aiContext"
          @update:model-value="emit('update:imageUrl', $event)"
          @update:focal-point="emit('update:focalPoint', $event)"
        />
      </section>

      <!-- Identity + Tags + stat block + lore — fieldset[disabled] for SRD -->
      <fieldset :disabled="isSrd" class="contents">
        <!-- Identity card (fixed enums → native selects per existing pattern) -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Identity</h3>
          <label class="block">
            <span class="field-label">Name</span>
            <input v-model="form.name" class="field-input w-full" placeholder="Monster name…" />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="field-label">Type</span>
              <select v-model="form.monster_type" class="field-input w-full capitalize">
                <option v-for="t in MONSTER_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">Size</span>
              <select v-model="form.size" class="field-input w-full capitalize">
                <option v-for="s in SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
              </select>
            </label>
          </div>
          <label class="block">
            <span class="field-label">Alignment</span>
            <select v-model="form.alignment" class="field-input w-full">
              <option v-for="a in ALIGNMENTS" :key="a" :value="a.toLowerCase()">{{ a }}</option>
            </select>
          </label>
          <label class="block">
            <span class="field-label">Source</span>
            <input v-model="form.source" class="field-input w-full" placeholder="Monster Manual" />
          </label>
          <label class="block">
            <span class="field-label">Habitat</span>
            <input v-model="form.habitat" class="field-input w-full" placeholder="Forest, underground…" />
          </label>
        </section>

        <!-- Tags card (TagInput when editable, read-only chips for SRD) -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Tags</h3>
          <TagInput v-if="!isSrd" v-model="form.tags" />
          <div v-else class="flex flex-wrap gap-1">
            <span
              v-for="tag in form.tags"
              :key="tag"
              class="inline-flex items-center rounded bg-muted px-2 py-0.5 font-cinzel text-2xs tracking-wider text-muted-foreground"
            >{{ tag }}</span>
          </div>
        </section>

        <!-- Stat Block card (monsters always have one — no include toggle) -->
        <section class="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Stat Block</h3>
          <StatBlockEditor :sb="sb" show-legendary show-lair />
        </section>

        <!-- Description card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">Description</h3>
          <RichTextEditor
            v-model="form.description"
            placeholder="Lore, habitat, behaviour, and flavour text…"
            min-height="160px"
          />
        </section>

        <!-- DM Notes card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="font-cinzel text-base font-bold text-foreground">DM Notes</h3>
          <RichTextEditor
            v-model="form.notes"
            placeholder="Encounter notes, tactics, lair description…"
            min-height="120px"
          />
        </section>
      </fieldset>
    </main>

    <!-- ── 3. Fixed bottom save bar (editable monsters only) ──────────────── -->
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
        :disabled="isSaving || !form.name.trim()"
        @click="emit('save')"
      >
        {{ isSaving ? "Saving…" : isNew ? "Create" : "Save Changes" }}
      </button>
    </footer>
  </div>

  <!-- Overflow ⋮ sheet (existing custom monsters) — secondary actions -->
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
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        :disabled="isDuplicating"
        @click="runAction('duplicate')"
      >
        <IconCopy class="size-4 shrink-0 text-muted-foreground" />
        {{ isDuplicating ? "Copying…" : "Duplicate" }}
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10"
        @click="runAction('delete')"
      >
        <IconDelete class="size-4 shrink-0" /> Delete monster
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import StatBlockEditor from "@/components/common/StatBlockEditor.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import { IconCopy, IconDelete, IconGenerate, IconScrollText } from "@/lib/icons";
import type { MonsterStatBlock, MonsterType, MonsterSize } from "@/types/monster.types";
import { buildEntityContext, toPlainText } from "@/ai/utils";

// The reactive shape MonsterDetail's `form` exposes. Structural (not the
// MonsterInsert payload) because the form holds "" rather than null for blanks.
interface MonsterEditForm {
  name: string;
  monster_type: MonsterType;
  size: MonsterSize;
  alignment: string;
  habitat: string;
  source: string;
  tags: string[];
  description: string;
  notes: string;
  image_url: string;
  portrait_focal_point: { x: number; y: number } | null;
}

const {
  form,
  monsterId = null,
  isSrd = false,
  isNew = false,
  isSaving = false,
  isCloning = false,
  isDuplicating = false,
  isSendingToScriptorium = false,
  isAiEnabled = false,
} = defineProps<{
  form: MonsterEditForm;
  sb: MonsterStatBlock;
  monsterId?: string | null;
  isSrd?: boolean;
  isNew?: boolean;
  isSaving?: boolean;
  isCloning?: boolean;
  isDuplicating?: boolean;
  isSendingToScriptorium?: boolean;
  isAiEnabled?: boolean;
}>();

const emit = defineEmits<{
  save: [];
  cancel: [];
  delete: [];
  generate: [];
  scriptorium: [];
  duplicate: [];
  customize: [];
  "update:imageUrl": [value: string];
  "update:focalPoint": [value: { x: number; y: number } | null];
}>();

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    `${form.size} ${form.monster_type}`,
    form.alignment,
    form.habitat,
    toPlainText(form.description),
  ]),
);

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
const MONSTER_TYPES: MonsterType[] = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
];
const SIZES: MonsterSize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

const showMenu = ref(false);

const title = computed(() => {
  if (isSrd) return form.name?.trim() || "Monster";
  if (isNew) return "New Monster";
  return form.name?.trim() || "Edit Monster";
});

function runAction(action: "generate" | "scriptorium" | "duplicate" | "delete") {
  showMenu.value = false;
  if (action === "generate") emit("generate");
  else if (action === "scriptorium") emit("scriptorium");
  else if (action === "duplicate") emit("duplicate");
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
