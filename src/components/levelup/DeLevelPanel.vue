<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Current Levels</h3>

    <!-- Class breakdown (read-only context) -->
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <div v-for="entry in characterClasses" :key="entry.id" class="flex items-baseline gap-1.5">
        <span class="font-fell text-sm text-foreground">
          {{ entry.class_name }}{{ entry.subclass_name ? ` (${entry.subclass_name})` : '' }}
        </span>
        <span class="font-cinzel text-xs text-muted-foreground">{{ entry.levels }}</span>
      </div>
    </div>

    <!-- Can't go below level 1 -->
    <p v-if="member.level <= 1" class="font-fell text-xs text-muted-foreground italic">
      Already at level 1 — cannot de-level further.
    </p>

    <template v-else>
      <!-- Last level taken (with history) -->
      <div v-if="lastChoice" class="flex items-center justify-between">
        <div>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Last level taken</span>
          <p class="font-fell text-sm text-foreground mt-0.5">
            {{ lastChoice.class_name }}
            <span class="text-muted-foreground">— Level {{ member.level }}</span>
            <span v-if="lastChoice.is_new_class" class="font-cinzel text-[10px] text-primary ml-2 tracking-wider">NEW CLASS</span>
          </p>
        </div>
        <button
          type="button"
          class="font-cinzel text-xs tracking-wider transition-colors"
          :class="showConfirmation
            ? 'text-muted-foreground hover:text-foreground'
            : 'text-muted-foreground hover:text-destructive'"
          @click="showConfirmation = !showConfirmation"
        >
          {{ showConfirmation ? '× cancel' : '− undo last level' }}
        </button>
      </div>

      <!-- Legacy: no history — show class picker -->
      <div v-else class="space-y-2">
        <div class="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2">
          <p class="font-cinzel text-[10px] text-amber-400 tracking-wider mb-0.5">NO LEVEL HISTORY</p>
          <p class="font-fell text-xs text-amber-400">
            This character has no level history. Select which class to remove a level from.
            HP will be estimated. Spells, ASIs, and feats cannot be auto-reversed.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <select
            v-model="legacyClassName"
            class="flex-1 rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>Select class…</option>
            <option v-for="entry in characterClasses" :key="entry.id" :value="entry.class_name">
              {{ entry.class_name }} ({{ entry.levels }} levels)
            </option>
          </select>
          <button
            v-if="legacyClassName"
            type="button"
            class="font-cinzel text-xs text-muted-foreground hover:text-destructive transition-colors tracking-wider"
            @click="showConfirmation = !showConfirmation"
          >
            {{ showConfirmation ? '× cancel' : '− undo last level' }}
          </button>
        </div>
      </div>

      <!-- Confirmation panel -->
      <div v-if="showConfirmation && targetEntry" class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
        <div class="space-y-1.5">
          <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Changes</p>

          <!-- Exact (has history) -->
          <template v-if="lastChoice">
            <p class="font-fell text-xs text-foreground">
              HP: <span class="text-destructive">−{{ lastChoice.hp_gained }}</span>
              <span class="text-muted-foreground ml-1">({{ member.max_hp }} → {{ Math.max(1, member.max_hp - lastChoice.hp_gained) }})</span>
            </p>
            <p v-if="profWillDrop" class="font-fell text-xs text-foreground">
              Proficiency bonus: +{{ currentProfBonus }} → +{{ newProfBonus }}
            </p>
            <p v-if="lastChoice.asi" class="font-fell text-xs text-foreground">
              {{ asiDescription }} reverted
            </p>
            <p v-if="lastChoice.subclass" class="font-fell text-xs text-foreground">
              Subclass "{{ lastChoice.subclass }}" cleared
            </p>
            <p v-if="lastChoice.is_new_class" class="font-fell text-xs text-foreground">
              {{ lastChoice.class_name }} class entry removed
            </p>
          </template>

          <!-- Estimated (legacy) -->
          <template v-else>
            <p class="font-fell text-xs text-foreground">
              HP: ~−{{ estimatedHpLoss }}
              <span class="text-muted-foreground ml-1">({{ member.max_hp }} → ~{{ Math.max(1, member.max_hp - estimatedHpLoss) }})</span>
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
          v-if="manualReviewItems.length > 0"
          class="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 space-y-1"
        >
          <p class="font-cinzel text-[10px] text-amber-400 tracking-wider">REVIEW MANUALLY</p>
          <ul class="space-y-0.5">
            <li v-for="item in manualReviewItems" :key="item" class="font-fell text-xs text-amber-400">• {{ item }}</li>
          </ul>
        </div>

        <p v-if="error" class="font-fell text-xs text-destructive">{{ error }}</p>

        <button
          type="button"
          class="w-full rounded-md bg-destructive px-4 py-2 font-cinzel text-xs font-semibold text-destructive-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="isPending"
          @click="confirmDeLevel"
        >
          {{ isPending ? 'Applying…' : `Confirm — Remove ${targetEntry.class_name} Level ${targetEntry.levels}` }}
        </button>
      </div>
    </template>
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

