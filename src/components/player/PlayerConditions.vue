<template>
  <!-- Conditions row: chips + add button -->
  <div class="flex flex-wrap items-center gap-1.5 min-h-8">

    <!-- Exhaustion (single chip with pip levels) -->
    <ExhaustionChip
      v-if="exhaustionLevel > 0"
      :level="exhaustionLevel"
      @update="setExhaustion"
    />

    <!-- Other condition chips -->
    <div
      v-for="cond in member.conditions.filter((c) => !isExhaustion(c))"
      :key="cond"
      class="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 pl-2.5 pr-1 py-0.5"
    >
      <span
        class="text-label-lg text-destructive leading-none"
        :title="getConditionDescription(cond, ruleset)"
      >{{ cond }}</span>
      <button
        class="flex items-center justify-center w-4 h-4 rounded-full text-destructive/50 hover:text-destructive hover:bg-destructive/20 transition-colors text-sm leading-none"
        title="Remove condition"
        @click="removeCondition(cond)"
      >×</button>
    </div>

    <!-- Active curses (read-only) -->
    <div
      v-for="curse in member.curses"
      :key="curse"
      class="flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5"
    >
      <span class="text-label-lg text-violet-400 leading-none">{{ curse }}</span>
    </div>

  </div>

  <!-- Death saves (shown only at 0 HP) -->
  <div v-if="member.current_hp <= 0" class="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
    <p class="text-label-lg font-semibold text-destructive mb-3">Death Saving Throws</p>
    <div class="flex items-center gap-8">
      <div>
        <p class="text-caption text-muted-foreground mb-1.5">Successes</p>
        <div class="flex gap-2">
          <button
            v-for="i in 3"
            :key="`s-${i}`"
            class="h-6 w-6 rounded-full border-2 transition-colors"
            :class="i <= member.death_save_successes ? 'bg-elven-green border-elven-green' : 'border-border hover:border-elven-green/50'"
            @click="toggleDeathSave('success', i)"
          />
        </div>
      </div>
      <div>
        <p class="text-caption text-muted-foreground mb-1.5">Failures</p>
        <div class="flex gap-2">
          <button
            v-for="i in 3"
            :key="`f-${i}`"
            class="h-6 w-6 rounded-full border-2 transition-colors"
            :class="i <= member.death_save_failures ? 'bg-destructive border-destructive' : 'border-border hover:border-destructive/50'"
            @click="toggleDeathSave('failure', i)"
          />
        </div>
      </div>
      <button
        class="ml-auto h-7 px-3 rounded border border-destructive/40 bg-destructive/10 text-label md:text-sm text-destructive hover:bg-destructive/20 transition-colors"
        @click="rollDeathSave"
      >Roll d20</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useRuleset } from "@/composables/useRuleset";
import {
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
} from "@/rules/conditions";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{ member: PartyMember }>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();
const { ruleset } = useRuleset();

// ── Condition helpers ─────────────────────────────────────────────────────────

const exhaustionLevel = computed(() => getExhaustionLevel(props.member.conditions ?? []));

async function removeCondition(cond: string) {
  const updated = (props.member.conditions ?? []).filter(c => c !== cond);
  await updateMember({ id: props.member.id, update: { conditions: updated } });
}

async function setExhaustion(level: number) {
  const updated = setExhaustionLevel(props.member.conditions ?? [], level);
  await updateMember({ id: props.member.id, update: { conditions: updated } });
}

// ── Death saves ───────────────────────────────────────────────────────────────

async function toggleDeathSave(type: "success" | "failure", pip: number) {
  const current = type === "success" ? props.member.death_save_successes : props.member.death_save_failures;
  const newVal = pip === current ? pip - 1 : pip;
  const update = type === "success" ? { death_save_successes: newVal } : { death_save_failures: newVal };
  await updateMember({ id: props.member.id, update });
}

async function rollDeathSave() {
  const name = props.member.name;
  const r = await promptRoll({ counts: { 20: 1 }, modifier: 0, label: `${name} — Death Save`, silent: true });
  if (!r) return;
  const d = r.breakdown.find(b => !b.dropped)!.val;
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
  await sendRoll({ ...r, label });
}
</script>
