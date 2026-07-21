<template>
  <div
    class="rounded-lg border bg-card transition-colors"
    :class="member.current_hp <= 0 ? 'border-destructive/50' : 'border-border'"
  >
    <div class="flex flex-col md:flex-row">
      <!-- Left: identity -->
      <div class="flex flex-col md:w-44 md:border-r md:border-border shrink-0 overflow-hidden">
        <div class="h-31.25 bg-muted overflow-hidden">
          <FocalImage
            :src="member.portrait_url"
            :alt="member.name"
            format="landscape"
            :focal-point="member.portrait_focal_point ?? null"
            placeholder="/assets/placeholders/character.webp"
          />
        </div>

        <div class="flex flex-col gap-0.5 px-3 py-2.5">
          <div class="flex items-center gap-1">
            <RouterLink
              :to="`/party/${member.id}`"
              class="font-cinzel text-sm font-bold text-foreground leading-tight hover:text-primary transition-colors flex-1"
            >
              {{ member.name }}
            </RouterLink>
            <button
              class="shrink-0 text-muted-foreground/50 hover:text-primary transition-colors"
              title="Preview player portal as this character"
              @click="previewAsPlayer"
            >
              <IconReveal class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="dmSharedJournal.length"
              class="relative shrink-0 transition-colors"
              :class="unreadJournalCount > 0 ? 'text-amber-500' : 'text-muted-foreground/50 hover:text-amber-500'"
              title="View player journal entries shared with DM"
              @click="showJournalModal = true"
            >
              <IconScrollText class="h-3.5 w-3.5" />
              <span
                v-if="unreadJournalCount > 0"
                class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive text-[0.5rem] font-bold text-white flex items-center justify-center leading-none"
              />
            </button>
          </div>
          <p class="font-fell text-xs text-muted-foreground italic">
            {{
              [speciesNameMap.get(member.species_id ?? '') ?? null, classLabel, levelDisplay ? `Lv${levelDisplay}` : ""]
                .filter(Boolean)
                .join(" · ")
            }}
          </p>
          <span
            v-if="isInDisguise(member)"
            class="inline-flex items-center gap-1 text-label text-amber-500/80"
            title="Currently in disguise"
          >◈ disguised</span>
          <p v-if="member.player_name" class="font-fell text-[0.6875rem] text-muted-foreground">
            {{ member.player_name }}
          </p>
          <RouterLink
            v-if="member.current_location_id"
            :to="`/locations/${member.current_location_id}`"
            class="inline-flex items-center gap-0.5 font-cinzel text-2xs text-muted-foreground hover:text-primary transition-colors"
          >
            <IconLocation class="h-2.5 w-2.5 shrink-0" />
            {{ locationNameMap.get(member.current_location_id) ?? '…' }}
          </RouterLink>
          <span
            v-else
            class="inline-flex items-center gap-0.5 font-cinzel text-2xs text-muted-foreground/40 italic"
          >
            <IconLocation class="h-2.5 w-2.5 shrink-0" />
            Location unknown
          </span>
        </div>
      </div>

      <!-- Middle: HP + stats -->
      <div class="flex-1 p-4 flex flex-col gap-3">
        <!-- HP section -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider flex-1">
              HP
              <span class="ml-2 text-sm font-bold" :class="hpColor(member.current_hp, member.max_hp)">{{ member.current_hp }}</span>
              <span class="text-muted-foreground font-normal"> / {{ member.max_hp }}</span>
              <span v-if="member.temp_hp > 0" class="ml-1 text-blue-400 font-bold">+{{ member.temp_hp }} tmp</span>
            </span>
            <button
              type="button"
              :class="[
                'w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0',
                member.inspiration
                  ? 'bg-yellow-400/20 text-yellow-400'
                  : 'text-muted-foreground/40 hover:text-yellow-400',
              ]"
              title="Toggle inspiration"
              @click="toggleInspiration"
            >
              <IconGenerate class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="h-2 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="hpBarColor(member.current_hp, member.max_hp)"
              :style="{ width: `${Math.max(0, Math.min(100, (member.current_hp / member.max_hp) * 100))}%` }"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              v-model.number="hpInput"
              type="number"
              min="0"
              placeholder="Amt"
              class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              class="px-2.5 py-1 rounded bg-destructive/10 border border-destructive/30 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
              @click="dealDamage"
            >Damage</button>
            <button
              type="button"
              class="px-2.5 py-1 rounded bg-green-500/10 border border-green-500/30 font-cinzel text-xs font-semibold text-green-500 hover:bg-green-500/20 transition-colors"
              @click="heal"
            >Heal</button>
            <button
              type="button"
              class="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 font-cinzel text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
              @click="addTemp"
            >+Temp</button>
          </div>
        </div>

        <!-- Key stats grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 font-cinzel text-xs">
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">AC</span>
            <span class="font-bold text-foreground shrink-0">{{ displayAc }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Speed</span>
            <span class="font-bold text-foreground shrink-0">{{ member.speed }} ft</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Perception</span>
            <span class="font-bold text-foreground shrink-0">{{ passivePerception }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Insight</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveInsight }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Investigation</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveInvestigation }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Arcana</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveArcana }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">History</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveHistory }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Nature</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveNature }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Religion</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveReligion }}</span>
          </span>
        </div>

        <!-- Saving throw proficiencies -->
        <div v-if="member.saving_throw_proficiencies.length" class="flex flex-wrap gap-1">
          <span class="font-cinzel text-2xs text-muted-foreground mr-1 self-center">SAVES:</span>
          <span
            v-for="save in member.saving_throw_proficiencies"
            :key="save"
            class="px-1.5 py-0.5 rounded bg-muted text-eyebrow text-foreground font-semibold"
          >{{ save }}</span>
        </div>

        <PartyConditionsPanel :member="member" />

        <PartyDeathSaves v-if="member.current_hp <= 0" :member="member" />
      </div>
    </div>

    <!-- Companions for this member -->
    <div v-if="companions.length" class="border-t border-border bg-muted/10 px-4 py-3 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-eyebrow font-semibold text-muted-foreground">Companions</span>
        <button
          type="button"
          class="font-cinzel text-2xs text-primary hover:opacity-80 transition-opacity"
          @click="emit('open-companion-form', { companion: null, ownerId: member.id })"
        >+ Add</button>
      </div>
      <CompanionCard
        v-for="comp in companions"
        :key="comp.id"
        :companion="comp"
        :source-name="companionSourceName(comp)"
        :source-link="companionSourceLink(comp)"
        @edit="emit('open-companion-form', { companion: $event })"
        @delete="emit('delete-companion', $event)"
      />
    </div>
    <div v-else class="border-t border-border bg-muted/10 px-4 py-2 flex items-center justify-between">
      <span class="font-fell text-xs text-muted-foreground italic">No companions</span>
      <button
        type="button"
        class="font-cinzel text-2xs text-muted-foreground hover:text-primary transition-colors"
        @click="emit('open-companion-form', { companion: null, ownerId: member.id })"
      >+ Add Companion</button>
    </div>
  </div>

  <PlayerJournalDmModal
    v-if="showJournalModal"
    :player-name="dmPlayerName || member.player_name || member.name"
    :entries="dmSharedJournal"
    @close="showJournalModal = false"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconGenerate, IconLocation, IconReveal, IconScrollText } from '@/lib/icons';
