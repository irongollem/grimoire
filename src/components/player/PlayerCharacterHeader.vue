<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden flex flex-col md:rounded-none md:border-0">
    <div class="flex items-stretch flex-1">
      <!-- Portrait (beast image when wildshaped) -->
      <div class="shrink-0 w-24 relative overflow-hidden bg-muted/50">
        <FocalImage
          v-if="wildshape?.beast_image_url ?? member.portrait_url"
          :src="(wildshape?.beast_image_url ?? member.portrait_url)!"
          :alt="wildshape?.beast_name ?? member.name"
          format="portrait"
          :focal-point="wildshape?.beast_image_url ? null : (member.portrait_focal_point ?? null)"
          :lightbox="true"
        />
        <span
          v-else
          class="absolute inset-0 flex items-center justify-center font-cinzel text-3xl font-bold text-muted-foreground"
        >{{ wildshape ? wildshape.beast_name.charAt(0) : member.name.charAt(0) }}</span>
      </div>

      <!-- Right column -->
      <div class="flex-1 min-w-0 flex flex-col">
        <!-- Name + inspiration -->
        <div class="flex items-start gap-2 px-3 pt-3 pb-1">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <h1 class="font-cinzel text-lg font-bold text-foreground leading-tight truncate">
                {{ wildshape ? wildshape.beast_name : member.name }}
              </h1>
              <button
                v-if="!wildshape"
                class="shrink-0 flex items-center justify-center transition-colors"
                :class="member.inspiration ? 'text-gold-500' : 'text-muted-foreground/30 hover:text-muted-foreground/60'"
                title="Inspiration"
                @click="toggleInspiration"
              ><IconStar class="h-3.5 w-3.5" :class="member.inspiration ? 'fill-gold-500' : ''" /></button>
            </div>
            <p class="font-fell text-xs text-muted-foreground italic">
              <template v-if="wildshape">🐺 {{ member.name }}</template>
              <template v-else>{{ [speciesName, member.subrace, classLabel].filter(Boolean).join(" · ") }}</template>
              <span v-if="!wildshape && memberTotalLevel" class="font-cinzel text-2xs md:text-sm text-primary not-italic ml-1">Lv {{ memberTotalLevel }}</span>
            </p>
            <!-- XP progress -->
            <div v-if="xpLevellingEnabled && !wildshape && ((member.experience_points ?? 0) > 0 || readyToLevelUp)" class="mt-1 flex items-center gap-1.5">
              <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">XP</span>
              <div class="flex-1 max-w-32 h-1 rounded-full bg-muted overflow-hidden">
                <div class="h-full transition-all"
                  :class="readyToLevelUp ? 'bg-primary' : 'bg-primary/50'"
                  :style="{ width: `${xpPct}%` }" />
              </div>
              <span class="font-cinzel text-2xs md:text-sm text-muted-foreground">
                {{ member.experience_points ?? 0 }}<template v-if="xpToNext !== null"> / {{ xpToNext }}</template>
              </span>
              <!-- DM: emit event (player /play/* routes aren't accessible to DMs) -->
              <button
                v-if="readyToLevelUp && auth.isDM"
                type="button"
                class="font-cinzel text-2xs md:text-sm text-primary tracking-wider hover:opacity-80 ml-0.5"
                @click="emit('level-up')"
              >Ready ↑</button>
              <!-- Player: link to the level-up flow -->
              <RouterLink
                v-else-if="readyToLevelUp && !hidePlayerActions"
                :to="`/play/character/levelup?memberId=${member.id}`"
                class="font-cinzel text-2xs md:text-sm text-primary tracking-wider hover:opacity-80 ml-0.5"
              >Ready ↑</RouterLink>
            </div>
          </div>
        </div>

        <!-- Combat stats: AC · SPD · INIT · PROF · HD (static reference, grouped with identity) -->
        <div class="flex items-center flex-wrap gap-y-0.5 px-3 pb-2">
          <template v-for="(cs, csIdx) in combatStats" :key="cs.label">
            <div class="flex items-baseline gap-0.5">
              <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">{{ cs.label }}</span>
              <span class="font-cinzel text-xs font-bold text-foreground ml-0.5">{{ cs.value }}<span v-if="cs.suffix" class="text-2xs md:text-sm text-muted-foreground">{{ cs.suffix }}</span></span>
            </div>
            <span v-if="csIdx < combatStats.length - 1" class="text-border mx-1 select-none">·</span>
          </template>
        </div>

        <!-- HP readout (current state — shown before controls) -->
        <div class="flex items-baseline gap-1.5 px-3 pt-1 flex-wrap">
          <span class="font-cinzel text-2xl font-bold" :class="hpColor">{{ displayHp }}</span>
          <span class="font-fell text-sm text-muted-foreground">/ {{ displayMaxHp }}</span>
          <button
            v-if="!wildshape && member.temp_hp"
            class="font-cinzel text-2xs md:text-sm text-blue-400 ml-1 hover:text-blue-300 transition-colors inline-flex items-center gap-0.5"
            title="Click to clear temp HP"
            @click="clearTempHp"
          >+{{ member.temp_hp }} tmp <span class="text-blue-400/50">×</span></button>
          <span v-if="attackDisadvantage" class="font-cinzel text-2xs md:text-sm text-amber-500 tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 ml-1" title="Disadvantage on attack rolls">⚔ Dis</span>
          <span v-if="checkDisadvantage"  class="font-cinzel text-2xs md:text-sm text-amber-500 tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 ml-1" title="Disadvantage on ability checks">✦ Dis</span>
          <button
            v-if="member.concentration"
            class="font-cinzel text-2xs md:text-sm text-indigo-300 tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 ml-1 hover:bg-indigo-500/20 transition-colors inline-flex items-center gap-1"
            :title="`Concentrating on ${member.concentration.spellName} — click to drop`"
            @click="dropConcentration"
          >
            ✦ Conc: {{ member.concentration.spellName }}
            <span class="text-muted-foreground">×</span>
          </button>
        </div>

        <!-- HP controls (directly below the readout) -->
        <div class="flex items-center gap-1 px-3 pt-1.5 pb-1">
          <input
            v-model.number="hpInput"
            type="number"
            min="0"
            placeholder="0"
            class="w-10 h-6 rounded border border-border bg-muted/40 px-1 font-cinzel text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
            @keydown="blockInvalidChars"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <button class="h-6 px-1.5 rounded bg-destructive/15 border border-destructive/40 font-cinzel text-2xs md:text-sm text-destructive hover:bg-destructive/25 transition-colors tracking-wider" @click="applyDamage">DMG</button>
          <button class="h-6 px-1.5 rounded bg-elven-green/10 border border-elven-green/40 font-cinzel text-2xs md:text-sm text-elven-green hover:bg-elven-green/20 transition-colors tracking-wider" @click="applyHeal">Heal</button>
          <button v-if="!wildshape" class="h-6 px-1.5 rounded bg-blue-500/10 border border-blue-500/30 font-cinzel text-2xs md:text-sm text-blue-400 hover:bg-blue-500/20 transition-colors tracking-wider" @click="applyTempHp">Tmp</button>
        </div>

        <!-- Rest + condition picker (management actions, pinned to bottom) -->
        <div class="flex items-center gap-1 px-3 pb-3 mt-auto">
          <RestButtons :member="member" />
          <button
            ref="conditionPickerBtn"
            class="h-6 w-6 flex items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/50 hover:border-amber-500/60 hover:text-amber-500 transition-colors text-base leading-none"
            title="Add condition"
            @click="openConditionPicker"
          >+</button>

          <Teleport to="body">
            <template v-if="showConditionPicker">
              <div class="fixed inset-0 z-40" @click="showConditionPicker = false" />
              <div
                class="fixed z-50 w-52 rounded-lg border border-border bg-card shadow-xl overflow-hidden"
                :style="{ top: pickerPos.top + 'px', right: pickerPos.right + 'px' }"
              >
                <div class="p-2 border-b border-border">
                  <input
                    ref="conditionSearchInput"
                    v-model="conditionSearch"
                    type="text"
                    placeholder="Search conditions…"
                    class="w-full rounded border border-border bg-muted/40 px-2 py-1 font-fell text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    @keydown.escape="showConditionPicker = false"
                  />
                </div>
                <div class="max-h-56 overflow-y-auto">
                  <button
                    v-for="cond in filteredConditions"
                    :key="cond"
                    class="w-full text-left px-3 py-1.5 font-cinzel text-xs tracking-wider transition-colors"
                    :class="hasCondition(cond)
                      ? 'text-destructive/40 cursor-default'
                      : 'text-foreground hover:bg-amber-500/10 hover:text-amber-500'"
                    :disabled="hasCondition(cond)"
                    :title="getConditionDescription(cond)"
                    @click="addCondition(cond)"
                  >{{ cond }}</button>
                </div>
              </div>
            </template>
          </Teleport>
        </div>
      </div>
    </div>

    <!-- HP bar — mobile only; md+ uses the parent wrapper's full-width bar -->
    <div class="h-1.5 w-full bg-muted overflow-hidden md:hidden">
      <div class="h-full flex">
        <div class="h-full transition-all" :class="hpBarColor" :style="{ width: `${hpBarWidthPct}%` }" />
        <div v-if="tempHpBarPct > 0" class="h-full transition-all bg-blue-500" :style="{ width: `${tempHpBarPct}%` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { RouterLink } from "vue-router";
import { IconStar } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useClassByName } from "@/composables/useCustomClasses";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import { useShieldAcBonus } from "@/composables/useShieldAc";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import { getHitDie } from "@/types/spell.types";
import { useConcentration } from "@/composables/useConcentration";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  hasAttackDisadvantage,
  hasCheckDisadvantage,
} from "@/lib/conditions";
import type { PartyMember } from "@/types/party.types";
import { xpForNextLevel, xpForLevel, levelForXp } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";
import { abilityModifier } from "@/lib/utils";
import { useAllSpecies } from "@/composables/useSpecies";
import { useIsRuleEnabled } from "@/composables/useOptionalRules";
import FocalImage from "@/components/common/FocalImage.vue";
import RestButtons from "@/components/player/RestButtons.vue";

const props = defineProps<{ member: PartyMember; wildshape?: WildshapeState; hidePlayerActions?: boolean }>();
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
const conditionSearchInput = ref<HTMLInputElement | null>(null);
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

const classNameRef = computed(() => props.member.class ?? "");
const classData = useClassByName(classNameRef);
const hitDie = computed<number>(() => classData.value?.hit_die ?? getHitDie(classNameRef.value));

const memberIdRef = computed(() => props.member.id);
const { data: characterClasses } = useCharacterClasses(memberIdRef);

/**
 * Hit dice composition by die size. For a single-class character this is
 * `[{ die: 10, count: 5 }]`. A Fighter 5 / Wizard 3 returns
 * `[{ die: 10, count: 5 }, { die: 6, count: 3 }]`.
 */
const hitDicePool = computed<{ die: number; count: number }[]>(() => {
  const list = characterClasses.value ?? [];
  if (list.length === 0) {
    return [{ die: hitDie.value, count: props.member.level }];
  }
  const byDie = new Map<number, number>();
  for (const c of list) {
    const d = getHitDie(c.class_name);
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
  if (pool.length <= 1) return `d${pool[0]?.die ?? hitDie.value}`;
  return pool.map((p) => `${p.count}d${p.die}`).join("+");
});

/**
 * Total character level. Sum of `character_classes` rows if populated;
 * otherwise falls back to the legacy single `party_members.level`.
 */
const memberTotalLevel = computed(() => {
  const list = characterClasses.value ?? [];
  return list.length > 0 ? totalLevel(list) : props.member.level;
});

/**
 * Label rendered next to the name: "Fighter 5 / Wizard 3" when multiclass,
 * otherwise the single class from the legacy column.
 */
const classLabel = computed(() => {
  const list = characterClasses.value ?? [];
  if (list.length > 1) return formatMulticlassLabel(list);
  if (list.length === 1) {
    const only = list[0];
    const parts = [only.class_name, only.subclass_name].filter(Boolean);
    return parts.join(" · ");
  }
  return [props.member.class, props.member.subclass].filter(Boolean).join(" · ");
});

const hitDiceRemaining = computed(() =>
  Math.min(memberTotalLevel.value, props.member.hit_dice_remaining ?? memberTotalLevel.value),
);

// When wildshaped, display beast AC/HP; otherwise real member stats.
// An equipped shield adds its bonus on top of the stored (shieldless) AC,
// but never to a beast form — gear merges into the form while wildshaped.
const { bonusFor: shieldAcBonusFor } = useShieldAcBonus();
const displayHp    = computed(() => props.wildshape?.beast_hp    ?? props.member.current_hp);
const displayMaxHp = computed(() => props.wildshape?.beast_max_hp ?? props.member.max_hp);
const displayAc    = computed(() => props.wildshape?.beast_ac     ?? props.member.ac + shieldAcBonusFor(props.member.id));

const combatStats = computed(() => [
  { label: "AC",   value: displayAc.value, suffix: "" },
  { label: "SPD",  value: props.member.speed, suffix: "ft" },
  { label: "INIT", value: abilityModifier(props.member.dex), suffix: "" },
  { label: "PROF", value: `+${props.member.proficiency_bonus}`, suffix: "" },
  { label: "HD",   value: `${hitDiceRemaining.value}/${memberTotalLevel.value}`, suffix: hitDicePoolLabel.value },
]);

const hpPct = computed(() => {
  if (displayMaxHp.value === 0) return 0;
  return Math.max(0, Math.min(100, (displayHp.value / displayMaxHp.value) * 100));
});
const tempHpBarPct = computed(() => {
  const temp = props.wildshape ? 0 : (props.member.temp_hp ?? 0);
  if (temp <= 0 || displayMaxHp.value === 0) return 0;
  return (temp / (displayMaxHp.value + temp)) * 100;
});
const hpBarWidthPct = computed(() => {
  const temp = props.wildshape ? 0 : (props.member.temp_hp ?? 0);
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
  if (p < 66) return "text-amber-400";
  return "text-elven-green";
});
const hpBarColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-amber-500";
  return "bg-elven-green";
});

