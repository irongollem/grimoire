<template>
  <div v-if="groups.length" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Feature actions</p>
    </div>
    <div class="divide-y divide-border">
      <section v-for="group in groups" :key="group.activation" :aria-label="group.label">
        <p class="px-4 pt-2.5 pb-1 text-label font-semibold text-primary/80">{{ group.label }}</p>
        <ul>
          <li
            v-for="entry in group.entries"
            :key="`${entry.featureId}:${entry.name}`"
            class="flex items-center gap-x-3 gap-y-1 px-4 py-2 flex-wrap"
          >
            <div class="min-w-0 flex-1 basis-40">
              <p class="text-body text-foreground leading-snug">{{ rowName(entry) }}</p>
              <p v-if="effectLine(entry)" class="text-caption leading-snug" :class="effectLine(entry)?.ok ? 'text-foreground' : 'text-muted-foreground'">
                {{ effectLine(entry)?.text }}
              </p>
              <p v-if="toggleOffReason(entry)" class="text-caption leading-snug text-muted-foreground">{{ toggleOffReason(entry) }}</p>
              <p v-if="entry.spends" class="text-caption leading-snug" :class="reasonFor(entry) ? 'text-destructive' : 'text-muted-foreground'">
                {{ reasonFor(entry) ?? costNote(entry.spends) }}
              </p>
            </div>

            <div v-if="!readonly && rollOf(entry)" class="flex flex-wrap items-center gap-2 shrink-0">
              <template v-if="rollOf(entry)?.toHit !== null">
                <AppButton
                  v-roll-mode="(mode: RollMode | null) => rollAttack(entry, mode)"
                  variant="subtle"
                  fill="muted"
                  size="md"
                  :disabled="uses.isSaving.value || rollBlocked(entry)"
                  label="Attack"
                  :aria-label="`${entry.name}: attack roll`"
                />
                <AppButton
                  v-if="rollOf(entry)?.damage"
                  variant="subtle"
                  fill="muted"
                  size="md"
                  :disabled="uses.isSaving.value || toggleOffReason(entry) !== null"
                  label="Damage"
                  :aria-label="`${entry.name}: damage roll`"
                  @click="rollEffectDamage(entry, false)"
                />
              </template>
              <AppButton
                v-else
                variant="subtle"
                fill="muted"
                size="md"
                :disabled="uses.isSaving.value || rollBlocked(entry, true)"
                :label="rolledThisUse[entryKey(entry)] ? 'Roll again' : BUTTON_LABEL[rollOf(entry)?.kind ?? 'damage']"
                :aria-label="`${entry.name}: ${ROLL_NOUN[rollOf(entry)?.kind ?? 'damage'].toLowerCase()} roll`"
                @click="rollEffectDamage(entry, true)"
              />
              <AppButton
                v-if="rolledThisUse[entryKey(entry)]"
                variant="subtle"
                fill="muted"
                size="md"
                :disabled="uses.isSaving.value"
                label="New use"
                :aria-label="`${entry.name}: start a new use`"
                @click="newUse(entry)"
              />
            </div>

            <template v-if="entry.toggleKey">
              <span v-if="readonly" class="text-label-lg shrink-0" :class="uses.isOn(entry.toggleKey) ? 'text-primary' : 'text-muted-foreground'">
                {{ uses.isOn(entry.toggleKey) ? "On" : "Off" }}
              </span>
              <AppButton
                v-else
                variant="subtle"
                fill="muted"
                size="md"
                class="shrink-0 min-w-16"
                :active="uses.isOn(entry.toggleKey)"
                :aria-pressed="uses.isOn(entry.toggleKey)"
                :aria-label="`${entry.name}: ${uses.isOn(entry.toggleKey) ? 'on' : 'off'}`"
                :disabled="uses.isSaving.value || (!uses.isOn(entry.toggleKey) && reasonFor(entry) !== null)"
                :label="uses.isOn(entry.toggleKey) ? 'On' : 'Off'"
                @click="flip(entry)"
              />
            </template>
            <AppButton
              v-else-if="!readonly && entry.spends && !rollOf(entry)"
              variant="subtle"
              fill="muted"
              size="md"
              class="shrink-0"
              :disabled="uses.isSaving.value || reasonFor(entry) !== null"
              label="Use"
              :aria-label="`Use ${entry.name}`"
              @click="use(entry)"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { CharacterFeatures } from "@/composables/features/useCharacterFeatures";
import { useFeatureUses } from "@/composables/features/useFeatureUses";
import { useToast } from "@/composables/useToast";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import type { RollMode } from "@/lib/dice/roller";
import { abilityMod } from "@/rules/armorClass";
import type { ActionEntry } from "@/rules/features/characterFeatures";
import { poolLabel } from "@/rules/features/characterFeatures";
import { unpayableReason } from "@/rules/features/uses";
import { describeResolved, effectDamageRoll, resolveEffect, type EffectResolution, type ResolvedEffect } from "@/rules/features/effect";
import type { Activation, EffectKind, UsesCost } from "@/rules/features/mechanics.types";
import type { PartyMember } from "@/types/party.types";

