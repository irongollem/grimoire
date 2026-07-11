<template>
  <div class="space-y-3">

    <!-- ── Beast actions (when wildshaped) ───────────────────────────────────── -->
    <template v-if="wildshapeMonster">
      <template v-for="section in beastActionSections" :key="section.label">
        <div v-if="section.entries.length" class="rounded-lg border border-primary/30 bg-card overflow-hidden">
          <div class="px-4 py-2.5 border-b border-border">
            <p class="font-cinzel text-xs font-semibold text-primary/80 tracking-wider">{{ section.label }}</p>
          </div>
          <div class="divide-y divide-border">
            <div v-for="action in section.entries" :key="action.name" class="px-4 py-3">
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <span class="font-fell text-sm text-foreground font-semibold">{{ action.name }}</span>
                <button
                  v-if="parseBeastAttackBonus(action.description) !== null"
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors shrink-0"
                  v-roll-mode="(mode: RollMode | null) => rollBeastAttack(action.name, parseBeastAttackBonus(action.description)!, mode)"
                >
                  <IconSword class="h-3 w-3 text-muted-foreground" />
                  <span class="font-cinzel text-xs text-foreground">Attack</span>
                  <span class="font-cinzel text-xs" :class="parseBeastAttackBonus(action.description)! >= 0 ? 'text-elven-green' : 'text-destructive'">
                    {{ signedNum(parseBeastAttackBonus(action.description)!) }}
                  </span>
                  <span v-if="attackDisadvantage" class="font-cinzel text-2xs md:text-sm text-amber-500">Dis</span>
                </button>
              </div>
              <p class="font-fell text-xs text-muted-foreground leading-relaxed">{{ action.description }}</p>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ── Normal character combat (hidden while wildshaped) ─────────────────── -->
    <template v-else>
      <!-- Loadout shortcut -->
      <PlayerLoadout :member-id="member.id" />

      <!-- Equipped weapon list -->
      <div v-if="equippedWeapons.length" class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
        <div v-for="{ inv, item } in equippedWeapons" :key="inv.id" class="px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="font-fell text-sm text-foreground font-semibold">{{ inv.name }}</span>
            <span v-if="item.subtype" class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">{{ item.subtype }}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
              v-roll-mode="(mode: RollMode | null) => rollWeaponAttack(inv, item, mode)"
            >
              <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Attack</span>
              <span class="font-cinzel text-xs" :class="weaponAttackMod(item) >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(weaponAttackMod(item)) }}
              </span>
              <span v-if="attackDisadvantage" class="font-cinzel text-2xs md:text-sm text-amber-500 tracking-wider">Dis</span>
            </button>
            <button
              v-if="item.damage_rolls?.length"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors group"
              @click="rollWeaponDamage(inv, item)"
            >
              <IconLightning class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
              <span class="font-cinzel text-xs text-foreground">{{ weaponDamageExpr(item) }}</span>
              <span class="font-cinzel text-xs text-muted-foreground">{{ item.damage_rolls[0].type }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Always-available melee attacks -->
      <div class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
        <div class="px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="font-fell text-sm text-foreground font-semibold">Unarmed Strike</span>
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">Proficient</span>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
              v-roll-mode="(mode: RollMode | null) => rollUnarmedAttack(mode)"
            >
              <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Attack</span>
              <span class="font-cinzel text-xs" :class="unarmedAttackMod >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(unarmedAttackMod) }}
              </span>
              <span v-if="attackDisadvantage" class="font-cinzel text-2xs md:text-sm text-amber-500 tracking-wider">Dis</span>
            </button>
            <span class="font-cinzel text-xs text-muted-foreground">{{ unarmedDamage }} bludgeoning</span>
          </div>
        </div>
        <div class="px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="font-fell text-sm text-foreground font-semibold">Improvised Weapon</span>
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">No proficiency</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-muted/30 transition-colors group"
              v-roll-mode="(mode: RollMode | null) => rollImprovisedAttack(mode)"
            >
              <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Attack</span>
              <span class="font-cinzel text-xs" :class="improvisedAttackMod >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(improvisedAttackMod) }}
              </span>
              <span v-if="attackDisadvantage" class="font-cinzel text-2xs md:text-sm text-amber-500 tracking-wider">Dis</span>
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:border-amber-500/50 hover:bg-muted/30 transition-colors group"
              @click="rollImprovisedDamage"
            >
              <IconLightning class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
              <span class="font-cinzel text-xs text-foreground">1d4</span>
              <span class="font-cinzel text-xs text-muted-foreground">{{ signedNum(improvisedAttackMod) }}</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconLightning, IconSword } from '@/lib/icons';
