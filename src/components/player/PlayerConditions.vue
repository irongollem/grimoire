<template>
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
        :class="hasCondition(cond)
          ? 'bg-destructive/15 border-destructive/40 text-destructive'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'"
        @click="toggleCondition(cond)"
      >{{ cond }}</button>
    </div>

    <!-- Active curses (read-only) -->
    <div v-if="member.curses?.length" class="px-3 pb-3 flex flex-wrap gap-2">
      <span
        v-for="curse in member.curses"
        :key="curse"
        class="px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 font-cinzel text-[11px] text-violet-400 tracking-wider"
      >Cursed: {{ curse }}</span>
    </div>

    <!-- Death saves (inline when at 0 HP) -->
    <div v-if="member.current_hp <= 0" class="px-4 pb-4 pt-3 border-t border-destructive/20">
      <p class="font-cinzel text-xs font-semibold text-destructive tracking-wider mb-3">Death Saving Throws</p>
      <div class="flex items-center gap-8">
        <div>
          <p class="font-fell text-xs text-muted-foreground mb-1.5">Successes</p>
          <div class="flex gap-2">
            <button
              v-for="i in 3"
              :key="`s-${i}`"
              class="h-6 w-6 rounded-full border-2 transition-colors"
              :class="i <= member.death_save_successes
                ? 'bg-elven-green border-elven-green'
                : 'border-border hover:border-elven-green/50'"
              @click="toggleDeathSave('success', i)"
            />
          </div>
        </div>
        <div>
          <p class="font-fell text-xs text-muted-foreground mb-1.5">Failures</p>
          <div class="flex gap-2">
            <button
              v-for="i in 3"
              :key="`f-${i}`"
              class="h-6 w-6 rounded-full border-2 transition-colors"
              :class="i <= member.death_save_failures
                ? 'bg-destructive border-destructive'
                : 'border-border hover:border-destructive/50'"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { CONDITIONS } from "@/types/party.types";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{ member: PartyMember }>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { sendRoll } = useCampaignMessages();

const ATTACK_DIS_CONDITIONS = new Set(["Blinded", "Frightened", "Poisoned", "Prone", "Restrained"]);
const CHECK_DIS_CONDITIONS  = new Set(["Frightened", "Poisoned", "Exhausted 1", "Exhausted 2", "Exhausted 3"]);

const attackDisadvantage = computed(() => props.member.conditions?.some(c => ATTACK_DIS_CONDITIONS.has(c)) ?? false);
const checkDisadvantage  = computed(() => props.member.conditions?.some(c => CHECK_DIS_CONDITIONS.has(c)) ?? false);

function hasCondition(cond: string) { return props.member.conditions?.includes(cond) ?? false; }

async function toggleCondition(cond: string) {
  const current = [...(props.member.conditions ?? [])];
  const idx = current.indexOf(cond);
  if (idx >= 0) current.splice(idx, 1); else current.push(cond);
  await updateMember({ id: props.member.id, update: { conditions: current } });
}

async function toggleDeathSave(type: "success" | "failure", pip: number) {
  const current = type === "success" ? props.member.death_save_successes : props.member.death_save_failures;
  const newVal = pip === current ? pip - 1 : pip;
  const update = type === "success" ? { death_save_successes: newVal } : { death_save_failures: newVal };
  await updateMember({ id: props.member.id, update });
}

async function rollDeathSave() {
  const d = Math.floor(Math.random() * 20) + 1;
  const name = props.member.name;
  let update: Partial<{ current_hp: number; death_save_successes: number; death_save_failures: number }>;
  let outcome: string;

  if (d === 20) {
    update = { current_hp: 1, death_save_successes: 0, death_save_failures: 0 };
    outcome = "Nat 20 — Stabilized";
  } else if (d === 1) {
    update = { death_save_failures: Math.min(3, props.member.death_save_failures + 2) };
    outcome = "Nat 1 — 2 Failures";
  } else if (d >= 10) {
    update = { death_save_successes: Math.min(3, props.member.death_save_successes + 1) };
    outcome = "Success";
  } else {
    update = { death_save_failures: Math.min(3, props.member.death_save_failures + 1) };
    outcome = "Failure";
  }

  await updateMember({ id: props.member.id, update });
  const label = `${name} — Death Save (${outcome})`;
  emit("roll", { label, dice: d, modifier: 0, total: d });
  void sendRoll({ total: d, label, modifier: 0, breakdown: [{ val: d, dropped: false }], isCrit: d === 20, isFumble: d === 1 });
}
</script>
