<template>
  <div>
    <PlayerSpellSlotStrip
      v-if="partyMemberId && casterType !== 'none'"
      :spell-slots="props.spellSlots"
      @set-used="setSlotUsed"
    />

    <!-- Prepared count against the limit: shown from the start, even with nothing prepared -->
    <div
      v-if="partyMemberId && casterType !== 'none' && showPreparedCounter"
      class="mb-2 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2"
    >
      <span class="text-label-lg text-muted-foreground">Spells prepared</span>
      <span class="text-heading-sm font-bold" :class="preparedCounterClass">
        {{ preparedNonCantrips }} / {{ maxPrepared }}
      </span>
    </div>

    <!-- No character selected -->
    <div v-if="!partyMemberId" class="rounded-lg border border-border bg-card px-5 py-8 text-center">
      <p class="text-body text-muted-foreground italic">No character selected.</p>
    </div>

    <!-- Non-caster -->
    <div v-else-if="casterType === 'none'" class="rounded-lg border border-border bg-card px-5 py-8 text-center">
      <p class="text-body text-muted-foreground italic">
        Your character class doesn't have a spell list.
      </p>
    </div>

    <!-- Two collapsed-level headers over a few spell rows, the shape of the grouped list below -->
    <div v-else-if="isLoading" role="status" class="flex flex-col gap-2">
      <span class="sr-only">Loading…</span>
      <div v-for="g in 2" :key="g" class="overflow-hidden rounded-lg border border-border bg-card">
        <SkeletonBlock class="h-9 w-full rounded-none" />
        <div v-for="r in 3" :key="r" class="flex items-center gap-2 px-3 py-3">
          <SkeletonBlock class="size-2.5 shrink-0 rounded-full" />
          <SkeletonBlock class="h-4" :class="r % 2 ? 'w-1/3' : 'w-1/2'" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!displayedEntries.length"
      class="rounded-lg border border-border bg-card px-5 py-8 text-center space-y-2"
    >
      <component :is="emptyIcon" class="h-8 w-8 mx-auto text-muted-foreground/60" />
      <p class="text-heading-sm font-semibold text-foreground">{{ emptyTitle }}</p>
      <p class="text-body text-muted-foreground max-w-sm mx-auto">{{ emptyBody }}</p>
    </div>

    <!-- Grouped spell list -->
    <template v-else>
      <div v-if="replacementCandidate" class="rounded-lg border border-tone-arcane/30 bg-tone-arcane/10 px-4 py-2 mb-2 text-body">
        Replacing <strong>{{ replacementCandidate.spell.name }}</strong>. Choose its replacement in All Spells.
        <button class="ml-2 text-ink-arcane underline" type="button" @click="clearReplacement">Cancel</button>
      </div>
      <div v-for="group in levelGroups" :key="group.level" class="mb-2">
        <!-- Level header (accordion toggle) -->
        <AppButton
          variant="outline"
          size="body"
          surface="muted"
          fill="muted"
          block
          class="justify-start py-2"
          :class="playerUi.playerSpellOpenLevels.includes(group.level) ? 'rounded-t-lg rounded-b-none border-b-0' : 'rounded-lg'"
          @click="playerUi.togglePlayerSpellLevel(group.level)"
        >
          <IconChevronRight
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform"
            :class="playerUi.playerSpellOpenLevels.includes(group.level) ? 'rotate-90' : ''"
          />

          <!-- Label -->
          <span class="text-label-lg font-bold text-foreground">
            {{ group.level === 0 ? "Cantrips" : SLOT_LEVEL_LABELS[group.level - 1] + " Level" }}
          </span>

          <!-- Spell count badge -->
          <span class="ml-auto text-label text-muted-foreground">
            {{ group.entries.length }}
          </span>
        </AppButton>

        <!-- Spell rows -->
        <div
          v-show="playerUi.playerSpellOpenLevels.includes(group.level)"
          class="rounded-b-lg border border-t-0 border-border bg-card divide-y divide-border overflow-hidden"
        >
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="group flex flex-col gap-1.5 px-3 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <div class="flex items-center gap-2">
            <!-- School colour dot -->
            <div
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :class="SCHOOL_BG[entry.spell.school]"
            />

            <!-- Spell name -->
            <AppButton
              variant="ghost"
              tone="primary"
              size="inline"
              class="flex-1 min-w-32 justify-start truncate text-body text-foreground"
              @click.stop="selectedEntry = entry"
            >{{ entry.spell.name }}</AppButton>

            <!-- Cast button (castable spells) -->
            <AppButton
              v-if="isCastable(entry)"
              variant="tinted"
              tone="primary"
              emphasis="soft"
              size="sm"
              class="max-md:min-h-11"
              :icon="IconWand"
              label="Cast"
              :disabled="isCasting || !slotAvailable(entry.spell.level)"
              :tooltip="castButtonTitle(entry)"
              @click="startCast(entry)"
            />

            <AppButton
              v-if="isRitualCastable(entry)"
              variant="tinted"
              tone="arcane"
              emphasis="soft"
              size="xs"
              :disabled="isCasting"
              tooltip="Cast as a ritual: takes 10 minutes longer and spends no spell slot"
              label="Ritual"
              @click="castRitual(entry)"
            />

            <!-- Prepare toggle (Wizard spellbook tab). Granted spells are locked. -->
            <AppButton
              v-if="showPrepareToggle && entry.spell.level > 0 && !entry.always_prepared"
              :variant="entry.is_prepared ? 'tinted' : 'subtle'"
              tone="primary"
              size="sm"
              class="max-md:min-h-11"
              :icon="entry.is_prepared ? IconFire : IconCircle"
              :label="entry.is_prepared ? 'Prepared' : 'Prepare'"
              :disabled="isToggling"
              :tooltip="entry.is_prepared ? 'Unprepare' : 'Prepare'"
              @click="togglePrepare(entry)"
            />

            <!-- Cantrip always-prepared badge (Wizard spellbook only) -->
            <span
              v-else-if="showPrepareToggle && entry.spell.level === 0"
              class="shrink-0 text-label text-ink-success/70 border border-tone-success/20 rounded px-2 py-0.5"
            >Always ready</span>

            <!-- Remove button — hidden for subclass-granted spells (locked) -->
            <AppButton
              v-if="!entry.always_prepared"
              variant="ghost"
              tone="danger"
              size="icon-xs"
              class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              :icon="IconClose"
              :tooltip="removeTitle"
              :disabled="isRemoving"
              @click="handleRemove(entry)"
            />
            </div>
            <!-- Badges and per-spell rolls, on their own line so the name never truncates for them -->
            <div class="flex flex-wrap items-center gap-1.5 pl-[1.125rem] empty:hidden">
            <!-- Badges -->
            <span
              v-if="entry.spell.ritual"
              class="shrink-0 text-label text-muted-foreground border border-border rounded px-1.5"
            >Ritual</span>
            <span
              v-if="entry.spell.concentration"
              class="shrink-0 text-label text-primary/80 border border-primary/30 rounded px-1.5"
            >Concentration</span>

            <!-- Subclass-granted (always prepared, doesn't count toward limit) -->
            <span
              v-if="entry.always_prepared"
              class="shrink-0 text-label text-ink-success/80 border border-tone-success/30 rounded px-2 py-0.5"
              title="Granted by your subclass: always prepared, doesn't count toward your prepared limit"
            >Always prepared</span>

            <!-- Spell attack roll (multiclass-aware via source class) -->
            <AppButton
              v-if="isCastable(entry) && attackBonusFor(entry) !== null && (entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell')"
              variant="subtle"
              surface="muted"
              fill="tone"
              tone="primary"
              size="xs"
              class="shrink-0"
              tooltip="Roll spell attack (d20 + attack bonus)"
              :label="`Atk ${signedNum(attackBonusFor(entry)!)}`"
              v-roll-mode="{ enabled: true, on: (m: RollMode | null, ev: Event) => { ev.stopPropagation(); rollSpellAttack(entry, m); } }"
            />
            <!-- Saving-throw prompt — announces DC + ability to the table -->
            <AppButton
              v-else-if="isCastable(entry) && saveDcFor(entry) !== null && entry.spell.attack_type === 'save'"
              variant="tinted"
              size="xs"
              tone="caution"
              emphasis="soft"
              :tooltip="`Announce DC ${saveDcFor(entry)} ${entry.spell.save_attribute ?? ''} saving throw`"
              :label="`DC ${saveDcFor(entry)}`"
              @click.stop="promptSpellSave(entry)"
            />

            <AppButton
              v-if="isCastable(entry) && entry.spell.damage_rolls?.length && entry.spell.mechanics_reviewed !== false"
              variant="tinted"
              size="xs"
              tone="danger"
              emphasis="soft"
              tooltip="Roll damage after resolving the spell attack or target saving throw"
              :label="entry.spell.effects?.length ? 'Resolve' : 'Damage'"
              @click.stop="entry.spell.effects?.length ? openEffectResolution(entry, lastCastLevel(entry)) : rollSpellDamage(entry, lastCastLevel(entry), transmutedDamageType[entry.id])"
            />
            <!-- Post-roll Metamagic (Empowered/Seeking) — set and costs come from the metamagic_options table -->
            <AppButton
              v-for="option in eligiblePostRollMetamagic(entry)"
              :key="option.name"
              variant="tinted"
              size="xs"
              tone="arcane"
              emphasis="soft"
              :tooltip="`After the roll, spend ${option.sp_cost} SP: ${option.description}`"
              :label="option.name.replace(' Spell', '')"
              @click.stop="applyReactiveMetamagic(entry, option.name)"
            />
            <AppButton
              v-if="isCastable(entry) && entry.spell.healing_dice && entry.spell.mechanics_reviewed !== false"
              variant="tinted"
              size="xs"
              tone="success"
              emphasis="soft"
              tooltip="Roll healing"
              :label="entry.spell.effects?.length ? 'Resolve' : 'Healing'"
              @click.stop="entry.spell.effects?.length ? openEffectResolution(entry, lastCastLevel(entry)) : rollSpellHealing(entry, lastCastLevel(entry))"
            />
            <span v-if="entry.spell.mechanics_reviewed === false" class="shrink-0 rounded border border-tone-caution/30 bg-tone-caution/10 px-1.5 py-0.5 text-label text-ink-caution" title="This spell's dice are not set up for auto-rolling; read the spell text and roll them yourself">Roll by hand</span>

            <AppSelect
              v-if="eligibleMetamagic(entry).length"
              v-model="selectedMetamagic[entry.id]"
              size="xs"
              class="max-w-28 shrink-0 border-tone-arcane/30 bg-tone-arcane/10 text-ink-arcane"
              title="Apply Metamagic to this casting"
              aria-label="Metamagic option"
              @click.stop
            >
              <option value="">No Metamagic</option>
              <option v-for="option in eligibleMetamagic(entry)" :key="option.name" :value="option.name">
                {{ option.name }} ({{ option.sp_cost }} SP)
              </option>
            </AppSelect>

            <AppSelect
              v-if="selectedMetamagicNames(entry).includes('Transmuted Spell')"
              v-model="transmutedDamageType[entry.id]"
              size="xs"
              class="max-w-24 shrink-0 border-tone-arcane/30 bg-tone-arcane/10 text-ink-arcane"
              title="Choose the new damage type"
              aria-label="Transmuted damage type"
              @click.stop
            >
              <option value="">New type…</option>
              <option v-for="type in transmutedChoices(entry)" :key="type" :value="type">{{ type }}</option>
            </AppSelect>

            <AppSelect
              v-if="canCombineMetamagic && eligibleSecondaryMetamagic(entry).length"
              v-model="selectedSecondMetamagic[entry.id]"
              size="xs"
              class="max-w-28 shrink-0 border-tone-arcane/30 bg-tone-arcane/10 text-ink-arcane"
              title="Sorcery Incarnate: apply a second Metamagic option"
              aria-label="Second Metamagic option"
              @click.stop
            >
              <option value="">No second option</option>
              <option v-for="option in eligibleSecondaryMetamagic(entry)" :key="option.name" :value="option.name">
                {{ option.name }} ({{ option.sp_cost }} SP)
              </option>
            </AppSelect>

            </div>
          </div>
        </div>
      </div>

      <!-- Not under the prepared counter: it counts what the limit counts, and a
           second total that includes cantrips read as a contradiction (10 vs 9 / 10). -->
      <p v-if="!showPreparedCounter" class="text-caption text-muted-foreground italic text-center mt-2">
        {{ footerText }}
      </p>
    </template>

    <!-- Spell detail modal -->
    <PlayerSpellModal
      :spell="selectedEntry?.spell ?? null"
      :can-cast="!!selectedEntry && isCastable(selectedEntry)"
      :cast-disabled-reason="selectedEntry ? castBlockedReason(selectedEntry) : null"
      :prepare-action="selectedEntry ? modalPrepareAction(selectedEntry) : null"
      :busy="isCasting || isToggling"
      @close="selectedEntry = null"
      @cast="castFromModal"
      @prepare="prepareFromModal"
    />
  </div>

  <!-- Upcast slot picker -->
  <SpellUpcastPicker
    :entry="pendingCastEntry"
    :spell-slots="props.spellSlots"
    :is-casting="isCasting"
    @cast="confirmCast"
    @cancel="pendingCastEntry = null"
  />
  <SpellEffectResolver
    :spell="pendingResolution?.spell ?? null"
    :cast-level="pendingResolution?.castLevel ?? 0"
    :character-level="props.memberLevel ?? 1"
    :spellcasting-modifier="pendingResolution?.modifier ?? 0"
    :damage-type-override="pendingResolution?.damageType ?? null"
    :metamagic-names="pendingResolution?.metamagicNames ?? []"
    @close="pendingResolution = null"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { IconChevronRight, IconCircle, IconClose, IconFire, IconPopulate, IconWand } from '@/lib/icons';
import {
  useCharacterSpellsWithDetails,
  useRemoveCharacterSpellById,
  useTogglePrepared,
} from "@/composables/party/useCharacterSpells";
import { useParty, useCastCharacterSpell } from "@/composables/party/useParty";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { useSpellSlotWrite } from "@/composables/spells/useSpellSlotWrite";
import { useConcentration } from "@/composables/party/useConcentration";
import { usePlayerUiStore } from "@/stores/ui/player";
import { SCHOOL_BG } from "@/types/spell.types";
import { parseExpression, parsedToCounts, scaleExpression } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import type { RollMode } from "@/lib/dice/roller";
import { signedNum } from "@/lib/utils";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { cantripDiceMultiplier } from "@/types/spell.types";
import type { CasterType, CharacterSpellEntry, Spell } from "@/types/spell.types";
import type { ConcentrationState, SpellSlotEntry } from "@/types/party.types";
import { pickSpellcastingStats, type SpellcastingClassStats } from "@/types/multiclass.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SkeletonBlock from "@/components/common/feedback/SkeletonBlock.vue";
import PlayerSpellModal from "@/components/spells/PlayerSpellModal.vue";
import PlayerSpellSlotStrip from "@/components/spells/PlayerSpellSlotStrip.vue";
import SpellUpcastPicker from "@/components/spells/SpellUpcastPicker.vue";
import SpellEffectResolver from "@/components/spells/SpellEffectResolver.vue";
import { countPreparedAgainstLimit } from "@/rules/preparedSpellCount";
import { availableSlotsForSpell, canCastWithSlot, slotPool, type SpellSlotPool } from "@/rules/spellSlots";
import { useToast } from "@/composables/useToast";
import { useRuleset } from "@/composables/rules/useRuleset";
import { canAutoRollSpellEffect, canCastAsRitual } from "@/rules/spellcastingPolicy";
import { useRitualStyles } from "@/composables/rules/useRitualPolicies";
import { useMetamagicOptions } from "@/composables/party/useMetamagic";
import type { MetamagicOption } from "@/rules/metamagic";
import { getSpellPreparationPolicy } from "@/rules/spellPreparationPolicy";
import { grantAttackBonus, grantSaveDc } from "@/rules/spellGrantStats";
import { useSpellReplacement } from "@/composables/party/useSpellReplacement";
import { isInnateSorceryActive, metamagicLimit } from "@/rules/sorcererFeatures";
import { isMetamagicEligible, TRANSMUTABLE_DAMAGE_TYPES } from "@/rules/metamagicPolicy";

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
   * Per-class spellcasting stats. Each spell entry picks the stats for its
   * source class via `source_class_id` (falling back to the first entry).
   * Empty array → fall back to the single-class spellAttackBonus / spellSaveDc
   * props.
   */
  spellcastingByClass?: SpellcastingClassStats[];
  /**
   * "spellbook" — show all character_spells (Wizard spellbook tab + Known tab for known casters)
   * "prepared"  — show only is_prepared = true (Wizard/Cleric/etc. prepared tab)
   */
  viewMode: "spellbook" | "prepared";
  /** Max spells that can be prepared (null = no cap / not applicable). */
  maxPrepared?: number | null;
  /** Total character level (sum of all class levels). Used for cantrip damage scaling. */
  memberLevel?: number;
  /** Sorcerer class level, distinct from total level for multiclass characters. */
  sorcererLevel?: number;
}>();

