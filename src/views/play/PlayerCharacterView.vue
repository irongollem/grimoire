<template>
  <div class="space-y-5 pb-8">
    <div v-if="!member" class="text-center py-16 space-y-3">
      <p class="font-cinzel text-lg text-muted-foreground">
        No character linked
      </p>
      <p class="font-fell text-sm text-muted-foreground italic">
        {{
          ui.dmPreviewMode
            ? "Select a character above to preview their sheet."
            : "Ask your DM to link your account to a party member."
        }}
      </p>
    </div>

    <template v-else>
      <!-- Header card -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex items-stretch">
          <!-- Portrait -->
          <div class="shrink-0 w-24 relative overflow-hidden bg-muted/50">
            <FocalImage
              v-if="member.portrait_url"
              :src="member.portrait_url"
              :alt="member.name"
              format="portrait"
              :focal-point="member.portrait_focal_point ?? null"
            />
            <span
              v-else
              class="absolute inset-0 flex items-center justify-center font-cinzel text-3xl font-bold text-muted-foreground"
              >{{ member.name.charAt(0) }}</span
            >
          </div>
          <!-- Right column -->
          <div class="flex-1 min-w-0 flex flex-col">
            <!-- Top: name/subtitle + controls row -->
            <div class="flex items-start justify-between gap-2 px-3 pt-3 pb-1">
              <!-- Name + subtitle -->
              <div class="min-w-0">
                <h1 class="font-cinzel text-lg font-bold text-foreground leading-tight truncate">{{ member.name }}</h1>
                <p class="font-fell text-xs text-muted-foreground italic">
                  {{ [member.race, member.class, member.subclass].filter(Boolean).join(" · ") }}
                  <span v-if="member.level" class="font-cinzel text-[10px] text-primary not-italic ml-1">Lv {{ member.level }}</span>
                </p>
              </div>
              <!-- HP controls + Insp stacked top-right -->
              <div class="shrink-0 flex flex-col items-end gap-1">
                <!-- Input + DMG/Heal/Temp + Insp -->
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="hpInput"
                    type="number"
                    min="0"
                    placeholder="0"
                    class="w-10 h-6 rounded border border-border bg-muted/40 px-1 font-cinzel text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button class="h-6 px-1.5 rounded bg-destructive/15 border border-destructive/40 font-cinzel text-[9px] text-destructive hover:bg-destructive/25 transition-colors tracking-wider" @click="applyDamage">DMG</button>
                  <button class="h-6 px-1.5 rounded bg-elven-green/10 border border-elven-green/40 font-cinzel text-[9px] text-elven-green hover:bg-elven-green/20 transition-colors tracking-wider" @click="applyHeal">Heal</button>
                  <button class="h-6 px-1.5 rounded bg-blue-500/10 border border-blue-500/30 font-cinzel text-[9px] text-blue-400 hover:bg-blue-500/20 transition-colors tracking-wider" @click="applyTempHp">Tmp</button>
                  <button
                    class="h-6 flex items-center gap-1 px-1.5 rounded border transition-colors"
                    :class="member.inspiration ? 'bg-gold-500/20 border-gold-500/50 text-gold-500' : 'border-border text-muted-foreground hover:text-foreground'"
                    @click="toggleInspiration"
                  >
                    <Star class="h-3 w-3" :class="member.inspiration ? 'fill-gold-500' : ''" />
                    <span class="font-cinzel text-[9px] tracking-wider">Insp.</span>
                  </button>
                </div>
              </div>
            </div>
            <!-- HP readout -->
            <div class="flex items-baseline gap-1.5 px-3">
              <span class="font-cinzel text-2xl font-bold" :class="hpColor">{{ member.current_hp }}</span>
              <span class="font-fell text-sm text-muted-foreground">/ {{ member.max_hp }}</span>
              <span v-if="member.temp_hp" class="font-cinzel text-[10px] text-blue-400 ml-1">+{{ member.temp_hp }} tmp</span>
            </div>
            <!-- Bottom: AC/SPD/INIT/PROF + rest buttons -->
            <div class="flex items-center gap-1 px-3 pt-2 pb-3 mt-auto">
              <div v-for="cs in COMBAT_STATS" :key="cs.label" class="flex items-baseline gap-0.5">
                <span class="font-cinzel text-[9px] text-muted-foreground tracking-wider">{{ cs.label }}</span>
                <span class="font-cinzel text-sm font-bold text-foreground ml-0.5">{{ cs.value }}<span v-if="cs.suffix" class="text-[9px] text-muted-foreground">{{ cs.suffix }}</span></span>
                <span class="text-border mx-1 select-none">·</span>
              </div>
              <div class="ml-auto flex items-center gap-1">
                <button
                  class="h-6 flex items-center gap-1 px-1.5 rounded border border-border font-cinzel text-[9px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors tracking-wider"
                  title="Short Rest"
                  @click="shortRest"
                ><Moon class="h-3 w-3" /> Rest</button>
                <button
                  class="h-6 flex items-center gap-1 px-1.5 rounded bg-primary/10 border border-primary/30 font-cinzel text-[9px] text-primary hover:bg-primary/20 transition-colors tracking-wider"
                  title="Long Rest"
                  @click="longRest"
                ><Sun class="h-3 w-3" /> Sleep</button>
              </div>
            </div>
          </div>
        </div>
        <!-- HP bar -->
        <div class="h-1.5 w-full bg-muted overflow-hidden">
          <div class="h-full transition-all" :class="hpBarColor" :style="{ width: `${hpPct}%` }" />
        </div>
      </div>

      <!-- Equipped weapons -->
      <div
        v-if="equippedWeaponsWithStats.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-4 py-2 border-b border-border bg-muted/20">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Weapons</span
          >
        </div>
        <div class="divide-y divide-border">
          <div
            v-for="{ inv, item } in equippedWeaponsWithStats"
            :key="inv.id"
            class="px-4 py-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-fell text-sm text-foreground font-semibold">{{
                inv.name
              }}</span>
              <span
                v-if="item.subtype"
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
                >{{ item.subtype }}</span
              >
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                @click="rollWeaponAttack(inv, item)"
              >
                <Sword
                  class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors"
                />
                <span class="font-cinzel text-xs text-foreground">Attack</span>
                <span
                  class="font-cinzel text-xs"
                  :class="
                    weaponAttackMod(item) >= 0
                      ? 'text-elven-green'
                      : 'text-destructive'
                  "
                  >{{ signedNum(weaponAttackMod(item)) }}</span
                >
                <span v-if="attackDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider">Dis</span>
              </button>
              <button
                v-if="item.damage_rolls?.length"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors group"
                @click="rollWeaponDamage(inv, item)"
              >
                <Zap
                  class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors"
                />
                <span class="font-cinzel text-xs text-foreground">{{
                  item.damage_rolls[0].dice
                }}</span>
                <span class="font-cinzel text-xs text-muted-foreground">{{
                  item.damage_rolls[0].type
                }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Spells (prepared / known) -->
      <div
        v-if="preparedOrKnownSpells.length"
        class="rounded-lg border border-border bg-card overflow-hidden"
      >
        <div class="px-4 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
            {{ casterType === 'known' ? 'Known Spells' : 'Prepared Spells' }}
          </span>
          <div class="flex items-center gap-3 font-cinzel text-[10px] text-muted-foreground tracking-wider">
            <span v-if="spellAttackBonus !== null">Atk {{ signedNum(spellAttackBonus) }}</span>
            <span v-if="spellSaveDc !== null">DC {{ spellSaveDc }}</span>
          </div>
        </div>
        <div class="divide-y divide-border">
          <div
            v-for="entry in preparedOrKnownSpells"
            :key="entry.id"
            class="px-4 py-2.5 flex items-center gap-3"
          >
            <!-- Level badge -->
            <span class="shrink-0 h-5 w-5 rounded bg-primary/15 border border-primary/30 font-cinzel text-[9px] font-bold text-primary flex items-center justify-center">
              {{ entry.spell.level === 0 ? 'C' : entry.spell.level }}
            </span>
            <!-- Name -->
            <span class="font-fell text-sm text-foreground flex-1 min-w-0 truncate">{{ entry.spell.name }}</span>
            <!-- Roll buttons -->
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                v-if="entry.spell.attack_type === 'ranged' || entry.spell.attack_type === 'melee'"
                class="flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors"
                @click="rollSpellAttack(entry.spell)"
              >
                <Sword class="h-3 w-3 text-muted-foreground" />
                <span class="font-cinzel text-[10px] text-foreground">{{ signedNum(spellAttackBonus ?? 0) }}</span>
                <span v-if="attackDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider">Dis</span>
              </button>
              <span
                v-else-if="entry.spell.attack_type === 'save' && spellSaveDc !== null"
                class="px-2 py-1 rounded border border-amber-500/30 bg-amber-500/5 font-cinzel text-[9px] text-amber-400 tracking-wider"
              >DC {{ spellSaveDc }} {{ entry.spell.save_attribute }}</span>
              <button
                v-if="entry.spell.damage_rolls?.length"
                class="flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors"
                @click="rollSpellDamage(entry.spell)"
              >
                <Zap class="h-3 w-3 text-muted-foreground" />
                <span class="font-cinzel text-[10px] text-foreground">{{ entry.spell.damage_rolls[0].dice }}</span>
                <span class="font-cinzel text-[9px] text-muted-foreground">{{ entry.spell.damage_rolls[0].type }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Death saves (only at 0 HP) -->
      <div
        v-if="member.current_hp <= 0"
        class="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      >
        <p
          class="font-cinzel text-xs font-semibold text-destructive tracking-wider mb-3"
        >
          Death Saving Throws
        </p>
        <div class="flex items-center gap-8">
          <div>
            <p class="font-fell text-xs text-muted-foreground mb-1.5">
              Successes
            </p>
            <div class="flex gap-2">
              <button
                v-for="i in 3"
                :key="`s-${i}`"
                class="h-6 w-6 rounded-full border-2 transition-colors"
                :class="
                  i <= member.death_save_successes
                    ? 'bg-elven-green border-elven-green'
                    : 'border-border hover:border-elven-green/50'
                "
                @click="toggleDeathSave('success', i)"
              />
            </div>
          </div>
          <div>
            <p class="font-fell text-xs text-muted-foreground mb-1.5">
              Failures
            </p>
            <div class="flex gap-2">
              <button
                v-for="i in 3"
                :key="`f-${i}`"
                class="h-6 w-6 rounded-full border-2 transition-colors"
                :class="
                  i <= member.death_save_failures
                    ? 'bg-destructive border-destructive'
                    : 'border-border hover:border-destructive/50'
                "
                @click="toggleDeathSave('failure', i)"
              />
            </div>
          </div>
          <button
            class="ml-auto h-7 px-3 rounded border border-destructive/40 bg-destructive/10 font-cinzel text-[10px] text-destructive hover:bg-destructive/20 transition-colors tracking-wider"
            @click="rollDeathSave"
          >Roll d20</button>
        </div>
      </div>

      <!-- Ability scores + saves (reusable component) + combat stats -->
      <AbilityScoreTable
        :scores="member"
        :saves="memberSaves"
        @roll-ability="onRollAbility"
        @roll-save="onRollSave"
      />

      <!-- Skills -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div
          class="px-4 py-2 border-b border-border bg-muted/20 flex items-center justify-between"
        >
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Skills</span
          >
          <div
            class="hidden md:flex items-center gap-4 text-[10px] font-cinzel text-muted-foreground tracking-wider"
          >
            <span>Passive Perception {{ passivePerception }}</span>
            <span>Passive Insight {{ passiveInsight }}</span>
            <span>Passive Investigation {{ passiveInvestigation }}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0">
          <div class="sm:border-r border-border divide-y divide-border">
            <button
              v-for="skill in SKILLS.slice(0, 9)"
              :key="skill.key"
              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group text-left"
              @click="rollSkill(skill)"
            >
              <span
                class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                :class="skillProfClass(skill.key)"
              >
                <span
                  v-if="isExpertise(skill.key)"
                  class="h-1.5 w-1.5 rounded-full bg-current"
                />
              </span>
              <span class="font-fell text-sm flex-1 text-foreground">{{
                skill.label
              }}</span>
              <span
                class="font-cinzel text-[10px] text-muted-foreground/50 mr-1"
                >{{ skill.ability.toUpperCase() }}</span
              >
              <span
                class="font-cinzel text-sm font-bold"
                :class="
                  skillBonusValue(skill) >= 0
                    ? 'text-foreground'
                    : 'text-destructive'
                "
              >
                {{ signedNum(skillBonusValue(skill)) }}
              </span>
              <ChevronRight
                class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors"
              />
            </button>
          </div>
          <div class="divide-y divide-border">
            <button
              v-for="skill in SKILLS.slice(9)"
              :key="skill.key"
              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group text-left"
              @click="rollSkill(skill)"
            >
              <span
                class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                :class="skillProfClass(skill.key)"
              >
                <span
                  v-if="isExpertise(skill.key)"
                  class="h-1.5 w-1.5 rounded-full bg-current"
                />
              </span>
              <span class="font-fell text-sm flex-1 text-foreground">{{
                skill.label
              }}</span>
              <span
                class="font-cinzel text-[10px] text-muted-foreground/50 mr-1"
                >{{ skill.ability.toUpperCase() }}</span
              >
              <span
                class="font-cinzel text-sm font-bold"
                :class="
                  skillBonusValue(skill) >= 0
                    ? 'text-foreground'
                    : 'text-destructive'
                "
              >
                {{ signedNum(skillBonusValue(skill)) }}
              </span>
              <ChevronRight
                class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Conditions -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-4 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Conditions</span>
          <div v-if="attackDisadvantage || checkDisadvantage" class="flex items-center gap-1.5">
            <span v-if="attackDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">⚔ Dis</span>
            <span v-if="checkDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">✦ Dis</span>
          </div>
        </div>
        <div class="p-3 flex flex-wrap gap-2">
          <button
            v-for="cond in CONDITIONS"
            :key="cond"
            class="px-2.5 py-1 rounded-md border font-cinzel text-[11px] tracking-wider transition-colors"
            :class="
              hasCondition(cond)
                ? 'bg-destructive/15 border-destructive/40 text-destructive'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
            "
            @click="toggleCondition(cond)"
          >
            {{ cond }}
          </button>
        </div>
        <!-- Active curses (read-only) -->
        <div
          v-if="member.curses?.length"
          class="px-3 pb-3 flex flex-wrap gap-2"
        >
          <span
            v-for="curse in member.curses"
            :key="curse"
            class="px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 font-cinzel text-[11px] text-violet-400 tracking-wider"
          >
            Cursed: {{ curse }}
          </span>
        </div>
      </div>

      <!-- Notes -->
      <div
        v-if="member.notes"
        class="rounded-lg border border-border bg-card p-4"
      >
        <p
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2"
        >
          Notes
        </p>
        <p class="font-fell text-sm text-foreground whitespace-pre-wrap">
          {{ member.notes }}
        </p>
      </div>
    </template>

    <!-- Roll toast -->
    <Transition name="toast">
      <div
        v-if="rollToast"
        class="fixed bottom-6 right-6 z-50 rounded-lg border border-primary/40 bg-card shadow-lg px-4 py-3 min-w-56 max-w-72"
      >
        <p
          class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5"
        >
          {{ rollToast.label }}
        </p>
        <div class="flex items-baseline gap-2">
          <span class="font-cinzel text-3xl font-bold text-foreground">{{
            rollToast.total
          }}</span>
          <span class="font-fell text-sm text-muted-foreground">
            d20 ({{ rollToast.dice }})
            <template v-if="rollToast.modifier !== 0">
              {{ rollToast.modifier >= 0 ? "+" : "" }}{{ rollToast.modifier }}
            </template>
          </span>
        </div>
        <div class="h-1 w-full rounded-full bg-muted mt-2 overflow-hidden">
          <div
            class="h-full bg-primary rounded-full animate-[shrink_3s_linear_forwards]"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Star, ChevronRight, Sword, Zap, Moon, Sun } from "lucide-vue-next";
import { rollDice } from "@/lib/dice";
import type { RollMode } from "@/lib/dice";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { SKILLS, CONDITIONS } from "@/types/party.types";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { useCharacterSpellsWithDetails } from "@/composables/useCharacterSpells";
import { getCasterType } from "@/types/spell.types";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const props = defineProps<{ memberId?: string }>();

const auth = useAuthStore();
const ui = useUiStore();

const { data: partyMembers } = useParty();
const { data: inventory } = usePartyInventory();
const { data: allItems } = useItems();
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const { sendRoll, sendFlavorMessage } = useCampaignMessages();
const { data: campaignMembers } = useCampaignMembers();
const campaignStore = useCampaignStore();
const dmUserId = computed(() => campaignMembers.value?.find((m) => m.role === "dm")?.user_id ?? null);

const resolvedMemberId = computed(
  () =>
    props.memberId ??
    (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
);
const member = computed<PartyMember | null>(() => {
  if (!resolvedMemberId.value || !partyMembers.value) return null;
  return (
    partyMembers.value.find((m) => m.id === resolvedMemberId.value) ?? null
  );
});

// ── Ability helpers ────────────────────────────────────────────────────────────
type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const COMBAT_STATS = computed(() => [
  { label: "AC",   value: member.value?.ac ?? "—",   suffix: "" },
  { label: "SPD",  value: member.value?.speed ?? "—", suffix: "ft" },
  { label: "INIT", value: member.value ? signedNum(dexMod.value) : "—", suffix: "" },
  { label: "PROF", value: member.value ? `+${member.value.proficiency_bonus}` : "—", suffix: "" },
]);

function abilityMod(score: number) {
  return Math.floor((score - 10) / 2);
}
function signedNum(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

const dexMod = computed(() =>
  member.value ? abilityMod(member.value.dex) : 0,
);

const hpPct = computed(() => {
  if (!member.value || member.value.max_hp === 0) return 0;
  return Math.max(
    0,
    Math.min(100, (member.value.current_hp / member.value.max_hp) * 100),
  );
});

const hpColor = computed(() => {
  if (!member.value) return "text-foreground";
  const pct = hpPct.value;
  if (pct <= 0) return "text-destructive";
  if (pct < 33) return "text-destructive";
  if (pct < 66) return "text-amber-400";
  return "text-elven-green";
});

const hpBarColor = computed(() => {
  const pct = hpPct.value;
  if (pct <= 0) return "bg-muted-foreground/40";
  if (pct < 33) return "bg-destructive";
  if (pct < 66) return "bg-amber-500";
  return "bg-elven-green";
});

// ── Saving throws ──────────────────────────────────────────────────────────────
function isSaveProficient(key: string) {
  return member.value?.saving_throw_proficiencies?.includes(key as AbilityKey) ?? false;
}

function saveBonus(key: string) {
  if (!member.value) return 0;
  const score = member.value[key as keyof PartyMember] as number;
  const mod = abilityMod(score);
  return mod + (isSaveProficient(key) ? member.value.proficiency_bonus : 0);
}

const memberSaves = computed(() => {
  if (!member.value) return undefined;
  return Object.fromEntries(
    ABILITY_KEYS.map((k) => [k, { bonus: saveBonus(k), proficient: isSaveProficient(k) }]),
  );
});

// ── Skills ─────────────────────────────────────────────────────────────────────
function profLevel(key: keyof SkillProficiencies) {
  return member.value?.skill_proficiencies?.[key] ?? "none";
}

function isExpertise(key: keyof SkillProficiencies) {
  return profLevel(key) === "expertise";
}

function skillProfClass(key: keyof SkillProficiencies) {
  const level = profLevel(key);
  if (level === "expertise") return "border-gold-500 text-gold-500";
  if (level === "proficient")
    return "border-primary text-primary bg-primary/20";
  return "border-muted-foreground/30 text-transparent";
}

function skillBonusValue(skill: (typeof SKILLS)[number]) {
  if (!member.value) return 0;
  const score = member.value[skill.ability] as number;
  const mod = abilityMod(score);
  const level = profLevel(skill.key);
  const pb = member.value.proficiency_bonus;
  return (
    mod + (level === "expertise" ? pb * 2 : level === "proficient" ? pb : 0)
  );
}

// ── Passive scores ─────────────────────────────────────────────────────────────
function passiveScore(skillKey: keyof SkillProficiencies) {
  const skill = SKILLS.find((s) => s.key === skillKey)!;
  return 10 + skillBonusValue(skill);
}

const passivePerception = computed(() => passiveScore("perception"));
const passiveInsight = computed(() => passiveScore("insight"));
const passiveInvestigation = computed(() => passiveScore("investigation"));

// ── Conditions ─────────────────────────────────────────────────────────────────

// D&D 5e conditions that impose disadvantage on specific roll types
const ATTACK_DIS_CONDITIONS = new Set(["Blinded", "Frightened", "Poisoned", "Prone", "Restrained"]);
const CHECK_DIS_CONDITIONS  = new Set(["Frightened", "Poisoned", "Exhausted 1", "Exhausted 2", "Exhausted 3"]);

const attackDisadvantage = computed(() =>
  member.value?.conditions?.some(c => ATTACK_DIS_CONDITIONS.has(c)) ?? false
);
const checkDisadvantage = computed(() =>
  member.value?.conditions?.some(c => CHECK_DIS_CONDITIONS.has(c)) ?? false
);

function hasCondition(cond: string) {
  return member.value?.conditions?.includes(cond) ?? false;
}

async function toggleCondition(cond: string) {
  if (!member.value) return;
  const current = [...(member.value.conditions ?? [])];
  const idx = current.indexOf(cond);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(cond);
  await updatePartyMember({
    id: member.value.id,
    update: { conditions: current },
  });
}

// ── HP / Inspiration ───────────────────────────────────────────────────────────
const hpInput = ref(0);

async function applyDamage() {
  if (!member.value || hpInput.value <= 0) return;
  const newHp = Math.max(0, member.value.current_hp - hpInput.value);
  await updatePartyMember({ id: member.value.id, update: { current_hp: newHp } });
  hpInput.value = 0;
}

async function applyHeal() {
  if (!member.value || hpInput.value <= 0) return;
  const newHp = Math.min(member.value.max_hp, member.value.current_hp + hpInput.value);
  await updatePartyMember({ id: member.value.id, update: { current_hp: newHp } });
  hpInput.value = 0;
}

async function applyTempHp() {
  if (!member.value || hpInput.value <= 0) return;
  await updatePartyMember({ id: member.value.id, update: { temp_hp: hpInput.value } });
  hpInput.value = 0;
}

async function shortRest() {
  if (!member.value || hpInput.value <= 0) return;
  const newHp = Math.min(member.value.max_hp, member.value.current_hp + hpInput.value);
  await updatePartyMember({ id: member.value.id, update: { current_hp: newHp } });
  hpInput.value = 0;
}

async function longRest() {
  if (!member.value) return;
  await updatePartyMember({
    id: member.value.id,
    update: { current_hp: member.value.max_hp, temp_hp: 0, death_save_successes: 0, death_save_failures: 0 },
  });
}

async function toggleInspiration() {
  if (!member.value) return;
  await updatePartyMember({
    id: member.value.id,
    update: { inspiration: !member.value.inspiration },
  });
}

async function toggleDeathSave(type: "success" | "failure", pip: number) {
  if (!member.value) return;
  const current =
    type === "success"
      ? member.value.death_save_successes
      : member.value.death_save_failures;
  const newVal = pip === current ? pip - 1 : pip;
  const update =
    type === "success"
      ? { death_save_successes: newVal }
      : { death_save_failures: newVal };
  await updatePartyMember({ id: member.value.id, update });
}

async function rollDeathSave() {
  if (!member.value) return;
  const d = Math.floor(Math.random() * 20) + 1;
  const name = member.value.name;
  let update: Partial<{ current_hp: number; death_save_successes: number; death_save_failures: number }>;
  let outcome: string;

  if (d === 20) {
    update = { current_hp: 1, death_save_successes: 0, death_save_failures: 0 };
    outcome = "Nat 20 — Stabilized";
  } else if (d === 1) {
    update = { death_save_failures: Math.min(3, member.value.death_save_failures + 2) };
    outcome = "Nat 1 — 2 Failures";
  } else if (d >= 10) {
    update = { death_save_successes: Math.min(3, member.value.death_save_successes + 1) };
    outcome = "Success";
  } else {
    update = { death_save_failures: Math.min(3, member.value.death_save_failures + 1) };
    outcome = "Failure";
  }

  await updatePartyMember({ id: member.value.id, update });
  const label = `${name} — Death Save (${outcome})`;
  rollToast.value = { label, dice: d, modifier: 0, total: d };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { rollToast.value = null; }, 3000);
  void sendRoll({ total: d, label, modifier: 0, breakdown: [{ val: d, dropped: false }], isCrit: d === 20, isFumble: d === 1 });
}

// ── Roll system ────────────────────────────────────────────────────────────────
interface RollToast {
  label: string;
  dice: number;
  modifier: number;
  total: number;
}
const rollToast = ref<RollToast | null>(null);
let rollTimer: ReturnType<typeof setTimeout> | null = null;

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

function doRoll(label: string, modifier: number, mode: RollMode = "normal") {
  const result = rollDice({ 20: 1 }, modifier, mode);
  const kept = result.breakdown.find(d => !d.dropped)!;
  const fullLabel = label + modeTag(mode);
  rollToast.value = { label: fullLabel, dice: kept.val, modifier, total: result.total };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { rollToast.value = null; }, 3000);
  void sendRoll({ ...result, label: fullLabel });
}


function onRollAbility(_key: string, label: string, mod: number) {
  doRoll(`${label} Check`, mod, checkDisadvantage.value ? "disadvantage" : "normal");
}
function onRollSave(_key: string, label: string, bonus: number) {
  doRoll(`${label} Save`, bonus);
}

// Skills that trigger the immersive roll flow when the campaign setting is on.
// Player sees only flavor; DM receives the full result via whisper.
const IMMERSIVE_SKILL_KEYS = new Set([
  "stealth", "sleight_of_hand", "arcana", "history", "nature", "religion",
  "insight", "investigation", "medicine",
]);

function immersiveFlavor(label: string, name: string): string {
  const l = label.toLowerCase();
  if (l.includes("stealth"))        return `${name} tries to move undetected`;
  if (l.includes("sleight"))        return `${name} attempts a careful maneuver`;
  if (l.includes("arcana"))         return `${name} searches their arcane knowledge`;
  if (l.includes("history"))        return `${name} tries to recall what they know`;
  if (l.includes("nature"))         return `${name} reads the signs of the natural world`;
  if (l.includes("religion"))       return `${name} draws on their religious knowledge`;
  if (l.includes("insight"))        return `${name} tries to read the situation`;
  if (l.includes("investigation"))  return `${name} examines the area carefully`;
  if (l.includes("medicine"))       return `${name} assesses the situation`;
  return `${name} makes a check`;
}

async function rollSkill(skill: (typeof SKILLS)[number]) {
  const isImmersive =
    campaignStore.activeCampaign?.immersive_rolls &&
    IMMERSIVE_SKILL_KEYS.has(skill.key);
  const mode: RollMode = checkDisadvantage.value ? "disadvantage" : "normal";

  if (isImmersive) {
    const modifier = skillBonusValue(skill);
    const result = rollDice({ 20: 1 }, modifier, mode);
    const kept = result.breakdown.find(d => !d.dropped)!;
    const label = `${skill.label} Check`;
    const name = member.value?.name ?? "Unknown";

    // Flavor text to all via composable (optimistic push → instant visibility)
    await sendFlavorMessage(immersiveFlavor(label, name), skill.label);

    // Full result whispered to DM only
    if (dmUserId.value) {
      await sendRoll(
        { ...result, label },
        dmUserId.value,
        name,
      );
    }

    // No local toast — player is unaware of the result
    void kept; // suppress unused warning
    return;
  }

  doRoll(`${skill.label} Check`, skillBonusValue(skill), mode);
}

// ── Spells ─────────────────────────────────────────────────────────────────────
const { data: characterSpells } = useCharacterSpellsWithDetails(resolvedMemberId);
const casterType = computed(() => getCasterType(member.value?.class ?? null));

const preparedOrKnownSpells = computed(() => {
  const entries = characterSpells.value ?? [];
  if (casterType.value === "none") return [];
  if (casterType.value === "known") return entries;
  return entries.filter((e) => e.is_prepared || e.spell.level === 0);
});

const spellSaveDc = computed(() => {
  const m = member.value;
  if (!m || casterType.value === "none") return null;
  const cls = m.class ?? "";
  let spellMod: number;
  if (["Cleric", "Druid", "Ranger"].includes(cls))                                            spellMod = abilityMod(m.wis);
  else if (["Wizard", "Fighter (Eldritch Knight)", "Rogue (Arcane Trickster)"].includes(cls)) spellMod = abilityMod(m.int);
  else                                                                                         spellMod = abilityMod(m.cha);
  return 8 + m.proficiency_bonus + spellMod;
});

const spellAttackBonus = computed(() => {
  const m = member.value;
  if (!m || casterType.value === "none") return null;
  const cls = m.class ?? "";
  let spellMod: number;
  if (["Cleric", "Druid", "Ranger"].includes(cls))                                            spellMod = abilityMod(m.wis);
  else if (["Wizard", "Fighter (Eldritch Knight)", "Rogue (Arcane Trickster)"].includes(cls)) spellMod = abilityMod(m.int);
  else                                                                                         spellMod = abilityMod(m.cha);
  return m.proficiency_bonus + spellMod;
});

function rollSpellDamage(spell: { name: string; damage_rolls?: Array<{ dice: string; type: string }> | null }) {
  if (!spell.damage_rolls?.length) return;
  const expr = spell.damage_rolls[0].dice;
  const m = expr.match(/^(\d+)d(\d+)$/);
  let total = 0;
  const breakdown: { val: number; dropped: boolean }[] = [];
  if (m) {
    const count = parseInt(m[1]);
    const sides = parseInt(m[2]);
    for (let i = 0; i < count; i++) {
      const v = Math.floor(Math.random() * sides) + 1;
      breakdown.push({ val: v, dropped: false });
      total += v;
    }
  }
  const label = `${spell.name} — Damage (${spell.damage_rolls[0].type})`;
  rollToast.value = { label, dice: total, modifier: 0, total };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { rollToast.value = null; }, 3000);
  void sendRoll({ total, label, modifier: 0, breakdown, isCrit: false, isFumble: false });
}

