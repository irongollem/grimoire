<template>
  <div class="space-y-3">
    <!-- Equipped weapon list -->
    <div v-if="equippedWeapons.length" class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
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

    <!-- Always-available melee attacks -->
    <div class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
      <!-- Unarmed Strike -->
      <div class="px-4 py-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-fell text-sm text-foreground font-semibold">Unarmed Strike</span>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Proficient</span>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
            @click="rollUnarmedAttack"
          >
            <Sword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span class="font-cinzel text-xs text-foreground">Attack</span>
            <span class="font-cinzel text-xs" :class="unarmedAttackMod >= 0 ? 'text-elven-green' : 'text-destructive'">
              {{ signedNum(unarmedAttackMod) }}
            </span>
            <span v-if="attackDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider">Dis</span>
          </button>
          <span class="font-cinzel text-xs text-muted-foreground">{{ unarmedDamage }} bludgeoning</span>
        </div>
      </div>
      <!-- Improvised Weapon -->
      <div class="px-4 py-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-fell text-sm text-foreground font-semibold">Improvised Weapon</span>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">No proficiency</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
            @click="rollImprovisedAttack"
          >
            <Sword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span class="font-cinzel text-xs text-foreground">Attack</span>
            <span class="font-cinzel text-xs" :class="improvisedAttackMod >= 0 ? 'text-elven-green' : 'text-destructive'">
              {{ signedNum(improvisedAttackMod) }}
            </span>
            <span v-if="attackDisadvantage" class="font-cinzel text-[9px] text-amber-500 tracking-wider">Dis</span>
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors group"
            @click="rollImprovisedDamage"
          >
            <Zap class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
            <span class="font-cinzel text-xs text-foreground">1d4</span>
            <span class="font-cinzel text-xs text-muted-foreground">{{ signedNum(improvisedAttackMod) }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Sword, Zap } from "lucide-vue-next";
import { rollParsed } from "@/lib/roller";
import type { RollMode, DieSize } from "@/lib/roller";
import { parseExpression } from "@/lib/dice";
import type { ParsedExpression } from "@/lib/dice";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{ member: PartyMember; attackDisadvantage: boolean }>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const { data: inventory } = usePartyInventory();
const { data: allItems } = useItems();
const { sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();

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

const strMod = computed(() => abilityMod(props.member.str));
const dexMod = computed(() => abilityMod(props.member.dex));
const bestMod = computed(() => Math.max(strMod.value, dexMod.value));

const unarmedAttackMod = computed(() => strMod.value + props.member.proficiency_bonus);
const unarmedDamage = computed(() => 1 + strMod.value);
const improvisedAttackMod = computed(() => bestMod.value);

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

async function rollAttackWith(mod: number, baseLabel: string) {
  const mode: RollMode = props.attackDisadvantage ? "disadvantage" : "normal";
  const fullLabel = `${baseLabel} — Attack` + modeTag(mode);
  const result = await promptRoll({ counts: { 20: 1 }, modifier: mod, label: fullLabel, mode });
  if (!result) return;
  const kept = result.breakdown.find(d => !d.dropped)!;
  emit("roll", { label: fullLabel, dice: kept.val, modifier: mod, total: result.total });
}

function rollUnarmedAttack() { return rollAttackWith(unarmedAttackMod.value, "Unarmed Strike"); }
function rollImprovisedAttack() { return rollAttackWith(improvisedAttackMod.value, "Improvised Weapon"); }
function rollWeaponAttack(inv: PartyInventoryItem, item: Item) {
  void item;
  return rollAttackWith(weaponAttackMod(item), inv.name);
}

function parsedToCounts(parsed: ParsedExpression): Partial<Record<DieSize, number>> {
  const counts: Partial<Record<DieSize, number>> = {};
  for (const t of parsed.terms) {
    if ([4, 6, 8, 10, 12, 20, 100].includes(t.sides)) {
      const k = t.sides as DieSize;
      counts[k] = (counts[k] ?? 0) + t.count;
    }
  }
  return counts;
}

async function rollDamageLabelled(parsed: ParsedExpression, mod: number, label: string) {
  const counts = parsedToCounts(parsed);
  if (Object.keys(counts).length === 0) {
    // Flat damage — no prompt needed, just emit+post via rollParsed path.
    const { total: diceTotal, breakdown } = rollParsed(parsed);
    const total = diceTotal + mod;
    emit("roll", { label, dice: diceTotal, modifier: mod, total });
    void sendRoll({ total, label, modifier: mod, breakdown, isCrit: false, isFumble: false });
    return;
  }
  const result = await promptRoll({ counts, modifier: mod + parsed.modifier, label });
  if (!result) return;
  const diceTotal = result.total - result.modifier;
  emit("roll", { label, dice: diceTotal, modifier: result.modifier, total: result.total });
}

function rollImprovisedDamage() {
  return rollDamageLabelled(
    { terms: [{ count: 1, sides: 4 }], modifier: 0 },
    improvisedAttackMod.value,
    "Improvised Weapon — Damage",
  );
}

function rollWeaponDamage(inv: PartyInventoryItem, item: Item) {
  if (!item.damage_rolls?.length) return;
  const abilMod = weaponAbilityMod(item);
  const parsed = parseExpression(item.damage_rolls[0].dice);
  if (!parsed) return;
  const label = `${inv.name} — Damage (${item.damage_rolls[0].type})`;
  return rollDamageLabelled(parsed, abilMod, label);
}
</script>
