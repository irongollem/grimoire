<template>
  <!-- Melee Attacks -->
  <div class="detail-divider" />
  <p class="detail-section-label">Melee Attacks</p>
  <div v-for="atk in meleeAttacks" :key="atk.name" class="detail-trait">
    <div class="detail-trait-header">
      <strong>{{ atk.name }}.</strong>
      <div class="trait-roll-bar">
        <button
          type="button"
          class="trait-roll-btn trait-atk-btn"
          @click.stop="emit('roll-attack', atk.attackBonus, atk.name, resolvedFor(atk.key))"
        >⚔ {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
        <button
          v-if="atk.damageDice || atk.shape?.kind === 'unarmed'"
          type="button"
          class="trait-roll-btn trait-dmg-btn"
          @click.stop="toggleDamage(atk.key)"
        >🎲 {{ atk.damageDice ? actionDiceLabel(atk.damageDice) : atk.damageFixed }}</button>
      </div>
    </div>
    <span class="detail-trait-desc">{{ atk.description }}</span>
    <DamageRiderPicker v-if="damageOpenFor === atk.key && atk.shape" v-bind="pickerProps(atk)" />
  </div>

  <!-- Ranged Attacks -->
  <template v-if="rangedAttacks.length">
    <div class="detail-divider" />
    <p class="detail-section-label">Ranged Attacks</p>
    <div v-for="atk in rangedAttacks" :key="atk.weaponInvId" class="detail-trait">
      <div class="detail-trait-header">
        <strong>{{ atk.name }}.</strong>
        <div class="trait-roll-bar">
          <!-- Self-charged weapon (laser rifle, etc.) -->
          <template v-if="atk.ammoTag === null">
            <button
              type="button"
              class="trait-roll-btn trait-atk-btn"
              :disabled="weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) <= 0"
              :title="weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) <= 0 ? 'No charges remaining' : undefined"
              @click.stop="fireRangedAttack(atk)"
            >🏹 {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
            <button
              v-if="atk.damageDice"
              type="button"
              class="trait-roll-btn trait-dmg-btn"
              @click.stop="toggleDamage(atk.weaponInvId)"
            >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
            <span
              class="text-label whitespace-nowrap self-center"
              :class="weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) > 0 ? 'text-muted-foreground' : 'text-destructive'"
            >⚡ {{ weaponSelfChargesRemaining(atk.weaponInvId, weaponMaxCharges(atk.weaponInvId)) }}</span>
          </template>
          <!-- External ammo weapon (bow, crossbow, etc.) -->
          <template v-else>
            <button
              type="button"
              class="trait-roll-btn trait-atk-btn"
              :disabled="!availableAmmoFor(atk.ammoTag)"
              :title="!availableAmmoFor(atk.ammoTag) ? 'No ammunition available' : undefined"
              @click.stop="fireRangedAttack(atk)"
            >🏹 {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
            <button
              v-if="atk.damageDice"
              type="button"
              class="trait-roll-btn trait-dmg-btn"
              @click.stop="toggleDamage(atk.weaponInvId)"
            >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
            <span
              v-if="availableAmmoFor(atk.ammoTag)"
              class="text-label text-muted-foreground whitespace-nowrap self-center"
            >× {{ ammoRemainingCount(availableAmmoFor(atk.ammoTag)) }}</span>
            <span
              v-else
              class="text-label text-destructive whitespace-nowrap self-center"
            >no ammo</span>
          </template>
        </div>
      </div>
      <span class="detail-trait-desc">{{ atk.description }}</span>
      <DamageRiderPicker v-if="damageOpenFor === atk.weaponInvId" v-bind="pickerProps(atk)" />
    </div>
  </template>

  <!-- Thrown Attacks -->
  <template v-if="thrownAttacks.length">
    <div class="detail-divider" />
    <p class="detail-section-label">Thrown Attacks</p>
    <div v-for="atk in thrownAttacks" :key="atk.weaponInvId" class="detail-trait">
      <div class="detail-trait-header">
        <strong>{{ atk.name }}.</strong>
        <div class="trait-roll-bar">
          <button
            type="button"
            class="trait-roll-btn trait-atk-btn"
            :disabled="throwCountFor(atk.weaponInvId) <= 0"
            :title="throwCountFor(atk.weaponInvId) <= 0 ? 'None left to throw' : undefined"
            @click.stop="fireThrownAttack(atk)"
          >🎯 {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
          <button
            v-if="atk.damageDice"
            type="button"
            class="trait-roll-btn trait-dmg-btn"
            @click.stop="toggleDamage(atk.weaponInvId)"
          >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
          <span class="text-label text-muted-foreground whitespace-nowrap self-center">× {{ throwCountFor(atk.weaponInvId) }}</span>
        </div>
      </div>
      <span class="detail-trait-desc">Thrown attack. The weapon lands on the ground, recoverable from chat.</span>
      <DamageRiderPicker v-if="damageOpenFor === atk.weaponInvId" v-bind="pickerProps(atk)" />
    </div>
  </template>

  <!-- Custom Attacks -->
  <template v-if="member.custom_attacks?.length">
    <div class="detail-divider" />
    <p class="detail-section-label">Custom Attacks</p>
    <div v-for="atk in member.custom_attacks" :key="atk.id" class="detail-trait">
      <div class="detail-trait-header">
        <strong>{{ atk.name }}.</strong>
        <div class="trait-roll-bar">
          <button
            v-if="atk.attack_bonus != null"
            type="button"
            class="trait-roll-btn trait-atk-btn"
            @click.stop="emit('roll-attack', atk.attack_bonus, atk.name)"
          >✨ {{ atk.attack_bonus >= 0 ? '+' : '' }}{{ atk.attack_bonus }}</button>
          <button
            type="button"
            class="trait-roll-btn trait-dmg-btn"
            @click.stop="emit('roll-damage', atk.damage, atk.name)"
          >🎲 {{ actionDiceLabel(atk.damage) }}</button>
          <span
            v-if="atk.damage_type"
            class="text-label text-muted-foreground whitespace-nowrap self-center"
          >{{ atk.damage_type }}</span>
        </div>
      </div>
      <span class="detail-trait-desc">Custom attack.</span>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { Item } from "@/types/item.types";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { inventoryItemRef } from "@/lib/itemRef";
import { useAmmoConsumption } from "@/composables/encounters/useAmmoConsumption";
import { useThrownWeapon } from "@/composables/encounters/useThrownWeapon";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { weaponAmmoTag, weaponUsesChargesAsAmmo, type WeaponAmmoTag } from "@/rules/ammunition";
import { isThrownWeapon } from "@/rules/thrownWeapon";
import { weaponAttackMod, weaponAbilityMod, weaponDamageType } from "@/rules/weaponAttack";
import { parseExpression } from "@/lib/dice/dice";
import type { RollResult } from "@/lib/dice/dice";
import { isRangedWeaponItem } from "@/rules/ammunition";
import type { AttackShape } from "@/rules/features/resolve";
import DamageRiderPicker from "@/components/features/DamageRiderPicker.vue";

const { member, profBonus, abilityMod, senderName, silent = false } = defineProps<{
  member: PartyMember;
  profBonus: number;
  abilityMod: (score: number) => number;
  /** Who the rolled damage is posted as in the chat. */
  senderName?: string;
  /** The runner's "don't post to chat" mode. */
  silent?: boolean;
}>();

const emit = defineEmits<{
  "roll-attack": [bonus: number, name: string, onResolved?: (rolled: boolean, crit?: boolean) => void];
  "roll-damage": [desc: string, name: string];
  "damage-rolled": [result: RollResult];
}>();

// ── Composables ───────────────────────────────────────────────────────────────

const { data: inventoryItems } = usePartyInventory();
// Carried rows resolve by id, not through the edition-narrowed browse list (#961).
const { items: vaultItems } = useStoredItemRefs(() => (inventoryItems.value ?? []).map(inventoryItemRef));

// ── Inventory views ───────────────────────────────────────────────────────────

const vaultItemMap = computed<Map<string, Item>>(() => {
  const map = new Map<string, Item>();
  for (const item of vaultItems.value) map.set(item.id, item);
  return map;
});

const memberInventory = computed(() => {
  const mid = member.id;
  return (inventoryItems.value ?? []).filter((i) => i.carried_by === mid);
});

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

// ── Hidden clearing ───────────────────────────────────────────────────────────
// Attacking gives away your position (5e RAW) — mirrors PlayerCombatTab's
// clearHidden, but only fires once a roll has actually resolved (see
// `onAttackResolved`), since a cancelled physical-dice prompt shouldn't reveal.
async function clearHidden() {
  const conditions = member.conditions ?? [];
  if (!conditions.includes("Hidden")) return;
  await updateMember({ id: member.id, update: { conditions: conditions.filter((c) => c !== "Hidden") } });
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

interface PickerAttack {
  key: string;
  name: string;
  baseDice: string | null;
  modifier: number;
  shape: AttackShape | null;
  damageType: string;
}

function pickerProps(atk: PickerAttack) {
  return {
    member,
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

// ── Attack interfaces & computeds ─────────────────────────────────────────────

interface MeleeAttack extends PickerAttack {
  name: string;
  attackBonus: number;
  damageDice: string | null;
  damageFixed: string | null;
  description: string;
}

interface RangedAttack extends PickerAttack {
  name: string;
  attackBonus: number;
  damageDice: string | null;
  description: string;
  ammoTag: WeaponAmmoTag | null;
  weaponInvId: string;
}

const meleeAttacks = computed<MeleeAttack[]>(() => {
  const strMod = abilityMod(member.str);
  const dexMod = abilityMod(member.dex);
  const prof = profBonus;
  const bestMod = Math.max(strMod, dexMod);
  const unarmedDmg = 1 + strMod;
  const impDice = `1d4${bestMod >= 0 ? "+" : ""}${bestMod}`;
  const scores = { str: member.str, dex: member.dex, proficiencyBonus: prof };
  // Equipped melee weapons, built like the ranged and thrown rows below from the shared weapon math.
  const weapons = memberInventory.value
    .filter((inv) => ["main_hand", "off_hand"].includes(inv.slot ?? ""))
    .flatMap((inv): MeleeAttack[] => {
      const item = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
      if (!item || item.item_type !== "weapon" || isRangedWeaponItem(item) || weaponUsesChargesAsAmmo(item)) return [];
      const dmgMod = weaponAbilityMod(item, scores);
      const base = item.damage_rolls?.[0]?.dice ?? "1d4";
      const damageDice = `${base}${dmgMod >= 0 ? "+" : ""}${dmgMod}`;
      const props = item.properties;
      const usesStrength = props.includes("finesse") ? strMod >= dexMod : true;
      return [{
        key: `melee:${inv.id}`,
        baseDice: base,
        modifier: dmgMod,
        shape: { kind: "weapon", melee: true, ranged: false, finesse: props.includes("finesse"), usesStrength },
        damageType: weaponDamageType(item),
        name: inv.name,
        attackBonus: weaponAttackMod(item, scores),
        damageDice,
        damageFixed: null,
        description: `Melee attack. Hit: ${damageDice} ${weaponDamageType(item)} damage.`,
      }];
    });
  return [
    ...weapons,
    {
      key: "unarmed",
      baseDice: null,
      modifier: 0,
      // The picker works out the damage itself (1 + Strength, or the Martial Arts die).
      shape: { kind: "unarmed" },
      damageType: "bludgeoning",
      name: "Unarmed Strike",
      attackBonus: strMod + prof,
      damageDice: null,
      damageFixed: `${unarmedDmg} bludgeoning`,
      description: `Melee attack. Proficient. Hit: ${unarmedDmg} bludgeoning damage.`,
    },
    {
      key: "improvised",
      baseDice: "1d4",
      modifier: bestMod,
      shape: { kind: "weapon", melee: true, finesse: false, ranged: false, usesStrength: strMod >= dexMod },
      damageType: "damage",
      name: "Improvised Weapon",
      attackBonus: bestMod,
      damageDice: impDice,
      damageFixed: null,
      description: `Melee or ranged attack. No proficiency bonus. Hit: ${impDice} damage (type varies).`,
    },
  ];
});

const rangedAttacks = computed<RangedAttack[]>(() => {
  const dexMod = abilityMod(member.dex);
  const strMod = abilityMod(member.str);
  const prof = profBonus;
  return memberInventory.value
    .filter((inv) => ["main_hand", "off_hand"].includes(inv.slot ?? ""))
    .flatMap((inv) => {
      if (!inv.item_id) return [];
      const item = vaultItemMap.value.get(inv.item_id);
      if (!item) return [];
      const isSelfCharged = weaponUsesChargesAsAmmo(item);
      const ammoTag = isSelfCharged ? null : weaponAmmoTag(item);
      if (!item.properties.includes("ammunition") && !isSelfCharged && !ammoTag) return [];
      const usesStr = item.properties.includes("finesse") && strMod > dexMod;
      const atkMod = (usesStr ? strMod : dexMod) + prof;
      const dmgMod = usesStr ? strMod : dexMod;
      let damageDice: string | null = null;
      if (item.damage_rolls?.length) {
        const base = item.damage_rolls[0];
        damageDice = `${base.dice}${dmgMod >= 0 ? "+" : ""}${dmgMod}`;
      }
      const rangeStr = item.weapon_range ? ` (${item.weapon_range})` : "";
      return [{
        key: inv.id,
        baseDice: item.damage_rolls?.[0]?.dice ?? null,
        modifier: dmgMod,
        shape: {
          kind: "weapon", melee: false, ranged: true,
          finesse: item.properties.includes("finesse"),
          usesStrength: usesStr,
        },
        damageType: item.damage_rolls?.[0]?.type ?? "damage",
        name: item.name,
        attackBonus: atkMod,
        damageDice,
        description: `Ranged attack${rangeStr}. Hit: ${damageDice ?? "see item"} ${item.damage_rolls?.[0]?.type ?? "damage"}.`,
        ammoTag,
        weaponInvId: inv.id,
      }] satisfies RangedAttack[];
    });
});

function fireRangedAttack(atk: RangedAttack) {
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

interface ThrownAttack extends PickerAttack {
  name: string;
  attackBonus: number;
  damageDice: string | null;
  weaponInvId: string;
}

const thrownAttacks = computed<ThrownAttack[]>(() => {
  const scores = { str: member.str, dex: member.dex, proficiencyBonus: profBonus };
  return memberInventory.value
    .filter((inv) => ["main_hand", "off_hand"].includes(inv.slot ?? ""))
    .flatMap((inv) => {
      const item = inv.item_id ? vaultItemMap.value.get(inv.item_id) ?? null : null;
      if (!isThrownWeapon(inv.name, item)) return [];
      const dmgMod = weaponAbilityMod(item, scores);
      const base = item?.damage_rolls?.[0]?.dice ?? "1d4";
      const damageDice = `${base}${dmgMod >= 0 ? "+" : ""}${dmgMod}`;
      const ranged = item !== null && isRangedWeaponItem(item);
      const props = item?.properties ?? [];
      const strMod = abilityMod(member.str);
      const dexMod = abilityMod(member.dex);
      // Mirrors weaponAbilityMod: ammunition is Dexterity, finesse takes the better score.
      const usesStrength = props.includes("ammunition") ? false : props.includes("finesse") || item === null ? strMod >= dexMod : true;
      return [{
        key: inv.id,
        baseDice: base,
        modifier: dmgMod,
        shape: { kind: "weapon", melee: !ranged, ranged, finesse: props.includes("finesse"), usesStrength },
        damageType: weaponDamageType(item),
        name: inv.name,
        attackBonus: weaponAttackMod(item, scores),
        damageDice,
        weaponInvId: inv.id,
      }] satisfies ThrownAttack[];
    });
});

function throwCountFor(weaponInvId: string): number {
  return memberInventory.value.find((i) => i.id === weaponInvId)?.quantity ?? 0;
}

function fireThrownAttack(atk: ThrownAttack) {
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

<style scoped>
@reference "@/assets/main.css";

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-section-label {
  @apply text-eyebrow font-bold text-muted-foreground mt-1;
}

.detail-trait {
  @apply flex flex-col gap-0.5;
}

.detail-trait-header {
  @apply flex items-start justify-between gap-2;
}

.detail-trait-header strong {
  @apply text-label font-bold text-foreground;
}

.trait-roll-bar {
  @apply flex items-center gap-1 flex-wrap justify-end;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-label font-semibold cursor-pointer transition-colors whitespace-nowrap;
}

.trait-atk-btn {
  @apply bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}

.detail-trait-desc {
  @apply text-caption text-muted-foreground leading-relaxed;
}
</style>
