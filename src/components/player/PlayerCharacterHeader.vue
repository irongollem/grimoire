<template>
  <!--
    The top of a character's sheet, laid out like the head of the 2024 sheet:
    the portrait as a plate inset in the paper, then name and class with the
    numbers a player reads out most (AC, initiative, speed, proficiency, hit
    dice), then hit points with their controls, then rest and conditions. The
    parent owns the card; the ability boxes close it underneath.
  -->
  <div class="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap sm:gap-4">
    <!-- Portrait (beast image when wildshaped) -->
    <div class="card-plate relative h-27 w-18 shrink-0 overflow-hidden rounded-md bg-muted/50 sm:h-30 sm:w-20">
      <MiniPortraitOverlay :source="{ table: 'party_members', id: member.id }">
        <FocalImage
          v-if="portrait.src"
          :src="portrait.src"
          :alt="portrait.alt"
          format="portrait"
          :focal-point="portrait.focalPoint"
          :lightbox="true"
        />
        <span
          v-else
          class="absolute inset-0 flex items-center justify-center text-display font-bold text-muted-foreground"
        >{{ wildshape ? wildshape.beast_name.charAt(0) : member.name.charAt(0) }}</span>
      </MiniPortraitOverlay>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-2.5">
      <!-- Identity -->
      <div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <h1 class="text-heading font-bold text-foreground leading-tight truncate">
              {{ wildshape ? wildshape.beast_name : member.name }}
            </h1>
            <AppButton
              v-if="!wildshape"
              variant="ghost"
              size="inline-xs"
              :active="member.inspiration"
              active-fill="none"
              class="shrink-0"
              :class="member.inspiration ? '' : 'text-muted-foreground/30 hover:text-muted-foreground/60'"
              tooltip="Inspiration"
              @click="toggleInspiration"
            >
              <template #icon>
                <IconStar class="h-3.5 w-3.5" :class="member.inspiration ? 'fill-current' : ''" />
              </template>
            </AppButton>
          </div>
          <p class="text-caption text-muted-foreground italic">
            <template v-if="wildshape">🐺 {{ member.name }}</template>
            <template v-else>{{ [speciesName, member.subrace, classLabel].filter(Boolean).join(" · ") }}</template>
            <span v-if="!wildshape && memberTotalLevel" class="font-cinzel text-2xs text-primary not-italic ml-1">Lv {{ memberTotalLevel }}</span>
          </p>
          <!-- XP progress -->
          <div v-if="xpLevellingEnabled && !wildshape && ((member.experience_points ?? 0) > 0 || readyToLevelUp)" class="mt-1 flex items-center gap-1.5">
            <span class="text-eyebrow text-muted-foreground">XP</span>
            <div class="flex-1 max-w-32 h-1 rounded-full bg-muted overflow-hidden">
              <div class="h-full transition-all"
                :class="readyToLevelUp ? 'bg-primary' : 'bg-primary/50'"
                :style="{ width: `${xpPct}%` }" />
            </div>
            <span class="font-cinzel text-2xs text-muted-foreground">
              {{ member.experience_points ?? 0 }}<template v-if="xpToNext !== null"> / {{ xpToNext }}</template>
            </span>
            <!-- DM: emit event (player /play/* routes aren't accessible to DMs) -->
            <AppButton
              v-if="readyToLevelUp && auth.isDM"
              variant="link"
              size="inline-xs"
              class="ml-0.5"
              label="Ready ↑"
              @click="emit('level-up')"
            />
            <!-- Player: link to the level-up flow -->
            <AppButton
              v-else-if="readyToLevelUp && !hidePlayerActions"
              variant="link"
              size="inline-xs"
              class="ml-0.5"
              :to="`/play/character/levelup?memberId=${member.id}`"
              label="Ready ↑"
            />
          </div>
        </div>

      </div>

      <!-- Hit points: readout, meter, then the controls that change it -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div class="flex items-baseline gap-1.5">
          <span class="text-label text-muted-foreground">Hit points</span>
          <span class="text-title font-bold leading-none" :class="hpColor">{{ displayHp }}</span>
          <span class="text-body text-muted-foreground">/ {{ displayMaxHp }}</span>
          <AppButton
            v-if="member.temp_hp"
            variant="link"
            tone="info"
            size="inline-xs"
            tooltip="Click to clear temp HP"
            @click="clearTempHp"
          >+{{ member.temp_hp }} temp <span class="text-tone-info/50">×</span></AppButton>
        </div>
        <div
          class="h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-32"
          role="meter"
          aria-label="Hit points"
          :aria-valuenow="displayHp"
          aria-valuemin="0"
          :aria-valuemax="displayMaxHp"
        >
          <div class="flex h-full">
            <div class="h-full transition-all" :class="hpBarColor" :style="{ width: `${hpBarWidthPct}%` }" />
            <div v-if="tempHpBarPct > 0" class="h-full transition-all bg-tone-info" :style="{ width: `${tempHpBarPct}%` }" />
          </div>
        </div>
        <div class="flex items-center gap-1">
          <AppInput
            v-model.number="hpInput"
            type="number"
            tone="muted"
            size="xs"
            align="center"
            min="0"
            placeholder="0"
            aria-label="Amount"
            class="w-10"
            @keydown="blockInvalidChars"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <AppButton variant="tinted" size="xs" tone="danger" emphasis="soft" label="Damage" @click="applyDamage" />
          <AppButton variant="tinted" size="xs" tone="success" emphasis="soft" label="Heal" @click="applyHeal" />
          <AppButton variant="tinted" size="xs" tone="info" emphasis="soft" label="Temp" @click="applyTempHp" />
        </div>
        <span v-if="attackDisadvantage" class="text-label text-ink-caution px-1.5 py-0.5 rounded bg-tone-caution/10 border border-tone-caution/20" title="Disadvantage on attack rolls">⚔ Dis</span>
        <span v-if="checkDisadvantage"  class="text-label text-ink-caution px-1.5 py-0.5 rounded bg-tone-caution/10 border border-tone-caution/20" title="Disadvantage on ability checks">✦ Dis</span>
        <span v-if="exhaustionD20Penalty !== 0" class="text-label text-ink-caution px-1.5 py-0.5 rounded bg-tone-caution/10 border border-tone-caution/20" title="Exhaustion penalty on every d20 Test (attack rolls, ability checks, saving throws)">{{ exhaustionD20Penalty }} d20</span>
        <AppButton
          v-if="member.concentration"
          variant="tinted"
          tone="arcane"
          emphasis="soft"
          size="xs"
          :tooltip="`Concentrating on ${member.concentration.spellName} — click to drop`"
          @click="dropConcentration"
        >✦ Conc: {{ member.concentration.spellName }} <span class="text-muted-foreground">×</span></AppButton>
      </div>

      <!-- Rest, then the conditions on the character and the picker that adds one -->
      <div class="flex flex-wrap items-center gap-1.5">
        <RestButtons :member="member" />
        <slot name="conditions" />
        <AppButton
          ref="conditionPickerBtn"
          variant="subtle"
          size="toolbar"
          :icon="IconAdd"
          icon-size="xs"
          class="border-dashed"
          label="Condition"
          tooltip="Add condition"
          @click="openConditionPicker"
        />

        <Teleport to="body">
          <template v-if="showConditionPicker">
            <div class="fixed inset-0 z-40" @click="showConditionPicker = false" />
            <div
              class="fixed z-50 w-52 rounded-lg border border-border bg-card shadow-xl overflow-hidden"
              :style="{ top: pickerPos.top + 'px', right: pickerPos.right + 'px' }"
            >
              <div class="p-2 border-b border-border">
                <AppInput
                  ref="conditionSearchInput"
                  v-model="conditionSearch"
                  type="text"
                  tone="muted"
                  size="body-xs"
                  placeholder="Search conditions…"
                  @keydown.escape="showConditionPicker = false"
                />
              </div>
              <div class="max-h-56 overflow-y-auto">
                <AppButton
                  v-for="cond in filteredConditions"
                  :key="cond"
                  variant="menu"
                  block
                  size="sm"
                  :tone="hasCondition(cond) ? 'danger' : 'caution'"
                  :fill="hasCondition(cond) ? 'none' : 'tone'"
                  :disabled="hasCondition(cond)"
                  :label="cond"
                  :tooltip="getConditionDescription(cond, ruleset)"
                  @click="addCondition(cond)"
                />
              </div>
            </div>
          </template>
        </Teleport>
      </div>
    </div>

    <!-- Reference numbers, boxed as on the 2024 sheet: Armor Class in its
         shield, the rest in small frames with the label beneath. Read at the
         table, never rolled from here. A row of five under the portrait on a
         phone; a block beside the name from sm up. -->
    <dl class="grid basis-full grid-cols-5 gap-1.5 sm:flex sm:basis-auto sm:shrink-0 sm:gap-2">
      <div v-for="cs in combatStats" :key="cs.label" class="flex min-w-0 flex-col-reverse items-center gap-1">
        <dt class="text-center text-label leading-tight text-muted-foreground">
          <span class="sm:hidden">{{ cs.short }}</span><span class="max-sm:hidden">{{ cs.label }}</span>
        </dt>
        <dd class="relative flex h-12 w-full items-center justify-center font-cinzel text-heading font-bold leading-none text-foreground sm:w-16">
          <svg
            v-if="cs.shield"
            viewBox="0 0 40 48"
            class="absolute inset-y-0 left-1/2 h-full -translate-x-1/2 text-border"
            fill="none"
            aria-hidden="true"
          >
            <path d="M20 1.5 37.5 7v15.5c0 11.2-7.4 19.6-17.5 24C9.9 42.1 2.5 33.7 2.5 22.5V7Z" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span v-else class="absolute inset-0 rounded-md border border-border" aria-hidden="true" />
          <span class="relative -mt-0.5">{{ cs.value }}<span v-if="cs.suffix" class="ml-0.5 text-label font-normal text-muted-foreground">{{ cs.suffix }}</span></span>
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { IconAdd, IconStar } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useShieldAcBonus } from "@/composables/party/useShieldAc";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import { useClassHitDice } from "@/composables/party/useClassHitDice";
import { useConcentration } from "@/composables/party/useConcentration";
import { applyDamage as damagePools, applyHealing as healPools, betterTempHp, formHpPools } from "@/rules/hitPoints";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  hasAttackDisadvantage,
  hasCheckDisadvantage,
  getExhaustionD20Penalty,
} from "@/rules/conditions";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { xpForNextLevel, xpForLevel, levelForXp } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";
import { formPortrait } from "@/lib/wildshapePortrait";
import { walkingSpeed } from "@/lib/movement";
import { useAllSpecies } from "@/composables/rules/useSpecies";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import FocalImage from "@/components/common/FocalImage.vue";
import RestButtons from "@/components/player/RestButtons.vue";
import MiniPortraitOverlay from "@/components/simulacrum/MiniPortraitOverlay.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";

const props = defineProps<{
  member: PartyMember;
  wildshape?: WildshapeState;
  /** The beast's speed string while wild-shaped; its walking speed replaces the character's. */
  beastSpeed?: string | null;
  hidePlayerActions?: boolean;
}>();
const portrait = computed(() => formPortrait(props.member, props.wildshape));
const emit = defineEmits<{ (e: "level-up"): void }>();