const { data: rawEntries, isLoading } = useCharacterSpellsWithDetails(
  computed(() => props.partyMemberId),
);
// Innate spells (racial/feat/item/other) are shown in the Innate tab — exclude them here
const allEntries = computed(() =>
  (rawEntries.value ?? []).filter((e) => !e.source_type || e.source_type === "class"),
);
const { mutate: removeSpell, isPending: isRemoving } = useRemoveCharacterSpellById();
const { mutate: togglePreparedMutation, isPending: isToggling } = useTogglePrepared();
const { mutateAsync: commitCast } = useCastCharacterSpell();
const { sendFlavorMessage, sendRoll } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();
const { promptRoll } = usePromptedRoll();
const { data: partyList } = useParty();
const { prepareConcentration } = useConcentration();
const thisMember = computed(() =>
  props.partyMemberId && partyList.value
    ? (partyList.value.find((m) => m.id === props.partyMemberId) ?? null)
    : null,
);
const playerUi = usePlayerUiStore();
const toast = useToast();
const { ruleset } = useRuleset();
const { candidate: replacementCandidate, choose: chooseReplacement, clear: clearReplacement } = useSpellReplacement();

// ── Modal ──────────────────────────────────────────────────────────────────────
const selectedEntry = ref<CharacterSpellEntry | null>(null);
const pendingResolution = ref<{ spell: Spell; castLevel: number; modifier: number; metamagicNames: string[]; damageType: string | null } | null>(null);

