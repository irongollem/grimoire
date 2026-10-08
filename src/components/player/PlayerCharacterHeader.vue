<template>
  <!--
    The top of a character's sheet, laid out like the head of the 2024 sheet:
    the portrait as a plate inset in the paper, then name and class with the
    numbers a player reads out most (AC, initiative, speed, proficiency, hit
    dice), then hit points with their controls, then rest and conditions. The
    parent owns the card; the ability boxes close it underneath.
  -->
  <!-- The layout follows the header's own width, not the screen's: the five
       stat boxes beside the name need about 48rem, and a sheet card on a
       640–800px screen (or in a narrow pane) is far short of that, which
       squeezed the name and the hit point controls into a 130px column. -->
  <div class="@container">
  <div class="flex flex-wrap items-start gap-3 p-3 @3xl:flex-nowrap @3xl:gap-4">
    <!-- Portrait (beast image when wildshaped) -->
    <div class="card-plate relative h-27 w-18 shrink-0 overflow-hidden rounded-md bg-muted/50 @3xl:h-30 @3xl:w-20">
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

    <!-- On a phone the identity sits beside the portrait and the hit points and
         rest rows take the full width beneath it (`contents` hands them to the
         card's own wrap), so the controls get a thumb's width instead of what is
         left of the portrait. -->
    <div class="contents @3xl:flex @3xl:min-w-0 @3xl:flex-1 @3xl:flex-col @3xl:gap-2.5">
      <!-- Identity -->
      <div class="@max-3xl:min-w-0 @max-3xl:flex-1">
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
              class="shrink-0 max-md:-my-2.5 max-md:h-11 max-md:w-11 max-md:justify-center"
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
            <template v-else>{{ summary.line }}</template>
            <span v-if="!wildshape && summary.level" class="text-label text-primary not-italic ml-1">Lv {{ summary.level }}</span>
          </p>
          <SubclassVariantControl v-if="!wildshape" :member-id="member.id" />
          <p v-if="inGameDate" class="text-caption text-muted-foreground">{{ inGameDate }}</p>
          <!-- XP progress -->
          <div v-if="xpLevellingEnabled && !wildshape && ((member.experience_points ?? 0) > 0 || readyToLevelUp)" class="mt-1 flex items-center gap-1.5">
            <span class="text-eyebrow text-muted-foreground">XP</span>
            <div class="flex-1 max-w-32 h-1 rounded-full bg-muted overflow-hidden">
              <div class="h-full transition-all"
                :class="readyToLevelUp ? 'bg-primary' : 'bg-primary/50'"
                :style="{ width: `${xpPct}%` }" />
            </div>
            <span class="text-label text-muted-foreground">
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
      <div data-hp-row class="flex flex-wrap items-center gap-x-3 gap-y-1.5 @max-3xl:basis-full">
        <div class="flex items-baseline gap-1.5">
          <span class="text-label text-muted-foreground">Hit points</span>
          <span class="text-title font-bold leading-none" :class="hpColor">{{ displayHp }}</span>
          <span class="text-body text-muted-foreground">/ {{ displayMaxHp }}</span>
          <AppButton
            v-if="member.temp_hp"
            variant="link"
            tone="info"
            size="inline-xs"
            class="max-md:min-h-11 max-md:px-1"
            tooltip="Tap to clear temp HP"
            @click="clearTempHp"
          >+{{ member.temp_hp }} temp <span class="text-tone-info/50">×</span></AppButton>
        </div>
        <div
          class="h-1.5 w-24 overflow-hidden rounded-full bg-muted @3xl:w-32"
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
        <PlayerHpControls :member="member" :wildshape="wildshape" />
        <span v-if="exhaustionD20Penalty !== 0" class="text-label text-ink-caution px-1.5 py-0.5 rounded bg-tone-caution/10 border border-tone-caution/20" title="Exhaustion penalty on every d20 Test (attack rolls, ability checks, saving throws)">{{ exhaustionD20Penalty }} d20</span>
        <AppButton
          v-if="member.concentration"
          variant="tinted"
          tone="arcane"
          emphasis="soft"
          size="md"
          :tooltip="`Concentrating on ${member.concentration.spellName}. Tap to drop`"
          @click="dropConcentration"
        >✦ Conc: {{ member.concentration.spellName }} <span class="text-muted-foreground">×</span></AppButton>
      </div>

      <!-- Rest, then the conditions on the character and the picker that adds one -->
      <div class="flex flex-wrap items-center gap-1.5 @max-3xl:basis-full">
        <RestButtons :member="member" />
        <slot name="conditions" />
        <AppButton
          ref="conditionPickerBtn"
          variant="subtle"
          size="sm"
          :icon="IconAdd"
          icon-size="xs"
          class="border-dashed max-md:min-h-11"
          label="Condition"
          tooltip="Add condition"
          @click="openConditionPicker"
        />

        <Teleport to="body">
          <template v-if="showConditionPicker">
            <div class="fixed inset-0 z-40" @click="showConditionPicker = false" />
            <div
              data-slip class="fixed z-50 w-52 rounded-lg border border-border bg-card shadow-xl overflow-hidden"
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
                  class="max-md:min-h-11"
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
         phone; a block beside the name once the header is 48rem wide. -->
    <dl class="grid basis-full grid-cols-5 gap-1.5 @3xl:flex @3xl:basis-auto @3xl:shrink-0 @3xl:gap-2">
      <div v-for="cs in combatStats" :key="cs.label" class="flex min-w-0 flex-col-reverse items-center gap-1">
        <dt class="text-center text-label leading-tight text-muted-foreground">
          <span class="@3xl:hidden">{{ cs.short }}</span><span class="@max-3xl:hidden">{{ cs.label }}</span>
        </dt>
        <dd class="relative flex h-12 w-full items-center justify-center text-heading font-bold leading-none text-foreground @3xl:w-16">
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
          <AcBreakdownPopover v-if="cs.shield" :breakdown="acBreakdown" :beast-form="wildshape?.beast_name" />
          <span class="relative -mt-0.5">{{ cs.value }}<span v-if="cs.suffix" class="ml-0.5 text-label font-normal text-muted-foreground">{{ cs.suffix }}</span></span>
        </dd>
      </div>
    </dl>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, type ComponentPublicInstance } from "vue";