import { useUpdatePartyMember } from "@/composables/useParty";
import { useShieldAcBonus } from "@/composables/useShieldAc";
import { useReadItems } from "@/composables/useReadItems";
import PlayerJournalDmModal from "./PlayerJournalDmModal.vue";
import type { PlayerJournalEntry } from "@/composables/usePlayerJournal";
import { useAllMonsters } from "@/composables/useMonsters";
import { useNpcs } from "@/composables/useNpcs";
import { useUiStore } from "@/stores/ui";
import { isInDisguise } from "@/lib/partyMemberDisplay";
import FocalImage from "@/components/common/FocalImage.vue";
import CompanionCard from "./CompanionCard.vue";
import PartyConditionsPanel from "./PartyConditionsPanel.vue";
import PartyDeathSaves from "./PartyDeathSaves.vue";
import type { PartyMember, SkillProficiencies, SkillProfLevel } from "@/types/party.types";
import type { Companion } from "@/types/companion.types";

const {
  member,
  speciesNameMap,
  locationNameMap,
  classLabel,
  levelDisplay,
  companions,
  dmSharedJournal = [],
  dmPlayerName = "",
} = defineProps<{
  member: PartyMember;
  speciesNameMap: Map<string, string>;
  locationNameMap: Map<string, string>;
  classLabel: string;
  levelDisplay: number;
  companions: Companion[];
  dmSharedJournal?: PlayerJournalEntry[];
  dmPlayerName?: string;
}>();

const emit = defineEmits<{
  'open-companion-form': [payload: { companion: Companion | null; ownerId?: string }];
  'delete-companion': [companion: Companion];
}>();