const showConfirmation = ref(false);
const legacyClassName = ref('');
const isPending = ref(false);
const error = ref('');

const { mutateAsync: updateMember } = useUpdatePartyMember();
const { mutateAsync: updateCharacterClass } = useUpdateCharacterClass();
const { mutateAsync: deleteCharacterClass } = useDeleteCharacterClass();
const { mutateAsync: deleteSpell } = useDeleteCharacterSpell();

// The level_choices entry for the current total level (if it exists)
const lastChoice = computed<LevelChoiceEntry | null>(() => {
  const choices = props.member.level_choices ?? {};
  return choices[props.member.level] ?? null;
});

// The class name to act on: from history if available, otherwise from picker
const activeClassName = computed(() => lastChoice.value?.class_name ?? legacyClassName.value);

// The character_classes row for the active class
const targetEntry = computed<CharacterClass | null>(() =>
  props.characterClasses.find(c => c.class_name === activeClassName.value) ?? null,
);

// Load class definition for the target class (for spell slots, resources, hit die)
const { data: customClass } = useCustomClassByName(activeClassName);
const { data: allSystemClasses } = useAllSystemClasses();
const systemClass = computed(() =>
  (allSystemClasses.value ?? []).find(c => c.class_name === activeClassName.value) ?? null,
);
const theClass = computed(() => customClass.value ?? systemClass.value ?? null);

// Proficiency bonus
const currentProfBonus = computed(() => 2 + Math.floor((props.member.level - 1) / 4));
const newProfBonus = computed(() => 2 + Math.floor((props.member.level - 2) / 4));
const profWillDrop = computed(() => newProfBonus.value < currentProfBonus.value);

// Estimated HP loss for legacy characters
const estimatedHpLoss = computed(() => {
  if (!targetEntry.value) return 0;
  const hd = theClass.value?.hit_die ?? getHitDie(targetEntry.value.class_name);
  const conMod = Math.floor((props.member.con - 10) / 2);
  return Math.max(1, Math.ceil(hd / 2) + 1 + conMod);
});

// ASI description for display
const asiDescription = computed(() => {
  const asi = lastChoice.value?.asi;
  if (!asi) return '';
  const LABEL: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
  if (asi.mode === 'feat') return 'Feat';
  if (asi.mode === 'plus2' && asi.primary) return `${LABEL[asi.primary] ?? asi.primary} +2`;
  if (asi.mode === 'plus1plus1')
    return [asi.primary, asi.secondary].filter(Boolean).map(k => `${LABEL[k!] ?? k} +1`).join(', ');
  return 'Ability Score Improvement';
});

// Manual review items
const manualReviewItems = computed<string[]>(() => {
  const items: string[] = [];
  if (!lastChoice.value) {
    items.push('No level history — HP estimated using class average');
    items.push('Spells, ASIs, and feats from this level cannot be auto-reversed');
    return items;
  }
  const c = lastChoice.value;
  if (c.asi?.mode === 'feat') items.push('Feat from this level — remove manually');
  if ((c.spells_learned?.length ?? 0) > 0)
    items.push(`${c.spells_learned!.length} spell(s) from this level will be removed`);
  if ((c.cantrips_learned?.length ?? 0) > 0)
    items.push(`${c.cantrips_learned!.length} cantrip(s) from this level will be removed`);
  if (c.step_choices && Object.keys(c.step_choices).length > 0)
    items.push('Class choices (Fighting Style, Invocations, etc.) — review manually');
  return items;
});

function resourceMaxAtLevel(resource: CustomResource, level: number): number {
  if (resource.scaling === 'fixed') return resource.fixed_value ?? 0;
  if (resource.scaling === 'per_level') return level;
  if (resource.scaling === 'table' && resource.table_values)
    return resource.table_values[Math.min(level, 20) - 1] ?? 0;
  return 0;
}

async function confirmDeLevel() {
  const entry = targetEntry.value;
  if (!entry) return;

  isPending.value = true;
  error.value = '';
  try {
    const currentLevel = props.member.level;
    const newTotalLevel = currentLevel - 1;
    const newClassLevel = entry.levels - 1;
    const choice = lastChoice.value;

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

    // ASI reversal (exact, from history)
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

    // Class resources at newClassLevel
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

    await updateMember({ id: props.member.id, update: memberUpdate as PartyMemberUpdate });

    // Remove spells learned at this level (not also learned at an earlier level)
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
          update: { class: remaining[0].class_name, subclass: remaining[0].subclass_name ?? null } as PartyMemberUpdate,
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

    showConfirmation.value = false;
    legacyClassName.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to de-level.';
  } finally {
    isPending.value = false;
  }
}
</script>