// ── Slot helpers ───────────────────────────────────────────────────────────────
const { setSlotUsed: writeSlotUsed } = useSpellSlotWrite();
async function setSlotUsed(target: SpellSlotEntry, used: number) {
  if (!props.partyMemberId) return;
  await writeSlotUsed({ id: props.partyMemberId, spell_slots: props.spellSlots }, target, used);
}

// ── Multiclass-aware stat lookup ───────────────────────────────────────────────

/** Pick the spellcasting stats for a spell entry, matching on source_class_id. */
function statsFor(entry: CharacterSpellEntry): SpellcastingClassStats | null {
  return pickSpellcastingStats(props.spellcastingByClass ?? [], entry.source_class_id);
}
function attackBonusFor(entry: CharacterSpellEntry): number | null {
  return grantAttackBonus(entry, thisMember.value, statsFor(entry), props.spellAttackBonus);
}
function saveDcFor(entry: CharacterSpellEntry): number | null {
  const base = grantSaveDc(entry, thisMember.value, statsFor(entry), props.spellSaveDc);
  return base === null ? null : base + (innateActive.value && isSorcererSpell(entry) ? 1 : 0);
}

function isSorcererSpell(entry: CharacterSpellEntry): boolean {
  const stats = statsFor(entry);
  if (stats) return stats.className === "Sorcerer" && stats.definitionKind !== "custom";
  return props.memberClass === "Sorcerer" && (props.sorcererLevel ?? 0) > 0;
}