const router = useRouter();
const ui = useUiStore();
const { mutateAsync: updateMember } = useUpdatePartyMember();

const showJournalModal = ref(false);
const { isNew: isJournalNew } = useReadItems("player_journal");
const unreadJournalCount = computed(() =>
  dmSharedJournal.filter((e) => isJournalNew(e.id, e.updated_at)).length,
);
const { data: allMonsters } = useAllMonsters();
const { data: allNpcs } = useNpcs();

const hpInput = ref(0);

function getHpAmount(): number {
  return Math.max(0, hpInput.value ?? 0);
}

async function dealDamage() {
  const amount = getHpAmount();
  if (!amount) return;
  let hp = member.current_hp;
  let temp = member.temp_hp;
  if (temp > 0) {
    const absorbed = Math.min(temp, amount);
    temp -= absorbed;
    hp = Math.max(-member.max_hp, hp - (amount - absorbed));
  } else {
    hp = Math.max(-member.max_hp, hp - amount);
  }
  await updateMember({ id: member.id, update: { current_hp: hp, temp_hp: temp } });
  hpInput.value = 0;
}

async function heal() {
  const amount = getHpAmount();
  if (!amount) return;
  const hp = Math.min(member.max_hp, member.current_hp + amount);
  await updateMember({ id: member.id, update: { current_hp: hp, death_save_successes: 0, death_save_failures: 0 } });
  hpInput.value = 0;
}

async function addTemp() {
  const amount = getHpAmount();
  if (!amount) return;
  const temp = Math.max(member.temp_hp, amount);
  await updateMember({ id: member.id, update: { temp_hp: temp } });
  hpInput.value = 0;
}

async function toggleInspiration() {
  await updateMember({ id: member.id, update: { inspiration: !member.inspiration } });
}

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

function profAdd(profs: SkillProficiencies, key: keyof SkillProficiencies, profBonus: number) {
  const level: SkillProfLevel = profs[key] ?? "none";
  return level === "proficient" ? profBonus : level === "expertise" ? profBonus * 2 : 0;
}

const { bonusFor: shieldAcBonusFor } = useShieldAcBonus();
const displayAc = computed(
  () => member.wildshape_state?.beast_ac ?? member.ac + shieldAcBonusFor(member.id),
);

const passivePerception = computed(() => 10 + mod(member.wis) + profAdd(member.skill_proficiencies, "perception", member.proficiency_bonus));
const passiveInsight = computed(() => 10 + mod(member.wis) + profAdd(member.skill_proficiencies, "insight", member.proficiency_bonus));
const passiveInvestigation = computed(() => 10 + mod(member.int) + profAdd(member.skill_proficiencies, "investigation", member.proficiency_bonus));
const passiveArcana = computed(() => 10 + mod(member.int) + profAdd(member.skill_proficiencies, "arcana", member.proficiency_bonus));
const passiveHistory = computed(() => 10 + mod(member.int) + profAdd(member.skill_proficiencies, "history", member.proficiency_bonus));
const passiveNature = computed(() => 10 + mod(member.int) + profAdd(member.skill_proficiencies, "nature", member.proficiency_bonus));
const passiveReligion = computed(() => 10 + mod(member.int) + profAdd(member.skill_proficiencies, "religion", member.proficiency_bonus));

function hpColor(current: number, max: number) {
  const pct = current / max;
  if (current <= 0) return "text-destructive";
  if (pct <= 0.25) return "text-orange-400";
  if (pct <= 0.5) return "text-yellow-400";
  return "text-green-400";
}

function hpBarColor(current: number, max: number) {
  const pct = current / max;
  if (current <= 0) return "bg-destructive";
  if (pct <= 0.25) return "bg-orange-400";
  if (pct <= 0.5) return "bg-yellow-400";
  return "bg-green-500";
}

function companionSourceName(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) {
    return (allMonsters.value ?? []).find((m) => m.id === c.source_monster_id)?.name ?? "";
  }
  if (c.source_type === "npc" && c.source_npc_id) {
    return (allNpcs.value ?? []).find((n) => n.id === c.source_npc_id)?.name ?? "";
  }
  return "";
}

function companionSourceLink(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) return `/bestiary/${c.source_monster_id}`;
  if (c.source_type === "npc" && c.source_npc_id) return `/npcs/${c.source_npc_id}`;
  return "";
}

function previewAsPlayer() {
  ui.enterDmPreview(member.id);
  router.push({ name: "play" });
}
</script>
