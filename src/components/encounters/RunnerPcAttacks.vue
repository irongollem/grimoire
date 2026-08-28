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
          @click.stop="emit('roll-attack', atk.attackBonus, atk.name, onAttackResolved)"
        >⚔ {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
        <button
          v-if="atk.damageDice"
          type="button"
          class="trait-roll-btn trait-dmg-btn"
          @click.stop="emit('roll-damage', atk.damageDice, atk.name)"
        >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
        <span
          v-else-if="atk.damageFixed"
          class="font-cinzel text-2xs text-muted-foreground whitespace-nowrap self-center"
        >{{ atk.damageFixed }}</span>
      </div>
    </div>
    <span class="detail-trait-desc">{{ atk.description }}</span>
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
              @click.stop="emit('roll-damage', atk.damageDice, atk.name)"
            >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
            <span
              class="font-cinzel text-2xs whitespace-nowrap self-center"
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
              @click.stop="emit('roll-damage', atk.damageDice, atk.name)"
            >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
            <span
              v-if="availableAmmoFor(atk.ammoTag)"
              class="font-cinzel text-2xs text-muted-foreground whitespace-nowrap self-center"
            >× {{ ammoRemainingCount(availableAmmoFor(atk.ammoTag)) }}</span>
            <span
              v-else
              class="font-cinzel text-2xs text-destructive whitespace-nowrap self-center"
            >— no ammo</span>
          </template>
        </div>
      </div>
      <span class="detail-trait-desc">{{ atk.description }}</span>
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
            @click.stop="emit('roll-damage', atk.damageDice, atk.name)"
          >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
          <span class="font-cinzel text-2xs text-muted-foreground whitespace-nowrap self-center">× {{ throwCountFor(atk.weaponInvId) }}</span>
        </div>
      </div>
      <span class="detail-trait-desc">Thrown attack. The weapon lands on the ground — recoverable from chat.</span>
    </div>
  </template>

  <!-- Class Features -->
  <template v-if="sneakAttackDice">
    <div class="detail-divider" />
    <p class="detail-section-label">Class Features</p>
    <div class="detail-trait">
      <div class="detail-trait-header">
        <strong>Sneak Attack.</strong>
        <div class="trait-roll-bar">
          <button
            type="button"
            class="trait-roll-btn trait-dmg-btn"
            @click.stop="emit('roll-damage', sneakAttackDice, 'Sneak Attack')"
          >🎲 {{ sneakAttackDice }}</button>
        </div>
      </div>
      <span class="detail-trait-desc">
        Once per turn, deal extra damage when attacking with a finesse or ranged weapon and you have advantage on the attack, or an ally is within 5 ft. of the target.
      </span>
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
            class="font-cinzel text-2xs text-muted-foreground whitespace-nowrap self-center"
          >{{ atk.damage_type }}</span>
        </div>
      </div>
      <span class="detail-trait-desc">Custom attack.</span>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { Item } from "@/types/item.types";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useItems } from "@/composables/items/useItems";
import { useAmmoConsumption } from "@/composables/encounters/useAmmoConsumption";
import { useThrownWeapon } from "@/composables/encounters/useThrownWeapon";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { weaponAmmoTag, weaponUsesChargesAsAmmo, type WeaponAmmoTag } from "@/rules/ammunition";
import { isThrownWeapon } from "@/rules/thrownWeapon";
import { weaponAttackMod, weaponAbilityMod } from "@/rules/weaponAttack";
import { parseExpression } from "@/lib/dice/dice";

const { member, profBonus, abilityMod } = defineProps<{
  member: PartyMember;
  profBonus: number;
  abilityMod: (score: number) => number;
}>();

const emit = defineEmits<{
  "roll-attack": [bonus: number, name: string, onResolved?: (rolled: boolean) => void];
  "roll-damage": [desc: string, name: string];
}>();

// ── Composables ───────────────────────────────────────────────────────────────

const { data: inventoryItems } = usePartyInventory();
const { data: vaultItems } = useItems();

// ── Inventory views ───────────────────────────────────────────────────────────

const vaultItemMap = computed<Map<string, Item>>(() => {
  const map = new Map<string, Item>();
  for (const item of vaultItems.value ?? []) map.set(item.id, item);
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

// ── Attack interfaces & computeds ─────────────────────────────────────────────

interface MeleeAttack {
  name: string;
  attackBonus: number;
  damageDice: string | null;
  damageFixed: string | null;
  description: string;
}

interface RangedAttack {
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
  return [
    {
      name: "Unarmed Strike",
      attackBonus: strMod + prof,
      damageDice: null,
      damageFixed: `${unarmedDmg} bludgeoning`,
      description: `Melee attack. Proficient. Hit: ${unarmedDmg} bludgeoning damage.`,
    },
    {
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
  emit("roll-attack", atk.attackBonus, atk.name, (rolled) => {
    onAttackResolved(rolled);
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

interface ThrownAttack {
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
      return [{
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
  emit("roll-attack", atk.attackBonus, atk.name, (rolled) => {
    onAttackResolved(rolled);
    if (!rolled) return; // cancelled physical-dice prompt throws nothing
    const inv = memberInventory.value.find((i) => i.id === atk.weaponInvId);
    if (!inv) return;
    const item = inv.item_id ? vaultItemMap.value.get(inv.item_id) ?? null : null;
    void throwWeapon(inv, item, member.name);
  });
}

// ── Class features ────────────────────────────────────────────────────────────

// Rogue Sneak Attack: ceil(level/2) d6 — covers all Rogue subclasses
// (Arcane Trickster, Assassin, etc.) since the class string always starts with "Rogue".
const sneakAttackDice = computed<string | null>(() => {
  const cls = member.class?.toLowerCase() ?? "";
  if (!cls.startsWith("rogue")) return null;
  const dice = Math.ceil(member.level / 2);
  return `${dice}d6`;
});

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
  @apply font-cinzel text-2xs font-bold text-foreground;
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