// ── Standalone roll actions (independent of casting / spending a slot) ──────────

/** Roll a spell attack: d20 + the caster's spell attack bonus for this spell. */
async function rollSpellAttack(entry: CharacterSpellEntry, override: RollMode | null = null) {
  const atk = attackBonusFor(entry);
  if (atk === null) return;
  const innateAdvantage = innateActive.value && isSorcererSpell(entry);
  const mode: RollMode = innateAdvantage
    ? (override === "disadvantage" ? "normal" : "advantage")
    : (override ?? "normal");
  const modeTag = mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
  await promptRoll({
    counts: { 20: 1 },
    modifier: atk,
    label: `${entry.spell.name}: Spell Attack${modeTag}`,
    mode,
  });
}

/** Announce a saving throw (DC + ability) to the table so others can roll against it. */
async function promptSpellSave(entry: CharacterSpellEntry) {
  const dc = saveDcFor(entry);
  if (dc === null) return;
  const ability = entry.spell.save_attribute ?? "";
  const effect =
    entry.spell.save_effect === "half" ? " (half on save)"
    : entry.spell.save_effect === "negates" ? " (negates on save)"
    : "";
  await sendFlavorMessage(`calls for a DC ${dc} ${ability} saving throw vs ${entry.spell.name}${effect}`, "spell").catch((e) => reportChatFailure(e, "announce the saving throw in the chat"));
}

