<template>
  <div>
    <div v-if="candidate" class="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 mb-3 text-body">
      Choose a replacement for <strong>{{ candidate.spell.name }}</strong>.
      <button type="button" class="ml-2 text-violet-400 underline" @click="clearReplacement">Cancel</button>
    </div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !props.search && !props.levelFilter && !props.schoolFilter && !props.classFilter"
      title="No spells yet"
      description="Craft your spellbook — cantrips to 9th-level catastrophes."
    >
      <template #icon><IconNavSpellbook class="h-16 w-16" /></template>
      <template v-if="!props.playerMemberId" #action>
        <RouterLink
          to="/spells/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first spell
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No spells match your filters.
    </p>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <div
          v-for="spell in visibleItems"
          :key="spell.id"
          class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
        >
          <!-- Card overlay: navigate in DM mode, open modal in player mode -->
          <button
            v-if="props.playerMemberId"
            class="absolute inset-0 z-2"
            @click="emit('spell-click', spell)"
          />
          <RouterLink v-else :to="`/spells/${spell.id}`" class="absolute inset-0 z-2" />

          <!-- School colour bar -->
          <div
            class="h-1.5 w-full shrink-0"
            :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }"
          />

          <div class="p-3 flex flex-col gap-2 flex-1">
            <!-- Name + level badge -->
            <div class="flex items-start justify-between gap-2">
              <h3
                class="font-cinzel text-sm font-bold text-foreground leading-tight flex-1 line-clamp-2"
              >
                {{ spell.name }}
              </h3>
              <span
                class="shrink-0 px-1.5 py-0.5 rounded text-label font-bold text-white whitespace-nowrap"
                :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }"
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
            <div class="flex gap-3 font-cinzel text-xs text-muted-foreground">
              <span><span class="text-foreground font-bold">Cast</span> {{ spell.casting_time }}</span>
              <span><span class="text-foreground font-bold">Range</span> {{ spell.range }}</span>
            </div>

            <!-- Components -->
            <p class="font-cinzel text-xs text-muted-foreground">
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
              class="relative z-10 mt-auto font-cinzel text-2xs text-muted-foreground/60 hover:text-muted-foreground truncate transition-colors"
              @click.stop
            >
              {{ spell.source_title ?? spell.source ?? "Reference" }}
            </a>
            <span
              v-else-if="spell.source_title || spell.source"
              class="mt-auto font-cinzel text-2xs text-muted-foreground/60 truncate"
            >
              {{ spell.source_title ?? spell.source }}
            </span>
          </div>

          <!-- Edit button — DM mode only, not shown for SRD spell cards -->
          <RouterLink
            v-if="!props.playerMemberId && !isSharedContent(spell)"
            :to="`/spells/${spell.id}?edit=true`"
            class="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 text-label font-semibold text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit spell"
          >
            <IconEdit class="max-md:h-4 max-md:w-4 h-3 w-3" />
            Edit
          </RouterLink>

          <!-- Learn / Prepare button — player mode -->
          <template v-if="showLearnButton">
            <button
              v-if="!isKnown(spell.id)"
              class="absolute bottom-2 right-2 z-10 flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 text-label font-semibold text-white bg-primary/80 hover:bg-primary [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40 cursor-pointer"
              :disabled="isAdding || isChanging"
              @click.prevent.stop="handleLearn(spell)"
            >
              <IconAddBook class="max-md:h-4 max-md:w-4 h-3 w-3" />
              {{ learnLabel(spell.level === 0) }}
            </button>
            <button
              v-else
              class="absolute bottom-2 right-2 z-10 flex items-center justify-center gap-1 rounded max-md:min-h-11 max-md:px-3 max-md:py-2 px-2 py-1 text-label font-semibold bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40 cursor-pointer"
              :class="isRemoving ? 'text-muted-foreground' : 'text-emerald-400 hover:text-red-400'"
              :disabled="isRemoving"
              :title="props.casterType === 'prepared' ? 'Unprepare' : 'Remove from spellbook'"
              @click.prevent.stop="handleKnownClick(spell)"
            >
              <IconCheck v-if="!isRemoving" class="max-md:h-4 max-md:w-4 h-3 w-3" />
              <IconClose v-else class="max-md:h-4 max-md:w-4 h-3 w-3" />
              {{ learnedLabel(spell.level === 0) }}
            </button>
          </template>
        </div>
      </div>

      <div ref="sentinelRef" />

      <p
        v-if="filtered.length"
        class="mt-4 text-caption text-muted-foreground italic text-right"
      >
        {{ filtered.length }} spells
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAddBook, IconCheck, IconClose, IconEdit, IconNavSpellbook } from '@/lib/icons';
import { refDebounced } from "@vueuse/core";
import { useAllSpells } from "@/composables/useSpells";
import { useAddCharacterSpell, useChangePreparedSpell, useRemoveCharacterSpell } from "@/composables/useCharacterSpells";
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useScrollRestore } from "@/composables/useScrollRestore";
import { SCHOOL_COLORS, spellLevelLabel } from "@/types/spell.types";
import type { CasterType, Spell } from "@/types/spell.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { isSharedContent } from "@/lib/library/contentIdentity";
import { useSpellReplacement } from "@/composables/useSpellReplacement";
import { useRuleset } from "@/composables/useRuleset";
import { getSpellPreparationPolicy, policyValueAtLevel } from "@/rules/spellPreparationPolicy";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  search: string;
  levelFilter: string;
  schoolFilter: string;
  classFilter: string;
  sourceFilter: string;
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
}>();

