<template>
  <div class="space-y-5 pb-8">
    <!-- DM preview: party member picker -->
    <div
      v-if="ui.dmPreviewMode"
      class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3"
    >
      <span class="font-cinzel text-xs text-amber-400 shrink-0"
        >Viewing as:</span
      >
      <select
        :value="ui.dmPreviewPartyMemberId ?? ''"
        class="flex-1 bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        @change="
          ui.dmPreviewPartyMemberId =
            ($event.target as HTMLSelectElement).value || null
        "
      >
        <option value="">— pick a character —</option>
        <option v-for="m in partyMembers" :key="m.id" :value="m.id">
          {{ m.name }}
        </option>
      </select>
    </div>

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
      <!-- Header -->
      <div
        class="rounded-lg border border-border bg-card p-4 flex items-start gap-4"
      >
        <div class="shrink-0">
          <div
            v-if="member.portrait_url"
            class="h-20 w-20 rounded-lg overflow-hidden border border-border"
          >
            <img
              :src="member.portrait_url"
              :alt="member.name"
              class="h-full w-full object-cover"
            />
          </div>
          <div
            v-else
            class="h-20 w-20 rounded-lg bg-muted/50 flex items-center justify-center border border-border"
          >
            <span
              class="font-cinzel text-2xl font-bold text-muted-foreground"
              >{{ member.name.charAt(0) }}</span
            >
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <h1 class="font-cinzel text-2xl font-bold text-foreground">
            {{ member.name }}
          </h1>
          <p class="font-fell text-sm text-muted-foreground italic">
            {{
              [member.race, member.class, member.subclass]
                .filter(Boolean)
                .join(" · ")
            }}
            <span
              v-if="member.level"
              class="font-cinzel text-xs text-primary not-italic ml-1"
              >Level {{ member.level }}</span
            >
          </p>
        </div>
        <!-- Inspiration -->
        <button
          class="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors"
          :class="
            member.inspiration
              ? 'bg-gold-500/20 border-gold-500/50 text-gold-500'
              : 'border-border text-muted-foreground hover:text-foreground'
          "
          @click="toggleInspiration"
        >
          <Star
            class="h-4 w-4"
            :class="member.inspiration ? 'fill-gold-500' : ''"
          />
          <span class="font-cinzel text-[10px] tracking-wider">Insp.</span>
        </button>
      </div>

      <!-- HP + Combat stats -->
      <div class="rounded-lg border border-border bg-card p-4 space-y-3">
        <div class="flex items-center gap-4">
          <!-- HP control -->
          <div class="flex-1 min-w-0">
            <p
              class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1"
            >
              HIT POINTS
            </p>
            <div class="flex items-center gap-2">
              <button
                class="h-8 w-8 rounded-md bg-muted/50 border border-border flex items-center justify-center hover:bg-muted transition-colors"
                @click="adjustHp(-1)"
              >
                <Minus class="h-3.5 w-3.5" />
              </button>
              <div class="text-center min-w-16">
                <span class="font-cinzel text-3xl font-bold" :class="hpColor">{{
                  member.current_hp
                }}</span>
                <span class="font-fell text-sm text-muted-foreground">
                  / {{ member.max_hp }}</span
                >
              </div>
              <button
                class="h-8 w-8 rounded-md bg-muted/50 border border-border flex items-center justify-center hover:bg-muted transition-colors"
                @click="adjustHp(1)"
              >
                <Plus class="h-3.5 w-3.5" />
              </button>
            </div>
            <p
              v-if="member.temp_hp"
              class="font-fell text-xs text-blue-400 mt-0.5"
            >
              +{{ member.temp_hp }} temp
            </p>
          </div>

          <!-- Small combat stats -->
          <div class="grid grid-cols-2 gap-2 shrink-0">
            <div
              class="rounded-md border border-border px-2.5 py-1.5 text-center min-w-14"
            >
              <p
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider"
              >
                AC
              </p>
              <p class="font-cinzel text-lg font-bold text-foreground">
                {{ member.ac }}
              </p>
            </div>
            <div
              class="rounded-md border border-border px-2.5 py-1.5 text-center min-w-14"
            >
              <p
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider"
              >
                SPEED
              </p>
              <p class="font-cinzel text-lg font-bold text-foreground">
                {{ member.speed
                }}<span class="text-[10px] text-muted-foreground">ft</span>
              </p>
            </div>
            <div
              class="rounded-md border border-border px-2.5 py-1.5 text-center min-w-14"
            >
              <p
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider"
              >
                INIT
              </p>
              <p class="font-cinzel text-lg font-bold text-foreground">
                {{ signedNum(dexMod) }}
              </p>
            </div>
            <div
              class="rounded-md border border-border px-2.5 py-1.5 text-center min-w-14"
            >
              <p
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider"
              >
                PROF
              </p>
              <p class="font-cinzel text-lg font-bold text-foreground">
                +{{ member.proficiency_bonus }}
              </p>
            </div>
          </div>
        </div>

        <!-- HP bar -->
        <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="hpBarColor"
            :style="{ width: `${hpPct}%` }"
          />
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
        </div>
      </div>

      <!-- Ability Scores -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-4 py-2 border-b border-border bg-muted/20">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Ability Scores</span
          >
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-6 divide-x divide-border">
          <button
            v-for="stat in ABILITY_STATS"
            :key="stat.key"
            class="flex flex-col items-center gap-0.5 py-4 px-2 hover:bg-muted/30 transition-colors active:bg-muted/50 group"
            @click="rollAbility(stat)"
          >
            <span
              class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider group-hover:text-foreground transition-colors"
              >{{ stat.label }}</span
            >
            <span class="font-cinzel text-2xl font-bold text-foreground">{{
              member[stat.key]
            }}</span>
            <span
              class="font-fell text-sm"
              :class="
                abilityMod(member[stat.key]) >= 0
                  ? 'text-elven-green'
                  : 'text-destructive'
              "
            >
              {{ signedNum(abilityMod(member[stat.key])) }}
            </span>
            <span
              class="font-cinzel text-[9px] text-muted-foreground/60 tracking-wider group-hover:text-primary transition-colors"
              >ROLL</span
            >
          </button>
        </div>
      </div>

      <!-- Saving Throws -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-4 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Saving Throws</span
            >
          </div>
          <div class="divide-y divide-border">
            <button
              v-for="save in SAVES"
              :key="save.key"
              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group text-left"
              @click="rollSave(save)"
            >
              <span
                class="h-3.5 w-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                :class="
                  isSaveProficient(save.key)
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/40'
                "
              />
              <span class="font-fell text-sm flex-1 text-foreground">{{
                save.label
              }}</span>
              <span
                class="font-cinzel text-sm font-bold"
                :class="
                  saveBonus(save.key) >= 0
                    ? 'text-foreground'
                    : 'text-destructive'
                "
              >
                {{ signedNum(saveBonus(save.key)) }}
              </span>
              <ChevronRight
                class="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors"
              />
            </button>
          </div>
        </div>

        <!-- Passive scores (mobile only — desktop shown in Skills header) -->
        <div class="flex flex-col gap-3 md:hidden">
          <div
            class="rounded-lg border border-border bg-card p-3 flex items-center justify-between"
          >
            <span class="font-fell text-sm text-foreground"
              >Passive Perception</span
            >
            <span class="font-cinzel text-sm font-bold text-foreground">{{
              passivePerception
            }}</span>
          </div>
          <div
            class="rounded-lg border border-border bg-card p-3 flex items-center justify-between"
          >
            <span class="font-fell text-sm text-foreground"
              >Passive Insight</span
            >
            <span class="font-cinzel text-sm font-bold text-foreground">{{
              passiveInsight
            }}</span>
          </div>
          <div
            class="rounded-lg border border-border bg-card p-3 flex items-center justify-between"
          >
            <span class="font-fell text-sm text-foreground"
              >Passive Investigation</span
            >
            <span class="font-cinzel text-sm font-bold text-foreground">{{
              passiveInvestigation
            }}</span>
          </div>
        </div>
      </div>

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
        <div class="px-4 py-2 border-b border-border bg-muted/20">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Conditions</span
          >
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
import { Plus, Minus, Star, ChevronRight, Sword, Zap } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { SKILLS, CONDITIONS } from "@/types/party.types";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{ memberId?: string }>();

