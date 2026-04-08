<template>
  <div class="space-y-6 max-w-lg mx-auto">
    <!-- Header -->
    <div class="text-center space-y-1">
      <p class="font-cinzel text-xs text-primary tracking-widest uppercase">Level Up</p>
      <h2 class="font-cinzel text-2xl font-bold text-foreground">
        {{ member.name }}
        <span class="text-muted-foreground">→ Level {{ nextLevel }}</span>
      </h2>
      <p v-if="member.class" class="font-fell text-sm text-muted-foreground italic">{{ member.class }}</p>
    </div>

    <!-- Max level guard -->
    <div v-if="nextLevel > 20" class="rounded-lg border border-border bg-card p-6 text-center space-y-2">
      <p class="font-cinzel text-sm text-muted-foreground">{{ member.name }} has already reached level 20.</p>
    </div>

    <template v-else>
      <!-- Features gained -->
      <div class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Features Gained</h3>

        <template v-if="levelData && levelData.features.length > 0">
          <ul class="space-y-1">
            <li
              v-for="feat in levelData.features"
              :key="feat"
              class="flex items-start gap-2 font-fell text-sm text-foreground"
            >
              <span class="text-primary mt-0.5">✦</span>
              <span>{{ feat }}</span>
            </li>
          </ul>
        </template>
        <template v-else-if="levelData">
          <p class="font-fell text-sm text-muted-foreground italic">
            Class feature details coming soon — check the class description for level {{ nextLevel }} features.
          </p>
        </template>
        <template v-else>
          <p class="font-fell text-sm text-muted-foreground italic">
            No class-specific feature data available yet for {{ member.class ?? "this class" }}.
          </p>
        </template>

        <!-- Proficiency bonus bump notice -->
        <div
          v-if="newProfBonus !== member.proficiency_bonus"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider">PROF</span>
          <span class="font-fell text-sm text-foreground">
            Proficiency bonus increases to
            <strong class="font-cinzel">+{{ newProfBonus }}</strong>
          </span>
        </div>
      </div>

      <!-- ASI picker -->
      <div v-if="levelData?.asi" class="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Ability Score Improvement</h3>
        <p class="font-fell text-sm text-muted-foreground">Choose how to apply your improvement.</p>

        <!-- Mode toggle -->
        <div class="flex rounded-md border border-border overflow-hidden w-fit font-cinzel text-xs tracking-wider">
          <button
            class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'plus2' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'plus2'"
          >+2 to one</button>
          <button
            class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'plus1plus1' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'plus1plus1'"
          >+1 / +1</button>
        </div>

        <!-- Ability picker(s) -->
        <div class="flex flex-wrap gap-3">
          <div class="space-y-1">
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
              {{ asiMode === 'plus2' ? '+2 Ability' : '+1 First Ability' }}
            </label>
            <select
              v-model="asiPrimary"
              class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Select…</option>
              <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
            </select>
          </div>

          <div v-if="asiMode === 'plus1plus1'" class="space-y-1">
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">+1 Second Ability</label>
            <select
              v-model="asiSecondary"
              class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Select…</option>
              <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
            </select>
          </div>
        </div>

        <!-- Preview -->
        <div v-if="asiPreview.length > 0" class="font-fell text-sm text-muted-foreground">
          <span v-for="(line, i) in asiPreview" :key="i" class="mr-3">{{ line }}</span>
        </div>
      </div>

      <!-- Subclass choice (first unlock, no subclass yet) -->
      <div v-if="needsSubclassChoice" class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Choose Subclass</h3>
        <p class="font-fell text-sm text-muted-foreground">
          At level {{ nextLevel }}, {{ member.class }} characters choose their specialisation.
          Individual subclass pickers are added per class — for now, enter the name directly.
        </p>
        <input
          v-model="subclassInput"
          type="text"
          placeholder="e.g. Circle of the Moon"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Error -->
      <p v-if="error" class="font-fell text-sm text-destructive">{{ error }}</p>

      <!-- Confirm / Cancel -->
      <div class="flex gap-3">
        <RouterLink
          to="/play"
          class="flex-1 rounded-md border border-border px-4 py-2 font-cinzel text-xs text-muted-foreground text-center tracking-wider hover:text-foreground hover:border-primary/40 transition-colors"
        >Cancel</RouterLink>
        <button
          class="flex-1 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="isPending || !canConfirm"
          @click="confirm"
        >
          {{ isPending ? "Applying…" : `Confirm Level ${nextLevel}` }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { useUpdatePartyMember } from "@/composables/useParty";
import { getLevelData, proficiencyBonusForLevel } from "./classFeatures";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";
import type { AbilityKey, AsiMode } from "./types";

const props = defineProps<{ member: PartyMember }>();

const router = useRouter();
const { mutateAsync: updateMember, isPending } = useUpdatePartyMember();

const nextLevel    = computed(() => props.member.level + 1);
const levelData    = computed(() => getLevelData(props.member.class ?? "", nextLevel.value));
const newProfBonus = computed(() => proficiencyBonusForLevel(nextLevel.value));

const needsSubclassChoice = computed(() =>
  !!levelData.value?.subclass_feature && !props.member.subclass,
);

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
const ABILITY_OPTIONS = (Object.entries(ABILITY_LABEL) as [AbilityKey, string][]).map(([key, label]) => ({ key, label }));

const asiMode      = ref<AsiMode>("plus2");
const asiPrimary   = ref<AbilityKey | "">("");
const asiSecondary = ref<AbilityKey | "">("");

const asiPreview = computed(() => {
  const lines: string[] = [];
  if (asiPrimary.value) {
    const cur = props.member[asiPrimary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiPrimary.value]} ${cur} → ${cur + (asiMode.value === "plus2" ? 2 : 1)}`);
  }
  if (asiMode.value === "plus1plus1" && asiSecondary.value && asiSecondary.value !== asiPrimary.value) {
    const cur = props.member[asiSecondary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiSecondary.value]} ${cur} → ${cur + 1}`);
  }
  return lines;
});

const subclassInput = ref("");
const error         = ref("");

const canConfirm = computed(() => {
  if (nextLevel.value > 20) return false;
  if (levelData.value?.asi) {
    if (!asiPrimary.value) return false;
    if (asiMode.value === "plus1plus1" && (!asiSecondary.value || asiSecondary.value === asiPrimary.value)) return false;
  }
  return true;
});

async function confirm() {
  error.value = "";
  const update: Record<string, unknown> = {
    level: nextLevel.value,
    proficiency_bonus: newProfBonus.value,
  };

  if (levelData.value?.asi && asiPrimary.value) {
    const bonus = asiMode.value === "plus2" ? 2 : 1;
    update[asiPrimary.value] = (props.member[asiPrimary.value as keyof PartyMember] as number) + bonus;
    if (asiMode.value === "plus1plus1" && asiSecondary.value) {
      update[asiSecondary.value] = (props.member[asiSecondary.value as keyof PartyMember] as number) + 1;
    }
  }

  const subclass = subclassInput.value.trim();
  if (needsSubclassChoice.value && subclass) {
    update.subclass = subclass;
    update.class_choices = { ...props.member.class_choices, subclass };
  }

  try {
    await updateMember({ id: props.member.id, update: update as PartyMemberUpdate });
    void router.push("/play");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to apply level up.";
  }
}
</script>
