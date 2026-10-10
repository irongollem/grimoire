<template>
  <div>
    <div v-if="candidate" class="rounded-lg border border-tone-arcane/30 bg-tone-arcane/10 px-4 py-2 mb-3 text-body">
      Choose a replacement for <strong>{{ candidate.spell.name }}</strong>.
      <button type="button" class="ml-2 text-ink-arcane underline" @click="clearReplacement">Cancel</button>
    </div>
    <!-- Loading: the same shape the real cards will land in. -->
    <ListSkeleton
      v-if="isLoading"
      :variant="mobileLayout ? layout : 'grid'"
      :count="mobileLayout ? 7 : 12"
    />

    <EmptyState
      v-else-if="!rows.length && !search && !levelFilter && !schoolFilter && !classFilter && sourceFilter === 'all'"
      title="No spells yet"
      description="Craft your spellbook: cantrips to 9th-level catastrophes."
    >
      <template #icon><IconNavSpellbook class="h-16 w-16" /></template>
      <template v-if="!playerMemberId" #action>
        <RouterLink
          to="/spells/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-heading-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Add your first spell
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!rows.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No spells match your filters.
    </p>

    <!-- ── Phone (<md): compact rows / gallery, as the bestiary does ────── -->
    <template v-else-if="mobileLayout">
      <MobileEntityMetaRow v-model:layout="layout" :shown="rows.length" :total="total" plural="spells" />
      <EntityMobileGrid :items="rows" :item-key="spellKey" :layout="layout">
        <template #default="{ item: spell }">
          <BulkSelectableCard
            corner="bottom-right"
            :selected="selectedIds.has(spell.id)"
            :selecting="selecting && spell.is_own && !spell.is_shared"
            @toggle="emit('toggle-select', spell.id)"
          >
            <EntityMobileCard
              :layout="layout"
              :to="`/spells/${spell.id}`"
              :title="spell.name"
              :subtitle="mobileSubtitle(spell)"
              :image-url="spell.image_url"
              :focal-point="spell.image_focal_point"
              :placeholder="placeholderUrl('spell')"
              :badge-text="spellLevelOrdinal(spell.level)"
              :badge-class="SCHOOL_BG[spell.school]"
              @pointerenter="prefetchSpell(spell.id)"
              @focusin="prefetchSpell(spell.id)"
            />
          </BulkSelectableCard>
        </template>
      </EntityMobileGrid>
    </template>

    <!-- ── Desktop grid (≥md), and the player portal at every width ──────── -->
    <template v-else>
      <VirtualGrid
        :items="rows"
        :item-key="spellKey"
        :columns="columns"
        :estimate-row-height="GRID_ROW_PX"
      >
        <template #default="{ item: spell }">
          <!--
            Wrapped in BulkSelectableCard (#875) for every card — but `selecting`
            is only ever true for a row the DM can actually re-scope; shared/
            library spells (`isSharedContent`) always get `selecting: false`
            regardless of the list-wide mode, so they render untouched and
            cannot be selected or re-scoped, same as their Edit button.
          -->
          <BulkSelectableCard
            corner="top-right"
            :selected="selectedIds.has(spell.id)"
            :selecting="selecting && spell.is_own && !spell.is_shared"
            @toggle="emit('toggle-select', spell.id)"
          >
            <!-- DM mode navigates to the spell; the player portal opens its own modal. -->
            <SpellGridCard
              :spell="spell"
              :activates="!!playerMemberId"
              :can-edit="!playerMemberId && spell.is_own && !spell.is_shared"
              @activate="emit('spell-click', spell)"
              @pointerenter="prefetchSpell(spell.id)"
              @focusin="prefetchSpell(spell.id)"
            >
              <template v-if="showLearnButton" #overlay>
                <AppButton
                  v-if="!isKnown(spell.id)"
                  variant="ghost"
                  size="xs"
                  :icon="IconAddBook"
                  :label="learnLabel(spell.level === 0)"
                  :disabled="isAdding || isChanging"
                  :class="[
                    'absolute bottom-2 right-2 z-10 text-white hover:text-white bg-primary/80 hover:bg-primary max-md:min-h-11 max-md:px-3',
                    '[@media(hover:hover)]:opacity-0 transition-opacity group-hover:opacity-100',
                  ]"
                  @click.prevent.stop="handleLearn(spell)"
                />
                <AppButton
                  v-else
                  variant="ghost"
                  size="xs"
                  :icon="isRemoving ? IconClose : IconCheck"
                  :label="learnedLabel(spell.level === 0)"
                  :disabled="isRemoving"
                  :tooltip="casterType === 'prepared' ? 'Unprepare' : 'Remove from spellbook'"
                  :class="[
                    CARD_OVERLAY_SCRIM,
                    isRemoving ? 'text-muted-foreground hover:text-muted-foreground' : 'text-ink-success hover:text-destructive',
                    'absolute bottom-2 right-2 z-10 max-md:min-h-11 max-md:px-3',
                    '[@media(hover:hover)]:opacity-0 transition-opacity group-hover:opacity-100',
                  ]"
                  @click.prevent.stop="handleKnownClick(spell)"
                />
              </template>
            </SpellGridCard>
          </BulkSelectableCard>
        </template>
      </VirtualGrid>

      <p class="mt-4 text-caption text-muted-foreground italic text-right">
        {{ total }} spells
      </p>
    </template>

    <div ref="sentinelRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { IconAddBook, IconCheck, IconClose, IconNavSpellbook } from '@/lib/icons';
