<template>
  <!-- ── Phase: Categories ─────────────────────────────────────────────────── -->
  <template v-if="phase === 'categories'">
    <div class="space-y-6">
      <div>
        <h3 class="text-heading-sm font-semibold text-foreground">{{ title }}</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          Select which entity types to include. You'll choose specific entities from each category
          in the next steps.
        </p>
      </div>

      <div class="rounded-md border border-border divide-y divide-border">
        <div v-for="group in typeGroups" :key="group.label">
          <p class="text-eyebrow font-semibold text-muted-foreground px-4 py-2 bg-muted/30">
            {{ group.label }}
          </p>
          <div class="px-4 py-3 space-y-2.5">
            <AppCheckbox
              v-for="type in group.types"
              :key="type.key"
              :model-value="selectedCategories.has(type.key)"
              :disabled="isLocked(type.key)"
              size="sm"
              class="gap-2.5 group"
              label-layout="row"
              @update:model-value="toggleCategory(type.key)"
            >
              <span
                class="transition-colors"
                :class="isLocked(type.key) ? 'text-muted-foreground' : 'text-foreground group-hover:text-primary'"
              >
                {{ type.label }}
              </span>
              <span v-if="isLocked(type.key)" class="text-label text-primary/60">
                required by Characters
              </span>
            </AppCheckbox>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2">
        <div><slot name="categories-actions" /></div>
        <AppButton
          variant="primary"
          size="md"
          label="Continue"
          :icon-right="IconChevronRight"
          :disabled="selectedCategories.size === 0"
          @click="goToFirstPick"
        />
      </div>
    </div>
  </template>

  <!-- ── Phase: Entity picker ──────────────────────────────────────────────── -->
  <template v-else-if="phase === 'pick'">
    <div class="space-y-6">
      <div class="flex items-center gap-3">
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronLeft"
          aria-label="Back"
          @click="goBack"
        />
        <div>
          <p class="text-eyebrow font-semibold text-muted-foreground">
            Step {{ pickIndex + 2 }} of {{ orderedCategories.length + 2 }}
          </p>
          <h3 class="text-heading-sm font-semibold text-foreground">
            {{ currentTypeDef?.label }}
          </h3>
        </div>
        <div class="ml-auto flex gap-1">
          <span
            v-for="(_, i) in orderedCategories"
            :key="i"
            class="h-1.5 w-5 rounded-full transition-colors"
            :class="i === pickIndex ? 'bg-primary' : i < pickIndex ? 'bg-primary/40' : 'bg-muted'"
          />
        </div>
      </div>

      <div class="relative">
        <IconSearch class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <AppInput
          v-model="search"
          tone="muted"
          size="body"
          placeholder="Search…"
          class="pl-8 pr-3"
        />
      </div>

      <div class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">
          <template v-if="pickerLoading">Loading…</template>
          <template v-else>
            {{ currentSelection.size }} of {{ pickerItems?.length ?? 0 }} selected
          </template>
        </span>
        <div class="flex gap-2">
          <AppButton variant="ghost" size="inline-xs" label="All" @click="onSelectAll" />
          <span class="text-border">·</span>
          <AppButton variant="ghost" size="inline-xs" label="None" @click="selectNone" />
        </div>
      </div>

      <div class="rounded-md border border-border overflow-hidden">
        <div v-if="pickerLoading" class="px-4 py-6 text-center">
          <p class="text-body text-muted-foreground italic">Loading…</p>
        </div>
        <div v-else-if="!filteredItems.length" class="px-4 py-6 text-center">
          <p class="text-body text-muted-foreground italic">
            {{ search ? "No results for your search." : "No entities found in this category." }}
          </p>
        </div>
        <div v-else class="max-h-72 overflow-y-auto divide-y divide-border">
          <AppCheckbox
            v-for="item in filteredItems"
            :key="item.id"
            :model-value="currentSelection.has(item.id)"
            size="sm"
            class="gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
            label-class="truncate"
            :label="item.label"
            @update:model-value="toggleEntity(item.id)"
          />
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <AppButton variant="subtle" size="md" label="Back" @click="goBack" />
        <AppButton
          variant="primary"
          size="md"
          :label="isLastPick ? finishLabel : 'Next'"
          :icon-right="IconChevronRight"
          @click="goNext"
        />
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
/**
 * The World Bundle wizard's first two steps (which entity types, then which
 * entities of each), shared by the World Bundle tab and Scriptorium's
 * "PDF with campaign data" dialog. The host creates the state with
 * `useBundleSelection`, so it can read the result and render the `details`
 * step itself.
 */
import { computed, ref, toRef, watch } from "vue";
import { IconChevronLeft, IconChevronRight, IconSearch } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { BUNDLE_ENTITY_TYPES, useEntityPickerItems } from "@/composables/campaign/useWorldBundle";
import type { BundleEntityKey } from "@/composables/campaign/useWorldBundle";
import type { BundleSelection } from "@/composables/campaign/useBundleSelection";

const {
  state,
  campaignId,
  title = "Create World Bundle",
  finishLabel = "Continue to Details",
} = defineProps<{
  /** Read once at setup: a host keeps one selection for the picker's lifetime. */
  state: BundleSelection;
  /** The campaign whose entities are offered. */
  campaignId: string | null;
  title?: string;
  /** Label of the last pick step's forward button. */
  finishLabel?: string;
}>();

const {
  phase, pickIndex, selectedCategories, orderedCategories, currentPickKey, currentSelection,
  isLastPick, isLocked, toggleCategory, toggleEntity, selectNone, pruneTo, goToFirstPick,
  goNext, goBack,
} = state;

const typeGroups = [
  { label: "Campaign Content", types: BUNDLE_ENTITY_TYPES.filter((t) => t.scope === "campaign") },
  { label: "Your Library", types: BUNDLE_ENTITY_TYPES.filter((t) => t.scope === "library") },
];

function typeDef(key: BundleEntityKey) {
  return BUNDLE_ENTITY_TYPES.find((t) => t.key === key);
}
const currentTypeDef = computed(() => (currentPickKey.value ? typeDef(currentPickKey.value) : null));

const { data: pickerItems, isLoading: pickerLoading } = useEntityPickerItems(
  currentPickKey,
  toRef(() => campaignId),
);

// A dialog-scoped search (CLAUDE.md "Sanctioned Exceptions"): a local ref, reset per category.
const search = ref("");
watch(currentPickKey, () => { search.value = ""; });

const filteredItems = computed(() => {
  const q = search.value.toLowerCase();
  const all = pickerItems.value ?? [];
  return q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all;
});

// A preselected id the picker does not offer is not campaign data: drop it.
watch([pickerItems, currentPickKey], ([items, key]) => {
  if (key && items) pruneTo(key, items.map((i) => i.id));
});

function onSelectAll() {
  state.selectAll((pickerItems.value ?? []).map((i) => i.id));
}
</script>
