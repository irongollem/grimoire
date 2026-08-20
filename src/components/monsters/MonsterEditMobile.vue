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
    onPortraitUrlUpdate / upsertLibraryArt), and the rest is disabled via
    fieldset[disabled], mirroring the desktop behaviour.
  -->
  <div class="flex min-h-dvh flex-col bg-background md:hidden">
    <!-- ── 1. App bar ─────────────────────────────────────────────────────── -->
    <header
      class="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur"
    >
      <AppButton
        variant="ghost"
        size="sm"
        label="Cancel"
        class="shrink-0"
        @click="emit('cancel')"
      />
      <h1 class="min-w-0 flex-1 truncate text-center text-heading-sm font-bold text-foreground">
        {{ title }}
      </h1>
      <AppButton
        v-if="!isNew && !isShared"
        variant="ghost"
        press="muted"
        shape="pill"
        size="icon-sm"
        aria-label="More actions"
        @click="showMenu = true"
      >
        <template #icon>
          <!-- vertical ellipsis -->
          <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </template>
      </AppButton>
      <span v-else class="size-8 shrink-0" aria-hidden="true" />
    </header>

    <!-- ── 2. Scroll body ─────────────────────────────────────────────────── -->
    <main class="flex-1 space-y-3 overflow-y-auto p-3 pb-28">
      <!-- Read-only SRD banner (Customize clones to an editable copy) -->
      <section
        v-if="isShared"
        class="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3"
      >
        <p class="text-body italic text-muted-foreground">
          Read-only reference.
        </p>
        <AppButton
          variant="primary"
          size="md"
          class="shrink-0"
          :icon="IconCopy"
          :label="isCloning ? 'Copying…' : 'Customize'"
          :disabled="isCloning"
          @click="emit('customize')"
        />
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
          :mini-source="monsterId ? { table: 'monsters', id: monsterId } : undefined"
          @update:model-value="emit('update:imageUrl', $event)"
          @update:focal-point="emit('update:focalPoint', $event)"
        />
      </section>

      <!-- Identity + Tags + stat block + lore — fieldset[disabled] for SRD -->
      <fieldset :disabled="isShared" class="contents">
        <!-- Identity card (fixed enums → native selects per existing pattern) -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="text-heading-sm font-bold text-foreground">Identity</h3>
          <label class="block">
            <span class="field-label">Name</span>
            <AppInput v-model="form.name" tone="muted" size="body" placeholder="Monster name…" />
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="field-label">Type</span>
              <AppSelect v-model="form.monster_type" tone="muted" size="body" weight="normal" block class="capitalize">
                <option v-for="t in MONSTER_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
              </AppSelect>
            </label>
            <label class="block">
              <span class="field-label">Size</span>
              <AppSelect v-model="form.size" tone="muted" size="body" weight="normal" block class="capitalize">
                <option v-for="s in SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
              </AppSelect>
            </label>
          </div>
          <label class="block">
            <span class="field-label">Alignment</span>
            <AppSelect v-model="form.alignment" tone="muted" size="body" weight="normal" block>
              <option v-for="a in ALIGNMENTS" :key="a" :value="a.toLowerCase()">{{ a }}</option>
            </AppSelect>
          </label>
          <label class="block">
            <span class="field-label">Source</span>
            <AppInput v-model="form.source" tone="muted" size="body" placeholder="Monster Manual" />
          </label>
          <CampaignScopeField v-model="form.campaign_id" />
          <label class="block">
            <span class="field-label">Habitat</span>
            <AppInput v-model="form.habitat" tone="muted" size="body" placeholder="Forest, underground…" />
          </label>
          <label class="block">
            <span class="field-label">Lair Location</span>
            <EntityCombobox
              :model-value="form.lair_location_id ?? ''"
              :options="locationOptions"
              placeholder="— none —"
              @update:model-value="form.lair_location_id = $event || null"
            >
              <template #option="{ opt }">
                <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
              </template>
            </EntityCombobox>
          </label>
        </section>

        <!-- Tags card (TagInput when editable, read-only chips for SRD) -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="text-heading-sm font-bold text-foreground">Tags</h3>
          <TagInput v-if="!isShared" v-model="form.tags" />
          <div v-else class="flex flex-wrap gap-1">
            <span
              v-for="tag in form.tags"
              :key="tag"
              class="inline-flex items-center rounded bg-muted px-2 py-0.5 text-label text-muted-foreground"
            >{{ tag }}</span>
          </div>
        </section>

        <!-- Stat Block card (monsters always have one — no include toggle) -->
        <section class="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 class="text-heading-sm font-bold text-foreground">Stat Block</h3>
          <StatBlockEditor :sb="sb" show-legendary show-lair />
        </section>

        <!-- Description card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="text-heading-sm font-bold text-foreground">Description</h3>
          <RichTextEditor
            v-model="form.description"
            placeholder="Lore, habitat, behaviour, and flavour text…"
            size="md"
          />
        </section>

        <!-- DM Notes card -->
        <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <h3 class="text-heading-sm font-bold text-foreground">DM Notes</h3>
          <RichTextEditor
            v-model="form.notes"
            placeholder="Encounter notes, tactics, lair description…"
            size="md"
          />
        </section>
      </fieldset>
    </main>

    <!-- ── 3. Fixed bottom save bar (editable monsters only) ──────────────── -->
    <footer
      v-if="!isShared"
      class="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-border bg-background/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
    >
      <AppButton
        variant="subtle"
        size="md"
        label="Cancel"
        class="shrink-0 basis-28"
        @click="emit('cancel')"
      />
      <AppButton
        variant="primary"
        size="md"
        class="flex-1"
        :label="isSaving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'"
        :disabled="isSaving || !form.name.trim()"
        @click="emit('save')"
      />
    </footer>
  </div>

  <!-- Overflow ⋮ sheet (existing custom monsters) — secondary actions -->
  <MobileSheet v-model:open="showMenu" title="Actions">
    <div class="flex flex-col gap-1 pb-2">
      <AppButton
        v-if="isAiEnabled"
        variant="menu"
        size="md"
        block
        class="gap-3"
        @click="runAction('generate')"
      >
        <template #icon><IconGenerate class="size-4 shrink-0 text-primary" /></template>
        Generate with AI
      </AppButton>
      <AppButton
        variant="menu"
        size="md"
        block
        class="gap-3"
        :disabled="isSendingToScriptorium"
        @click="runAction('scriptorium')"
      >
        <template #icon><IconScrollText class="size-4 shrink-0 text-muted-foreground" /></template>
        {{ isSendingToScriptorium ? "Exporting…" : "Send to Scriptorium" }}
      </AppButton>
      <AppButton
        variant="menu"
        size="md"
        block
        class="gap-3"
        :disabled="isDuplicating"
        @click="runAction('duplicate')"
      >
        <template #icon><IconCopy class="size-4 shrink-0 text-muted-foreground" /></template>
        {{ isDuplicating ? "Copying…" : "Duplicate" }}
      </AppButton>
      <AppButton
        variant="link"
        tone="danger"
        press="tone"
        size="body"
        block
        :icon="IconDelete"
        icon-size="md"
        label="Delete monster"
        class="justify-start"
        @click="runAction('delete')"
      />
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import StatBlockEditor from "@/components/common/StatBlockEditor.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import { useLocationTree } from "@/composables/useLocations";
import type { Location } from "@/types/location.types";
import { IconCopy, IconDelete, IconGenerate, IconScrollText } from "@/lib/icons";
import { MONSTER_SIZES as SIZES, MONSTER_TYPES } from "@/types/monster.types";
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
  lair_location_id: string | null;
  source: string;
  campaign_id: string | null;
  tags: string[];
  description: string;
  notes: string;
  image_url: string;
  portrait_focal_point: { x: number; y: number } | null;
}

const {
  form,
  monsterId = null,
  isShared = false,
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
  isShared?: boolean;
  isNew?: boolean;
  isSaving?: boolean;
  isCloning?: boolean;
  isDuplicating?: boolean;
  isSendingToScriptorium?: boolean;
  isAiEnabled?: boolean;
}>();

type LocationOption = Location & { depth: number };
const { locationOptions } = useLocationTree();

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

const showMenu = ref(false);

const title = computed(() => {
  if (isShared) return form.name?.trim() || "Monster";
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
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
