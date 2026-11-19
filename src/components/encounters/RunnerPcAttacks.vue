<template>
  <!-- Melee Attacks -->
  <div v-if="!compact" class="my-1 border-t border-border/60" />
  <p v-if="!compact" class="mt-1 text-eyebrow font-bold text-muted-foreground">Melee Attacks</p>
  <RunnerPcAttackRow
    v-for="atk in meleeAttacks"
    :key="atk.name"
    :compact="compact"
    :name="atk.name"
    :attack-bonus="atk.attackBonus"
    :damage-label="atk.damageDice ? actionDiceLabel(atk.damageDice) : atk.shape?.kind === 'unarmed' ? atk.damageFixed : null"
    :description="atk.description"
    @attack="emit('roll-attack', atk.attackBonus, atk.name, resolvedFor(atk.key))"
    @damage="toggleDamage(atk.key)"
  >
    <template #below>
      <DamageRiderPicker v-if="damageOpenFor === atk.key && atk.shape" v-bind="pickerProps(atk)" />
    </template>
  </RunnerPcAttackRow>

  <!-- Ranged Attacks -->
  <template v-if="rangedAttacks.length">
    <div v-if="!compact" class="my-1 border-t border-border/60" />
    <p v-if="!compact" class="mt-1 text-eyebrow font-bold text-muted-foreground">Ranged Attacks</p>
    <RunnerPcAttackRow
      v-for="atk in rangedAttacks"
      :key="atk.weaponInvId"
      :compact="compact"
      :name="atk.name"
      :attack-bonus="atk.attackBonus"
      :attack-icon="IconRangedAttack"
      :damage-label="atk.damageDice ? actionDiceLabel(atk.damageDice) : null"
      :description="atk.description"
      :attack-disabled="rangedBlocked(atk) !== null"
      :attack-title="rangedBlocked(atk) ?? undefined"
      @attack="fireRangedAttack(atk)"
      @damage="toggleDamage(atk.weaponInvId)"
    >
      <template #note>
        <!-- Self-charged weapon (laser rifle, etc.) shows its charges; an ammunition weapon, what is left in the quiver. -->
        <span
          v-if="atk.ammoTag === null"
          class="inline-flex items-center gap-0.5 whitespace-nowrap text-label"
          :class="weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) > 0 ? 'text-muted-foreground' : 'text-destructive'"
        ><IconLightning class="h-3 w-3" aria-hidden="true" />{{ weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) }}</span>
        <span v-else-if="availableAmmoFor(atk.ammoTag)" class="whitespace-nowrap text-label text-muted-foreground">× {{ ammoRemainingCount(availableAmmoFor(atk.ammoTag)) }}</span>
        <span v-else class="whitespace-nowrap text-label text-destructive">no ammo</span>
      </template>
      <template #below>
        <DamageRiderPicker v-if="damageOpenFor === atk.weaponInvId" v-bind="pickerProps(atk)" />
      </template>
    </RunnerPcAttackRow>
  </template>

  <!-- Thrown Attacks -->
  <template v-if="thrownAttacks.length">
    <div v-if="!compact" class="my-1 border-t border-border/60" />
    <p v-if="!compact" class="mt-1 text-eyebrow font-bold text-muted-foreground">Thrown Attacks</p>
    <RunnerPcAttackRow
      v-for="atk in thrownAttacks"
      :key="atk.weaponInvId"
      :compact="compact"
      :name="atk.name"
      :attack-bonus="atk.attackBonus"
      :attack-icon="IconThrownAttack"
      :damage-label="atk.damageDice ? actionDiceLabel(atk.damageDice) : null"
      :description="atk.description"
      :attack-disabled="throwCountFor(atk.weaponInvId) <= 0"
      attack-title="None left to throw"
      @attack="fireThrownAttack(atk)"
      @damage="toggleDamage(atk.weaponInvId)"
    >
      <template #note>
        <span class="whitespace-nowrap text-label text-muted-foreground">× {{ throwCountFor(atk.weaponInvId) }}</span>
      </template>
      <template #below>
        <DamageRiderPicker v-if="damageOpenFor === atk.weaponInvId" v-bind="pickerProps(atk)" />
      </template>
    </RunnerPcAttackRow>
  </template>

  <!-- Custom Attacks -->
  <template v-if="customAttacks.length">
    <div v-if="!compact" class="my-1 border-t border-border/60" />
    <p v-if="!compact" class="mt-1 text-eyebrow font-bold text-muted-foreground">Custom Attacks</p>
    <RunnerPcAttackRow
      v-for="atk in customAttacks"
      :key="atk.key"
      :compact="compact"
      :name="atk.name"
      :attack-bonus="atk.attackBonus"
      :attack-icon="IconSpellAttack"
      :damage-label="actionDiceLabel(atk.customDamage)"
      :description="atk.description"
      @attack="rollCustomAttack(atk)"
      @damage="emit('roll-damage', atk.customDamage, atk.name)"
    >
      <template v-if="atk.customDamageType" #note>
        <span class="whitespace-nowrap text-label text-muted-foreground">{{ atk.customDamageType }}</span>
      </template>
    </RunnerPcAttackRow>
  </template>