const auth = useAuthStore();
const ui = useUiStore();

const { data: partyMembers } = useParty();
const { data: inventory } = usePartyInventory();
const { data: allItems } = useItems();
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const { sendRoll } = useCampaignMessages();

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
const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

const SAVES = [
  { key: "str" as const, label: "Strength" },
  { key: "dex" as const, label: "Dexterity" },
  { key: "con" as const, label: "Constitution" },
  { key: "int" as const, label: "Intelligence" },
  { key: "wis" as const, label: "Wisdom" },
  { key: "cha" as const, label: "Charisma" },
];

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
  return (
    member.value?.saving_throw_proficiencies?.includes(
      key as (typeof SAVES)[number]["key"],
    ) ?? false
  );
}

function saveBonus(key: string) {
  if (!member.value) return 0;
  const score = member.value[key as keyof PartyMember] as number;
  const mod = abilityMod(score);
  return mod + (isSaveProficient(key) ? member.value.proficiency_bonus : 0);
}

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
async function adjustHp(delta: number) {
  if (!member.value) return;
  const newHp = Math.max(
    0,
    Math.min(member.value.max_hp, member.value.current_hp + delta),
  );
  await updatePartyMember({
    id: member.value.id,
    update: { current_hp: newHp },
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

// ── Roll system ────────────────────────────────────────────────────────────────
interface RollToast {
  label: string;
  dice: number;
  modifier: number;
  total: number;
}
const rollToast = ref<RollToast | null>(null);
let rollTimer: ReturnType<typeof setTimeout> | null = null;

function doRoll(label: string, modifier: number) {
  const dice = Math.floor(Math.random() * 20) + 1;
  const total = dice + modifier;
  rollToast.value = { label, dice, modifier, total };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => {
    rollToast.value = null;
  }, 3000);

  // Post to campaign chat
  void sendRoll({
    total,
    label,
    modifier,
    breakdown: [{ val: dice, dropped: false }],
    isCrit: dice === 20,
    isFumble: dice === 1,
  });
}

function rollAbility(stat: (typeof ABILITY_STATS)[number]) {
  if (!member.value) return;
  doRoll(`${stat.label} Check`, abilityMod(member.value[stat.key]));
}

function rollSave(save: (typeof SAVES)[number]) {
  doRoll(`${save.label} Save`, saveBonus(save.key));
}

function rollSkill(skill: (typeof SKILLS)[number]) {
  doRoll(`${skill.label} Check`, skillBonusValue(skill));
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
  const dice = Math.floor(Math.random() * 20) + 1;
  const total = dice + mod;
  rollToast.value = {
    label: `${inv.name} — Attack`,
    dice,
    modifier: mod,
    total,
  };
  if (rollTimer) clearTimeout(rollTimer);
  rollTimer = setTimeout(() => {
    rollToast.value = null;
  }, 3000);
  void sendRoll({
    total,
    label: `${inv.name} — Attack`,
    modifier: mod,
    breakdown: [{ val: dice, dropped: false }],
    isCrit: dice === 20,
    isFumble: dice === 1,
  });
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