// ── Cast ───────────────────────────────────────────────────────────────────────
const isCasting = ref(false);
const lastCastLevels = ref<Record<string, number>>({});
const lastCastIds = ref<Record<string, string>>({});
const selectedMetamagic = ref<Record<string, string>>({});
const selectedSecondMetamagic = ref<Record<string, string>>({});
const transmutedDamageType = ref<Record<string, string>>({});
const innateClock = ref(Date.now());
let innateTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { innateTimer = setInterval(() => { innateClock.value = Date.now(); }, 1_000); });
onUnmounted(() => { if (innateTimer) clearInterval(innateTimer); });
const innateActive = computed(() => !!thisMember.value && isInnateSorceryActive(thisMember.value, innateClock.value));
const canCombineMetamagic = computed(() =>
  metamagicLimit(ruleset.value, props.sorcererLevel ?? 0, innateActive.value) === 2,
);

const { optionsByName: metamagicByName } = useMetamagicOptions();

function knownMetamagic(): MetamagicOption[] {
  const raw = thisMember.value?.class_choices?.metamagic_options;
  const names = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
  return names.map((name) => metamagicByName.value.get(name)).filter((option): option is MetamagicOption => !!option);
}

/** Post-roll options (Empowered/Seeking) the character knows and the spell qualifies for. */
function eligiblePostRollMetamagic(entry: CharacterSpellEntry): MetamagicOption[] {
  if (!isCastable(entry)) return [];
  return knownMetamagic().filter((option) =>
    option.post_roll
      && isMetamagicEligible(option, entry.spell, ruleset.value)
      // Damage rerolls need trustworthy imported damage mechanics.
      && (option.name !== "Empowered Spell" || entry.spell.mechanics_reviewed !== false),
  );
}

async function applyReactiveMetamagic(entry: CharacterSpellEntry, name: string) {
  if (!props.partyMemberId || isCasting.value) return;
  const parentCastId = lastCastIds.value[entry.id];
  if (!parentCastId) {
    toast.error(`Cast ${entry.spell.name} before applying ${name}.`);
    return;
  }
  isCasting.value = true;
  try {
    await commitCast({
      partyMemberId: props.partyMemberId,
      slotLevel: 0,
      pool: "spellcasting",
      slotTemplate: props.spellSlots,
      metamagicName: name,
      characterSpellId: entry.id,
      parentCastId,
    });
    await sendFlavorMessage(`uses ${name} on ${entry.spell.name}`, "spell").catch((e) => reportChatFailure(e, "announce the metamagic in the chat"));
    if (name === "Seeking Spell") await rollSpellAttack(entry);
    else toast.info("Reroll up to your Charisma modifier in damage dice; you must use the new rolls.");
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    isCasting.value = false;
  }
}

function eligibleMetamagic(entry: CharacterSpellEntry): MetamagicOption[] {
  return knownMetamagic().filter((option) =>
    !option.post_roll && isMetamagicEligible(option, entry.spell, ruleset.value),
  );
}