function rollSpellAttack(spell: { name: string }) {
  if (spellAttackBonus.value === null) return;
  const mode: RollMode = attackDisadvantage.value ? "disadvantage" : "normal";
  const result = rollDice({ 20: 1 }, spellAttackBonus.value, mode);
  const kept = result.breakdown.find(d => !d.dropped)!;
  const fullLabel = `${spell.name} — Spell Attack` + modeTag(mode);
  rollToast.value = { label: fullLabel, dice: kept.val, modifier: spellAttackBonus.value, total: result.total };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { rollToast.value = null; }, 3000);
  void sendRoll({ ...result, label: fullLabel });
}

// ── Weapon attacks ─────────────────────────────────────────────────────────────
const myInventory = computed(() =>
  (inventory.value ?? []).filter(
    (i) => i.carried_by === resolvedMemberId.value,
  ),
);

interface EquippedWeapon {
  inv: PartyInventoryItem;
  item: Item;
}
const equippedWeaponsWithStats = computed<EquippedWeapon[]>(() => {
  if (!allItems.value) return [];
  return myInventory.value
    .filter((i) => i.is_equipped && i.item_id)
    .flatMap((inv) => {
      const item = allItems.value!.find((it) => it.id === inv.item_id);
      return item ? [{ inv, item }] : [];
    });
});