/**
 * What a character can do with its features, by the action it takes (#976):
 * the player's Combat tab and the encounter runner's character panel show the
 * same card. A feature that spends something gets a Use button; one that costs
 * nothing is just listed. `readonly` is the view without the buttons.
 *
 * An entry with an effect (an attack, a save with damage, healing) shows its
 * numbers for this character and rolls them. Rolling is how it is used: the
 * roll that makes it happen spends its cost once, after the dice are rolled
 * (a cancelled roll spends nothing), so there is no separate Use beside it.
 * An attack spends on its attack roll, and its damage roll is free.
 *
 * A save, damage, heal or temp HP effect that spends has one use per click of
 * its first roll: after it, the button reads "Roll again" and rolls for free
 * (a second target, a re-roll), until "New use" is pressed, which makes the
 * next roll spend again. That flag lives in the card only, so leaving the
 * sheet also starts a new use. A toggle entry (Rage-like, with an effect) paid
 * when it was switched on: its rolls never spend, and are disabled while off.
 */
const { member, features, readonly = false } = defineProps<{
  member: PartyMember;
  /** The member's resolved features, owned by the parent so the graph is built once. */
  features: CharacterFeatures;
  readonly?: boolean;
}>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number }] }>();

const toast = useToast();
const memberRef = toRef(() => member);
const featurePools = features.pools;
const { actions, spellcasting } = features;
const { promptRoll } = usePromptedRoll();
const { sendRoll } = useCampaignMessages();
const { reportChatFailure } = useChatSendFailure();
const uses = useFeatureUses(memberRef, featurePools);
// The feature pools plus a virtual Wild Shape pool for a druid ("Expend a use of your Wild Shape").
const pools = uses.pools;

const BUTTON_LABEL: Record<EffectKind, string> = { attack: "Damage", save: "Damage", damage: "Damage", heal: "Heal", temp_hp: "Temp HP" };
/** What the roll is called in the chat and in the button's accessible name. */
const ROLL_NOUN: Record<EffectKind, string> = { attack: "Damage", save: "Damage", damage: "Damage", heal: "Healing", temp_hp: "Temporary hit points" };

const GROUP_LABELS: { activation: Activation; label: string }[] = [
  { activation: "action", label: "Action" },
  { activation: "bonus_action", label: "Bonus Action" },
  { activation: "reaction", label: "Reaction" },
  { activation: "special", label: "Special" },
];

const groups = computed(() =>
  GROUP_LABELS
    .map(g => ({ ...g, entries: actions.value[g.activation] }))
    .filter(g => g.entries.length > 0),
);

/** "Cunning Action: Disengage" for a sub-action; a feature's own action is just its name. */
function rowName(entry: ActionEntry): string {
  return entry.isSubAction ? `${entry.featureName}: ${entry.name}` : entry.name;
}

function labelOf(key: string): string {
  return poolLabel(pools.value, key);
}

/** "Ki 3/5" for a pool with a count, "Ki (unlimited)" when it never runs out. */
function remainingText(key: string): string {
  const left = uses.remaining(key);
  const label = labelOf(key);
  if (left === "unlimited") return `${label} unlimited`;
  const pool = pools.value.find(p => p.key === key);
  if (left === null || !pool || pool.max === "unlimited") return label;
  return `${label} ${left}/${pool.max}`;
}

function costNote(cost: UsesCost): string {
  return cost.amount === 1 ? remainingText(cost.key) : `Costs ${cost.amount}. ${remainingText(cost.key)}`;
}

/** Entries whose current use has been rolled once; further rolls are free until "New use". */
const rolledThisUse = ref<Record<string, boolean>>({});

function newUse(entry: ActionEntry) {
  rolledThisUse.value = { ...rolledThisUse.value, [entryKey(entry)]: false };
}

/** Why a toggle entry's rolls are unavailable (it is switched off), or null. */
function toggleOffReason(entry: ActionEntry): string | null {
  if (!entry.toggleKey || !rollOf(entry) || uses.isOn(entry.toggleKey)) return null;
  return "Switch it on to roll.";
}

/**
 * Whether the roll button is disabled. A toggle paid when switched on, so only
 * its on/off state matters; otherwise the cost must be payable, except for a
 * free re-roll of a use already paid (`freeAfterRoll`).
 */
function rollBlocked(entry: ActionEntry, freeAfterRoll = false): boolean {
  if (entry.toggleKey) return toggleOffReason(entry) !== null;
  if (freeAfterRoll && rolledThisUse.value[entryKey(entry)]) return false;
  return reasonFor(entry) !== null;
}

/** Why the row cannot be used, or null when it can. */
function reasonFor(entry: ActionEntry): string | null {
  if (!entry.spends || uses.payable(entry.spends)) return null;
  return unpayableReason(uses.remaining(entry.spends.key), labelOf(entry.spends.key));
}

function entryKey(entry: ActionEntry): string {
  return `${entry.featureId}:${entry.name}`;
}