function eligibleSecondaryMetamagic(entry: CharacterSpellEntry): MetamagicOption[] {
  const first = selectedMetamagic.value[entry.id];
  return eligibleMetamagic(entry).filter((option) => option.name !== first);
}

function selectedMetamagicNames(entry: CharacterSpellEntry): string[] {
  return [selectedMetamagic.value[entry.id], selectedSecondMetamagic.value[entry.id]].filter((name): name is string => !!name);
}

function transmutedChoices(entry: CharacterSpellEntry): readonly string[] {
  const original = new Set((entry.spell.damage_rolls ?? []).map((roll) => roll.type.toLowerCase()));
  return TRANSMUTABLE_DAMAGE_TYPES.filter((type) => !original.has(type));
}

function lastCastLevel(entry: CharacterSpellEntry): number {
  return lastCastLevels.value[entry.id] ?? entry.spell.level;
}

function openEffectResolution(entry: CharacterSpellEntry, castLevel: number, metamagicNames = selectedMetamagicNames(entry)) {
  const stats = statsFor(entry);
  pendingResolution.value = {
    spell: entry.spell,
    castLevel,
    modifier: (stats?.attack ?? props.spellAttackBonus ?? 0) - (thisMember.value?.proficiency_bonus ?? 0),
    metamagicNames,
    damageType: metamagicNames.includes("Transmuted Spell") ? (transmutedDamageType.value[entry.id] || null) : null,
  };
}

/** A spell is castable if it's prepared, a cantrip, or the caster always has it ready (known casters). */
function isCastable(entry: CharacterSpellEntry): boolean {
  if (props.viewMode === "prepared") return true;
  if ((statsFor(entry)?.casterType ?? props.casterType) === "known") return true;
  return entry.is_prepared || entry.spell.level === 0;
}

const { ritualStyleFor } = useRitualStyles();

function isRitualCastable(entry: CharacterSpellEntry): boolean {
  const sourceClass = statsFor(entry)?.className ?? props.memberClass;
  return canCastAsRitual({
    ritualStyle: ritualStyleFor(sourceClass, statsFor(entry)?.definitionKind !== "custom"),
    hasRitualTag: entry.spell.ritual,
    isReadyToCast: isCastable(entry),
    isInSpellbook: props.viewMode === "spellbook",
  });
}

function castRitual(entry: CharacterSpellEntry) {
  if (!isRitualCastable(entry)) return;
  void castSpell(entry, entry.spell.level, { ritual: true });
}

function slotAvailable(level: number): boolean {
  return canCastWithSlot(level, props.spellSlots);
}

/** Why Cast is unavailable for this spell, in words the player can act on; null when it can be cast. */
function castBlockedReason(entry: CharacterSpellEntry): string | null {
  return slotAvailable(entry.spell.level)
    ? null
    : `No slot of level ${entry.spell.level} or higher is left. Tap a slot above to restore one after a rest.`;
}

function castButtonTitle(entry: CharacterSpellEntry): string {
  if (entry.spell.level === 0) return "Cast cantrip";
  const available = availableSlotsForSpell(entry.spell.level, props.spellSlots);
  if (available.length === 0) return "No suitable slots remaining";
  const lowest = available[0].level;
  return `Cast: spend one ${SLOT_LEVEL_LABELS[lowest - 1]}-level slot`;
}

// ── Upcast picker ──────────────────────────────────────────────────────────────
const pendingCastEntry = ref<CharacterSpellEntry | null>(null);

function castFromModal() {
  const entry = selectedEntry.value;
  selectedEntry.value = null;
  if (entry) startCast(entry);
}

/** Prepare or Unprepare for the detail modal; null where this tab cannot change it. */
function modalPrepareAction(entry: CharacterSpellEntry): "prepare" | "unprepare" | null {
  if (entry.spell.level === 0 || entry.always_prepared) return null;
  if (showPrepareToggle.value) return entry.is_prepared ? "unprepare" : "prepare";
  return props.viewMode === "prepared" ? "unprepare" : null;
}

function prepareFromModal() {
  const entry = selectedEntry.value;
  if (!entry) return;
  selectedEntry.value = null;
  if (showPrepareToggle.value) togglePrepare(entry);
  else handleRemove(entry);
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
  const available = availableSlotsForSpell(base, props.spellSlots);
  // One valid option uses that actual slot level (important for Pact Magic).
  if (available.length === 1) {
    void castSpell(entry, available[0].level, { pool: slotPool(available[0]) });
    return;
  }
  // Multiple levels available → show picker
  pendingCastEntry.value = entry;
}

function confirmCast(slot: SpellSlotEntry) {
  if (!pendingCastEntry.value) return;
  const entry = pendingCastEntry.value;
  pendingCastEntry.value = null;
  void castSpell(entry, slot.level, { pool: slotPool(slot) });
}

