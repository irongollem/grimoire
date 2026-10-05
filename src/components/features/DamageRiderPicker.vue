<template>
  <div class="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-2" @click.stop>
    <div v-if="offered.length" class="flex flex-col gap-1.5">
      <div v-for="(entry, i) in offered" :key="riderId(i)">
        <AppCheckbox
          :model-value="isPicked(i)"
          :label="riderLabel(entry)"
          :hint="riderHint(entry)"
          :disabled="unavailable(entry) !== null"
          @update:model-value="(on: boolean) => setPicked(i, on)"
        />
        <p v-if="unavailable(entry)" class="ml-6 text-caption text-muted-foreground">{{ unavailable(entry) }}</p>
      </div>
    </div>

    <label v-if="slotRiderPicked" class="flex items-center gap-2">
      <span class="text-body text-foreground shrink-0">Spell slot</span>
      <AppSelect v-model="slotKey" size="sm" class="min-w-0 flex-1" aria-label="Spell slot to spend">
        <option v-for="slot in spendableSlots" :key="spellSlotKey(slot)" :value="spellSlotKey(slot)">
          Level {{ slot.level }} ({{ slot.max - slot.used }} left){{ slotPool(slot) === "pact" ? ", Pact Magic" : "" }}
        </option>
      </AppSelect>
    </label>

    <AppCheckbox v-model="critical" label="Critical hit" hint="Doubles every damage die, not the bonuses" />

    <div class="flex flex-wrap items-center gap-2">
      <AppButton
        variant="primary"
        size="md"
        :disabled="rolling || preview === null"
        :label="preview ? `Roll ${preview}` : 'Roll damage'"
        @click="roll"
      />
      <AppButton variant="ghost" size="md" label="Cancel" @click="emit('cancel')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useCharacterFeatures } from "@/composables/features/useCharacterFeatures";
import { useFeatureUses } from "@/composables/features/useFeatureUses";
import { useSpendFeatureSpellSlot } from "@/composables/features/useSpendFeatureSpellSlot";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useToast } from "@/composables/useToast";
import { rollDice, type RollResult } from "@/lib/dice/dice";
import { abilityMod } from "@/rules/weaponAttack";
import { slotPool, spellSlotKey } from "@/rules/spellSlots";
import type { SpellSlotEntry } from "@/types/party.types";
import type { OfferedRider } from "@/rules/features/characterFeatures";
import { assembleDamage, unarmedDamageBase } from "@/rules/features/damageRoll";
import type { AttackShape } from "@/rules/features/resolve";
import type { PartyMember } from "@/types/party.types";

/**
 * The damage roll for one attack, with the riders the character's features
 * offer for it (#976): Sneak Attack, Rage, and the rest. Shared by the player's
 * Combat tab and the encounter runner so both roll, spend and double on a
 * critical hit the same way.
 *
 * A rider that spends a use or a spell slot pays when the dice are rolled,
 * never before: a cancelled physical-dice prompt costs nothing. A slot rider
 * (2014 Divine Smite) asks which slot, and its dice follow that slot's level.
 *
 * An Unarmed Strike passes no `base`/`modifier`: the picker works them out from
 * the character (1 + Strength, or a Monk's Martial Arts die).
 */
const { member, attack, base, modifier, label, defaultCritical = false, senderName, silent = false } = defineProps<{
  member: PartyMember;
  attack: AttackShape;
  /** The weapon's own dice ("1d8"). Omit for an Unarmed Strike. */
  base?: string;
  /** The ability modifier added to the weapon's damage. Omit for an Unarmed Strike. */
  modifier?: number;
  /** The roll's label, e.g. "Rapier · Damage (piercing)". */
  label: string;
  /** Whether the last attack roll with this weapon was a critical hit. */
  defaultCritical?: boolean;
  senderName?: string;
  silent?: boolean;
}>();

const emit = defineEmits<{
  rolled: [result: RollResult];
  cancel: [];
}>();

const toast = useToast();
const { promptRoll } = usePromptedRoll();
const memberRef = toRef(() => member);
const features = useCharacterFeatures(memberRef);
const uses = useFeatureUses(memberRef, features.pools);

const spendSlot = useSpendFeatureSpellSlot();
const { sendRoll } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();

// ── Spell slots (Divine Smite) ───────────────────────────────────────────────
// Only Spellcasting and Pact Magic slots with a use left can be spent by a feature.
const spendableSlots = computed<SpellSlotEntry[]>(() =>
  (member.spell_slots ?? [])
    .filter(slot => (slotPool(slot) === "spellcasting" || slotPool(slot) === "pact") && slot.used < slot.max)
    .sort((a, b) => a.level - b.level),
);
const slotKey = ref<string | null>(null);
const chosenSlot = computed<SpellSlotEntry | null>(
  () => spendableSlots.value.find(slot => spellSlotKey(slot) === slotKey.value) ?? spendableSlots.value[0] ?? null,
);
// An unchosen slot reads as the lowest one, so the select shows what will be spent.
watch(chosenSlot, slot => { slotKey.value = slot ? spellSlotKey(slot) : null; }, { immediate: true });

function isSlotRider(entry: OfferedRider): boolean {
  return entry.rider.cost?.kind === "spell_slot" || entry.rider.dice.kind === "slot";
}

const offered = computed(() => features.riders(attack, chosenSlot.value?.level));
const slotRiderPicked = computed(() => chosen.value.some(isSlotRider));

