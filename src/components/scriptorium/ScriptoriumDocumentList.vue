<template>
  <div>
    <!-- Filters bar -->
    <ListFilterBar
      class="mb-5"
      :has-active-filters="ui.scriptoriumHasActiveFilters"
      @clear="ui.resetScriptoriumFilters()"
    >
      <ListSearchInput v-model="ui.scriptoriumSearch" placeholder="Search documents…" />
      <!--
        Ten doc types is past what a segmented group can hold: joined segments
        do not wrap, so at md widths the tail gets clipped. Same call the
        Bestiary makes for its 14 creature types — a native select lists them
        compactly and opens the OS picker on touch.
      -->
      <ListFilterSelect v-model="typeFilter" aria-label="Document type filter">
        <option v-for="t in TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
      </ListFilterSelect>
    </ListFilterBar>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !ui.scriptoriumHasActiveFilters"
      title="The scriptorium awaits"
      description="Craft monsters, spells, items, and adventure documents with the look of the official books."
    >
      <template #icon><IconNavScriptorium class="h-16 w-16" /></template>
      <template #action>
        <AppButton variant="primary" size="lg" label="Create your first document" @click="handleNew" />
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No documents match your filters.
    </p>

    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
    >
      <div
        v-for="doc in filtered"
        :key="doc.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay (disabled for locked items) -->
        <RouterLink v-if="!lockedDocIds.has(doc.id)" :to="`/scriptorium/${doc.id}`" class="absolute inset-0 z-2" />

        <!-- Locked overlay for over-quota items -->
        <div
          v-if="lockedDocIds.has(doc.id)"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
        >
          <IconLock class="h-4 w-4 text-muted-foreground" />
          <p class="text-label font-semibold text-muted-foreground">Locked</p>
          <RouterLink to="/billing" class="text-label text-primary/80 hover:text-primary transition-colors">
            Upgrade to access
          </RouterLink>
        </div>

        <!-- Type colour bar -->
        <div
          class="h-1 w-full shrink-0"
          :class="DOC_TYPE_BG[doc.doc_type]"
        />

        <div class="p-4 flex flex-col gap-2 flex-1">
          <!-- Header row -->
          <div class="flex items-start justify-between gap-2">
            <h3
              class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1"
            >
              {{ doc.title }}
            </h3>
            <span
              class="shrink-0 px-1.5 py-0.5 rounded text-eyebrow font-bold"
              :style="{
                backgroundColor: `color-mix(in oklab, ${DOC_TYPE_VAR[doc.doc_type]} 13%, transparent)`,
                color: DOC_TYPE_VAR[doc.doc_type],
              }"
            >
              {{ DOC_TYPE_LABELS[doc.doc_type] }}
            </span>
          </div>

          <!-- Tags -->
          <div v-if="doc.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in doc.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
            >
              {{ tag }}
            </span>
            <span
              v-if="doc.tags.length > 3"
              class="text-caption-sm text-muted-foreground italic self-center"
            >
              +{{ doc.tags.length - 3 }}
            </span>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between mt-auto pt-1">
            <span class="text-caption text-muted-foreground italic">
              {{ doc.word_count }} words
            </span>
            <span class="text-caption text-muted-foreground">
              {{ formatDate(doc.updated_at) }}
            </span>
          </div>

          <!-- Published badge -->
          <div v-if="doc.is_published" class="flex items-center gap-1">
            <IconFaction class="h-3 w-3 text-green-500" />
            <span
              class="text-label text-green-500 font-semibold"
              >Published</span
            >
          </div>
        </div>

        <button
          type="button"
          class="absolute top-2 right-2 z-10 w-6 h-6 rounded flex items-center justify-center bg-card/80 border border-border text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-all"
          title="Delete document"
          @click.prevent="confirmDelete(doc.id, doc.title)"
        >
          <IconDelete class="h-3 w-3" />
        </button>
      </div>
    </div>

    <p
      v-if="filtered.length"
      class="mt-4 text-caption text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ docs?.length ?? 0 }} documents
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconDelete, IconFaction, IconLock, IconNavScriptorium } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import {
  useScriptoriumDocuments,
  useDeleteScriptoriumDocument,
} from "@/composables/scriptorium/useScriptorium";
import { useUiStore } from "@/stores/ui";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/billing/useQuota";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";

