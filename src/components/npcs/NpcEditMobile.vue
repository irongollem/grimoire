<template>
  <!--
    Mobile-only (<md) NPC edit screen. Rendered by NpcDetail when
    useMediaQuery("(max-width: 767px)") is true; the desktop grid form is shown
    otherwise (byte-identical to before).

    The reactive `form` / `statBlock` live in NpcDetail and are passed down here,
    so this layer owns layout + interaction only — never form state. Mutations
    are emitted back to NpcDetail's existing handlers.

    Layout top → bottom:
      1. sticky app bar (Cancel · title · overflow ⋮ sheet)
      2. stacked section cards (portrait / identity / stance / status / tags /
         lore accordion / relations / stat block)
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
      <!-- Portrait card (True Form / Alter Ego + upload, via EntityImageBlock) -->
      <section class="overflow-hidden rounded-xl border border-border bg-card">
        <EntityImageBlock
          v-if="artTab === 'true-form'"
          :model-value="form.portrait_url"
          :focal-point="form.portrait_focal_point"
          bucket="npc-portraits"
          show-focal-point
          :variants="ART_VARIANTS"
          :active-variant-id="artTab"
          ai-kind="npc_portrait"
          :ai-target-id="npc?.id"
          :ai-context="aiContext"
          :mini-source="npc?.id ? { table: 'npcs', id: npc.id } : undefined"
          @update:model-value="form.portrait_url = $event || null"
          @update:focal-point="form.portrait_focal_point = $event"
          @update:active-variant-id="emit('update:artTab', $event as ArtTab)"
        />
        <EntityImageBlock
          v-else
          :model-value="form.disguise_portrait_url"
          :focal-point="form.disguise_portrait_focal_point"
          bucket="npc-portraits"
          show-focal-point
          :variants="ART_VARIANTS"
          :active-variant-id="artTab"
          @update:model-value="form.disguise_portrait_url = $event || null"
          @update:focal-point="form.disguise_portrait_focal_point = $event"
          @update:active-variant-id="emit('update:artTab', $event as ArtTab)"
        />
      </section>

      <!-- Identity card -->
      <section class="rounded-xl border border-border bg-card p-4">
        <NpcIdentitySection
          :npc-id="npc?.id ?? null"
          :name="form.name"
          :disguise-name="form.disguise_name"
          :race="form.race"
          :alignment="form.alignment"
          :age="form.age"
          :occupation="form.occupation"
          :location-id="form.location_id"
          :location-options="locationOptions"
          @update:name="form.name = $event"
          @update:disguise-name="form.disguise_name = $event"
          @update:race="form.race = $event"
          @update:alignment="form.alignment = $event"
          @update:age="form.age = $event"
          @update:occupation="form.occupation = $event"
          @update:location-id="form.location_id = $event"
        />
      </section>

      <!-- Party Stance card (3-col colour-on-select chips via RelationshipWheel) -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Party Stance</h3>
        <RelationshipWheel
          :model-value="form.relationship"
          @update:model-value="form.relationship = $event"
        />
      </section>

      <!-- Status card (4-col chip grid) -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Status</h3>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="s in STATUS_OPTIONS"
            :key="s.value"
            type="button"
            class="rounded-md border py-2 text-label-lg font-semibold transition-colors"
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
      <NpcAccordionSection v-model:open="loreOpen" title="Lore">
        <NpcLoreTab
          :npc-name="form.name"
          :appearance="form.appearance"
          :personality="form.personality"
          :backstory="form.backstory"
          :notes="form.notes"
          @update:appearance="form.appearance = $event"
          @update:personality="form.personality = $event"
          @update:backstory="form.backstory = $event"
          @update:notes="form.notes = $event"
        />
      </NpcAccordionSection>

      <!-- Relations card (existing NPCs only) -->
      <section v-if="npc?.id" class="rounded-xl border border-border bg-card p-4">
        <NpcRelationsSection :npc-id="npc.id" />
      </section>

      <!-- Stat Block card -->
      <section class="space-y-3 rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-cinzel text-base font-bold text-foreground">Stat Block</h3>
          <label class="flex cursor-pointer items-center gap-2">
            <input
              :checked="hasStatBlock"
              type="checkbox"
              class="size-4 rounded border-border accent-primary"
              @change="emit('update:hasStatBlock', ($event.target as HTMLInputElement).checked)"
            />
            <span class="font-fell text-sm text-foreground">Include</span>
          </label>
        </div>

        <template v-if="hasStatBlock">
          <!-- Populate from template / Bestiary -->
          <div class="space-y-2">
            <div>
              <label class="field-label">From template</label>
              <select
                class="field-input"
                @change="emit('apply-template', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">— Custom / blank —</option>
                <optgroup v-for="cat in templateCategories" :key="cat" :label="cat">
                  <option v-for="t in templatesByCategory(cat)" :key="t.id" :value="t.id">
                    {{ t.name }} (CR {{ t.stat_block.challenge_rating }})
                  </option>
                </optgroup>
              </select>
            </div>
            <div>
              <label class="field-label">From bestiary</label>
              <EntityCombobox
                :model-value="form.linked_monster_id ?? ''"
                :options="allMonsters"
                placeholder="Search monsters…"
                @update:model-value="emit('link-monster', $event || null)"
              />
              <RouterLink
                v-if="form.linked_monster_id"
                :to="`/monsters/${form.linked_monster_id}`"
                class="mt-1 inline-block font-fell text-xs text-primary hover:underline"
              >
                View in Bestiary →
              </RouterLink>
            </div>
          </div>

          <div class="gold-divider" />

          <StatBlockEditor :sb="statBlock" show-legendary show-lair />
        </template>
      </section>
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
        {{ isSaving ? "Saving…" : isNew ? "Create" : "Save Changes" }}
      </button>
    </footer>
  </div>

  <!-- Overflow ⋮ sheet (existing NPCs) — secondary actions -->
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
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10"
        @click="runAction('delete')"
      >
        <IconDelete class="size-4 shrink-0" /> Delete NPC
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import type { Npc, NpcInsert, NpcStatus, StatBlock } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { Location } from "@/types/location.types";
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES } from "@/data/npcTemplates";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TagInput from "@/components/common/TagInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import StatBlockEditor from "@/components/common/StatBlockEditor.vue";
import NpcIdentitySection from "./NpcIdentitySection.vue";
import RelationshipWheel from "./RelationshipWheel.vue";
import NpcLoreTab from "./NpcLoreTab.vue";
import NpcRelationsSection from "./NpcRelationsSection.vue";
import NpcAccordionSection from "./NpcAccordionSection.vue";
import { IconDelete, IconGenerate, IconScrollText } from "@/lib/icons";

