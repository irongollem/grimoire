<template>
  <div class="space-y-3">

    <!-- ── Hide action / hidden state ────────────────────────────────────────── -->
    <!-- Take the Hide action (rolls Dexterity (Stealth) + marks the Hidden
         condition), and shows at a glance whether you're currently hidden.
         Attacking auto-reveals you (see rollAttackWith). -->
    <div
      class="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
      :class="isHidden ? 'border-primary/50 bg-primary/10' : 'border-border bg-card'"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <component
          :is="isHidden ? IconHide : IconReveal"
          class="h-4 w-4 shrink-0"
          :class="isHidden ? 'text-primary' : 'text-muted-foreground'"
        />
        <div class="min-w-0">
          <p class="text-body font-semibold" :class="isHidden ? 'text-primary' : 'text-foreground'">
            {{ isHidden ? "Hidden" : "Hide" }}
          </p>
          <p class="text-caption text-muted-foreground leading-snug">
            {{ isHidden
              ? "You are unseen — attacking or making noise reveals you."
              : "Roll Dexterity (Stealth) to slip out of sight." }}
          </p>
        </div>
      </div>
      <AppButton
        v-if="!isHidden"
        variant="subtle"
        fill="muted"
        size="sm"
        class="shrink-0"
        :disabled="hiding"
        tooltip="Take the Hide action"
        v-roll-mode="(mode: RollMode | null) => takeHideAction(mode)"
      >
        <IconHide class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="font-cinzel text-xs text-foreground">Hide</span>
        <span class="font-cinzel text-xs" :class="stealthBonus >= 0 ? 'text-elven-green' : 'text-destructive'">
          {{ signedNum(stealthBonus) }}
        </span>
        <span v-if="checkBadgeLabel" class="font-cinzel text-2xs text-amber-500">{{ checkBadgeLabel }}</span>
      </AppButton>
      <AppButton
        v-else
        variant="tinted"
        tone="primary"
        emphasis="soft"
        size="sm"
        class="shrink-0"
        :icon="IconReveal"
        label="Reveal"
        tooltip="Step out of hiding"
        :disabled="hiding"
        @click="revealSelf"
      />
    </div>

    <!-- ── Beast actions (when wildshaped) ───────────────────────────────────── -->
    <template v-if="wildshapeMonster">
      <template v-for="section in beastActionSections" :key="section.label">
        <div v-if="section.entries.length" class="rounded-lg border border-primary/30 bg-card overflow-hidden">
          <div class="px-4 py-2.5 border-b border-border">
            <p class="text-label-lg font-semibold text-primary/80">{{ section.label }}</p>
          </div>
          <div class="divide-y divide-border">
            <div v-for="action in section.entries" :key="action.name" class="px-4 py-3">
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <span class="text-body text-foreground font-semibold">{{ action.name }}</span>
                <AppButton
                  v-if="parseBeastAttackBonus(action.description) !== null"
                  variant="subtle"
                  fill="muted"
                  size="sm"
                  class="shrink-0"
                  v-roll-mode="(mode: RollMode | null) => rollBeastAttack(action.name, parseBeastAttackBonus(action.description)!, mode)"
                >
                  <IconSword class="h-3 w-3 text-muted-foreground" />
                  <span class="font-cinzel text-xs text-foreground">Attack</span>
                  <span class="font-cinzel text-xs" :class="parseBeastAttackBonus(action.description)! >= 0 ? 'text-elven-green' : 'text-destructive'">
                    {{ signedNum(parseBeastAttackBonus(action.description)!) }}
                  </span>
                  <span v-if="attackBadgeLabel" class="font-cinzel text-2xs text-amber-500">{{ attackBadgeLabel }}</span>
                </AppButton>
              </div>
              <p class="text-caption text-muted-foreground leading-relaxed">{{ action.description }}</p>
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
            <span class="text-body text-foreground font-semibold">{{ inv.name }}</span>
            <span v-if="item?.subtype" class="text-label text-muted-foreground">{{ item.subtype }}</span>
            <span v-else-if="!item" class="text-label text-muted-foreground">Custom</span>
          </div>
          <!-- Weapon mastery — 2024 campaigns only; toggles whether this character has mastery with the weapon -->
          <button
            v-if="is2024 && item?.mastery"
            type="button"
            class="mb-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label transition-colors"
            :class="hasMastery(item)
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'"
            :title="WEAPON_MASTERY_DEFINITIONS[item.mastery].description"
            @click="toggleMastery(item)"
          >
            Mastery: {{ WEAPON_MASTERY_DEFINITIONS[item.mastery].label }}
            <span v-if="hasMastery(item)">✓</span>
          </button>
          <div class="flex flex-wrap gap-2 items-center">
            <AppButton
              variant="subtle"
              fill="muted"
              size="sm"
              class="group disabled:hover:border-border disabled:hover:bg-transparent"
              :disabled="weaponAmmoById[inv.id]?.needsAmmo && !weaponAmmoById[inv.id]?.hasAmmo"
              :tooltip="weaponAmmoById[inv.id]?.needsAmmo && !weaponAmmoById[inv.id]?.hasAmmo ? 'No ammunition available' : undefined"
              v-roll-mode="(mode: RollMode | null) => rollWeaponAttack(inv, item, mode)"
            >
              <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Attack</span>
              <span class="font-cinzel text-xs" :class="weaponAttackMod(item) >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(weaponAttackMod(item)) }}
              </span>
              <span v-if="attackBadgeLabel" class="text-label text-amber-500">{{ attackBadgeLabel }}</span>
            </AppButton>
            <AppButton
              v-if="weaponIsThrowable(inv, item)"
              variant="subtle"
              fill="muted"
              size="sm"
              class="group"
              :tooltip="`Throw ${inv.name} — lands on the ground, recoverable from chat`"
              v-roll-mode="(mode: RollMode | null) => rollThrowAttack(inv, item, mode)"
            >
              <IconSend class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Throw</span>
              <span class="font-cinzel text-xs" :class="weaponAttackMod(item) >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(weaponAttackMod(item)) }}
              </span>
              <span class="font-cinzel text-xs text-muted-foreground">× {{ inv.quantity }}</span>
            </AppButton>
            <AppButton
              variant="subtle"
              fill="muted"
              size="sm"
              class="group hover:border-amber-500/50"
              @click="rollWeaponDamage(inv, item)"
            >
              <IconLightning class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
              <span class="font-cinzel text-xs text-foreground">{{ weaponDamageExpr(item) }}</span>
              <span class="font-cinzel text-xs text-muted-foreground">{{ item?.damage_rolls?.[0]?.type ?? 'bludgeoning' }}</span>
            </AppButton>
            <span
              v-if="weaponAmmoById[inv.id]?.needsAmmo && weaponAmmoById[inv.id]?.hasAmmo"
              class="font-cinzel text-xs text-muted-foreground self-center"
            >🏹 × {{ weaponAmmoById[inv.id].remaining }}</span>
            <span
              v-else-if="weaponAmmoById[inv.id]?.needsAmmo"
              class="font-cinzel text-xs text-destructive self-center"
            >no ammo</span>
          </div>
        </div>
      </div>

      <!-- Custom attacks — player-defined attacks not derived from equipment (#568) -->
      <PlayerCustomAttacks
        :member="member"
        :attack-disadvantage="attackDisadvantage"
        :attack-penalty="attackPenalty"
        @roll="emit('roll', $event)"
        @attacked="clearHidden"
      />

      <!-- Always-available melee attacks -->
      <div class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
        <div class="px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-body text-foreground font-semibold">Unarmed Strike</span>
            <span class="text-label text-muted-foreground">Proficient</span>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <AppButton
              variant="subtle"
              fill="muted"
              size="sm"
              class="group"
              v-roll-mode="(mode: RollMode | null) => rollUnarmedAttack(mode)"
            >
              <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Attack</span>
              <span class="font-cinzel text-xs" :class="unarmedAttackMod >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(unarmedAttackMod) }}
              </span>
              <span v-if="attackBadgeLabel" class="text-label text-amber-500">{{ attackBadgeLabel }}</span>
            </AppButton>
            <span class="font-cinzel text-xs text-muted-foreground">{{ unarmedDamage }} bludgeoning</span>
          </div>
        </div>
        <div class="px-4 py-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-body text-foreground font-semibold">Improvised Weapon</span>
            <span class="text-label text-muted-foreground">No proficiency</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <AppButton
              variant="subtle"
              fill="muted"
              size="sm"
              class="group"
              v-roll-mode="(mode: RollMode | null) => rollImprovisedAttack(mode)"
            >
              <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span class="font-cinzel text-xs text-foreground">Attack</span>
              <span class="font-cinzel text-xs" :class="improvisedAttackMod >= 0 ? 'text-elven-green' : 'text-destructive'">
                {{ signedNum(improvisedAttackMod) }}
              </span>
              <span v-if="attackBadgeLabel" class="text-label text-amber-500">{{ attackBadgeLabel }}</span>
            </AppButton>
            <AppButton
              variant="subtle"
              fill="muted"
              size="sm"
              class="group hover:border-amber-500/50"
              @click="rollImprovisedDamage"
            >
              <IconLightning class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
              <span class="font-cinzel text-xs text-foreground">1d4</span>
              <span class="font-cinzel text-xs text-muted-foreground">{{ signedNum(improvisedAttackMod) }}</span>
            </AppButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconHide, IconLightning, IconReveal, IconSend, IconSword } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { rollParsed, combineModes } from "@/lib/dice/roller";
