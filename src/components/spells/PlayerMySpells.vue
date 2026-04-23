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

    <!-- Grouped spell list -->
    <template v-else>
      <!-- Prepared count vs. max banner (Wizard prepared tab) -->
      <div
        v-if="showPreparedCounter"
        class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2 mb-2"
      >
        <span class="font-cinzel text-xs text-muted-foreground tracking-wider">Spells Prepared</span>
        <span class="font-cinzel text-sm font-bold tracking-wider" :class="preparedCounterClass">
          {{ preparedNonCantrips }} / {{ maxPrepared }}
        </span>
      </div>

      <div v-for="group in levelGroups" :key="group.level" class="mb-2">
        <!-- Level header (accordion toggle) -->
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-t-lg bg-muted/40 border border-border hover:bg-muted/60 transition-colors"
          :class="ui.playerSpellOpenLevels.includes(group.level) ? 'rounded-t-lg border-b-0' : 'rounded-lg'"
          @click="ui.togglePlayerSpellLevel(group.level)"
        >
          <ChevronRight
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
            :class="ui.playerSpellOpenLevels.includes(group.level) ? 'rotate-90' : ''"
          />

          <!-- Label -->
          <span class="font-cinzel text-xs font-bold tracking-wider text-foreground">
            {{ group.level === 0 ? "Cantrips" : SLOT_LEVEL_LABELS[group.level - 1] + " Level" }}
          </span>

          <!-- Slot pips for this level -->
          <template v-if="group.level > 0 && slotForLevel(group.level)">
            <div class="flex items-center gap-0.5 ml-1" @click.stop>
              <button
                v-for="pip in slotForLevel(group.level)!.max"
                :key="pip"
                class="h-3.5 w-3.5 rounded-full border-2 transition-colors"
                :class="pip <= slotForLevel(group.level)!.used
                  ? 'bg-primary border-primary'
                  : 'border-muted-foreground/40 hover:border-primary/60'"
                :title="pip <= slotForLevel(group.level)!.used ? 'Recover slot' : 'Spend slot'"
                @click="togglePip(group.level, pip)"
              />
            </div>
            <span class="font-cinzel text-[10px] text-muted-foreground">
              {{ slotForLevel(group.level)!.max - slotForLevel(group.level)!.used }}/{{ slotForLevel(group.level)!.max }}
            </span>
          </template>

          <!-- Spell count badge -->
          <span class="ml-auto font-cinzel text-[10px] text-muted-foreground tracking-wider">
            {{ group.entries.length }}
          </span>
        </button>

        <!-- Spell rows -->
        <div
          v-show="ui.playerSpellOpenLevels.includes(group.level)"
          class="rounded-b-lg border border-t-0 border-border bg-card divide-y divide-border overflow-hidden"
        >
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="group flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <!-- School colour dot -->
            <div
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: SCHOOL_COLORS[entry.spell.school] }"
            />

            <!-- Spell name -->
            <button
              class="flex-1 font-fell text-sm text-foreground hover:text-primary transition-colors min-w-0 truncate text-left"
              @click.stop="selectedSpell = entry.spell"
            >
              {{ entry.spell.name }}
            </button>

            <!-- Badges -->
            <span
              v-if="entry.spell.ritual"
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-muted-foreground border border-border rounded px-1"
            >R</span>
            <span
              v-if="entry.spell.concentration"
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-primary/70 border border-primary/30 rounded px-1"
            >C</span>

            <!-- Attack / save info -->
            <span
              v-if="isCastable(entry) && spellAttackBonus !== null && (entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell')"
              class="shrink-0 font-cinzel text-[10px] text-muted-foreground"
            >Atk {{ signedNum(spellAttackBonus) }}</span>
            <span
              v-else-if="isCastable(entry) && spellSaveDc !== null && entry.spell.attack_type === 'save'"
              class="shrink-0 font-cinzel text-[10px] text-muted-foreground"
            >DC {{ spellSaveDc }}</span>

            <!-- Cast button (castable spells) -->
            <button
              v-if="isCastable(entry)"
              class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded font-cinzel text-[10px] font-semibold tracking-wider transition-colors border"
              :class="castButtonClass(entry)"
              :disabled="isCasting"
              :title="castButtonTitle(entry)"
              @click="startCast(entry)"
            >
              <Wand2 class="h-3 w-3" />
              Cast
            </button>

            <!-- Prepare toggle (Wizard spellbook tab) -->
            <button
              v-if="showPrepareToggle && entry.spell.level > 0"
              class="shrink-0 flex items-center gap-1 rounded px-2 py-0.5 font-cinzel text-[10px] font-semibold tracking-wider transition-colors cursor-pointer border"
              :class="entry.is_prepared
                ? 'bg-primary/15 text-primary border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
                : 'bg-muted text-muted-foreground border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30'"
              :disabled="isToggling"
              :title="entry.is_prepared ? 'Unprepare' : 'Prepare'"
              @click="togglePrepare(entry)"
            >
              <Flame v-if="entry.is_prepared" class="h-3 w-3" />
              <Circle v-else class="h-3 w-3" />
              {{ entry.is_prepared ? "Prepared" : "Prepare" }}
            </button>

            <!-- Cantrip always-prepared badge (Wizard spellbook only) -->
            <span
              v-else-if="showPrepareToggle && entry.spell.level === 0"
              class="shrink-0 font-cinzel text-[10px] tracking-wider text-emerald-500/70 border border-emerald-500/20 rounded px-2 py-0.5"
            >Always</span>

            <!-- Remove button -->
            <button
              class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 rounded cursor-pointer shrink-0"
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

    <!-- Spell detail modal -->
    <PlayerSpellModal :spell="selectedSpell" @close="selectedSpell = null" />
  </div>

  <!-- Upcast slot picker -->
  <Teleport to="body">
    <div v-if="pendingCastEntry" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60" @click="pendingCastEntry = null" />
      <div class="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl p-5 space-y-4">
        <!-- Header -->
        <div class="flex items-center gap-2">
          <div
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: SCHOOL_COLORS[pendingCastEntry.spell.school] }"
          />
          <h2 class="font-cinzel text-base font-bold text-foreground">{{ pendingCastEntry.spell.name }}</h2>
        </div>

        <!-- Slot level picker -->
        <div>
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-2">CAST AT LEVEL</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="lvl in upcastLevels"
              :key="lvl"
              class="flex flex-col items-center px-3 py-2 rounded-lg border font-cinzel text-xs font-semibold transition-colors"
              :class="selectedUpcastLevel === lvl
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-muted border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'"
              @click="selectedUpcastLevel = lvl"
            >
              <span>{{ SLOT_LEVEL_LABELS[lvl - 1] }}</span>
              <span v-if="scaledDiceLabel(pendingCastEntry, lvl)" class="font-fell text-[10px] font-normal mt-0.5 opacity-80">
                {{ scaledDiceLabel(pendingCastEntry, lvl) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-3 pt-1">
          <button
            type="button"
            class="flex-1 px-4 py-2 font-cinzel text-xs font-semibold border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
            @click="pendingCastEntry = null"
          >Cancel</button>
          <button
            type="button"
            :disabled="isCasting"
            class="flex-1 px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="confirmCast"
          >
            {{ isCasting ? "Casting…" : "Cast" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Flame, Circle, X, BookOpen, ChevronRight, Wand2 } from "lucide-vue-next";
import {
  useCharacterSpellsWithDetails,
  useRemoveCharacterSpell,
  useTogglePrepared,
} from "@/composables/useCharacterSpells";
import { useUpdatePartyMember, useParty } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useConcentration } from "@/composables/useConcentration";
import { useUiStore } from "@/stores/ui";
import { SCHOOL_COLORS } from "@/types/spell.types";
import { parseExpression, parsedToCounts, scaleExpression } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import { signedNum } from "@/lib/utils";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import type { CasterType, CharacterSpellEntry, Spell } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PlayerSpellModal from "@/components/spells/PlayerSpellModal.vue";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const props = defineProps<{
  partyMemberId: string | null;
  casterType: CasterType;
  memberClass: string;
  memberName: string;
  spellSlots: SpellSlotEntry[];
  spellAttackBonus: number | null;
  spellSaveDc: number | null;
  /**
   * "spellbook" — show all character_spells (Wizard spellbook tab + Known tab for known casters)
   * "prepared"  — show only is_prepared = true (Wizard/Cleric/etc. prepared tab)
   */
  viewMode: "spellbook" | "prepared";
  /** Max spells that can be prepared (null = no cap / not applicable). */
  maxPrepared?: number | null;
}>();

const { data: rawEntries, isLoading } = useCharacterSpellsWithDetails(
  computed(() => props.partyMemberId),
);
// Innate spells (racial/feat/item/other) are shown in the Innate tab — exclude them here
const allEntries = computed(() =>
  (rawEntries.value ?? []).filter((e) => !e.source_type || e.source_type === "class"),
);
const { mutate: removeSpell, isPending: isRemoving } = useRemoveCharacterSpell();
const { mutate: togglePreparedMutation, isPending: isToggling } = useTogglePrepared();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { sendFlavorMessage, sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();
const { data: partyList } = useParty();
const { startConcentration } = useConcentration();
const thisMember = computed(() =>
  props.partyMemberId && partyList.value
    ? (partyList.value.find((m) => m.id === props.partyMemberId) ?? null)
    : null,
);
const ui = useUiStore();

// ── Modal ──────────────────────────────────────────────────────────────────────
const selectedSpell = ref<Spell | null>(null);

// ── Slot helpers ───────────────────────────────────────────────────────────────
function slotForLevel(level: number): SpellSlotEntry | undefined {
  return props.spellSlots.find((s) => s.level === level);
}

async function togglePip(level: number, pip: number) {
  if (!props.partyMemberId) return;
  const updated = props.spellSlots.map((s) => {
    if (s.level !== level) return s;
    const newUsed = s.used >= pip ? pip - 1 : pip;
    return { ...s, used: newUsed };
  });
  await updateMember({ id: props.partyMemberId, update: { spell_slots: updated } });
}

// ── Cast ───────────────────────────────────────────────────────────────────────
const isCasting = ref(false);

/** A spell is castable if it's prepared, a cantrip, or the caster always has it ready (known casters). */
function isCastable(entry: CharacterSpellEntry): boolean {
  if (props.viewMode === "prepared") return true;
  if (props.casterType === "known") return true;
  return entry.is_prepared || entry.spell.level === 0;
}

function slotAvailable(level: number): boolean {
  if (level === 0) return true;
  const slot = slotForLevel(level);
  if (!slot) return true; // no slot tracking configured — allow
  return slot.used < slot.max;
}

function castButtonClass(entry: CharacterSpellEntry): string {
  if (entry.spell.level === 0) {
    return "bg-muted/50 border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30";
  }
  if (!slotAvailable(entry.spell.level)) {
    return "bg-muted/30 border-border/50 text-muted-foreground/40 cursor-not-allowed";
  }
  return "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20";
}

function castButtonTitle(entry: CharacterSpellEntry): string {
  if (entry.spell.level === 0) return "Cast cantrip";
  const slot = slotForLevel(entry.spell.level);
  if (slot && slot.used >= slot.max) return "No slots remaining";
  return `Cast — spend one ${SLOT_LEVEL_LABELS[entry.spell.level - 1]}-level slot`;
}

// ── Upcast picker ──────────────────────────────────────────────────────────────
const pendingCastEntry = ref<CharacterSpellEntry | null>(null);
const selectedUpcastLevel = ref(1);

/** All slot levels ≥ spell's base that have at least one use remaining. */
const upcastLevels = computed(() => {
  if (!pendingCastEntry.value) return [];
  const base = pendingCastEntry.value.spell.level;
  return props.spellSlots
    .filter((s) => s.level >= base && s.used < s.max)
    .map((s) => s.level);
});

/** Human-readable scaled dice label shown under each level button in the picker. */
function scaledDiceLabel(entry: CharacterSpellEntry, castLevel: number): string {
  const extra = castLevel - entry.spell.level;
  if (extra === 0) {
    // Base level — show base dice if available
    if (entry.spell.damage_rolls?.length) return entry.spell.damage_rolls[0].dice;
    if (entry.spell.healing_dice) return entry.spell.healing_dice;
    return "";
  }
  if (entry.spell.higher_level_damage && entry.spell.damage_rolls?.length) {
    return scaleExpression(entry.spell.damage_rolls[0].dice, extra, entry.spell.higher_level_damage.dice_per_level);
  }
  if (entry.spell.higher_level_healing && entry.spell.healing_dice) {
    return scaleExpression(entry.spell.healing_dice, extra, entry.spell.higher_level_healing);
  }
  return "";
}

/** Decide whether to show the upcast picker or cast immediately. */
function startCast(entry: CharacterSpellEntry) {
  if (!slotAvailable(entry.spell.level)) return;
  // Cantrips cast directly — no slot
  if (entry.spell.level === 0) {
    void castSpell(entry, 0);
    return;
  }
  // Compute available slot levels for this spell
  const base = entry.spell.level;
  const available = props.spellSlots.filter((s) => s.level >= base && s.used < s.max);
  // Only one option (or no slot tracking) → cast at base level directly
  if (available.length <= 1) {
    void castSpell(entry, base);
    return;
  }
  // Multiple levels available → show picker
  pendingCastEntry.value = entry;
  selectedUpcastLevel.value = base;
}

function confirmCast() {
  if (!pendingCastEntry.value) return;
  const entry = pendingCastEntry.value;
  const level = selectedUpcastLevel.value;
  pendingCastEntry.value = null;
  void castSpell(entry, level);
}

async function castSpell(entry: CharacterSpellEntry, castLevel: number) {
  if (!props.partyMemberId || isCasting.value) return;
  isCasting.value = true;
  try {
    const spell = entry.spell;
    const extraLevels = castLevel - spell.level;

    // Concentration guard
    if (spell.concentration && thisMember.value) {
      const ok = await startConcentration(thisMember.value, spell, { castAtLevel: castLevel });
      if (!ok) return;
    }

    // Flavor text
    let text = `${props.memberName} casts ${spell.name}`;
    if (extraLevels > 0) text += ` (upcast ${SLOT_LEVEL_LABELS[castLevel - 1]})`;
    if (castLevel > 0 && props.spellAttackBonus !== null
      && (spell.attack_type === "ranged_spell" || spell.attack_type === "melee_spell")) {
      text += ` — Atk ${signedNum(props.spellAttackBonus)}`;
    } else if (castLevel > 0 && props.spellSaveDc !== null && spell.attack_type === "save") {
      text += ` — DC ${props.spellSaveDc} ${spell.save_attribute ?? ""}`;
    }
    await sendFlavorMessage(text, "spell");

    // Auto-roll damage (scaled if upcast)
    if (spell.damage_rolls?.length) {
      for (const dmg of spell.damage_rolls) {
        const diceSrc = (extraLevels > 0 && spell.higher_level_damage)
          ? scaleExpression(dmg.dice, extraLevels, spell.higher_level_damage.dice_per_level)
          : dmg.dice;
        const parsed = parseExpression(diceSrc);
        if (!parsed) continue;
        const typeLabel = dmg.type ? ` ${dmg.type}` : "";
        let label = `${spell.name} — ${diceSrc}${typeLabel} damage`;
        if (spell.attack_type === "save" && spell.save_effect === "half") {
          label += ` (half on ${spell.save_attribute ?? "save"})`;
        }
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true });
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
        }
      }
    }

    // Auto-roll healing (scaled if upcast)
    if (spell.healing_dice) {
      const diceSrc = (extraLevels > 0 && spell.higher_level_healing)
        ? scaleExpression(spell.healing_dice, extraLevels, spell.higher_level_healing)
        : spell.healing_dice;
      const parsed = parseExpression(diceSrc);
      if (parsed) {
        const label = `${spell.name} — ${diceSrc} healing`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: false });
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: false });
        }
      }
    }

    // Spend slot at the chosen level
    if (castLevel > 0) {
      const slot = slotForLevel(castLevel);
      if (slot && slot.used < slot.max) {
        const updated = props.spellSlots.map((s) =>
          s.level === castLevel ? { ...s, used: s.used + 1 } : s,
        );
        await updateMember({ id: props.partyMemberId, update: { spell_slots: updated } });
      }
    }
  } finally {
    isCasting.value = false;
  }
}

// ── Prepare toggle ─────────────────────────────────────────────────────────────
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

// ── Remove ─────────────────────────────────────────────────────────────────────
const removeTitle = computed(() => {
  if (props.viewMode === "prepared" && props.casterType !== "spellbook") return "Unprepare";
  return "Remove from spellbook";
});

function handleRemove(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  removeSpell({ partyMemberId: props.partyMemberId, spellId: entry.spell.id });
}

function togglePrepare(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  togglePreparedMutation({
    id: entry.id,
    partyMemberId: props.partyMemberId,
    isPrepared: !entry.is_prepared,
  });
}

// ── Prepared counter ───────────────────────────────────────────────────────────
const preparedNonCantrips = computed(
  () => displayedEntries.value.filter((e) => e.spell.level > 0 && e.is_prepared).length,
);
const showPreparedCounter = computed(
  () => props.viewMode === "prepared" && props.maxPrepared !== null && props.maxPrepared !== undefined,
);
const preparedCounterClass = computed(() => {
  if (props.maxPrepared === null || props.maxPrepared === undefined) return "";
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