function weaponAbilityMod(item: Item): number {
  if (!member.value) return 0;
  const props = item.properties ?? [];
  const strMod = abilityMod(member.value.str);
  const dexModVal = abilityMod(member.value.dex);
  if (props.includes("ammunition")) return dexModVal;
  if (props.includes("finesse")) return dexModVal > strMod ? dexModVal : strMod;
  return strMod;
}

function weaponAttackMod(item: Item): number {
  if (!member.value) return 0;
  return weaponAbilityMod(item) + member.value.proficiency_bonus;
}

function rollDiceExpression(expr: string): {
  total: number;
  breakdown: { val: number; dropped: boolean }[];
} {
  const m = expr.match(/^(\d+)d(\d+)$/);
  if (!m) return { total: 0, breakdown: [] };
  const count = parseInt(m[1]);
  const sides = parseInt(m[2]);
  const breakdown = Array.from({ length: count }, () => ({
    val: Math.floor(Math.random() * sides) + 1,
    dropped: false,
  }));
  return { total: breakdown.reduce((s, d) => s + d.val, 0), breakdown };
}

function rollWeaponAttack(inv: PartyInventoryItem, item: Item) {
  const mod = weaponAttackMod(item);
  const mode: RollMode = attackDisadvantage.value ? "disadvantage" : "normal";
  const result = rollDice({ 20: 1 }, mod, mode);
  const kept = result.breakdown.find(d => !d.dropped)!;
  const fullLabel = `${inv.name} — Attack` + modeTag(mode);
  rollToast.value = { label: fullLabel, dice: kept.val, modifier: mod, total: result.total };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { rollToast.value = null; }, 3000);
  void sendRoll({ ...result, label: fullLabel });
}

function rollWeaponDamage(inv: PartyInventoryItem, item: Item) {
  if (!item.damage_rolls?.length) return;
  const abilMod = weaponAbilityMod(item);
  const { total: diceTotal, breakdown } = rollDiceExpression(
    item.damage_rolls[0].dice,
  );
  const total = diceTotal + abilMod;
  const label = `${inv.name} — Damage (${item.damage_rolls[0].type})`;
  rollToast.value = { label, dice: diceTotal, modifier: abilMod, total };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => {
    rollToast.value = null;
  }, 3000);
  void sendRoll({
    total,
    label,
    modifier: abilMod,
    breakdown,
    isCrit: false,
    isFumble: false,
  });
}
</script>

<style scoped>
.toast-enter-active {
  transition: all 0.2s ease-out;
}
.toast-leave-active {
  transition: all 0.15s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.97);
}

@keyframes shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
</style>