import { IconAdd, IconStar } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { characterSummary } from "@/lib/partyMemberDisplay";
import { memberInitiativeModifier } from "@/rules/initiative";
import { useClassHitDice } from "@/composables/party/useClassHitDice";
import { useConcentration } from "@/composables/party/useConcentration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  getExhaustionD20Penalty,
} from "@/rules/conditions";
import type { PartyMember } from "@/types/party.types";
import { xpForNextLevel, xpForLevel, levelForXp } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";
import { formPortrait } from "@/lib/wildshapePortrait";
import { walkingSpeed } from "@/lib/movement";
import { useAllSpecies } from "@/composables/rules/useSpecies";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import FocalImage from "@/components/common/FocalImage.vue";
import AcBreakdownPopover from "@/components/player/AcBreakdownPopover.vue";
import SubclassVariantControl from "@/components/player/SubclassVariantControl.vue";
import RestButtons from "@/components/player/RestButtons.vue";
import MiniPortraitOverlay from "@/components/simulacrum/MiniPortraitOverlay.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { hpTextClass } from "@/components/player/hpDisplay";
import PlayerHpControls from "@/components/player/PlayerHpControls.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";

const props = defineProps<{
  member: PartyMember;
  wildshape?: WildshapeState;
  /** The beast's speed string while wild-shaped; its walking speed replaces the character's. */
  beastSpeed?: string | null;
  hidePlayerActions?: boolean;
  /** DEX in effect: the Wild Shape form's while shaped. Defaults to the character's own. */
  effectiveDex?: number;
}>();
const portrait = computed(() => formPortrait(props.member, props.wildshape));
const emit = defineEmits<{ (e: "level-up"): void }>();

const { data: allSpecies } = useAllSpecies();
const speciesName = computed(() =>
  (allSpecies.value ?? []).find(s => s.id === props.member.species_id)?.name ?? null,
);

const auth = useAuthStore();
const campaignStore = useCampaignStore();
const calendarStore = useCalendarStore();

/** "Flamerule 12, 1495", on the character's own campaign only: the date the table is playing in. */
const inGameDate = computed(() => {
  const campaign = campaignStore.activeCampaign;
  if (!campaign || props.member.campaign_id !== campaign.id) return null;
  const month = calendarStore.adapter.months.find((m) => m.num === campaign.current_month);
  const monthName = month?.name ?? month?.alias ?? `Month ${campaign.current_month}`;
  return `${monthName} ${campaign.current_day}, ${campaign.current_year}`;
});
const xpLevellingEnabled = useIsRuleEnabled("xp_levelling");
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { endConcentration } = useConcentration();

const showConditionPicker = ref(false);
const conditionSearch = ref("");
const conditionSearchInput = ref<AppInputHandle | null>(null);
// An AppButton, so the ref is its component instance; the element is `$el`.
const conditionPickerBtn = ref<ComponentPublicInstance | null>(null);
const pickerPos = ref({ top: 0, right: 0 });

function openConditionPicker() {
  const rect = (conditionPickerBtn.value?.$el as HTMLElement | undefined)?.getBoundingClientRect();
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

/** Species / class line and total level (class rows summed; a classless character keeps its own level). */
const summary = computed(() =>
  characterSummary({
    speciesName: speciesName.value,
    subrace: props.member.subrace,
    classes: characterClasses.value,
    fallbackLevel: props.member.level,
  }),
);
const memberTotalLevel = computed(() => summary.value.level);

const hitDiceRemaining = computed(() =>
  Math.min(memberTotalLevel.value, props.member.hit_dice_remaining ?? memberTotalLevel.value),
);

// When wildshaped, display beast AC/HP; otherwise real member stats.
// Armor Class is worked out from gear (tap the shield to see how); a beast form
// replaces it.
const { acFor, acBreakdownFor } = useArmorClass();

const displayHp    = computed(() => props.wildshape?.beast_hp    ?? props.member.current_hp);
const displayMaxHp = computed(() => props.wildshape?.beast_max_hp ?? props.member.max_hp);
const acBreakdown  = computed(() => acBreakdownFor(props.member));
const displayAc    = computed(() => props.wildshape?.beast_ac     ?? acFor(props.member));

// Initiative = DEX mod + initiative_bonus (feat/special extras like Alert).
const initiativeDisplay = computed(() => {
  const total = memberInitiativeModifier(props.member, props.effectiveDex);
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
const hpColor = computed(() => hpTextClass(displayHp.value, displayMaxHp.value));
const hpBarColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-tone-caution";
  return "bg-elven-green";
});

const { ruleset } = useTableRuleset();
const exhaustionD20Penalty = computed(() => getExhaustionD20Penalty(props.member.conditions ?? [], ruleset.value));

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