</template>

<script setup lang="ts">
import { hasCondition, withoutCondition } from "@/rules/conditions";
import { ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import {
  usePcAttackRows,
  type PcAttackPickerFields,
  type PcRangedAttackRow,
  type PcThrownAttackRow,
} from "@/composables/encounters/usePcAttackRows";
import { useAmmoConsumption } from "@/composables/encounters/useAmmoConsumption";
import { useThrownWeapon } from "@/composables/encounters/useThrownWeapon";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { weaponUsesChargesAsAmmo } from "@/rules/ammunition";
import { parseExpression } from "@/lib/dice/dice";
import type { RollResult } from "@/lib/dice/dice";
import type { AttackShape } from "@/rules/features/resolve";
import type { CharacterFeatures } from "@/composables/features/useCharacterFeatures";
import DamageRiderPicker from "@/components/features/DamageRiderPicker.vue";
import RunnerPcAttackRow from "@/components/encounters/RunnerPcAttackRow.vue";
import { IconLightning, IconRangedAttack, IconSpellAttack, IconThrownAttack } from "@/lib/icons";

const { member, features, profBonus, abilityMod, senderName, silent = false, compact = false } = defineProps<{
  member: PartyMember;
  /** The member's resolved features, shared with every rider picker. */
  features: CharacterFeatures;
  profBonus: number;
  abilityMod: (score: number) => number;
  /** Who the rolled damage is posted as in the chat. */
  senderName?: string;
  /** The runner's "don't post to chat" mode. */
  silent?: boolean;
  /** One line per attack with a Roll, for the Play turn card (#1125 frame 10); the full sheet keeps the whole list. */
  compact?: boolean;
}>();

const emit = defineEmits<{
  "roll-attack": [bonus: number, name: string, onResolved?: (rolled: boolean, crit?: boolean) => void];
  "roll-damage": [desc: string, name: string];
  "damage-rolled": [result: RollResult];
}>();

// ── Composables ───────────────────────────────────────────────────────────────

// ── Attack rows ───────────────────────────────────────────────────────────────
// The rows are data (usePcAttackRows), shared with the AI table's fight; the component adds only the UI state.

const {
  melee: meleeAttacks,
  ranged: rangedAttacks,
  thrown: thrownAttacks,
  custom: customAttacks,
  memberInventory,
  vaultItemMap,
} = usePcAttackRows(() => member, { profBonus: () => profBonus, abilityMod: (score) => abilityMod(score) });

const {
  availableAmmoFor,
  ammoRemainingCount,
  consumeAmmo,
  weaponMaxCharges,
  weaponSelfChargesRemaining,
  consumeWeaponCharge,
} = useAmmoConsumption(memberInventory, vaultItemMap);

const { throwWeapon } = useThrownWeapon();

const { mutateAsync: updateMember } = useUpdatePartyMember();

// A custom attack with no to-hit bonus (auto-hit or save-based) has nothing to roll: never roll it as +0.
function rollCustomAttack(atk: { name: string; attackBonus: number | null }) {
  if (atk.attackBonus == null) return;
  emit("roll-attack", atk.attackBonus, atk.name);
}

// ── Hidden clearing ───────────────────────────────────────────────────────────
// Attacking gives away your position (5e RAW) — mirrors PlayerCombatTab's
// clearHidden, but only fires once a roll has actually resolved (see
// `onAttackResolved`), since a cancelled physical-dice prompt shouldn't reveal.
async function clearHidden() {
  if (!hasCondition(member.conditions, "Hidden")) return;
  await updateMember({ id: member.id, update: { conditions: withoutCondition(member.conditions, "Hidden") } });
}

function onAttackResolved(rolled: boolean) {
  if (rolled) void clearHidden();
}

// ── Damage with riders (#976) ─────────────────────────────────────────────────
// A weapon's damage opens the rider panel (Sneak Attack, Rage…) instead of
// rolling at once; the panel starts with Critical ticked when the last attack
// with that weapon was a natural 20.
const damageOpenFor = ref<string | null>(null);
const lastCrit = ref<Record<string, boolean>>({});

function toggleDamage(key: string) {
  damageOpenFor.value = damageOpenFor.value === key ? null : key;
}

/** The attack-roll callback for a row: clears Hidden and remembers a crit. */
function resolvedFor(key: string) {
  return (rolled: boolean, crit?: boolean) => {
    onAttackResolved(rolled);
    if (rolled) lastCrit.value = { ...lastCrit.value, [key]: crit === true };
  };
}

function pickerProps(atk: PcAttackPickerFields) {
  return {
    member,
    features,
    attack: atk.shape as AttackShape,
    base: atk.shape?.kind === "unarmed" ? undefined : (atk.baseDice ?? "1d4"),
    modifier: atk.shape?.kind === "unarmed" ? undefined : atk.modifier,
    label: `${atk.name} · Damage (${atk.damageType})`,
    defaultCritical: lastCrit.value[atk.key] === true,
    senderName,
    silent,
    onRolled: (result: RollResult) => {
      lastCrit.value = { ...lastCrit.value, [atk.key]: false };
      damageOpenFor.value = null;
      emit("damage-rolled", result);
    },
    onCancel: () => { damageOpenFor.value = null; },
  };
}

/** Why a ranged attack cannot be fired right now, else null. */
function rangedBlocked(atk: PcRangedAttackRow): string | null {
  if (atk.ammoTag === null) {
    return weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) <= 0 ? "No charges remaining" : null;
  }
  return availableAmmoFor(atk.ammoTag) ? null : "No ammunition available";
}

