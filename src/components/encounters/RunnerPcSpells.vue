<template>
  <div class="detail-divider" />
  <p class="detail-section-label">Spells</p>
  <div v-for="entry in spells" :key="entry.id" class="detail-spell">
    <div class="spell-info">
      <span class="spell-level-badge">{{ entry.spell.level === 0 ? 'C' : entry.spell.level }}</span>
      <span class="spell-name">{{ entry.spell.name }}</span>
    </div>
    <div class="spell-rolls">
      <button
        type="button"
        class="trait-roll-btn spell-cast-btn"
        :disabled="castingId === entry.id || !castSlot(entry)"
        :title="castTitle(entry)"
        @click.stop="cast(entry)"
      >{{ castingId === entry.id ? 'Casting…' : 'Cast' }}</button>
      <button
        v-if="(entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell') && attackBonusFor(entry) !== null"
        type="button"
        class="trait-roll-btn trait-atk-btn"
        title="Roll spell attack (d20 + attack bonus)"
        @click.stop="emit('roll-attack', attackBonusFor(entry)!, entry.spell.name)"
      >🎲 Atk {{ signedNum(attackBonusFor(entry)!) }}</button>
      <button
        v-if="entry.spell.damage_rolls?.length && entry.spell.mechanics_reviewed !== false"
        type="button"
        class="trait-roll-btn trait-dmg-btn"
        @click.stop="entry.spell.effects?.length ? openEffectResolution(entry) : emit('roll-spell', spellForLastCast(entry))"
      >🎲 {{ entry.spell.effects?.length ? "Resolve" : entry.spell.damage_rolls[0].dice }}</button>
      <span v-if="entry.spell.mechanics_reviewed === false" class="text-[0.5625rem] text-amber-500">Manual</span>
      <button
        v-if="entry.spell.attack_type === 'save' && saveDcFor(entry)"
        type="button"
        class="trait-roll-btn spell-save-btn"
        title="Announce saving throw to the table"
        @click.stop="emit('roll-spell-save', entry.spell, saveDcFor(entry)!)"
      >DC {{ saveDcFor(entry) }} {{ entry.spell.save_attribute }}</button>
    </div>
  </div>
  <SpellEffectResolver
    :spell="pendingResolution?.spell ?? null"
    :cast-level="pendingResolution?.castLevel ?? 0"
    :character-level="member.level"
    :spellcasting-modifier="pendingResolution?.modifier ?? 0"
    @close="pendingResolution = null"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { CharacterSpellEntry, Spell } from "@/types/spell.types";
import type { PartyMember } from "@/types/party.types";
import { pickSpellcastingStats, type SpellcastingClassStats } from "@/types/multiclass.types";
import { signedNum } from "@/lib/utils";
import { scaleExpression } from "@/lib/dice";
import { cantripDiceMultiplier } from "@/types/spell.types";
import { availableSlotsForSpell, slotPool } from "@/lib/spellSlots";
import { grantAttackBonus, grantSaveDc } from "@/lib/spellGrantStats";
import { useCastCharacterSpell } from "@/composables/useParty";
import { useConcentration } from "@/composables/useConcentration";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useToast } from "@/composables/useToast";
import SpellEffectResolver from "@/components/spells/SpellEffectResolver.vue";

const props = defineProps<{
  member: PartyMember;
  spells: CharacterSpellEntry[];
  casterType: string;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  spellcastingByClass?: SpellcastingClassStats[];
}>();

const { mutateAsync: commitCast } = useCastCharacterSpell();
const { prepareConcentration } = useConcentration();
const { sendFlavorMessage } = useCampaignMessages();
const toast = useToast();
const castingId = ref<string | null>(null);
const lastCastLevels = ref<Record<string, number>>({});
const pendingResolution = ref<{ spell: Spell; castLevel: number; modifier: number } | null>(null);
function statsFor(entry: CharacterSpellEntry) {
  return pickSpellcastingStats(props.spellcastingByClass ?? [], entry.source_class_id);
}
function attackBonusFor(entry: CharacterSpellEntry): number | null {
  return grantAttackBonus(entry, props.member, statsFor(entry), props.spellAttackBonus);
}
function saveDcFor(entry: CharacterSpellEntry): number | null {
  return grantSaveDc(entry, props.member, statsFor(entry), props.spellSaveDc);
}
function openEffectResolution(entry: CharacterSpellEntry, castLevel = lastCastLevels.value[entry.id] ?? entry.spell.level) {
  pendingResolution.value = {
    spell: entry.spell,
    castLevel,
    modifier: (attackBonusFor(entry) ?? 0) - props.member.proficiency_bonus,
  };
}

