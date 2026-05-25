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
          @click.stop="emit('roll-attack', atk.attackBonus, atk.name)"
        >⚔ {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
        <button
          v-if="atk.damageDice"
          type="button"
          class="trait-roll-btn trait-dmg-btn"
          @click.stop="emit('roll-damage', atk.damageDice, atk.name)"
        >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
        <span
          v-else-if="atk.damageFixed"
          class="font-cinzel text-[9px] text-muted-foreground whitespace-nowrap self-center"
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
              class="font-cinzel text-[9px] whitespace-nowrap self-center"
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
              class="font-cinzel text-[9px] text-muted-foreground whitespace-nowrap self-center"
            >× {{ ammoRemainingCount(availableAmmoFor(atk.ammoTag)) }}</span>
            <span
              v-else
              class="font-cinzel text-[9px] text-destructive whitespace-nowrap self-center"
            >— no ammo</span>
          </template>
        </div>
      </div>
      <span class="detail-trait-desc">{{ atk.description }}</span>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { Item } from "@/types/item.types";
import { usePartyInventory, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { parseExpression } from "@/lib/dice";

const { member, profBonus, abilityMod } = defineProps<{
  member: PartyMember;
  profBonus: number;
  abilityMod: (score: number) => number;
}>();

const emit = defineEmits<{
  "roll-attack": [bonus: number, name: string];
  "roll-damage": [desc: string, name: string];
}>();

// ── Composables ───────────────────────────────────────────────────────────────

const { data: inventoryItems } = usePartyInventory();
const { data: vaultItems } = useItems();
const updateInventoryItem = useUpdateInventoryItem();
const removeInventoryItem = useRemoveInventoryItem();

// ── Ammo tag helpers ──────────────────────────────────────────────────────────

const AMMO_TAGS = ["arrow", "bolt", "bullet", "needle", "dart", "firearm-bullet"] as const;

function weaponAmmoTag(item: Item): string | null {
  const explicitTag = AMMO_TAGS.find((t) => item.tags.includes(t));
  if (explicitTag) return explicitTag;
  if (item.tags.includes("firearm")) return "firearm-bullet";
  const sub = (item.subtype ?? "").toLowerCase();
  if (sub.includes("shortbow") || sub.includes("longbow") || (sub.includes("bow") && !sub.includes("crossbow"))) return "arrow";
  if (sub.includes("crossbow")) return "bolt";
  if (sub === "sling") return "bullet";
  if (sub.includes("blowgun")) return "needle";
  if (sub.includes("dart")) return "dart";
  const name = item.name.toLowerCase();
  if (name.includes("longbow") || name.includes("shortbow") || (name.includes("bow") && !name.includes("crossbow"))) return "arrow";
  if (name.includes("crossbow")) return "bolt";
  if (name.includes("sling")) return "bullet";
  if (name.includes("blowgun")) return "needle";
  return null;
}

function ammoTagFromName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("arrow")) return "arrow";
  if (lower.includes("bolt")) return "bolt";
  if ((lower.includes("bullet") || lower.includes("shot")) && (lower.includes("firearm") || lower.includes("black powder") || lower.includes("pistol") || lower.includes("musket"))) return "firearm-bullet";
  if (lower.includes("bullet")) return "bullet";
  if (lower.includes("needle")) return "needle";
  if (lower.includes("dart")) return "dart";
  return null;
}

// ── Inventory helpers ─────────────────────────────────────────────────────────

const vaultItemMap = computed<Map<string, Item>>(() => {
  const map = new Map<string, Item>();
  for (const item of vaultItems.value ?? []) map.set(item.id, item);
  return map;
});

const memberInventory = computed(() => {
  const mid = member.id;
  return (inventoryItems.value ?? []).filter((i) => i.carried_by === mid);
});

const memberContainerIds = computed<Set<string>>(() => {
  const s = new Set<string>();
  for (const i of memberInventory.value) {
    if (i.is_container) s.add(i.id);
  }
  return s;
});

