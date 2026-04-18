<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Current Levels</h3>

    <div v-for="entry in characterClasses" :key="entry.id" class="space-y-2">
      <!-- Class row -->
      <div class="flex items-center justify-between">
        <div>
          <span class="font-fell text-sm text-foreground">
            {{ entry.class_name }}{{ entry.subclass_name ? ` (${entry.subclass_name})` : '' }}
          </span>
          <span class="font-cinzel text-xs text-muted-foreground ml-2">Level {{ entry.levels }}</span>
        </div>
        <button
          type="button"
          class="font-cinzel text-xs text-muted-foreground hover:text-destructive transition-colors tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="member.level <= 1 || (!!pendingEntry && pendingEntry.id !== entry.id)"
          @click="pendingEntry = pendingEntry?.id === entry.id ? null : entry"
        >
          {{ pendingEntry?.id === entry.id ? '× cancel' : '− 1 level' }}
        </button>
      </div>

      <!-- Inline confirmation -->
      <div v-if="pendingEntry?.id === entry.id" class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
        <!-- What changes -->
        <div class="space-y-1.5">
          <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Changes</p>
          <template v-if="hasHistory">
            <p class="font-fell text-xs text-foreground">
              HP: <span class="text-destructive">−{{ pendingChoice!.hp_gained }}</span>
              ({{ member.max_hp }} → {{ Math.max(1, member.max_hp - pendingChoice!.hp_gained) }})
            </p>
            <p v-if="profWillDrop" class="font-fell text-xs text-foreground">
              Proficiency bonus: +{{ currentProfBonus }} → +{{ newProfBonus }}
            </p>
            <p v-if="pendingChoice!.asi" class="font-fell text-xs text-foreground">
              {{ asiDescription }} will be reverted
            </p>
            <p v-if="pendingChoice!.subclass" class="font-fell text-xs text-foreground">
              Subclass "{{ pendingChoice!.subclass }}" will be cleared
            </p>
          </template>
          <template v-else>
            <p class="font-fell text-xs text-foreground">
              HP: approximately −{{ estimatedHpLoss }}
              ({{ member.max_hp }} → ~{{ Math.max(1, member.max_hp - estimatedHpLoss) }})
            </p>
            <p v-if="profWillDrop" class="font-fell text-xs text-foreground">
              Proficiency bonus: +{{ currentProfBonus }} → +{{ newProfBonus }}
            </p>
          </template>
          <p class="font-fell text-xs text-muted-foreground italic">
            Spell slots and class resources recalculated from class table.
          </p>
        </div>

        <!-- Manual review warning -->
        <div
          v-if="manualReviewItems.length > 0 || !hasHistory"
          class="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 space-y-1"
        >
          <p class="font-cinzel text-[10px] text-amber-400 tracking-wider">REVIEW MANUALLY</p>
          <p v-if="!hasHistory" class="font-fell text-xs text-amber-400">
            No level history found — HP estimated using class average. Spells, ASIs, and feats cannot be auto-reversed.
          </p>
          <ul v-if="manualReviewItems.length" class="space-y-0.5">
            <li v-for="item in manualReviewItems" :key="item" class="font-fell text-xs text-amber-400">• {{ item }}</li>
          </ul>
        </div>

        <p v-if="error" class="font-fell text-xs text-destructive">{{ error }}</p>

        <button
          type="button"
          class="w-full rounded-md bg-destructive px-4 py-2 font-cinzel text-xs font-semibold text-destructive-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="isPending"
          @click="confirmDeLevel(entry)"
        >
          {{ isPending ? 'Applying…' : `Confirm — Remove ${entry.class_name} Level ${entry.levels}` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUpdatePartyMember } from '@/composables/useParty';
import { useUpdateCharacterClass, useDeleteCharacterClass } from '@/composables/useCharacterClasses';
import { useDeleteCharacterSpell } from '@/composables/useCharacterSpells';
import { useCustomClassByName, useAllSystemClasses } from '@/composables/useCustomClasses';
import { getHitDie } from '@/types/spell.types';
import type { PartyMember, PartyMemberUpdate, LevelChoiceEntry, SpellSlotEntry } from '@/types/party.types';
import type { CharacterClass } from '@/types/multiclass.types';
import type { CustomResource } from '@/levelup/customTypes';

const props = defineProps<{
  member: PartyMember;
  characterClasses: CharacterClass[];
}>();

const pendingEntry = ref<CharacterClass | null>(null);
const isPending = ref(false);
const error = ref('');

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { mutateAsync: updateCharacterClass } = useUpdateCharacterClass();
const { mutateAsync: deleteCharacterClass } = useDeleteCharacterClass();
const { mutateAsync: deleteSpell } = useDeleteCharacterSpell();

// Load class data for the pending entry
const selectedClassName = computed(() => pendingEntry.value?.class_name ?? '');
const { data: customClass } = useCustomClassByName(selectedClassName);
const { data: allSystemClasses } = useAllSystemClasses();
const systemClass = computed(() =>
  (allSystemClasses.value ?? []).find(c => c.class_name === selectedClassName.value) ?? null,
);
const theClass = computed(() => customClass.value ?? systemClass.value ?? null);

// The level_choices entry for the current total level
const pendingChoice = computed<LevelChoiceEntry | null>(() => {
  if (!pendingEntry.value) return null;
  const choices = props.member.level_choices ?? {};
  const entry = choices[props.member.level];
  if (!entry || entry.class_name !== pendingEntry.value.class_name) return null;
  return entry;
});
const hasHistory = computed(() => !!pendingChoice.value);

// Proficiency bonus
const currentProfBonus = computed(() => 2 + Math.floor((props.member.level - 1) / 4));
const newProfBonus = computed(() => 2 + Math.floor((props.member.level - 2) / 4));
const profWillDrop = computed(() => newProfBonus.value < currentProfBonus.value);

// Estimated HP loss for legacy characters
const estimatedHpLoss = computed(() => {
  if (!pendingEntry.value) return 0;
  const hd = theClass.value?.hit_die ?? getHitDie(pendingEntry.value.class_name);
  const conMod = Math.floor((props.member.con - 10) / 2);
  return Math.max(1, Math.ceil(hd / 2) + 1 + conMod);
});

// ASI description for display
const asiDescription = computed(() => {
  const asi = pendingChoice.value?.asi;
  if (!asi) return '';
  const LABEL: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
  if (asi.mode === 'feat') return `Feat${asi.feat_id ? '' : ''}`;
  if (asi.mode === 'plus2' && asi.primary) return `${LABEL[asi.primary] ?? asi.primary} +2`;
  if (asi.mode === 'plus1plus1')
    return [asi.primary, asi.secondary].filter(Boolean).map(k => `${LABEL[k!] ?? k} +1`).join(', ');
  return 'Ability Score Improvement';
});

// Manual review items
const manualReviewItems = computed<string[]>(() => {
  if (!pendingEntry.value || !hasHistory.value || !pendingChoice.value) return [];
  const items: string[] = [];
  const c = pendingChoice.value;
  if (c.asi?.mode === 'feat' && c.asi.feat_id) items.push('Feat from this level — remove manually from sheet');
  if ((c.spells_learned?.length ?? 0) > 0)
    items.push(`${c.spells_learned!.length} spell(s) learned at this level will be removed from your spell list`);
  if ((c.cantrips_learned?.length ?? 0) > 0)
    items.push(`${c.cantrips_learned!.length} cantrip(s) learned at this level will be removed`);
  if (c.step_choices && Object.keys(c.step_choices).length > 0)
    items.push('Class choices from this level (e.g. Fighting Style, Invocations) — review manually');
  return items;
});

function resourceMaxAtLevel(resource: CustomResource, level: number): number {
  if (resource.scaling === 'fixed') return resource.fixed_value ?? 0;
  if (resource.scaling === 'per_level') return level;
  if (resource.scaling === 'table' && resource.table_values)
    return resource.table_values[Math.min(level, 20) - 1] ?? 0;
  return 0;
}

async function confirmDeLevel(entry: CharacterClass) {
  isPending.value = true;
  error.value = '';
  try {
    const currentLevel = props.member.level;
    const newTotalLevel = currentLevel - 1;
    const newClassLevel = entry.levels - 1;
    const choice = pendingChoice.value;

    const memberUpdate: Record<string, unknown> = {
      level: newTotalLevel,
      proficiency_bonus: 2 + Math.floor((newTotalLevel - 1) / 4),
      hit_dice_remaining: Math.max(0, (props.member.hit_dice_remaining ?? props.member.level) - 1),
    };

    // HP
    const hpLoss = choice ? choice.hp_gained : estimatedHpLoss.value;
    const newMaxHp = Math.max(1, props.member.max_hp - hpLoss);
    memberUpdate.max_hp = newMaxHp;
    memberUpdate.current_hp = Math.min(props.member.current_hp, newMaxHp);

    // ASI reversal
    if (choice?.asi && choice.asi.mode !== 'feat') {
      if (choice.asi.primary) {
        const k = choice.asi.primary as keyof PartyMember;
        memberUpdate[k] = Math.max(1, (props.member[k] as number) - (choice.asi.mode === 'plus2' ? 2 : 1));
      }
      if (choice.asi.mode === 'plus1plus1' && choice.asi.secondary) {
        const k = choice.asi.secondary as keyof PartyMember;
        memberUpdate[k] = Math.max(1, (props.member[k] as number) - 1);
      }
    }

    // Subclass
    const subclassToClear = choice
      ? !!choice.subclass
      : (theClass.value?.subclass_level === entry.levels && !!entry.subclass_name);
    if (subclassToClear && entry.is_primary) memberUpdate.subclass = null;

    // Spell slots from class table at newClassLevel
    const cls = theClass.value;
    if (newClassLevel === 0) {
      memberUpdate.spell_slots = [];
    } else if (cls?.spell_slots && newClassLevel > 0) {
      const row = cls.spell_slots[newClassLevel - 1];
      if (row) {
        memberUpdate.spell_slots = (row as number[])
          .map((max, i): SpellSlotEntry => ({
            level: i + 1,
            max,
            used: props.member.spell_slots?.find(s => s.level === i + 1)?.used ?? 0,
          }))
          .filter(s => s.max > 0);
      }
    }

    // Class resources
    const resources: CustomResource[] = [
      ...(systemClass.value?.resources ?? []),
      ...(customClass.value?.resources ?? []),
    ];
    if (resources.length > 0) {
      const newResources = { ...props.member.class_resources };
      for (const r of resources) {
        const newMax = resourceMaxAtLevel(r, newClassLevel);
        if (newMax === 0) {
          delete newResources[r.key];
        } else {
          const existing = newResources[r.key];
          newResources[r.key] = {
            max: newMax,
            current: existing ? Math.min(existing.current, newMax) : newMax,
            rest: r.rest,
          };
        }
      }
      memberUpdate.class_resources = newResources;
    }

    // Remove this level from level_choices
    if (choice) {
      const newChoices = { ...(props.member.level_choices ?? {}) };
      delete newChoices[currentLevel];
      memberUpdate.level_choices = newChoices;
    }

    // Update party member
    await updateMember({ id: props.member.id, update: memberUpdate as PartyMemberUpdate });

    // Remove spells learned at this level
    if (choice) {
      const toRemove = [...(choice.spells_learned ?? []), ...(choice.cantrips_learned ?? [])];
      const earlierSpells = new Set(
        Object.entries(props.member.level_choices ?? {})
          .filter(([lvl]) => parseInt(lvl) < currentLevel)
          .flatMap(([, e]) => [...(e.spells_learned ?? []), ...(e.cantrips_learned ?? [])]),
      );
      for (const spellId of toRemove) {
        if (!earlierSpells.has(spellId)) {
          await deleteSpell({ partyMemberId: props.member.id, spellId });
        }
      }
    }

    // Update or delete character_classes row
    if (newClassLevel === 0) {
      await deleteCharacterClass(entry.id);
      const remaining = props.characterClasses.filter(c => c.id !== entry.id);
      if (remaining.length > 0 && entry.is_primary) {
        await updateCharacterClass({ id: remaining[0].id, update: { is_primary: true } });
        await updateMember({
          id: props.member.id,
          update: {
            class: remaining[0].class_name,
            subclass: remaining[0].subclass_name ?? null,
          } as PartyMemberUpdate,
        });
      } else if (remaining.length === 0) {
        await updateMember({ id: props.member.id, update: { class: null, subclass: null } as PartyMemberUpdate });
      }
    } else {
      await updateCharacterClass({
        id: entry.id,
        update: { levels: newClassLevel, ...(subclassToClear ? { subclass_name: null } : {}) },
      });
    }

    pendingEntry.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to de-level.';
  } finally {
    isPending.value = false;
  }
}
</script>
