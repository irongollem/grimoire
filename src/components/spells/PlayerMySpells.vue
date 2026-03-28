<template>
  <div>
    <!-- No character selected -->
    <div v-if="!partyMemberId" class="rounded-lg border border-border bg-card px-5 py-8 text-center">
      <p class="font-fell text-sm text-muted-foreground italic">No character selected.</p>
    </div>

    <!-- Non-caster -->
    <div v-else-if="casterType === 'none'" class="rounded-lg border border-border bg-card px-5 py-8 text-center">
      <p class="font-fell text-sm text-muted-foreground italic">
        Your character class doesn't have a spell list.
      </p>
    </div>

    <LoadingSpinner v-else-if="isLoading" class="py-16" />

    <!-- Empty state -->
    <div
      v-else-if="!displayedEntries.length"
      class="rounded-lg border border-border bg-card px-5 py-8 text-center space-y-2"
    >
      <component :is="emptyIcon" class="h-8 w-8 mx-auto text-muted-foreground/60" />
      <p class="font-cinzel text-sm font-semibold text-foreground">{{ emptyTitle }}</p>
      <p class="font-fell text-sm text-muted-foreground max-w-sm mx-auto">{{ emptyBody }}</p>
    </div>

    <!-- Spell list + optional prepared counter -->
    <template v-else-if="displayedEntries.length">
      <!-- Prepared count vs. max banner -->
      <div
        v-if="showPreparedCounter"
        class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 mb-2"
      >
        <span class="font-cinzel text-xs text-muted-foreground tracking-wider">Spells Prepared</span>
        <span class="font-cinzel text-sm font-bold tracking-wider" :class="preparedCounterClass">
          {{ preparedNonCantrips }} / {{ maxPrepared }}
        </span>
      </div>
      <div v-for="group in levelGroups" :key="group.level" class="mb-4">
        <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1.5 px-1">
          {{ group.level === 0 ? "Cantrips" : `Level ${group.level}` }}
        </h3>

        <div class="rounded-lg border border-border bg-card divide-y divide-border overflow-hidden">
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="group flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <!-- School colour dot -->
            <div
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: SCHOOL_COLORS[entry.spell.school] }"
            />

            <!-- Name -->
            <RouterLink
              :to="`/spells/${entry.spell.id}`"
              class="flex-1 font-fell text-sm text-foreground hover:text-primary transition-colors"
            >
              {{ entry.spell.name }}
            </RouterLink>

            <!-- Badges -->
            <span
              v-if="entry.spell.ritual"
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground border border-border rounded px-1"
            >R</span>
            <span
              v-if="entry.spell.concentration"
              class="font-cinzel text-[10px] tracking-wider text-primary/70 border border-primary/30 rounded px-1"
            >C</span>

            <!-- School label -->
            <span class="hidden sm:block font-cinzel text-[10px] tracking-wider text-muted-foreground capitalize w-20 text-right shrink-0">
              {{ entry.spell.school }}
            </span>

            <!-- Prepare toggle (Wizard spellbook tab + non-cantrips) -->
            <button
              v-if="showPrepareToggle && entry.spell.level > 0"
              class="shrink-0 flex items-center gap-1 rounded px-2 py-0.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors cursor-pointer"
              :class="entry.is_prepared
                ? 'bg-primary/15 text-primary border border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
                : 'bg-muted text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30'"
              :disabled="isToggling"
              :title="entry.is_prepared ? 'Unprepare' : 'Prepare'"
              @click="togglePrepare(entry)"
            >
              <Flame v-if="entry.is_prepared" class="h-3 w-3" />
              <Circle v-else class="h-3 w-3" />
              {{ entry.is_prepared ? "Prepared" : "Prepare" }}
            </button>

            <!-- Cantrip always-prepared badge -->
            <span
              v-else-if="showPrepareToggle && entry.spell.level === 0"
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-emerald-500/70 border border-emerald-500/20 rounded px-2 py-0.5"
            >
              Always
            </span>

            <!-- Remove button -->
            <button
              class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 rounded cursor-pointer"
              :title="removeTitle"
              :disabled="isRemoving"
              @click="handleRemove(entry)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <p class="font-fell text-xs text-muted-foreground italic text-center mt-2">
        {{ footerText }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Flame, Circle, X, BookOpen } from "lucide-vue-next";