import type { RollMode, DieSize } from "@/lib/dice/roller";
import type { ParsedExpression } from "@/lib/dice/dice";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { usePlayerVisibleItems } from "@/composables/useItems";
import { useAmmoConsumption } from "@/composables/useAmmoConsumption";
import { useThrownWeapon } from "@/composables/useThrownWeapon";
import { weaponAmmoTag, weaponUsesChargesAsAmmo } from "@/rules/ammunition";
import { isThrownWeapon } from "@/rules/thrownWeapon";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useRuleset } from "@/composables/useRuleset";
import { useUpdatePartyMember } from "@/composables/useParty";
import { skillCheckBonus } from "@/rules/skillCheck";
import { WEAPON_MASTERY_DEFINITIONS } from "@/data/weaponMastery";
import PlayerLoadout from "@/components/player/PlayerLoadout.vue";
import PlayerCustomAttacks from "@/components/player/PlayerCustomAttacks.vue";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { Monster } from "@/types/monster.types";
import {
  signedNum,
  weaponAbilityMod as libWeaponAbilityMod,
  weaponAttackMod as libWeaponAttackMod,
  weaponDamageExpr as libWeaponDamageExpr,
  weaponDamageType as libWeaponDamageType,
  weaponDamageParsedExpression,
  unarmedAttackMod as libUnarmedAttackMod,
  unarmedDamage as libUnarmedDamage,
  improvisedAttackMod as libImprovisedAttackMod,
} from "@/rules/weaponAttack";