const { data: allSpecies } = useAllSpecies();
const speciesName = computed(() =>
  (allSpecies.value ?? []).find(s => s.id === props.member.species_id)?.name ?? null,
);

const auth = useAuthStore();
const xpLevellingEnabled = useIsRuleEnabled("xp_levelling");
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { rollConcentrationSave, endConcentration } = useConcentration();

const hpInput = ref<number | null>(null);

function blockInvalidChars(e: KeyboardEvent) {
  if (["+", "-", "e", "E"].includes(e.key)) e.preventDefault();
}

const showConditionPicker = ref(false);
const conditionSearch = ref("");
const conditionSearchInput = ref<AppInputHandle | null>(null);
const conditionPickerBtn = ref<HTMLElement | null>(null);
const pickerPos = ref({ top: 0, right: 0 });

function openConditionPicker() {
  const rect = conditionPickerBtn.value?.getBoundingClientRect();
  if (rect) pickerPos.value = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
  showConditionPicker.value = true;
  conditionSearch.value = "";
  nextTick(() => conditionSearchInput.value?.focus());
}

const filteredConditions = computed(() => {
  const q = conditionSearch.value.toLowerCase();
  const hasExhaustion = getExhaustionLevel(props.member.conditions ?? []) > 0;
  return CONDITIONS.filter((c) => {
    if (!c.toLowerCase().includes(q)) return false;
    if (c === "Exhaustion") return !hasExhaustion;
    return true;
  });
});
function hasCondition(cond: string) {
  if (cond === "Exhaustion") return getExhaustionLevel(props.member.conditions ?? []) > 0;
  return props.member.conditions?.includes(cond) ?? false;
}
async function addCondition(cond: string) {
  if (hasCondition(cond)) return;
  showConditionPicker.value = false;
  const updated = cond === "Exhaustion"
    ? setExhaustionLevel(props.member.conditions ?? [], 1)
    : [...(props.member.conditions ?? []), cond];
  await updateMember({ id: props.member.id, update: { conditions: updated } });
}