import {
  useCharacterSpellsWithDetails,
  useRemoveCharacterSpell,
  useTogglePrepared,
} from "@/composables/useCharacterSpells";
import { SCHOOL_COLORS } from "@/types/spell.types";
import type { CasterType, CharacterSpellEntry } from "@/types/spell.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const props = defineProps<{
  partyMemberId: string | null;
  casterType: CasterType;
  memberClass: string;
  /**
   * "spellbook" — show all character_spells (used for Wizard spellbook tab + Known tab)
   * "prepared"  — show only is_prepared = true (used for Prepared tab)
   */
  viewMode: "spellbook" | "prepared";
  /** Max spells that can be prepared (null = no cap / not applicable). */
  maxPrepared?: number | null;
}>();

const { data: allEntries, isLoading } = useCharacterSpellsWithDetails(
  computed(() => props.partyMemberId),
);
const { mutate: removeSpell, isPending: isRemoving } = useRemoveCharacterSpell();
const { mutate: togglePreparedMutation, isPending: isToggling } = useTogglePrepared();

/** Prepare toggle is shown only for Wizard in their spellbook tab. */
const showPrepareToggle = computed(
  () => props.casterType === "spellbook" && props.viewMode === "spellbook",
);

const displayedEntries = computed(() => {
  if (!allEntries.value) return [];
  if (props.viewMode === "prepared") return allEntries.value.filter((e) => e.is_prepared || e.spell.level === 0);
  return allEntries.value;
});

const levelGroups = computed(() => {
  const map = new Map<number, CharacterSpellEntry[]>();
  for (const e of displayedEntries.value) {
    const lvl = e.spell.level;
    if (!map.has(lvl)) map.set(lvl, []);
    map.get(lvl)!.push(e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, entries]) => ({ level, entries }));
});

// ── Empty state messaging ──────────────────────────────────────────────────────
const emptyIcon = computed(() => (props.viewMode === "prepared" ? Flame : BookOpen));

const emptyTitle = computed(() => {
  if (props.viewMode === "prepared") return "Nothing prepared";
  if (props.casterType === "spellbook") return "Spellbook is empty";
  return "No spells learned yet";
});

const emptyBody = computed(() => {
  if (props.viewMode === "prepared" && props.casterType === "spellbook")
    return 'Open your Spellbook tab and click "Prepare" on the spells you want ready today.';
  if (props.viewMode === "prepared")
    return `Browse "All ${props.memberClass} Spells" and click "Prepare" to add spells to today's list.`;
  if (props.casterType === "spellbook")
    return 'Browse "All Spells" and click "Add" to copy spells into your spellbook.';
  return 'Browse "All Spells" and click "Learn" to add spells to your list.';
});

// ── Remove / unprepare ─────────────────────────────────────────────────────────
const removeTitle = computed(() => {
  if (props.viewMode === "prepared" && props.casterType !== "spellbook") return "Unprepare";
  return "Remove from spellbook";
});

function handleRemove(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  if (props.viewMode === "prepared" && props.casterType !== "spellbook") {
    // Prepared casters: deleting from prepared tab removes the row entirely
    removeSpell({ partyMemberId: props.partyMemberId, spellId: entry.spell.id });
  } else {
    removeSpell({ partyMemberId: props.partyMemberId, spellId: entry.spell.id });
  }
}

function togglePrepare(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  togglePreparedMutation({
    id: entry.id,
    partyMemberId: props.partyMemberId,
    isPrepared: !entry.is_prepared,
  });
}

// ── Prepared counter ──────────────────────────────────────────────────────────
const preparedNonCantrips = computed(
  () => displayedEntries.value.filter((e) => e.spell.level > 0 && e.is_prepared).length,
);
const showPreparedCounter = computed(
  () => props.viewMode === "prepared" && props.maxPrepared != null,
);
const preparedCounterClass = computed(() => {
  if (props.maxPrepared == null) return "";
  const n = preparedNonCantrips.value;
  if (n > props.maxPrepared) return "text-red-400";
  if (n === props.maxPrepared) return "text-amber-400";
  return "text-emerald-400";
});

// ── Footer ─────────────────────────────────────────────────────────────────────
const totalCount = computed(() => displayedEntries.value.length);
const footerText = computed(() => {
  const n = totalCount.value;
  if (props.viewMode === "prepared") return `${n} spell${n !== 1 ? "s" : ""} prepared`;
  if (props.casterType === "spellbook") return `${n} spell${n !== 1 ? "s" : ""} in spellbook`;
  return `${n} spell${n !== 1 ? "s" : ""} known`;
});
</script>