const props = defineProps<{
  member: PartyMember;
  attackDisadvantage: boolean;
  /** 2024-only flat Exhaustion penalty to every attack roll (0 under 2014 — see `attackDisadvantage`). */
  attackPenalty: number;
  /** Disadvantage on ability checks (used by the Hide action's Stealth roll). */
  checkDisadvantage: boolean;
  /** 2024-only flat Exhaustion penalty to every ability check (0 under 2014). */
  checkPenalty: number;
  wildshapeMonster?: Monster;
}>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const { data: inventory } = usePartyInventory();
const { data: allItems } = usePlayerVisibleItems();
const { sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();

// Badge next to each Attack button: "Dis" under 2014 exhaustion/conditions,
// or the flat numeric penalty under 2024 exhaustion (never both at once —
// see `hasAttackDisadvantage` / `getExhaustionD20Penalty` in `@/rules/conditions`).
const attackBadgeLabel = computed(() => {
  if (props.attackDisadvantage) return "Dis";
  if (props.attackPenalty !== 0) return String(props.attackPenalty);
  return null;
});

// ── Hide action ───────────────────────────────────────────────────────────────
// The Hide action rolls Dexterity (Stealth) — an ability *check*, so it uses the
// check-disadvantage/penalty props, not the attack ones. On a completed roll the
// character is marked with the "Hidden" condition (a shared, DM-visible chip);
// making any attack clears it again (see rollAttackWith).
const stealthBonus = computed(() => skillCheckBonus(props.member, "stealth"));
const isHidden = computed(() => (props.member.conditions ?? []).includes("Hidden"));
const hiding = ref(false);

// Same "Dis" / numeric-penalty badge as attacks, but for the Stealth check.
const checkBadgeLabel = computed(() => {
  if (props.checkDisadvantage) return "Dis";
  if (props.checkPenalty !== 0) return String(props.checkPenalty);
  return null;
});

async function markHidden() {
  const conditions = props.member.conditions ?? [];
  if (conditions.includes("Hidden")) return;
  await updateMember({ id: props.member.id, update: { conditions: [...conditions, "Hidden"] } });
}

async function clearHidden() {
  const conditions = props.member.conditions ?? [];
  if (!conditions.includes("Hidden")) return;
  await updateMember({ id: props.member.id, update: { conditions: conditions.filter((c) => c !== "Hidden") } });
}

async function takeHideAction(override: RollMode | null = null) {
  if (hiding.value) return;
  hiding.value = true;
  try {
    // Player-picked mode merged with condition-imposed disadvantage — opposing
    // sources cancel to normal (5e RAW), matching the Skills tab.
    const mode: RollMode = combineModes(
      override ?? "normal",
      props.checkDisadvantage ? "disadvantage" : "normal",
    );
    const modifier = stealthBonus.value + props.checkPenalty;
    const label = "Hide — Dexterity (Stealth)" + modeTag(mode);
    const result = await promptRoll({ counts: { 20: 1 }, modifier, label, mode });
    if (!result) return; // physical-dice prompt cancelled — don't mark hidden
    const kept = result.breakdown.find((d) => !d.dropped)!;
    emit("roll", { label, dice: kept.val, modifier, total: result.total });
    await markHidden();
  } finally {
    hiding.value = false;
  }
}

async function revealSelf() {
  if (hiding.value) return;
  hiding.value = true;
  try {
    await clearHidden();
  } finally {
    hiding.value = false;
  }
}

const myInventory = computed(() =>
  (inventory.value ?? []).filter((i) => i.carried_by === props.member.id),
);

// Weapon-hand slots — an item-less (custom-named) item equipped here is treated
// as a weapon (rendered with improvised 1d4 stats), so it still gets an attack row.
const WEAPON_SLOTS = new Set<string>(["main_hand", "off_hand"]);

const equippedWeapons = computed<{ inv: PartyInventoryItem; item: Item | null }[]>(() =>
  myInventory.value
    .filter((i) => i.is_equipped)
    .flatMap((inv): { inv: PartyInventoryItem; item: Item | null }[] => {
      const item = inv.item_id ? (allItems.value ?? []).find((it) => it.id === inv.item_id) ?? null : null;
      if (item) return item.item_type === "weapon" ? [{ inv, item }] : [];
      // No vault item: a custom weapon only if equipped in a weapon hand.
      return inv.slot && WEAPON_SLOTS.has(inv.slot) ? [{ inv, item: null }] : [];
    }),
);

// ── Ammunition ────────────────────────────────────────────────────────────────
// Firing a ranged weapon from the player's own sheet must deplete their quiver,
// matching the DM encounter runner (see RunnerPcAttacks.vue).
const vaultItemMap = computed<Map<string, Item>>(() => {
  const map = new Map<string, Item>();
  for (const item of allItems.value ?? []) map.set(item.id, item);
  return map;
});
const { availableAmmoFor, ammoRemainingCount, consumeAmmo, weaponSelfChargesRemaining, consumeWeaponCharge } =
  useAmmoConsumption(myInventory, vaultItemMap);
const { throwWeapon } = useThrownWeapon();

interface WeaponAmmoInfo {
  /** True for ranged weapons that draw from ammo or an internal charge. */
  needsAmmo: boolean;
  hasAmmo: boolean;
  remaining: number;
}

function weaponAmmoInfo(inv: PartyInventoryItem, item: Item | null): WeaponAmmoInfo {
  if (!item) return { needsAmmo: false, hasAmmo: true, remaining: 0 };
  // A self-charged weapon (laser rifle, internal-magazine firearm) spends its own charges.
  if (weaponUsesChargesAsAmmo(item)) {
    const remaining = weaponSelfChargesRemaining(inv.id, item.charges!);
    return { needsAmmo: true, hasAmmo: remaining > 0, remaining };
  }
  const tag = weaponAmmoTag(item);
  if (!tag) return { needsAmmo: false, hasAmmo: true, remaining: 0 };
  const ammo = availableAmmoFor(tag);
  return { needsAmmo: true, hasAmmo: !!ammo, remaining: ammoRemainingCount(ammo) };
}

const weaponAmmoById = computed<Record<string, WeaponAmmoInfo>>(() => {
  const map: Record<string, WeaponAmmoInfo> = {};
  for (const { inv, item } of equippedWeapons.value) map[inv.id] = weaponAmmoInfo(inv, item);
  return map;
});

// ── Weapon mastery (2024 only) ──────────────────────────────────────────────
const { is2024 } = useRuleset();
const { mutateAsync: updateMember } = useUpdatePartyMember();

// Local optimistic set — mirrors the local-ref-synced-via-watch pattern used
// in ItemDetailPanel.vue, avoiding a flash back to the stale value before refetch.
const localMasteries = ref<Set<string>>(new Set(props.member.weapon_masteries));
watch(() => [props.member.id, props.member.weapon_masteries] as const, () => {
  localMasteries.value = new Set(props.member.weapon_masteries);
}, { immediate: true });

function hasMastery(item: Item | null): boolean {
  return !!item && localMasteries.value.has(item.id);
}

const isTogglingMastery = ref(false);
async function toggleMastery(item: Item | null) {
  if (!item || isTogglingMastery.value) return;
  isTogglingMastery.value = true;
  try {
    const next = new Set(localMasteries.value);
    if (next.has(item.id)) next.delete(item.id);
    else next.add(item.id);
    localMasteries.value = next; // optimistic
    await updateMember({ id: props.member.id, update: { weapon_masteries: [...next] } });
  } finally {
    isTogglingMastery.value = false;
  }
}

const unarmedAttackMod = computed(() => libUnarmedAttackMod(props.member.str, props.member.proficiency_bonus));
const unarmedDamage = computed(() => libUnarmedDamage(props.member.str));
const improvisedAttackMod = computed(() => libImprovisedAttackMod(props.member.str, props.member.dex));

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

// Thin wrappers over src/rules/weaponAttack.ts, binding in this member's scores —
// keeps the template's existing call sites (`weaponAttackMod(item)`, etc.) unchanged.
function memberScores() {
  return { str: props.member.str, dex: props.member.dex, proficiencyBonus: props.member.proficiency_bonus };
}
function weaponAbilityMod(item: Item | null): number {
  return libWeaponAbilityMod(item, memberScores());
}
function weaponAttackMod(item: Item | null): number {
  return libWeaponAttackMod(item, memberScores());
}
function weaponDamageExpr(item: Item | null): string {
  return libWeaponDamageExpr(item, memberScores());
}

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

/** Resolves an attack roll; returns true when it actually rolled (false if the prompt was cancelled). */
async function rollAttackWith(mod: number, baseLabel: string, override: RollMode | null = null): Promise<boolean> {
  // Player-picked mode (long-press/right-click) merged with condition-imposed
  // disadvantage — opposing sources cancel to normal (5e RAW).
  const mode: RollMode = combineModes(
    override ?? "normal",
    props.attackDisadvantage ? "disadvantage" : "normal",
  );
  const totalMod = mod + props.attackPenalty;
  const fullLabel = `${baseLabel} — Attack` + modeTag(mode);
  const result = await promptRoll({ counts: { 20: 1 }, modifier: totalMod, label: fullLabel, mode });
  if (!result) return false;
  const kept = result.breakdown.find(d => !d.dropped)!;
  emit("roll", { label: fullLabel, dice: kept.val, modifier: totalMod, total: result.total });
  // Attacking gives away your position (5e RAW) — drop Hidden if it was set.
  void clearHidden();
  return true;
}

function rollUnarmedAttack(override: RollMode | null = null) { return rollAttackWith(unarmedAttackMod.value, "Unarmed Strike", override); }
function rollImprovisedAttack(override: RollMode | null = null) { return rollAttackWith(improvisedAttackMod.value, "Improvised Weapon", override); }
async function rollWeaponAttack(inv: PartyInventoryItem, item: Item | null, override: RollMode | null = null) {
  const rolled = await rollAttackWith(weaponAttackMod(item), inv.name, override);
  // Only deplete ammo once the attack has actually been made.
  if (!rolled || !item) return;
  if (weaponUsesChargesAsAmmo(item)) {
    consumeWeaponCharge(inv.id, item.charges!);
  } else {
    const tag = weaponAmmoTag(item);
    if (tag) consumeAmmo(tag);
  }
}

// Throwing a thrown weapon (javelin, dagger, …) at range: same to-hit math as
// the melee attack, then the weapon leaves the hand — one drops to the ground
// (recoverable in chat) and the equipped stack shrinks by one.
function weaponIsThrowable(inv: PartyInventoryItem, item: Item | null): boolean {
  return isThrownWeapon(inv.name, item);
}
async function rollThrowAttack(inv: PartyInventoryItem, item: Item | null, override: RollMode | null = null) {
  const rolled = await rollAttackWith(weaponAttackMod(item), `${inv.name} (Thrown)`, override);
  if (!rolled) return; // cancelled physical-dice prompt spends nothing
  await throwWeapon(inv, item, props.member.name);
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

function rollWeaponDamage(inv: PartyInventoryItem, item: Item | null) {
  const abilMod = weaponAbilityMod(item);
  // Custom weapon with no vault stats rolls as an improvised 1d4.
  const parsed = weaponDamageParsedExpression(item);
  if (!parsed) return;
  const typeLabel = libWeaponDamageType(item);
  const label = `${inv.name} — Damage (${typeLabel})`;
  return rollDamageLabelled(parsed, abilMod, label);
}
</script>