function spellForLastCast(entry: CharacterSpellEntry): Spell {
  const spell = entry.spell;
  const castLevel = lastCastLevels.value[entry.id] ?? spell.level;
  const extraLevels = Math.max(0, castLevel - spell.level);
  const cantripMultiplier = spell.level === 0 ? cantripDiceMultiplier(props.member.level) : 1;
  const damageRolls = (spell.damage_rolls ?? []).map((roll) => ({
    ...roll,
    dice: extraLevels > 0 && spell.higher_level_damage
      ? scaleExpression(roll.dice, extraLevels, spell.higher_level_damage.dice_per_level)
      : cantripMultiplier > 1
        ? scaleExpression(roll.dice, cantripMultiplier - 1, roll.dice)
        : roll.dice,
  }));
  return { ...spell, damage_rolls: damageRolls, higher_level_damage: null };
}

function castSlot(entry: CharacterSpellEntry) {
  if (entry.source_type !== "class") {
    return entry.uses_per_day !== null && !entry.uses_remaining
      ? null
      : { level: 0, max: 0, used: 0, pool: "feature" as const };
  }
  const spell = entry.spell;
  if (spell.level === 0) return { level: 0, max: 0, used: 0, pool: "spellcasting" as const };
  return availableSlotsForSpell(spell.level, props.member.spell_slots ?? [])[0] ?? null;
}

function castTitle(entry: CharacterSpellEntry): string {
  const slot = castSlot(entry);
  if (!slot) return entry.source_type === "class" ? "No suitable spell slot remaining" : "No uses remaining";
  if (entry.source_type !== "class") return `Cast from ${entry.source_label ?? entry.source_type}`;
  const spell = entry.spell;
  return spell.level === 0 ? "Cast cantrip" : `Cast using a level ${slot.level} ${slotPool(slot)} slot`;
}

async function cast(entry: CharacterSpellEntry) {
  if (castingId.value) return;
  const slot = castSlot(entry);
  if (!slot) return;
  castingId.value = entry.id;
  try {
    const resolvedCastLevel = entry.source_type === "class" ? slot.level : entry.spell.level;
    const concentrationState = entry.spell.concentration
      ? await prepareConcentration(props.member, entry.spell, { castAtLevel: resolvedCastLevel })
      : null;
    if (entry.spell.concentration && !concentrationState) return;
    await commitCast({
      partyMemberId: props.member.id,
      slotLevel: slot.level,
      pool: slotPool(slot),
      slotTemplate: props.member.spell_slots ?? [],
      concentrationState,
      characterSpellId: entry.id,
    });
    lastCastLevels.value = { ...lastCastLevels.value, [entry.id]: resolvedCastLevel };
    const attackBonus = attackBonusFor(entry);
    const saveDc = saveDcFor(entry);
    let castText = `casts ${entry.spell.name}${resolvedCastLevel > entry.spell.level ? ` at level ${resolvedCastLevel}` : ""}`;
    if (entry.spell.level > 0 && attackBonus !== null
      && (entry.spell.attack_type === "ranged_spell" || entry.spell.attack_type === "melee_spell")) {
      castText += ` (Atk ${signedNum(attackBonus)})`;
    } else if (entry.spell.level > 0 && saveDc !== null && entry.spell.attack_type === "save") {
      castText += entry.spell.save_attribute ? ` (DC ${saveDc} ${entry.spell.save_attribute})` : ` (DC ${saveDc})`;
    }
    if (entry.source_type !== "class" && entry.source_label) castText += ` [${entry.source_label}]`;
    await sendFlavorMessage(castText, "spell");
    if (concentrationState) await sendFlavorMessage(`begins concentrating on ${entry.spell.name}`, entry.spell.name);
    if (entry.spell.mechanics_reviewed !== false && entry.spell.effects?.length) {
      openEffectResolution(entry, resolvedCastLevel);
    } else if (entry.spell.mechanics_reviewed === false) {
      toast.info("Imported mechanics are unreviewed; resolve this spell manually from its rules text.");
    }
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    castingId.value = null;
  }
}

const emit = defineEmits<{
  "roll-spell": [spell: Spell];
  "roll-attack": [bonus: number, name: string];
  "roll-spell-save": [spell: Spell, dc: number];
}>();
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-section-label {
  @apply font-cinzel text-2xs font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.detail-spell {
  @apply flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-b-0;
}

.spell-info {
  @apply flex items-center gap-1.5 min-w-0 flex-1;
}

.spell-name {
  @apply font-fell text-xs text-foreground truncate;
}

.spell-level-badge {
  @apply font-cinzel text-[0.5625rem] font-bold text-muted-foreground bg-muted rounded px-1 shrink-0;
}

.spell-rolls {
  @apply flex items-center gap-1 shrink-0;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[0.5625rem] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}

.trait-atk-btn {
  @apply bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20;
}

.spell-save-btn {
  @apply text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20;
}

.spell-cast-btn {
  @apply bg-violet-500/10 text-violet-500 border border-violet-500/30 hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
