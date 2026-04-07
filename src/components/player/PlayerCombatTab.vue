<template>
  <div>
    <!-- No weapons -->
    <div
      v-if="!equippedWeapons.length"
      class="rounded-lg border border-border bg-card px-5 py-10 text-center space-y-2"
    >
      <Sword class="h-8 w-8 mx-auto text-muted-foreground/40" />
      <p class="font-cinzel text-sm font-semibold text-foreground">No weapons equipped</p>
      <p class="font-fell text-sm text-muted-foreground italic">Equip items from your Inventory tab.</p>
    </div>

    <!-- Weapon list -->
    <div v-else class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
      <div v-for="{ inv, item } in equippedWeapons" :key="inv.id" class="px-4 py-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-fell text-sm text-foreground font-semibold">{{ inv.name }}</span>
          <span v-if="item.subtype" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">{{ item.subtype }}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
            @click="rollWeaponAttack(inv, item)"
          >
            <Sword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span class="font-cinzel text-xs text-foreground">Attack</span>
            <span class="font-cinzel text-xs" :class="weaponAttackMod(item) >= 0 ? 'text-elven-green' : 'text-destructive'">
              {{ signedNum(weaponAttackMod(item)) }}
            </span>
            <span v-if="attackDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider">Dis</span>
          </button>
          <button
            v-if="item.damage_rolls?.length"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors group"
            @click="rollWeaponDamage(inv, item)"
          >
            <Zap class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
            <span class="font-cinzel text-xs text-foreground">{{ item.damage_rolls[0].dice }}</span>
            <span class="font-cinzel text-xs text-muted-foreground">{{ item.damage_rolls[0].type }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Sword, Zap } from "lucide-vue-next";
import { rollDice } from "@/lib/dice";
import type { RollMode } from "@/lib/dice";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{ member: PartyMember; attackDisadvantage: boolean }>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const { data: inventory } = usePartyInventory();
const { data: allItems } = useItems();
const { sendRoll } = useCampaignMessages();

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function signedNum(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

const myInventory = computed(() =>
  (inventory.value ?? []).filter((i) => i.carried_by === props.member.id),
);

const equippedWeapons = computed(() => {
  if (!allItems.value) return [];
  return myInventory.value
    .filter((i) => i.is_equipped && i.item_id)
    .flatMap((inv) => {
      const item = allItems.value!.find((it) => it.id === inv.item_id);
      return item && item.item_type === "weapon" ? [{ inv, item }] : [];
    });
});

function weaponAbilityMod(item: Item): number {
  const itemProps = item.properties ?? [];
  const strMod = abilityMod(props.member.str);
  const dexModVal = abilityMod(props.member.dex);
  if (itemProps.includes("ammunition")) return dexModVal;
  if (itemProps.includes("finesse")) return dexModVal > strMod ? dexModVal : strMod;
  return strMod;
}
function weaponAttackMod(item: Item): number {
  return weaponAbilityMod(item) + props.member.proficiency_bonus;
}

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

function rollDiceExpression(expr: string): { total: number; breakdown: { val: number; dropped: boolean }[] } {
  const m = expr.match(/^(\d+)d(\d+)$/);
  if (!m) return { total: 0, breakdown: [] };
  const count = parseInt(m[1]);
  const sides = parseInt(m[2]);
  const breakdown = Array.from({ length: count }, () => ({
    val: Math.floor(Math.random() * sides) + 1,
    dropped: false,
  }));
  return { total: breakdown.reduce((s, d) => s + d.val, 0), breakdown };
}

function rollWeaponAttack(inv: PartyInventoryItem, item: Item) {
  const mod = weaponAttackMod(item);
  const mode: RollMode = props.attackDisadvantage ? "disadvantage" : "normal";
  const result = rollDice({ 20: 1 }, mod, mode);
  const kept = result.breakdown.find(d => !d.dropped)!;
  const fullLabel = `${inv.name} — Attack` + modeTag(mode);
  emit("roll", { label: fullLabel, dice: kept.val, modifier: mod, total: result.total });
  void sendRoll({ ...result, label: fullLabel });
}

function rollWeaponDamage(inv: PartyInventoryItem, item: Item) {
  if (!item.damage_rolls?.length) return;
  const abilMod = weaponAbilityMod(item);
  const { total: diceTotal, breakdown } = rollDiceExpression(item.damage_rolls[0].dice);
  const total = diceTotal + abilMod;
  const label = `${inv.name} — Damage (${item.damage_rolls[0].type})`;
  emit("roll", { label, dice: diceTotal, modifier: abilMod, total });
  void sendRoll({ total, label, modifier: abilMod, breakdown, isCrit: false, isFumble: false });
}
</script>