type ArtTab = "true-form" | "alter-ego";

// Matches NpcIdentitySection's expected shape and useLocationTree's output.
type LocationOption = Location & { depth: number };

const {
  form,
  statBlock,
  hasStatBlock,
  artTab,
  locationOptions,
  allMonsters = [],
  npc = null,
  isNew = false,
  isSaving = false,
  isSendingToScriptorium = false,
  isAiEnabled = false,
} = defineProps<{
  form: NpcInsert;
  statBlock: StatBlock;
  hasStatBlock: boolean;
  artTab: ArtTab;
  locationOptions: LocationOption[];
  allMonsters?: Monster[];
  npc?: Npc | null;
  isNew?: boolean;
  isSaving?: boolean;
  isSendingToScriptorium?: boolean;
  isAiEnabled?: boolean;
}>();

const emit = defineEmits<{
  save: [];
  cancel: [];
  delete: [];
  generate: [];
  scriptorium: [];
  "update:hasStatBlock": [value: boolean];
  "update:artTab": [value: ArtTab];
  "apply-template": [id: string];
  "link-monster": [id: string | null];
}>();

const ART_VARIANTS = [
  { id: "true-form", label: "True Form" },
  { id: "alter-ego", label: "Alter Ego" },
] as const;

const STATUS_OPTIONS: { value: NpcStatus; label: string; color: string }[] = [
  { value: "alive", label: "Alive", color: "#22c55e" },
  { value: "dead", label: "Dead", color: "#ef4444" },
  { value: "missing", label: "Missing", color: "#f59e0b" },
  { value: "unknown", label: "?", color: "#6b7280" },
];

const showMenu = ref(false);
const loreOpen = ref(true);

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    [form.race, form.occupation].filter(Boolean).join(", "),
    toPlainText(form.appearance),
    toPlainText(form.personality),
  ]),
);

const title = computed(() => {
  if (isNew) return "New NPC";
  return form.name?.trim() || "Edit NPC";
});

const templateCategories = computed(() => NPC_TEMPLATE_CATEGORIES);
function templatesByCategory(cat: string) {
  return NPC_TEMPLATES.filter((t) => t.category === cat);
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
