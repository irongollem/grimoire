<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <ExhaustionChip
      v-if="getExhaustionLevel(member.conditions) > 0"
      :level="getExhaustionLevel(member.conditions)"
      @update="setExhaustion"
    />
    <span
      v-for="cond in nonExhaustionConditions"
      :key="cond"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/30 font-cinzel text-[10px] font-semibold text-destructive"
      :title="getConditionDescription(cond)"
    >
      {{ cond }}
      <button type="button" class="hover:text-destructive/60 transition-colors" @click="removeCondition(cond)">×</button>
    </span>

    <span
      v-for="curse in member.curses"
      :key="curse"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 font-cinzel text-[10px] font-semibold text-violet-400"
    >
      Cursed: {{ curse }}
      <button type="button" class="hover:text-violet-400/60 transition-colors" @click="removeCurse(curse)">×</button>
    </span>

    <template v-if="curseInputOpen">
      <input
        :ref="(el) => { if (el) curseInputEl = el as HTMLInputElement }"
        v-model="curseInputText"
        placeholder="Curse name…"
        class="px-2 py-0.5 rounded-full border border-violet-500/50 bg-violet-500/10 font-cinzel text-[10px] text-violet-400 placeholder:text-violet-400/40 focus:outline-none w-32"
        @keydown.enter.prevent="addCurse"
        @keydown.escape="curseInputOpen = false"
      />
      <button
        type="button"
        class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-violet-500/50 font-cinzel text-[10px] text-violet-400 hover:bg-violet-500/20 transition-colors"
        @click="addCurse"
      >Add</button>
    </template>

    <div class="relative">
      <button
        type="button"
        class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/40 font-cinzel text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        @click="toggleDropdown"
      >
        <IconAdd class="h-2.5 w-2.5" /> Condition
      </button>
      <div v-if="conditionOpen" class="fixed inset-0 z-10" @click="conditionOpen = false" />
      <div
        v-if="conditionOpen"
        class="absolute left-0 z-20 w-48 rounded-lg border border-border bg-card shadow-lg p-1"
        :class="conditionOpenUp ? 'bottom-full mb-1' : 'top-full mt-1'"
      >
        <button
          v-for="cond in availableConditions"
          :key="cond"
          type="button"
          class="w-full text-left px-2 py-1 rounded font-cinzel text-[11px] text-foreground hover:bg-muted transition-colors"
          :title="getConditionDescription(cond)"
          @click="addCondition(cond)"
        >{{ cond }}</button>
        <div class="border-t border-border mt-1 pt-1">
          <button
            type="button"
            class="w-full text-left px-2 py-1 rounded font-cinzel text-[11px] text-violet-400 hover:bg-muted transition-colors"
            @click="openCurseInput"
          >Cursed…</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { IconAdd } from '@/lib/icons';
import { useUpdatePartyMember } from "@/composables/useParty";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
} from "@/lib/conditions";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();
const { mutateAsync: updateMember } = useUpdatePartyMember();

const conditionOpen = ref(false);
const conditionOpenUp = ref(false);
const curseInputOpen = ref(false);
const curseInputText = ref("");
const curseInputEl = ref<HTMLInputElement | null>(null);

const nonExhaustionConditions = computed(() => member.conditions.filter((c) => !isExhaustion(c)));

const availableConditions = computed(() => {
  const hasExhaustion = getExhaustionLevel(member.conditions) > 0;
  return CONDITIONS.filter((c) => {
    if (c === "Exhaustion") return !hasExhaustion;
    return !member.conditions.includes(c);
  });
});

function toggleDropdown(event: MouseEvent) {
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  const estimated = availableConditions.value.length * 26 + 40;
  conditionOpenUp.value = rect.bottom + estimated > window.innerHeight;
  conditionOpen.value = !conditionOpen.value;
}

async function addCondition(condition: string) {
  conditionOpen.value = false;
  if (condition === "Exhaustion") {
    await setExhaustion(1);
    return;
  }
  await updateMember({ id: member.id, update: { conditions: [...member.conditions, condition] } });
}

async function removeCondition(condition: string) {
  await updateMember({ id: member.id, update: { conditions: member.conditions.filter((c) => c !== condition) } });
}

async function setExhaustion(level: number) {
  await updateMember({ id: member.id, update: { conditions: setExhaustionLevel(member.conditions, level) } });
}

function openCurseInput() {
  conditionOpen.value = false;
  curseInputText.value = "";
  curseInputOpen.value = true;
  nextTick(() => curseInputEl.value?.focus());
}

async function addCurse() {
  const name = curseInputText.value.trim();
  if (!name) { curseInputOpen.value = false; return; }
  const curses = [...(member.curses ?? []), name];
  const conditions = member.conditions.includes("Cursed")
    ? member.conditions
    : [...member.conditions, "Cursed"];
  await updateMember({ id: member.id, update: { curses, conditions } });
  curseInputOpen.value = false;
  curseInputText.value = "";
}

async function removeCurse(curse: string) {
  const curses = (member.curses ?? []).filter((c) => c !== curse);
  const conditions = curses.length
    ? member.conditions
    : member.conditions.filter((c) => c !== "Cursed");
  await updateMember({ id: member.id, update: { curses, conditions } });
}
</script>
