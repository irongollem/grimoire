<template>
  <div class="detail-divider" />
  <p class="detail-section-label">{{ casterType === 'known' ? 'Known Spells' : 'Prepared Spells' }}</p>
  <div v-for="entry in spells" :key="entry.id" class="detail-spell">
    <div class="spell-info">
      <span class="spell-level-badge">{{ entry.spell.level === 0 ? 'C' : entry.spell.level }}</span>
      <span class="spell-name">{{ entry.spell.name }}</span>
    </div>
    <div class="spell-rolls">
      <button
        type="button"
        class="trait-roll-btn spell-cast-btn"
        :disabled="castingId === entry.id || !castSlot(entry.spell)"
        :title="castTitle(entry.spell)"
        @click.stop="cast(entry)"
      >{{ castingId === entry.id ? 'Casting…' : 'Cast' }}</button>
      <button
        v-if="(entry.spell.attack_type === 'ranged_spell' || entry.spell.attack_type === 'melee_spell') && spellAttackBonus !== null"
        type="button"
        class="trait-roll-btn trait-atk-btn"
        title="Roll spell attack (d20 + attack bonus)"
        @click.stop="emit('roll-attack', spellAttackBonus, entry.spell.name)"
      >🎲 Atk {{ signedNum(spellAttackBonus) }}</button>
      <button
        v-if="entry.spell.damage_rolls?.length"
        type="button"
        class="trait-roll-btn trait-dmg-btn"
        @click.stop="emit('roll-spell', entry.spell)"
      >🎲 {{ entry.spell.damage_rolls[0].dice }}</button>
      <button
        v-if="entry.spell.attack_type === 'save' && spellSaveDc"
        type="button"
        class="trait-roll-btn spell-save-btn"
        title="Announce saving throw to the table"
        @click.stop="emit('roll-spell-save', entry.spell, spellSaveDc)"
      >DC {{ spellSaveDc }} {{ entry.spell.save_attribute }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { CharacterSpellEntry, Spell } from "@/types/spell.types";
import type { PartyMember } from "@/types/party.types";
import { signedNum } from "@/lib/utils";
import { availableSlotsForSpell, slotPool } from "@/lib/spellSlots";
import { useCastCharacterSpell } from "@/composables/useParty";
import { useConcentration } from "@/composables/useConcentration";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  member: PartyMember;
  spells: CharacterSpellEntry[];
  casterType: string;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
}>();

const { mutateAsync: commitCast } = useCastCharacterSpell();
const { prepareConcentration } = useConcentration();
const { sendFlavorMessage } = useCampaignMessages();
const toast = useToast();
const castingId = ref<string | null>(null);

function castSlot(spell: Spell) {
  if (spell.level === 0) return { level: 0, max: 0, used: 0, pool: "spellcasting" as const };
  return availableSlotsForSpell(spell.level, props.member.spell_slots ?? [])[0] ?? null;
}

function castTitle(spell: Spell): string {
  const slot = castSlot(spell);
  if (!slot) return "No suitable spell slot remaining";
  return spell.level === 0 ? "Cast cantrip" : `Cast using a level ${slot.level} ${slotPool(slot)} slot`;
}

async function cast(entry: CharacterSpellEntry) {
  if (castingId.value) return;
  const slot = castSlot(entry.spell);
  if (!slot) return;
  castingId.value = entry.id;
  try {
    const concentrationState = entry.spell.concentration
      ? await prepareConcentration(props.member, entry.spell, { castAtLevel: slot.level })
      : null;
    if (entry.spell.concentration && !concentrationState) return;
    await commitCast({
      partyMemberId: props.member.id,
      slotLevel: slot.level,
      pool: slotPool(slot),
      slotTemplate: props.member.spell_slots ?? [],
      concentrationState,
    });
    await sendFlavorMessage(`casts ${entry.spell.name}${slot.level > entry.spell.level ? ` at level ${slot.level}` : ""}`, "spell");
    if (concentrationState) await sendFlavorMessage(`begins concentrating on ${entry.spell.name}`, entry.spell.name);
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
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
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
  @apply font-cinzel text-[9px] font-bold text-muted-foreground bg-muted rounded px-1 shrink-0;
}

.spell-rolls {
  @apply flex items-center gap-1 shrink-0;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
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
