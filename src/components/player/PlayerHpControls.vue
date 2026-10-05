<template>
  <!-- The amount box and the buttons that change hit points. Shared by the
       sheet's header and the strip that follows the player down the page, so
       the two cannot drift. Sized for a thumb: AppButton/AppInput `md` carry the
       44px floor on a phone and relax from md up. -->
  <div class="flex flex-wrap items-center gap-1.5">
    <AppInput
      v-model.number="hpInput"
      type="number"
      tone="muted"
      :size="controlSize"
      align="center"
      min="0"
      placeholder="0"
      aria-label="Amount"
      class="w-16"
      @keydown="blockInvalidChars"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <AppButton variant="tinted" :size="controlSize" tone="danger" emphasis="soft" label="Damage" @click="applyDamage" />
    <AppButton variant="tinted" :size="controlSize" tone="success" emphasis="soft" label="Heal" @click="applyHeal" />
    <AppButton v-if="!compact" variant="tinted" :size="controlSize" tone="info" emphasis="soft" label="Temp" @click="applyTempHp" />
    <!-- A hit on someone at 0 HP is a death save failure, two from a critical hit: it matters only here. -->
    <AppCheckbox v-if="hitsDyingBody && !compact" v-model="criticalHit" size="sm" label-role="label" label="Critical hit" class="whitespace-nowrap" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useConcentration } from "@/composables/party/useConcentration";
import { betterTempHp, formHpPools } from "@/rules/hitPoints";
import { damageOutcome, describeDamageOutcome, healingOutcome } from "@/rules/dying";
import { useToast } from "@/composables/useToast";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";
import type { WildshapeState } from "@/types/encounter.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useBelow } from "@/composables/useBreakpoint";
import AppCheckbox from "@/components/common/AppCheckbox.vue";

const { member, wildshape, compact = false } = defineProps<{
  member: PartyMember;
  wildshape?: WildshapeState;
  /** The strip's short form: no Temp button and no critical-hit box. */
  compact?: boolean;
}>();

// 44px on a phone; the DM tracker's own size from md up, where the header's
// column is narrow and the pointer or an iPad thumb has room to spare.
const control = useBelow("md");
const controlSize = computed(() => (control.value ? "md" : "sm"));
const toast = useToast();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { rollConcentrationSave, endConcentration } = useConcentration();

const hpInput = ref<number | null>(null);

function blockInvalidChars(e: KeyboardEvent) {
  if (["+", "-", "e", "E", ".", ","].includes(e.key)) e.preventDefault();
}

/**
 * The amount box as whole hit points, emptying the box. Keys alone cannot keep
 * a fraction or a sign out (a paste or a phone's number pad gets past
 * `blockInvalidChars`), and "1.5" reached the database as an integer column's
 * 400: the damage was lost with no word to the player.
 */
function takeHpAmount(): number | null {
  const amount = Math.trunc(Number(hpInput.value));
  hpInput.value = null;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

const hpPools = computed(() => formHpPools(member, wildshape));
const criticalHit = ref(false);
/** The critical-hit choice shows only for a character at 0 HP and not in a beast form. */
const hitsDyingBody = computed(() => member.current_hp <= 0 && !wildshape);
const dyingInput = computed(() => ({
  pools: hpPools.value,
  saves: { successes: member.death_save_successes, failures: member.death_save_failures },
  conditions: member.conditions ?? [],
}));

async function applyDamage() {
  const dmg = takeHpAmount();
  if (dmg === null) return;
  const critical = hitsDyingBody.value && criticalHit.value;
  criticalHit.value = false;

  // Temp HP, beast form and own HP, then death at 0 HP: shared with the
  // encounter runner and DM tracker so every side agrees.
  const out = damageOutcome(dyingInput.value, { amount: dmg, critical });
  const update: PartyMemberUpdate = { current_hp: out.current_hp };
  if (out.temp_hp !== member.temp_hp) update.temp_hp = out.temp_hp;
  if (wildshape) {
    // A 2024 form has no beast pool: it stays until the character drops to 0.
    if (out.reverted) update.wildshape_state = null;
    else if (out.beast_hp !== null) update.wildshape_state = { ...wildshape, beast_hp: out.beast_hp };
  }
  if (out.saves.successes !== member.death_save_successes) update.death_save_successes = out.saves.successes;
  if (out.saves.failures !== member.death_save_failures) update.death_save_failures = out.saves.failures;
  if (out.conditions.length !== (member.conditions ?? []).length) update.conditions = out.conditions;
  await updateMember({ id: member.id, update });
  const message = describeDamageOutcome(member.name, dmg, out.outcome);
  if (message) toast.info(message);

  if (member.concentration) {
    if (out.current_hp === 0) {
      await endConcentration(member, { reason: "dropped to 0 HP" });
    } else {
      // Damage soaked by temp HP is still damage taken, so it still forces the
      // save (SAC ruling) — and concentration survives Wild Shape.
      await rollConcentrationSave(member, dmg);
    }
  }
}
async function applyHeal() {
  const val = takeHpAmount();
  if (val === null) return;
  const out = healingOutcome(dyingInput.value, val);
  if (out.outcome === "healing-refused-dead") {
    toast.info(`${member.name} is dead. Healing cannot bring them back. Only the DM can.`);
    return;
  }
  if (wildshape && out.beast_hp !== null) {
    await updateMember({ id: member.id, update: {
      wildshape_state: { ...wildshape, beast_hp: out.beast_hp },
    }});
    return;
  }
  const update: PartyMemberUpdate = { current_hp: out.current_hp };
  // Healing from 0 ends the dying condition (5e): clear the death saves and
  // Unconscious so a later drop to 0 starts fresh.
  if (out.outcome === "revived-by-healing") {
    update.death_save_successes = 0;
    update.death_save_failures = 0;
    update.conditions = out.conditions;
  }
  await updateMember({ id: member.id, update });
}
async function applyTempHp() {
  const amount = takeHpAmount();
  if (amount === null) return;
  // Temp HP doesn't stack — a smaller new source never replaces a bigger pool.
  await updateMember({ id: member.id, update: { temp_hp: betterTempHp(member.temp_hp, amount) } });
}
</script>