import { rollParsed, combineModes } from "@/lib/roller";
import type { RollMode, DieSize } from "@/lib/roller";
import { parseExpression } from "@/lib/dice";
import type { ParsedExpression } from "@/lib/dice";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import PlayerLoadout from "@/components/player/PlayerLoadout.vue";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { Monster } from "@/types/monster.types";

const props = defineProps<{ member: PartyMember; attackDisadvantage: boolean; wildshapeMonster?: Monster }>();
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

// Beast action sections shown when wildshaped
const beastActionSections = computed(() => {
  const sb = props.wildshapeMonster?.stat_block;
  if (!sb) return [];
  return [
    { label: "Actions",       entries: sb.actions       ?? [] },
    { label: "Bonus Actions", entries: sb.bonus_actions ?? [] },
    { label: "Reactions",     entries: sb.reactions     ?? [] },
  ];
});

/** Extracts the attack bonus from a beast action description, e.g. "+4 to hit" → 4 */
function parseBeastAttackBonus(desc: string): number | null {
  const m = desc.match(/\+(\d+)\s+to\s+hit/i);
  if (m) return parseInt(m[1], 10);
  const m2 = desc.match(/-(\d+)\s+to\s+hit/i);
  if (m2) return -parseInt(m2[1], 10);
  return null;
}

async function rollBeastAttack(name: string, bonus: number, override: RollMode | null = null) {
  return rollAttackWith(bonus, name, override);
}

function weaponAbilityMod(item: Item): number {
  const itemProps = item.properties ?? [];
  const strModVal = abilityMod(props.member.str);
  const dexModVal = abilityMod(props.member.dex);
  if (itemProps.includes("ammunition")) return dexModVal;
  if (itemProps.includes("finesse")) return dexModVal > strModVal ? dexModVal : strModVal;
  return strModVal;
}
function weaponAttackMod(item: Item): number {
  return weaponAbilityMod(item) + props.member.proficiency_bonus;
}

function weaponDamageExpr(item: Item): string {
  const raw = item.damage_rolls?.[0]?.dice ?? "";
  const abilMod = weaponAbilityMod(item);
  if (abilMod === 0) return raw;
  const parsed = parseExpression(raw);
  if (!parsed) return raw;
  const totalMod = parsed.modifier + abilMod;
  const parts: string[] = parsed.terms.map(t => `${t.count}d${t.sides}`);
  if (totalMod > 0) parts.push(`+${totalMod}`);
  else if (totalMod < 0) parts.push(String(totalMod));
  return parts.join("") || raw;
}

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

async function rollAttackWith(mod: number, baseLabel: string, override: RollMode | null = null) {
  // Player-picked mode (long-press/right-click) merged with condition-imposed
  // disadvantage — opposing sources cancel to normal (5e RAW).
  const mode: RollMode = combineModes(
    override ?? "normal",
    props.attackDisadvantage ? "disadvantage" : "normal",
  );
  const fullLabel = `${baseLabel} — Attack` + modeTag(mode);
  const result = await promptRoll({ counts: { 20: 1 }, modifier: mod, label: fullLabel, mode });
  if (!result) return;
  const kept = result.breakdown.find(d => !d.dropped)!;
  emit("roll", { label: fullLabel, dice: kept.val, modifier: mod, total: result.total });
}

function rollUnarmedAttack(override: RollMode | null = null) { return rollAttackWith(unarmedAttackMod.value, "Unarmed Strike", override); }
function rollImprovisedAttack(override: RollMode | null = null) { return rollAttackWith(improvisedAttackMod.value, "Improvised Weapon", override); }
function rollWeaponAttack(inv: PartyInventoryItem, item: Item, override: RollMode | null = null) {
  return rollAttackWith(weaponAttackMod(item), inv.name, override);
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