const emit = defineEmits<{
  (e: "spell-click", spell: Spell): void;
}>();

const { mutateAsync: addSpell, isPending: isAdding } = useAddCharacterSpell();
const { mutate: removeSpell, isPending: isRemoving } = useRemoveCharacterSpell();
const { mutateAsync: changePreparedSpell, isPending: isChanging } = useChangePreparedSpell();
const { candidate, clear: clearReplacement } = useSpellReplacement();
const { ruleset } = useRuleset();
const toast = useToast();

async function handleLearn(spell: Spell) {
  if (!props.playerMemberId || !props.sourceClassId) return;
  const policy = props.officialRulesPolicy
    ? getSpellPreparationPolicy(props.classFilter, ruleset.value)
    : null;
  if (policy && policy.casterType !== "spellbook") {
    if (spell.level === 0) {
      const limit = policyValueAtLevel(policy.cantrips, props.sourceClassLevel ?? 1);
      if (limit !== null && (props.knownCantripCount ?? 0) < limit) {
        await addSpell({
          partyMemberId: props.playerMemberId,
          spellId: spell.id,
          isPrepared: true,
          sourceClassId: props.sourceClassId,
        });
        return;
      }
      toast.info("Your revised cantrip choices are full; change them during level up.");
      return;
    }
    if (candidate.value && candidate.value.source_class_id !== props.sourceClassId) {
      toast.error("The replacement spell must use the same source class.");
      return;
    }
    if (!candidate.value && policy.changeCount !== null) {
      const limit = policyValueAtLevel(policy.prepared, props.sourceClassLevel ?? 1);
      if (limit !== null && (props.preparedSpellCount ?? 0) < limit) {
        await addSpell({
          partyMemberId: props.playerMemberId,
          spellId: spell.id,
          isPrepared: true,
          sourceClassId: props.sourceClassId,
        });
        return;
      }
      toast.info("Choose the prepared spell to replace first.");
      return;
    }
    try {
      await changePreparedSpell({
        partyMemberId: props.playerMemberId,
        sourceClassId: props.sourceClassId,
        newSpellId: spell.id,
        oldCharacterSpellId: candidate.value?.id ?? null,
      });
      clearReplacement();
    } catch (error) {
      toast.error(toast.fromError(error));
    }
    return;
  }
  await addSpell({
    partyMemberId: props.playerMemberId,
    spellId: spell.id,
    isPrepared: props.casterType === "prepared",
    sourceClassId: props.sourceClassId,
  });
}

function handleKnownClick(spell: Spell) {
  if (!props.playerMemberId) return;
  const policy = props.officialRulesPolicy
    ? getSpellPreparationPolicy(props.classFilter, ruleset.value)
    : null;
  if (policy) {
    toast.info(policy.casterType === "spellbook"
      ? "Change prepared Wizard spells from your Prepared tab after a long rest."
      : "Choose the spell to replace from your prepared list.");
    return;
  }
  removeSpell({ partyMemberId: props.playerMemberId, spellId: spell.id, sourceClassId: props.sourceClassId });
}

const showLearnButton = computed(() => !!props.playerMemberId && props.casterType !== "none");

function learnLabel(isCantrip: boolean) {
  if (props.casterType === "prepared") return "Prepare";
  if (isCantrip) return "Learn";
  return props.casterType === "spellbook" ? "Add" : "Learn";
}

function learnedLabel(isCantrip: boolean) {
  if (props.casterType === "prepared") return "Prepared";
  if (isCantrip) return "Known";
  return props.casterType === "spellbook" ? "Added" : "Learned";
}

function isKnown(spellId: string): boolean {
  if (props.casterType === "prepared") return props.preparedSpellIds?.includes(spellId) ?? false;
  return props.knownSpellIds?.includes(spellId) ?? false;
}

const { data: allSpells, isLoading } = useAllSpells();

// Debounce search to avoid filtering on every keystroke
const debouncedSearch = refDebounced(computed(() => props.search), 200);

const filtered = computed<Spell[]>(() => {
  let list = allSpells.value ?? [];
  const q = debouncedSearch.value.trim().toLowerCase();
  if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
  if (props.levelFilter !== "") list = list.filter((s) => s.level === parseInt(props.levelFilter));
  if (props.schoolFilter) list = list.filter((s) => s.school === props.schoolFilter);
  if (props.classFilter) list = list.filter((s) => s.classes.includes(props.classFilter));
  if (props.sourceFilter && props.sourceFilter !== "all") list = list.filter((s) => s.source === props.sourceFilter);
  return list;
});

const { savedCount, linkCount } = useScrollRestore("spells");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);
</script>