const memberIdRef = computed(() => props.member.id);
const { data: characterClasses } = useCharacterClasses(memberIdRef);
const { hitDieOf } = useClassHitDice();

/**
 * Hit dice composition by die size. For a single-class character this is
 * `[{ die: 10, count: 5 }]`. A Fighter 5 / Wizard 3 returns
 * `[{ die: 10, count: 5 }, { die: 6, count: 3 }]`.
 */
const hitDicePool = computed<{ die: number; count: number }[]>(() => {
  // A classless character has no hit dice to roll.
  const list = characterClasses.value ?? [];
  const byDie = new Map<number, number>();
  for (const c of list) {
    // Read from the row's pinned definition; unresolved (still loading) adds nothing.
    const d = hitDieOf(c);
    if (d === null) continue;
    byDie.set(d, (byDie.get(d) ?? 0) + c.levels);
  }
  return Array.from(byDie.entries())
    .map(([die, count]) => ({ die, count }))
    .sort((a, b) => b.die - a.die);
});

/**
 * Compact label for the HD chip. Single-die shows the bare die size ("d10")
 * so the count can be read from the chip value. Heterogeneous multiclass
 * shows the full pool ("5d10+3d6") since one count no longer tells the
 * full story. Spend tracking remains a single counter — proper per-die
 * spend is a follow-up once the rest dialog is multiclass-aware.
 */