/** This character's numbers for each entry that rolls something, by entry. */
const resolutions = computed(() => {
  const out = new Map<string, EffectResolution>();
  const abilityMods = {
    str: abilityMod(member.str),
    dex: abilityMod(member.dex),
    con: abilityMod(member.con),
    int: abilityMod(member.int),
    wis: abilityMod(member.wis),
    cha: abilityMod(member.cha),
  };
  for (const list of Object.values(actions.value)) {
    for (const entry of list) {
      if (!entry.effect) continue;
      const stats = entry.className === null ? undefined : spellcasting.value.find(s => s.className === entry.className);
      out.set(entryKey(entry), resolveEffect(entry.effect, {
        classLevel: entry.effectLevel,
        proficiencyBonus: member.proficiency_bonus,
        abilityMods,
        spell: stats ? { dc: stats.dc, attack: stats.attack } : null,
      }));
    }
  }
  return out;
});

/** The resolved effect when this entry has one that can be rolled now, else null. */
function rollOf(entry: ActionEntry): ResolvedEffect | null {
  const resolution = resolutions.value.get(entryKey(entry));
  if (!resolution || !resolution.ok) return null;
  const { effect } = resolution;
  return effect.toHit !== null || effect.damage !== null ? effect : null;
}

/** What the effect is for this character ("DC 14 Con save · 2d6 thunder"), or why it cannot be worked out. */
function effectLine(entry: ActionEntry): { ok: boolean; text: string } | null {
  const resolution = resolutions.value.get(entryKey(entry));
  if (!resolution) return null;
  return resolution.ok ? { ok: true, text: describeResolved(resolution.effect) } : { ok: false, text: resolution.reason };
}

/** Whether the last attack roll for each entry was a natural 20, so its damage roll doubles the dice. */
const crits = ref<Record<string, boolean>>({});

function modeTag(mode: RollMode): string {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

async function spendFor(entry: ActionEntry) {
  if (!entry.spends) return;
  try {
    await uses.spend(entry.spends);
  } catch (error) {
    toast.error(toast.fromError(error, `Couldn't use ${entry.name}.`));
  }
}

async function rollAttack(entry: ActionEntry, override: RollMode | null) {
  const effect = rollOf(entry);
  if (!effect || effect.toHit === null) return;
  const mode: RollMode = override ?? "normal";
  const result = await promptRoll({ counts: { 20: 1 }, modifier: effect.toHit, label: `${rowName(entry)} · Attack${modeTag(mode)}`, mode });
  // A cancelled attack is no attack: the last roll's crit must not double the next damage.
  if (!result) {
    crits.value = { ...crits.value, [entryKey(entry)]: false };
    return;
  }
  crits.value = { ...crits.value, [entryKey(entry)]: result.isCrit };
  const kept = result.breakdown.find(d => !d.dropped);
  emit("roll", { label: result.label, dice: kept ? kept.val : result.total - result.modifier, modifier: result.modifier, total: result.total });
  // A toggle paid when it was switched on.
  if (!entry.toggleKey) await spendFor(entry);
}

/** Damage or healing. `spends` is true when this roll is the one that uses the feature (no attack roll before it). */
async function rollEffectDamage(entry: ActionEntry, spends: boolean) {
  const effect = rollOf(entry);
  if (!effect || !effect.damage) return;
  const key = entryKey(entry);
  const roll = effectDamageRoll(effect.damage, crits.value[key] === true);
  const noun = ROLL_NOUN[effect.kind];
  const dc = effect.save ? ` (DC ${effect.save.dc})` : "";
  const label = `${rowName(entry)} · ${noun}${dc}`;
  let total: number;
  let dice: number;
  if (Object.keys(roll.counts).length === 0) {
    // A flat value has no dice to throw: post it as it is.
    total = roll.modifier;
    dice = 0;
    sendRoll({ total, label, modifier: roll.modifier, breakdown: [], isCrit: false, isFumble: false, isDamage: true })
      .catch(e => reportChatFailure(e, "post the roll to the chat"));
  } else {
    const result = await promptRoll({ counts: roll.counts, modifier: roll.modifier, label, isDamage: true });
    if (!result) return;
    total = result.total;
    dice = result.total - result.modifier;
  }
  crits.value = { ...crits.value, [key]: false };
  emit("roll", { label, dice, modifier: roll.modifier, total });
  if (spends && !entry.toggleKey) {
    if (!rolledThisUse.value[key]) {
      await spendFor(entry);
      rolledThisUse.value = { ...rolledThisUse.value, [key]: true };
    }
  }
}

async function use(entry: ActionEntry) {
  if (!entry.spends) return;
  try {
    await uses.spend(entry.spends);
  } catch (error) {
    toast.error(toast.fromError(error, `Couldn't use ${entry.name}.`));
  }
}

async function flip(entry: ActionEntry) {
  if (!entry.toggleKey) return;
  const turningOn = !uses.isOn(entry.toggleKey);
  try {
    await uses.setToggle(entry.toggleKey, turningOn, turningOn ? entry.spends : null);
  } catch (error) {
    toast.error(toast.fromError(error, `Couldn't switch ${entry.name} ${turningOn ? "on" : "off"}.`));
  }
}
</script>
