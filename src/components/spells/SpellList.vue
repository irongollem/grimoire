<template>
  <div>
    <div v-if="candidate" class="rounded-lg border border-tone-arcane/30 bg-tone-arcane/10 px-4 py-2 mb-3 text-body">
      Choose a replacement for <strong>{{ candidate.spell.name }}</strong>.
      <button type="button" class="ml-2 text-ink-arcane underline" @click="clearReplacement">Cancel</button>
    </div>
    <!-- Loading: a spell card is text-only (school bar, name + level badge,
         detail lines), the shape of the `text` skeleton. -->
    <ListSkeleton v-if="isLoading" variant="text" :count="12" />

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
          cannot be selected or re-scoped, same as their Edit button above.
        -->
        <BulkSelectableCard
          corner="top-right"
          :selected="selectedIds.has(spell.id)"
          :selecting="selecting && spell.is_own && !spell.is_shared"
          @toggle="emit('toggle-select', spell.id)"
        >
          <div
            class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
          >
            <!-- Card overlay: navigate in DM mode, open modal in player mode -->
            <button
              v-if="playerMemberId"
              class="absolute inset-0 z-2"
              @click="emit('spell-click', spell)"
            />
            <RouterLink
              v-else
              :to="`/spells/${spell.id}`"
              class="absolute inset-0 z-2"
              @pointerenter="prefetchSpell(spell.id)"
              @focus="prefetchSpell(spell.id)"
            />

            <!-- School colour bar -->
            <div
              class="h-1.5 w-full shrink-0"
              :class="SCHOOL_BG[spell.school]"
            />

            <div class="p-3 flex flex-col gap-2 flex-1">
              <!-- Name + level badge -->
              <div class="flex items-start justify-between gap-2">
                <h3
                  class="text-heading-xs font-bold text-foreground leading-tight flex-1 line-clamp-2"
                >
                  {{ spell.name }}
                </h3>
                <span
                  class="shrink-0 px-1.5 py-0.5 rounded text-label font-bold text-white whitespace-nowrap"
                  :class="SCHOOL_BG[spell.school]"
                >
                  {{ spell.level === 0 ? "C" : spell.level }}
                </span>
              </div>

              <!-- School + type line -->
              <p class="text-caption text-muted-foreground italic capitalize">
                {{ spellLevelLabel(spell.level) }} {{ spell.school }}
                <span v-if="spell.ritual"> · Ritual</span>
              </p>

              <!-- Cast time + range -->
              <div class="flex gap-3 text-label-lg text-muted-foreground">
                <span><span class="text-foreground font-bold">Cast</span> {{ spell.casting_time }}</span>
                <span><span class="text-foreground font-bold">Range</span> {{ spell.range }}</span>
              </div>

              <!-- Components -->
              <p class="text-label-lg text-muted-foreground">
                <span class="text-foreground font-bold">Components</span>
                {{ spell.components.join(", ") || "—" }}
                <span v-if="spell.concentration"> · <em class="text-primary">Conc.</em></span>
              </p>

              <!-- Classes -->
              <p
                v-if="spell.classes.length"
                class="text-caption text-muted-foreground truncate"
              >
                {{ spell.classes.join(", ") }}
              </p>

              <!-- Tags -->
              <div v-if="spell.tags.length" class="flex flex-wrap gap-1 mt-auto">
                <span
                  v-for="tag in spell.tags.slice(0, 3)"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground"
                >
                  {{ tag }}
                </span>
              </div>

              <!-- Source attribution -->
              <a
                v-if="spell.source_url"
                :href="spell.source_url"
                target="_blank"
                rel="noopener noreferrer"
                class="relative z-10 mt-auto text-caption-sm text-muted-foreground/60 hover:text-muted-foreground truncate transition-colors"
                @click.stop
              >
                {{ spell.source_title ?? spell.source ?? "Reference" }}
              </a>
              <span
                v-else-if="spell.source_title || spell.source"
                class="mt-auto text-caption-sm text-muted-foreground/60 truncate"
              >
                {{ spell.source_title ?? spell.source }}
              </span>
            </div>

            <!-- Edit button — DM mode only, not shown for SRD spell cards -->
            <AppButton
              v-if="!playerMemberId && spell.is_own && !spell.is_shared"
              :to="`/spells/${spell.id}?edit=true`"
              variant="ghost"
              size="xs"
              :icon="IconEdit"
              label="Edit"
              :class="[
                CARD_OVERLAY_SCRIM,
                'text-white hover:text-white absolute top-2 left-2 z-10 max-md:min-h-11 max-md:px-3',
                '[@media(hover:hover)]:opacity-0 transition-opacity group-hover:opacity-100',
              ]"
              tooltip="Edit spell"
            />

            <!-- Learn / Prepare button — player mode -->
            <template v-if="showLearnButton">
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
          </div>
        </BulkSelectableCard>
        </template>
      </VirtualGrid>

      <div ref="sentinelRef" />

      <p
        class="mt-4 text-caption text-muted-foreground italic text-right"
      >
        {{ total }} spells
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { IconAddBook, IconCheck, IconClose, IconEdit, IconNavSpellbook } from '@/lib/icons';
import { useQueryClient } from "@tanstack/vue-query";
import { fetchResolvedSpell, resolvedSpellKey } from "@/composables/spells/useSpells";
import { useSpellBrowse } from "@/composables/spells/useSpellBrowse";
import { useAddCharacterSpell, useChangePreparedSpell, useRemoveCharacterSpell } from "@/composables/party/useCharacterSpells";
import { useServerInfiniteScroll } from "@/composables/useServerInfiniteScroll";
import { SCHOOL_BG, spellLevelLabel } from "@/types/spell.types";
import type { CasterType, SpellBrowseRow } from "@/types/spell.types";
import VirtualGrid from "@/components/common/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import ListSkeleton from "@/components/common/ListSkeleton.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/appButtonVariants";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
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

// Row height before a row is measured (px): 164px measured at a 390px
// phone, 8 Oct 2026. It decides where a restored scroll lands, since coming
// back from a detail re-renders every unmeasured row above the viewport.
const GRID_ROW_PX = 164;

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