async function rollSpellDamage(entry: CharacterSpellEntry, castLevel: number, damageTypeOverride?: string | null) {
  const spell = entry.spell;
  const extraLevels = Math.max(0, castLevel - spell.level);
  const cantripMult = spell.level === 0 ? cantripDiceMultiplier(props.memberLevel ?? 1) : 1;
  for (const dmg of spell.damage_rolls ?? []) {
    let diceSrc = (extraLevels > 0 && spell.higher_level_damage)
      ? scaleExpression(dmg.dice, extraLevels, spell.higher_level_damage.dice_per_level)
      : dmg.dice;
    if (cantripMult > 1) diceSrc = scaleExpression(dmg.dice, cantripMult - 1, dmg.dice);
    const parsed = parseExpression(diceSrc);
    if (!parsed) {
      toast.error(`Cannot roll unsupported damage expression: ${diceSrc}`);
      continue;
    }
    const resolvedType = damageTypeOverride || dmg.type;
    const typeLabel = resolvedType ? ` ${resolvedType}` : "";
    let label = `${spell.name}: ${diceSrc}${typeLabel} damage`;
    if (spell.attack_type === "save" && spell.save_effect === "half") {
      label += ` (half on ${spell.save_attribute ?? "save"})`;
    }
    const counts = parsedToCounts(parsed.terms);
    if (Object.keys(counts).length === 0) {
      const { total, breakdown } = rollParsed(parsed);
      sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true }).catch((e) => reportChatFailure(e, "post the roll to the chat"));
    } else {
      await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
    }
  }
}

async function rollSpellHealing(entry: CharacterSpellEntry, castLevel: number) {
  const spell = entry.spell;
  if (!spell.healing_dice) return;
  const extraLevels = Math.max(0, castLevel - spell.level);
  const diceSrc = (extraLevels > 0 && spell.higher_level_healing)
    ? scaleExpression(spell.healing_dice, extraLevels, spell.higher_level_healing)
    : spell.healing_dice;
  const parsed = parseExpression(diceSrc);
  if (!parsed) {
    toast.error(`Cannot roll unsupported healing expression: ${diceSrc}`);
    return;
  }
  const label = `${spell.name}: ${diceSrc} healing`;
  const counts = parsedToCounts(parsed.terms);
  if (Object.keys(counts).length === 0) {
    const { total, breakdown } = rollParsed(parsed);
    sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: false }).catch((e) => reportChatFailure(e, "post the roll to the chat"));
  } else {
    await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: false });
  }
}

async function castSpell(
  entry: CharacterSpellEntry,
  castLevel: number,
  options: { ritual?: boolean; pool?: SpellSlotPool; metamagicName?: string | null } = {},
) {
  if (!props.partyMemberId || isCasting.value) return;
  isCasting.value = true;
  try {
    const spell = entry.spell;
    const isRitual = options.ritual === true;
    const metamagicName = options.metamagicName ?? (selectedMetamagic.value[entry.id] || null);
    const metamagicNames = options.metamagicName
      ? [options.metamagicName]
      : [metamagicName, canCombineMetamagic.value ? selectedSecondMetamagic.value[entry.id] : null]
        .filter((name): name is string => !!name);
    const transmutedType = metamagicNames.includes("Transmuted Spell") ? transmutedDamageType.value[entry.id] : null;
    if (metamagicNames.includes("Transmuted Spell") && !transmutedType) {
      toast.error("Choose the new damage type for Transmuted Spell.");
      return;
    }
    const extraLevels = isRitual ? 0 : castLevel - spell.level;
    lastCastLevels.value = { ...lastCastLevels.value, [entry.id]: castLevel };

    let concentrationState: ConcentrationState | null = null;
    if (spell.concentration && thisMember.value) {
      concentrationState = await prepareConcentration(thisMember.value, spell, { castAtLevel: castLevel });
      if (!concentrationState) return;
    }

    // Slot debit and concentration replacement share one row-locked transaction.
    const castResult = await commitCast({
      partyMemberId: props.partyMemberId,
      slotLevel: isRitual ? 0 : castLevel,
      pool: options.pool ?? "spellcasting",
      slotTemplate: props.spellSlots,
      concentrationState,
      metamagicNames,
      metamagicChoices: transmutedType ? { transmuted_damage_type: transmutedType } : {},
      characterSpellId: entry.id,
    });
    const castId = (castResult as { cast_id?: string }).cast_id;
    if (castId) lastCastIds.value = { ...lastCastIds.value, [entry.id]: castId };

    // Flavor text
    let text = `casts ${spell.name}`;
    if (isRitual) text += " as a ritual";
    else if (extraLevels > 0) text += ` (upcast ${SLOT_LEVEL_LABELS[castLevel - 1]})`;
    if (metamagicNames.length) text += ` with ${metamagicNames.join(" and ")}`;
    const atk = attackBonusFor(entry);
    const dc  = saveDcFor(entry);
    if (castLevel > 0 && atk !== null
      && (spell.attack_type === "ranged_spell" || spell.attack_type === "melee_spell")) {
      text += ` · Atk ${signedNum(atk)}`;
    } else if (castLevel > 0 && dc !== null && spell.attack_type === "save") {
      text += ` · DC ${dc} ${spell.save_attribute ?? ""}`;
    }
    await sendFlavorMessage(text, "spell").catch((e) => reportChatFailure(e, "announce the cast in the chat"));
    if (concentrationState) {
      await sendFlavorMessage(`begins concentrating on ${spell.name}`, spell.name).catch((e) => reportChatFailure(e, "announce the cast in the chat"));
    }

    if (spell.mechanics_reviewed !== false && spell.effects?.length) {
      openEffectResolution(entry, castLevel, metamagicNames);
    } else if (spell.mechanics_reviewed === false) {
      toast.info("Imported mechanics are unreviewed; resolve this spell manually from its rules text.");
    }

    if (!spell.effects?.length && spell.damage_rolls?.length && canAutoRollSpellEffect(spell.attack_type, "damage", spell.mechanics_reviewed !== false)) {
      await rollSpellDamage(entry, castLevel, transmutedType);
    }
    if (!spell.effects?.length && spell.healing_dice && canAutoRollSpellEffect(spell.attack_type, "healing", spell.mechanics_reviewed !== false)) {
      await rollSpellHealing(entry, castLevel);
    }
    selectedMetamagic.value = { ...selectedMetamagic.value, [entry.id]: "" };
    selectedSecondMetamagic.value = { ...selectedSecondMetamagic.value, [entry.id]: "" };
    transmutedDamageType.value = { ...transmutedDamageType.value, [entry.id]: "" };

  } catch (error) {
    toast.error(toast.fromError(error));
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
  if (props.viewMode === "prepared") return allEntries.value.filter((e) => e.is_prepared || (e.spell?.level ?? 1) === 0);
  return allEntries.value.filter((e) => !!e.spell);
});