function availableAmmoFor(ammoTag: string) {
  const candidates = memberInventory.value.filter((inv) => {
    const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
    const tag = vaultItem
      ? (vaultItem.tags.includes("firearm") && ammoTag === "firearm-bullet"
          ? "firearm-bullet"
          : vaultItem.tags.find((t) => ["arrow", "bolt", "bullet", "needle", "dart"].includes(t)) ?? null)
      : ammoTagFromName(inv.name);
    if (tag !== ammoTag) return false;
    const maxCharges = vaultItem?.charges ?? null;
    const remaining = inv.current_charges !== null ? inv.current_charges : maxCharges;
    if (remaining !== null && remaining <= 0) return false;
    if (remaining === null && inv.quantity <= 0) return false;
    return true;
  });
  const inContainer = candidates.filter((i) => i.location === "container" && memberContainerIds.value.has(i.container_id ?? ""));
  const onBelt = candidates.filter((i) => i.location === "belt");
  const inBackpack = candidates.filter((i) => i.location === "backpack");
  return inContainer[0] ?? onBelt[0] ?? inBackpack[0] ?? null;
}

function ammoRemainingCount(inv: ReturnType<typeof availableAmmoFor>): number {
  if (!inv) return 0;
  const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
  const maxCharges = vaultItem?.charges ?? null;
  if (inv.current_charges !== null) return inv.current_charges;
  if (maxCharges !== null) return maxCharges;
  return inv.quantity;
}

function weaponMaxCharges(weaponInvId: string): number {
  const inv = memberInventory.value.find((i) => i.id === weaponInvId);
  const vaultItem = inv?.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
  return vaultItem?.charges ?? 0;
}

function weaponSelfChargesRemaining(weaponInvId: string, maxCharges: number): number {
  const inv = memberInventory.value.find((i) => i.id === weaponInvId);
  if (!inv) return 0;
  return inv.current_charges !== null ? inv.current_charges : maxCharges;
}

function consumeWeaponCharge(weaponInvId: string, maxCharges: number) {
  const remaining = weaponSelfChargesRemaining(weaponInvId, maxCharges);
  updateInventoryItem.mutate({ id: weaponInvId, update: { current_charges: Math.max(0, remaining - 1) } });
}

function consumeAmmo(ammoTag: string) {
  const inv = availableAmmoFor(ammoTag);
  if (!inv) return;
  const vaultItem = inv.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
  const maxCharges = vaultItem?.charges ?? null;
  if (maxCharges !== null) {
    const current = inv.current_charges !== null ? inv.current_charges : maxCharges;
    updateInventoryItem.mutate({ id: inv.id, update: { current_charges: Math.max(0, current - 1) } });
  } else {
    if (inv.quantity <= 1) {
      removeInventoryItem.mutate(inv.id);
    } else {
      updateInventoryItem.mutate({ id: inv.id, update: { quantity: inv.quantity - 1 } });
    }
  }
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
  ammoTag: string | null;
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
      const isSelfCharged = item.charges !== null;
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
  emit("roll-attack", atk.attackBonus, atk.name);
  if (atk.ammoTag) {
    consumeAmmo(atk.ammoTag);
  } else {
    const inv = memberInventory.value.find((i) => i.id === atk.weaponInvId);
    const vaultItem = inv?.item_id ? vaultItemMap.value.get(inv.item_id) : undefined;
    if (vaultItem?.charges) consumeWeaponCharge(atk.weaponInvId, vaultItem.charges);
  }
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
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.detail-trait {
  @apply flex flex-col gap-0.5;
}

.detail-trait-header {
  @apply flex items-start justify-between gap-2;
}

.detail-trait-header strong {
  @apply font-cinzel text-[10px] font-bold text-foreground;
}

.trait-roll-bar {
  @apply flex items-center gap-1 flex-wrap justify-end;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
}

.trait-atk-btn {
  @apply bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}

.detail-trait-desc {
  @apply font-fell text-xs text-muted-foreground leading-relaxed;
}
</style>