const router = useRouter();
const { canCreate, quota: docQuota } = useQuota("scriptorium_documents");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/scriptorium/new");
}

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "spell", label: "Spell" },
  { value: "monster", label: "Monster" },
  { value: "item", label: "Item" },
  { value: "class", label: "Class" },
  { value: "background", label: "Background" },
  { value: "adventure", label: "Adventure" },
  { value: "npc-sheet", label: "NPC Sheet" },
  { value: "location", label: "Location" },
] as const satisfies readonly { value: ScriptoriumDocType | "all"; label: string }[];

const DOC_TYPE_LABELS: Record<ScriptoriumDocType, string> = {
  custom: "Custom",
  spell: "Spell",
  monster: "Monster",
  item: "Item",
  class: "Class",
  subclass: "Subclass",
  race: "Species",
  background: "Background",
  adventure: "Adventure",
  "npc-sheet": "NPC Sheet",
  location: "Location",
  quest: "Quest",
};

const DOC_TYPE_BG: Record<ScriptoriumDocType, string> = {
  custom:        "bg-doctype-custom",
  spell:         "bg-doctype-spell",
  monster:       "bg-doctype-monster",
  item:          "bg-doctype-item",
  class:         "bg-doctype-class",
  subclass:      "bg-doctype-subclass",
  race:          "bg-doctype-race",
  background:    "bg-doctype-background",
  adventure:     "bg-doctype-adventure",
  "npc-sheet":   "bg-doctype-npc-sheet",
  location:      "bg-doctype-location",
  quest:         "bg-doctype-quest",
};


/** The same ramp as `var()` values, for borders, gradients and canvas — places
 *  a utility class cannot reach. Tint with `color-mix`, never by appending a
 *  hex alpha: that only ever worked on a hex literal. */
const DOC_TYPE_VAR: Record<ScriptoriumDocType, string> = {
  custom:        "var(--doctype-custom)",
  spell:         "var(--doctype-spell)",
  monster:       "var(--doctype-monster)",
  item:          "var(--doctype-item)",
  class:         "var(--doctype-class)",
  subclass:      "var(--doctype-subclass)",
  race:          "var(--doctype-race)",
  background:    "var(--doctype-background)",
  adventure:     "var(--doctype-adventure)",
  "npc-sheet":   "var(--doctype-npc-sheet)",
  location:      "var(--doctype-location)",
  quest:         "var(--doctype-quest)",
};

// Filter State Pattern — search + type survive opening a document and coming back.
const ui = useUiStore();

// ListFilterSelect models a plain string; the store keeps the narrower union.
const typeFilter = computed({
  get: () => ui.scriptoriumFilterType as string,
  set: (v) => { ui.scriptoriumFilterType = v as ScriptoriumDocType | "all"; },
});

const { data: docs, isLoading } = useScriptoriumDocuments();
const { mutateAsync: deleteDoc } = useDeleteScriptoriumDocument();

const lockedDocIds = computed((): Set<string> => {
  const q = docQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(docs.value ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((d) => d.id));
});

async function confirmDelete(id: string, title: string) {
  if (!(await confirm(`Delete "${title}"? This cannot be undone.`))) return;
  await deleteDoc(id);
}

const filtered = computed(() => {
  let list = docs.value ?? [];
  if (ui.scriptoriumSearch.trim()) {
    const q = ui.scriptoriumSearch.trim().toLowerCase();
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (ui.scriptoriumFilterType !== "all")
    list = list.filter((d) => d.doc_type === ui.scriptoriumFilterType);
  return list;
});


function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}
</script>