// ── What the weapon itself rolls ─────────────────────────────────────────────
const martialArtsDie = computed(() => {
  const g = features.granted.value.find(f => f.mechanics.scaling?.label === "Martial Arts Die");
  return g ? g.scalingValue : null;
});
const weaponDamage = computed(() => {
  if (attack.kind === "unarmed") {
    return unarmedDamageBase({
      strMod: abilityMod(member.str),
      dexMod: abilityMod(member.dex),
      martialArtsDie: martialArtsDie.value,
    });
  }
  return { base: base ?? "1d4", modifier: modifier ?? 0 };
});

function riderId(i: number): string {
  return `${offered.value[i].featureId}:${i}`;
}

// A rider that rides on a switched-on state (Rage) starts ticked, since the
// player already said they are raging; the others start clear and the player
// decides (Sneak Attack depends on the table, not the sheet).
const overrides = ref<Record<string, boolean>>({});
function isPicked(i: number): boolean {
  if (unavailable(offered.value[i]) !== null) return false;
  const chosen = overrides.value[riderId(i)];
  if (chosen !== undefined) return chosen;
  const { rider } = offered.value[i];
  return rider.requires_toggle !== undefined && rider.cost === undefined;
}
function setPicked(i: number, on: boolean) {
  overrides.value = { ...overrides.value, [riderId(i)]: on };
}

const critical = ref(defaultCritical);
watch(() => defaultCritical, next => { critical.value = next; });

function unavailable(entry: OfferedRider): string | null {
  if (isSlotRider(entry) && chosenSlot.value === null) return "No spell slots left.";
  if (entry.dice === null) return "No damage dice at this level.";
  const cost = entry.rider.cost;
  if (cost?.kind === "uses" && !uses.payable({ key: cost.key, amount: cost.amount })) {
    return `No ${poolLabel(cost.key)} left.`;
  }
  return null;
}

function poolLabel(key: string): string {
  const pool = features.pools.value.find(p => p.key === key);
  return pool ? pool.label : key;
}

function riderLabel(entry: OfferedRider): string {
  return entry.dice ? `${entry.rider.label} ${entry.dice}` : entry.rider.label;
}

function riderHint(entry: OfferedRider): string | undefined {
  const bits: string[] = [];
  if (entry.rider.once_per_turn) bits.push("Once per turn");
  if (isSlotRider(entry)) bits.push("Spends a spell slot");
  const cost = entry.rider.cost;
  if (cost?.kind === "uses") bits.push(`Spends ${cost.amount} ${poolLabel(cost.key)}`);
  return bits.length ? bits.join(". ") : undefined;
}

const chosen = computed(() => offered.value.filter((_, i) => isPicked(i)));

function assemble() {
  return assembleDamage({
    base: weaponDamage.value.base,
    modifier: weaponDamage.value.modifier,
    riders: chosen.value.flatMap(entry => (entry.dice ? [{ dice: entry.dice }] : [])),
    critical: critical.value,
  });
}

/** What the roll button shows: the dice about to be thrown. Null when the weapon's expression cannot be read. */
const preview = computed(() => {
  try {
    // "2d8 + 6d6 + 3": dice joined by plus signs, a flat bonus or penalty last.
    const parts = assemble().parts;
    const dice = parts.filter(p => !/^[+-]/.test(p));
    const flat = parts.filter(p => /^[+-]/.test(p)).map(p => `${p[0] === "-" ? "−" : "+"} ${p.slice(1)}`);
    return [dice.join(" + "), ...flat].filter(Boolean).join(" ");
  } catch {
    return null;
  }
});

const rolling = ref(false);

/** A roll with no dice (an Unarmed Strike's 1 + Strength): nothing to throw, so no dice prompt, but it still goes to the chat. */
async function rollFlat(total: number, text: string): Promise<RollResult> {
  const result: RollResult = { ...rollDice({}, total, "normal"), label: text, isDamage: true };
  if (!silent) await sendRoll(result, null, senderName).catch(e => reportChatFailure(e, "post the roll to the chat"));
  return result;
}

async function roll() {
  if (rolling.value) return;
  rolling.value = true;
  try {
    const costs = new Map<string, number>();
    for (const entry of chosen.value) {
      const cost = entry.rider.cost;
      if (cost?.kind === "uses") costs.set(cost.key, (costs.get(cost.key) ?? 0) + cost.amount);
    }
    for (const [key, amount] of costs) {
      if (!uses.payable({ key, amount })) {
        toast.error(`Not enough ${poolLabel(key)} left for those extras.`);
        return;
      }
    }

    const slot = slotRiderPicked.value ? chosenSlot.value : null;
    const { counts, modifier: total } = assemble();
    const names = chosen.value.map(entry => entry.rider.label);
    const text = [label, ...names].join(" + ") + (critical.value ? " (Critical)" : "");
    const result = Object.keys(counts).length === 0
      ? await rollFlat(total, text)
      : await promptRoll({ counts, modifier: total, label: text, isDamage: true, senderName, silent });
    if (!result) return;

    if (slot) {
      try {
        await spendSlot.mutateAsync({
          partyMemberId: member.id,
          slotLevel: slot.level,
          pool: slotPool(slot) === "pact" ? "pact" : "spellcasting",
        });
      } catch (error) {
        toast.error(toast.fromError(error, "The roll was made, but the spell slot could not be spent."));
      }
    }

    for (const [key, amount] of costs) {
      try {
        await uses.spend({ key, amount });
      } catch (error) {
        toast.error(toast.fromError(error, `The roll was made, but ${poolLabel(key)} could not be spent.`));
      }
    }
    emit("rolled", result);
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't roll the damage."));
  } finally {
    rolling.value = false;
  }
}
</script>