const hitDicePoolLabel = computed(() => {
  const pool = hitDicePool.value;
  if (pool.length === 0) return "";
  if (pool.length === 1) return `d${pool[0].die}`;
  return pool.map((p) => `${p.count}d${p.die}`).join("+");
});

/**
 * Total character level. Sum of the `character_classes` rows; a classless
 * character has none, so its own `party_members.level` stands.
 */
const memberTotalLevel = computed(() => {
  const list = characterClasses.value ?? [];
  return list.length > 0 ? totalLevel(list) : props.member.level;
});

/**
 * Label rendered next to the name: "Fighter 5 / Wizard 3" when multiclass,
 * the single class and subclass otherwise, nothing for a classless character.
 */
const classLabel = computed(() => {
  const list = characterClasses.value ?? [];
  if (list.length > 1) return formatMulticlassLabel(list);
  if (list.length === 1) {
    const only = list[0];
    const parts = [only.class_name, only.subclass_name].filter(Boolean);
    return parts.join(" · ");
  }
  return "";
});

const hitDiceRemaining = computed(() =>
  Math.min(memberTotalLevel.value, props.member.hit_dice_remaining ?? memberTotalLevel.value),
);

// When wildshaped, display beast AC/HP; otherwise real member stats.
// An equipped shield adds its bonus on top of the stored (shieldless) AC,
// but never to a beast form — gear merges into the form while wildshaped.
const { acFor } = useShieldAcBonus();
const hpPools = computed(() => formHpPools(props.member, props.wildshape));

const displayHp    = computed(() => props.wildshape?.beast_hp    ?? props.member.current_hp);
const displayMaxHp = computed(() => props.wildshape?.beast_max_hp ?? props.member.max_hp);
const displayAc    = computed(() => props.wildshape?.beast_ac     ?? acFor(props.member));

// Initiative = DEX mod + initiative_bonus (feat/special extras like Alert).
const initiativeDisplay = computed(() => {
  const total = Math.floor((props.member.dex - 10) / 2) + (props.member.initiative_bonus ?? 0);
  return total >= 0 ? `+${total}` : `${total}`;
});

const combatStats = computed(() => [
  { label: "Armor Class", short: "AC",       value: displayAc.value, suffix: "", shield: true },
  { label: "Initiative",  short: "Init",     value: initiativeDisplay.value, suffix: "", shield: false },
  { label: "Speed",       short: "Speed",    value: (props.wildshape ? walkingSpeed(props.beastSpeed) : null) ?? props.member.speed, suffix: "ft", shield: false },
  { label: "Proficiency", short: "Prof",     value: `+${props.member.proficiency_bonus}`, suffix: "", shield: false },
  { label: "Hit Dice",    short: "Hit Dice", value: `${hitDiceRemaining.value}/${memberTotalLevel.value}`, suffix: hitDicePoolLabel.value, shield: false },
]);