function fireRangedAttack(atk: PcRangedAttackRow) {
  const remember = resolvedFor(atk.weaponInvId);
  emit("roll-attack", atk.attackBonus, atk.name, (rolled, crit) => {
    remember(rolled, crit);
    if (!rolled) return; // cancelled physical-dice prompt spends nothing
    if (atk.ammoTag) {
      consumeAmmo(atk.ammoTag);
    } else {
      const inv = memberInventory.value.find((i) => i.id === atk.weaponInvId);
      const vaultItem = inv?.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
      if (vaultItem?.charges && weaponUsesChargesAsAmmo(vaultItem)) consumeWeaponCharge(atk.weaponInvId, vaultItem.charges);
    }
  });
}

// ── Thrown attacks ────────────────────────────────────────────────────────────
// Thrown weapons (javelin, dagger, handaxe, spear) can be hurled at range. The
// STR-unless-finesse math comes from the shared weaponAttack lib so it matches
// the player combat tab exactly; throwing drops one to the ground (recoverable)
// and shrinks the equipped stack.

function throwCountFor(weaponInvId: string): number {
  return memberInventory.value.find((i) => i.id === weaponInvId)?.quantity ?? 0;
}

function fireThrownAttack(atk: PcThrownAttackRow) {
  const remember = resolvedFor(atk.weaponInvId);
  emit("roll-attack", atk.attackBonus, atk.name, (rolled, crit) => {
    remember(rolled, crit);
    if (!rolled) return; // cancelled physical-dice prompt throws nothing
    const inv = memberInventory.value.find((i) => i.id === atk.weaponInvId);
    if (!inv) return;
    const item = inv.item_id ? vaultItemMap.value.get(inv.item_id) ?? null : null;
    void throwWeapon(inv, item, member.name);
  });
}

// ── Dice label helper ─────────────────────────────────────────────────────────

function actionDiceLabel(desc: string): string {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return "";
  const diceStr = parsed.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = parsed.modifier;
  return diceStr + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "");
}
</script>