const attackDisadvantage = computed(() => hasAttackDisadvantage(props.member.conditions ?? []));
const checkDisadvantage  = computed(() => hasCheckDisadvantage(props.member.conditions ?? []));

async function applyDamage() {
  if (!hpInput.value || hpInput.value <= 0) return;
  const dmg = hpInput.value;
  hpInput.value = null;
  if (props.wildshape) {
    const newBeastHp = props.wildshape.beast_hp - dmg;
    if (newBeastHp <= 0) {
      // Beast drops to 0 — revert and apply overflow damage to real HP
      const overflow = Math.abs(newBeastHp);
      const newHp = Math.max(0, props.member.current_hp - overflow);
      await updateMember({ id: props.member.id, update: { wildshape_state: null, current_hp: newHp } });
      if (props.member.concentration && newHp === 0) {
        await endConcentration(props.member, { reason: "dropped to 0 HP" });
      }
    } else {
      await updateMember({ id: props.member.id, update: {
        wildshape_state: { ...props.wildshape, beast_hp: newBeastHp },
      }});
    }
  } else {
    // Temp HP absorbs damage first
    let remaining = dmg;
    const tempHp = props.member.temp_hp ?? 0;
    let newTempHp = tempHp;
    if (tempHp > 0) {
      const absorbed = Math.min(tempHp, remaining);
      newTempHp = tempHp - absorbed;
      remaining -= absorbed;
    }
    const newHp = Math.max(0, props.member.current_hp - remaining);
    const update: Record<string, number> = { current_hp: newHp };
    if (newTempHp !== tempHp) update.temp_hp = newTempHp;
    await updateMember({ id: props.member.id, update });
    if (props.member.concentration) {
      if (newHp === 0) {
        await endConcentration(props.member, { reason: "dropped to 0 HP" });
      } else if (remaining > 0) {
        await rollConcentrationSave(props.member, dmg);
      }
    }
  }
}
async function applyHeal() {
  if (!hpInput.value || hpInput.value <= 0) return;
  const val = hpInput.value;
  hpInput.value = null;
  if (props.wildshape) {
    const newBeastHp = Math.min(props.wildshape.beast_max_hp, props.wildshape.beast_hp + val);
    await updateMember({ id: props.member.id, update: {
      wildshape_state: { ...props.wildshape, beast_hp: newBeastHp },
    }});
  } else {
    const newHp = Math.min(props.member.max_hp, props.member.current_hp + val);
    await updateMember({ id: props.member.id, update: { current_hp: newHp } });
  }
}
async function applyTempHp() {
  if (!hpInput.value || hpInput.value <= 0) return;
  await updateMember({ id: props.member.id, update: { temp_hp: hpInput.value } });
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