import { useQueryClient } from "@tanstack/vue-query";
import { fetchResolvedSpell, resolvedSpellKey } from "@/composables/spells/useSpells";
import { useSpellBrowse } from "@/composables/spells/useSpellBrowse";
import { useAddCharacterSpell, useChangePreparedSpell, useRemoveCharacterSpell } from "@/composables/party/useCharacterSpells";
import { useServerInfiniteScroll } from "@/composables/useServerInfiniteScroll";
import { SCHOOL_BG, spellLevelOrdinal } from "@/types/spell.types";
import type { CasterType, SpellBrowseRow } from "@/types/spell.types";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/appButtonVariants";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import EntityMobileCard from "@/components/common/EntityMobileCard.vue";
import EntityMobileGrid from "@/components/common/EntityMobileGrid.vue";
import MobileEntityMetaRow from "@/components/common/MobileEntityMetaRow.vue";
import SpellGridCard from "@/components/spells/SpellGridCard.vue";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useAppUiStore } from "@/stores/ui/app";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useSpellReplacement } from "@/composables/party/useSpellReplacement";
import { useRuleset } from "@/composables/rules/useRuleset";
import { getSpellPreparationPolicy, policyValueAtLevel } from "@/rules/spellPreparationPolicy";
import { useToast } from "@/composables/useToast";

const {
  search,
  levelFilter,
  schoolFilter,
  classFilter,
  sourceFilter,
  extraIds,
  playerMemberId,
  casterType,
  knownSpellIds,
  preparedSpellIds,
  sourceClassId,
  sourceClassLevel,
  knownCantripCount,
  preparedSpellCount,
  officialRulesPolicy,
  selecting = false,
  selectedIds = new Set<string>(),
} = defineProps<{
  search: string;
  levelFilter: string;
  schoolFilter: string;
  classFilter: string;
  sourceFilter: string;
  /** Spells the class filter also admits: the chosen class's subclass's expanded list. */
  extraIds?: readonly string[];
  /** Set when rendering inside the player portal — hides Edit, shows Learn/Remove button. */
  playerMemberId?: string;
  /** Caster archetype — controls button label and whether to show the button at all. */
  casterType?: CasterType;
  /** Spell IDs already in this character's spellbook (drives button state). */
  knownSpellIds?: string[];
  /** Spell IDs currently prepared (subset of knownSpellIds, for prepared casters). */
  preparedSpellIds?: string[];
  /** character_classes row for the class selected in the player browse filter. */
  sourceClassId?: string | null;
  sourceClassLevel?: number;
  knownCantripCount?: number;
  preparedSpellCount?: number;
  /** The parent resolved this class row to an official edition policy. */
  officialRulesPolicy?: boolean;
  /** Bulk-selection mode is on (#875). Shared/library spells (isSharedContent)
   *  never enter selection mode regardless of this flag — see the template. */
  selecting?: boolean;
  selectedIds?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  (e: "spell-click", spell: SpellBrowseRow): void;
  (e: "toggle-select", id: string): void;
}>();

const { mutateAsync: addSpell, isPending: isAdding } = useAddCharacterSpell();
const { mutate: removeSpell, isPending: isRemoving } = useRemoveCharacterSpell();
const { mutateAsync: changePreparedSpell, isPending: isChanging } = useChangePreparedSpell();
const { candidate, clear: clearReplacement } = useSpellReplacement();
const { ruleset } = useRuleset();
const toast = useToast();

/** Add a spell, surfacing a rejected write (e.g. "Cleric spell limit of 10 reached") as a toast. */
async function learnSpell(spellId: string, isPrepared: boolean) {
  if (!playerMemberId || !sourceClassId) return;
  try {
    await addSpell({ partyMemberId: playerMemberId, spellId, isPrepared, sourceClassId });
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't add that spell."));
  }
}