const hpPct = computed(() => {
  if (displayMaxHp.value === 0) return 0;
  return Math.max(0, Math.min(100, (displayHp.value / displayMaxHp.value) * 100));
});
// Temp HP is a buffer in front of whatever HP pool is active — it persists
// through Wild Shape and is spent before the beast's hit points, so the bar
// shows it in beast form too.
const tempHpBarPct = computed(() => {
  const temp = props.member.temp_hp ?? 0;
  if (temp <= 0 || displayMaxHp.value === 0) return 0;
  return (temp / (displayMaxHp.value + temp)) * 100;
});
const hpBarWidthPct = computed(() => {
  const temp = props.member.temp_hp ?? 0;
  const total = displayMaxHp.value + temp;
  if (total === 0) return 0;
  return Math.max(0, Math.min(100, (displayHp.value / total) * 100));
});

// XP progress — only meaningful when the campaign actually awards XP.
const xpToNext = computed(() => xpForNextLevel(props.member.level));
const xpPct = computed(() => {
  const xp = props.member.experience_points ?? 0;
  const floor = xpForLevel(props.member.level);
  const next = xpToNext.value;
  if (next === null) return 100; // Lv 20
  if (next <= floor) return 0;
  return Math.max(0, Math.min(100, ((xp - floor) / (next - floor)) * 100));
});
const readyToLevelUp = computed(() => {
  const xp = props.member.experience_points ?? 0;
  return levelForXp(xp) > props.member.level;
});
const hpColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "text-destructive";
  if (p < 33) return "text-destructive";
  if (p < 66) return "text-ink-caution";
  return "text-elven-green";
});
const hpBarColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-tone-caution";
  return "bg-elven-green";
});

const { ruleset } = useTableRuleset();
const attackDisadvantage = computed(() => hasAttackDisadvantage(props.member.conditions ?? [], ruleset.value));
const checkDisadvantage  = computed(() => hasCheckDisadvantage(props.member.conditions ?? [], ruleset.value));
const exhaustionD20Penalty = computed(() => getExhaustionD20Penalty(props.member.conditions ?? [], ruleset.value));

async function applyDamage() {
  if (!hpInput.value || hpInput.value <= 0) return;
  const dmg = hpInput.value;
  hpInput.value = null;

  // Temp HP absorbs first in either form, then the beast's HP — shared with the
  // encounter runner so DM-side and player-side damage agree.
  const out = damagePools(hpPools.value, dmg);
  const update: PartyMemberUpdate = { current_hp: out.current_hp };
  if (out.temp_hp !== props.member.temp_hp) update.temp_hp = out.temp_hp;
  if (props.wildshape) {
    // A 2024 form has no beast pool: it stays until the character drops to 0.
    if (out.reverted) update.wildshape_state = null;
    else if (out.beast_hp !== null) update.wildshape_state = { ...props.wildshape, beast_hp: out.beast_hp };
  }
  await updateMember({ id: props.member.id, update });

  const newHp = out.current_hp;
  if (props.member.concentration) {
    if (newHp === 0) {
      await endConcentration(props.member, { reason: "dropped to 0 HP" });
    } else {
      // Damage soaked by temp HP is still damage taken, so it still forces the
      // save (SAC ruling) — and concentration survives Wild Shape.
      await rollConcentrationSave(props.member, dmg);
    }
  }
}
async function applyHeal() {
  if (!hpInput.value || hpInput.value <= 0) return;
  const val = hpInput.value;
  hpInput.value = null;
  const out = healPools(hpPools.value, val);
  if (props.wildshape && out.beast_hp !== null) {
    await updateMember({ id: props.member.id, update: {
      wildshape_state: { ...props.wildshape, beast_hp: out.beast_hp },
    }});
    return;
  }
  const update: PartyMemberUpdate = { current_hp: out.current_hp };
  // Any healing from 0 or below ends the dying condition (5e) — clear the
  // death-save pips so a later drop to 0 starts fresh instead of with stale ones.
  if (props.member.current_hp <= 0 && out.current_hp > 0) {
    update.death_save_successes = 0;
    update.death_save_failures = 0;
  }
  await updateMember({ id: props.member.id, update });
}
async function applyTempHp() {
  if (!hpInput.value || hpInput.value <= 0) return;
  // Temp HP doesn't stack — a smaller new source never replaces a bigger pool.
  await updateMember({ id: props.member.id, update: { temp_hp: betterTempHp(props.member.temp_hp, hpInput.value) } });
  hpInput.value = null;
}
async function clearTempHp() {
  await updateMember({ id: props.member.id, update: { temp_hp: 0 } });
}

async function toggleInspiration() {
  await updateMember({ id: props.member.id, update: { inspiration: !props.member.inspiration } });
}

async function dropConcentration() {
  if (!props.member.concentration) return;
  await endConcentration(props.member, { reason: "dropped" });
}
</script>
