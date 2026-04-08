<template>
  <!-- Conditions row: chips + add button -->
  <div class="flex flex-wrap items-center gap-1.5 min-h-8">

    <!-- Active condition chips -->
    <div
      v-for="cond in member.conditions"
      :key="cond"
      class="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 pl-2.5 pr-1 py-0.5"
    >
      <button
        class="font-cinzel text-[11px] text-destructive tracking-wider leading-none"
        :title="CONDITION_DESCRIPTIONS[cond]"
        @click="() => {}"
      >{{ cond }}</button>
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
      <span class="font-cinzel text-[11px] text-violet-400 tracking-wider leading-none">{{ curse }}</span>
    </div>

  </div>

  <!-- Death saves (shown only at 0 HP) -->
  <div v-if="member.current_hp <= 0" class="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
    <p class="font-cinzel text-xs font-semibold text-destructive tracking-wider mb-3">Death Saving Throws</p>
    <div class="flex items-center gap-8">
      <div>
        <p class="font-fell text-xs text-muted-foreground mb-1.5">Successes</p>
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
        <p class="font-fell text-xs text-muted-foreground mb-1.5">Failures</p>
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
        class="ml-auto h-7 px-3 rounded border border-destructive/40 bg-destructive/10 font-cinzel text-[10px] text-destructive hover:bg-destructive/20 transition-colors tracking-wider"
        @click="rollDeathSave"
      >Roll d20</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{ member: PartyMember }>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { sendRoll } = useCampaignMessages();

// ── Condition descriptions ────────────────────────────────────────────────────

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  "Blinded":      "Can't see. Auto-fail sight checks. Your attacks have disadvantage; attacks against you have advantage.",
  "Charmed":      "Can't attack or harm the charmer. Charmer has advantage on social interactions with you.",
  "Deafened":     "Can't hear. Auto-fail hearing checks.",
  "Exhausted 1":  "Disadvantage on ability checks.",
  "Exhausted 2":  "Speed halved.",
  "Exhausted 3":  "Disadvantage on attack rolls and saving throws.",
  "Frightened":   "Disadvantage on ability checks and attacks while source is visible. Can't willingly move closer to it.",
  "Grappled":     "Speed becomes 0. Ends if grappler is incapacitated or you are moved out of reach.",
  "Incapacitated":"Can't take actions or reactions.",
  "Invisible":    "Can't be seen without special senses. Your attacks have advantage; attacks against you have disadvantage.",
  "Paralyzed":    "Incapacitated, can't move or speak. Auto-fail STR/DEX saves. Attacks have advantage and are auto-crits within 5 ft.",
  "Petrified":    "Transformed to stone. Incapacitated, resistant to all damage. Auto-fail STR/DEX saves; attacks have advantage.",
  "Poisoned":     "Disadvantage on attack rolls and ability checks.",
  "Prone":        "Your attacks have disadvantage. Melee attacks against you within 5 ft have advantage; ranged attacks have disadvantage.",
  "Restrained":   "Speed 0. Disadvantage on attacks and DEX saves. Attacks against you have advantage.",
  "Stunned":      "Incapacitated, can't move. Auto-fail STR/DEX saves. Attacks against you have advantage.",
  "Unconscious":  "Incapacitated, prone. Auto-fail STR/DEX saves. Attacks have advantage and are auto-crits within 5 ft.",
};

// ── Condition helpers ─────────────────────────────────────────────────────────

async function removeCondition(cond: string) {
  await updateMember({ id: props.member.id, update: { conditions: (props.member.conditions ?? []).filter(c => c !== cond) } });
}

// ── Death saves ───────────────────────────────────────────────────────────────

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