async function handleLearn(spell: Pick<SpellBrowseRow, "id" | "level">) {
  if (!playerMemberId || !sourceClassId) return;
  const policy = officialRulesPolicy
    ? getSpellPreparationPolicy(classFilter, ruleset.value)
    : null;
  if (policy && policy.casterType !== "spellbook") {
    if (spell.level === 0) {
      const limit = policyValueAtLevel(policy.cantrips, sourceClassLevel ?? 1);
      if (limit !== null && (knownCantripCount ?? 0) < limit) {
        await learnSpell(spell.id, true);
        return;
      }
      toast.info("Your revised cantrip choices are full; change them during level up.");
      return;
    }
    if (candidate.value && candidate.value.source_class_id !== sourceClassId) {
      toast.error("The replacement spell must use the same source class.");
      return;
    }
    if (!candidate.value && policy.changeCount !== null) {
      const limit = policyValueAtLevel(policy.prepared, sourceClassLevel ?? 1);
      if (limit !== null && (preparedSpellCount ?? 0) < limit) {
        await learnSpell(spell.id, true);
        return;
      }
      toast.info("Choose the prepared spell to replace first.");
      return;
    }
    try {
      await changePreparedSpell({
        partyMemberId: playerMemberId,
        sourceClassId: sourceClassId,
        newSpellId: spell.id,
        oldCharacterSpellId: candidate.value?.id ?? null,
      });
      clearReplacement();
    } catch (error) {
      toast.error(toast.fromError(error));
    }
    return;
  }
  await learnSpell(spell.id, casterType === "prepared");
}

function handleKnownClick(spell: Pick<SpellBrowseRow, "id">) {
  if (!playerMemberId) return;
  const policy = officialRulesPolicy
    ? getSpellPreparationPolicy(classFilter, ruleset.value)
    : null;
  if (policy) {
    toast.info(policy.casterType === "spellbook"
      ? "Change prepared Wizard spells from your Prepared tab after a long rest."
      : "Choose the spell to replace from your prepared list.");
    return;
  }
  removeSpell({ partyMemberId: playerMemberId, spellId: spell.id, sourceClassId: sourceClassId });
}

const showLearnButton = computed(() => !!playerMemberId && casterType !== "none");

function learnLabel(isCantrip: boolean) {
  if (casterType === "prepared") return "Prepare";
  if (isCantrip) return "Learn";
  return casterType === "spellbook" ? "Add" : "Learn";
}

function learnedLabel(isCantrip: boolean) {
  if (casterType === "prepared") return "Prepared";
  if (isCantrip) return "Known";
  return casterType === "spellbook" ? "Added" : "Learned";
}

function isKnown(spellId: string): boolean {
  if (casterType === "prepared") return preparedSpellIds?.includes(spellId) ?? false;
  return knownSpellIds?.includes(spellId) ?? false;
}

// Mirrors the grid classes this list used to carry:
// `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
const columns = useBreakpointColumns({ base: 1, sm: 2, lg: 3, xl: 4 });
const spellKey = (spell: SpellBrowseRow) => spell.id;

// Desktop row height before a row is measured (px; 277 measured, 9 Oct 2026); the phone layouts' live in
// EntityMobileGrid. On desktop the sheet opens over a list that stays mounted,
// so nothing has to be restored and the estimate matters little.
const GRID_ROW_PX = 277;

// The DM's phone gets the bestiary's rows/gallery. The player portal keeps the
// grid at every width: its cards carry Learn / Prepare controls the compact
// rows have no room for.
const isMobile = useIsMobile();
const mobileLayout = computed(() => isMobile.value && !playerMemberId);
const appUi = useAppUiStore();
const layout = computed({
  get: () => appUi.entityListLayout,
  set: (v: "rows" | "gallery") => { appUi.entityListLayout = v; },
});

function mobileSubtitle(spell: SpellBrowseRow): string {
  const school = spell.school.charAt(0).toUpperCase() + spell.school.slice(1);
  return `${school}${spell.ritual ? " · Ritual" : ""}`;
}

const {
  rows, total, selectableIds, ready, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading, error,
} = useSpellBrowse(() => ({
  search,
  level: levelFilter,
  school: schoolFilter,
  class: classFilter,
  source: sourceFilter,
  extraIds,
}));

watch(error, (e) => {
  if (e) toast.error(toast.fromError(e));
});

/**
 * Ids selectable for a bulk campaign-scope move: every own, non-shared spell
 * matching the filters, across all pages (the server decides). `selectableReady`
 * is false while page 1 of the current filters loads, so the parent does not
 * prune a selection down to an empty placeholder.
 */
defineExpose({ selectableIds, selectableReady: ready });

// Hover/focus on a card warms the detail page's read.
const queryClient = useQueryClient();
function prefetchSpell(id: string) {
  void queryClient.prefetchQuery({
    queryKey: resolvedSpellKey(id),
    queryFn: () => fetchResolvedSpell(id),
  });
}

// The sentinel asks for the next server page; scroll depth is restored on return
// from a detail.
const { sentinelRef } = useServerInfiniteScroll({
  scrollKey: "spells",
  loadedCount: () => rows.value.length,
  ready, hasNextPage, isFetchingNextPage, fetchNextPage,
});
</script>