const levelGroups = computed(() => {
  const map = new Map<number, CharacterSpellEntry[]>();
  for (const e of displayedEntries.value) {
    const lvl = e.spell?.level ?? 0;
    if (!map.has(lvl)) map.set(lvl, []);
    map.get(lvl)!.push(e);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, entries]) => ({ level, entries }));
});

// ── Empty state messaging ──────────────────────────────────────────────────────
const emptyIcon = computed(() => (props.viewMode === "prepared" ? IconFire : IconPopulate));

const emptyTitle = computed(() => {
  if (props.viewMode === "prepared") return "Nothing prepared";
  if (props.casterType === "spellbook") return "Spellbook is empty";
  return "No spells learned yet";
});

const emptyBody = computed(() => {
  if (props.viewMode === "prepared" && props.casterType === "spellbook")
    return 'Open your Spellbook tab and tap "Prepare" on the spells you want ready today.';
  if (props.viewMode === "prepared")
    return `Browse "All ${props.memberClass} Spells" and tap "Prepare" to add spells to today's list.`;
  if (props.casterType === "spellbook")
    return 'Browse "All Spells" and tap "Add" to copy spells into your spellbook.';
  return 'Browse "All Spells" and tap "Learn" to add spells to your list.';
});

// ── Remove ─────────────────────────────────────────────────────────────────────
const removeTitle = computed(() => {
  if (props.viewMode === "prepared" && props.casterType !== "spellbook") return "Unprepare";
  return "Remove from spellbook";
});

function handleRemove(entry: CharacterSpellEntry) {
  if (!props.partyMemberId) return;
  const sourceStats = statsFor(entry);
  const sourceClassName = sourceStats?.className ?? props.memberClass;
  const policy = sourceStats?.definitionKind === "custom"
    ? null
    : getSpellPreparationPolicy(sourceClassName, ruleset.value);
  const sourceCasterType = policy?.casterType ?? sourceStats?.casterType ?? props.casterType;
  if (sourceCasterType === "spellbook" && props.viewMode === "prepared") {
    togglePreparedMutation({ id: entry.id, partyMemberId: props.partyMemberId, isPrepared: false });
    return;
  }
  if (policy && entry.spell.level > 0 && sourceCasterType !== "spellbook") {
    chooseReplacement(entry);
    toast.info(`Choose a new ${sourceClassName} spell in All Spells to replace ${entry.spell.name}.`);
    return;
  }
  removeSpell({ partyMemberId: props.partyMemberId, id: entry.id });
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
// Always-prepared (oath/domain/subclass-granted) spells are prepared for free
// and must NOT count against the prepared-spell limit.
const preparedNonCantrips = computed(() => countPreparedAgainstLimit(displayedEntries.value));
const showPreparedCounter = computed(
  () => props.viewMode === "prepared" && props.maxPrepared !== null && props.maxPrepared !== undefined,
);
const preparedCounterClass = computed(() => {
  if (props.maxPrepared === null || props.maxPrepared === undefined) return "";
  const n = preparedNonCantrips.value;
  if (n > props.maxPrepared) return "text-destructive";
  if (n === props.maxPrepared) return "text-ink-caution";
  return "text-ink-success";
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
