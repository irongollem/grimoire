<template>
  <!-- Nothing to show if already at level 1 -->
  <template v-if="member.level > 1">
    <!-- No history warning (subtle) -->
    <div v-if="!lastChoice" class="flex items-center gap-2 pt-2">
      <span class="text-eyebrow text-amber-500/70">No level history</span>
      <span class="font-fell text-xs text-muted-foreground">— ask your DM to seed <code class="font-mono">level_choices</code> before de-leveling</span>
    </div>

    <template v-else>
      <!-- Confirmation details (shown above the action row when active) -->
      <div v-if="showConfirmation && targetEntry" class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
        <p class="text-eyebrow text-muted-foreground">Reversing level {{ member.level }} — {{ lastChoice.class_name }}</p>

        <div class="space-y-1">
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
          <p class="font-fell text-xs text-muted-foreground italic">
            Spell slots and class resources recalculated from class table.
          </p>
        </div>

        <div
          v-if="manualReviewItems.length > 0"
          class="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 space-y-1"
        >
          <p class="font-cinzel text-2xs text-amber-400 tracking-wider">REVIEW MANUALLY</p>
          <ul class="space-y-0.5">
            <li v-for="item in manualReviewItems" :key="item" class="font-fell text-xs text-amber-400">• {{ item }}</li>
          </ul>
        </div>

        <p v-if="error" class="font-fell text-xs text-destructive">{{ error }}</p>
      </div>

      <!-- Action row -->
      <div class="flex items-center justify-between gap-4 pt-1">
        <!-- De-level trigger / confirm -->
        <button
          v-if="!showConfirmation"
          type="button"
          class="font-cinzel text-xs tracking-wider text-muted-foreground hover:text-destructive transition-colors"
          @click="showConfirmation = true"
        >
          ← Back to level {{ member.level - 1 }}
        </button>
        <div v-else class="flex items-center gap-3">
          <button
            type="button"
            class="font-cinzel text-xs tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            @click="showConfirmation = false"
          >
            × cancel
          </button>
          <button
            type="button"
            class="rounded-md bg-destructive px-3 py-1.5 font-cinzel text-xs font-semibold text-destructive-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="isPending"
            @click="confirmDeLevel"
          >
            {{ isPending ? 'Applying…' : `Confirm — remove level ${member.level}` }}
          </button>
        </div>
      </div>
    </template>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import { supabase } from '@/lib/supabase';
import { useCustomClassByName, useAllSystemClasses } from '@/composables/useCustomClasses';
import { getMulticlassSpellSlots } from '@/types/spell.types';
import type { PartyMember, LevelChoiceEntry, SpellSlotEntry } from '@/types/party.types';
import type { CharacterClass } from '@/types/multiclass.types';
import type { CustomResource } from '@/levelup/customTypes';
import { useRuleset } from '@/composables/useRuleset';

const props = defineProps<{
  member: PartyMember;
  characterClasses: CharacterClass[];
}>();

const showConfirmation = ref(false);
const isPending = ref(false);
const error = ref('');

const queryClient = useQueryClient();
const { ruleset } = useRuleset();

// The level_choices entry for the current total level (if it exists)
const lastChoice = computed<LevelChoiceEntry | null>(() => {
  const choices = props.member.level_choices ?? {};
  return choices[props.member.level] ?? null;
});

const activeClassName = computed(() => lastChoice.value?.class_name ?? '');

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
  if (!lastChoice.value) return items;
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
  const choice = lastChoice.value;
  if (!entry || !choice) return;

  isPending.value = true;
  error.value = '';
  try {
    const currentLevel = props.member.level;
    const newTotalLevel = currentLevel - 1;
    const newClassLevel = entry.levels - 1;

    const memberUpdate: Record<string, unknown> = {
      level: newTotalLevel,
      proficiency_bonus: 2 + Math.floor((newTotalLevel - 1) / 4),
      hit_dice_remaining: Math.max(0, (props.member.hit_dice_remaining ?? props.member.level) - 1),
    };

    // HP: reverse the base roll (hp_gained) AND, if this level's ASI bumped CON,
    // the retroactive (ΔconMod × level) that buildLevelUpPayload added on top —
    // level_choices only records hp_gained, so subtracting it alone left the retro
    // chunk behind (character stuck permanently over max HP after a CON ASI).
    const conModOf = (score: number) => Math.floor((score - 10) / 2);
    let conReduction = 0;
    if (choice.asi && choice.asi.mode !== 'feat') {
      if (choice.asi.primary === 'con') conReduction += choice.asi.mode === 'plus2' ? 2 : 1;
      if (choice.asi.mode === 'plus1plus1' && choice.asi.secondary === 'con') conReduction += 1;
    }
    const retroHp = conReduction > 0
      ? (conModOf(props.member.con) - conModOf(props.member.con - conReduction)) * props.member.level
      : 0;
    const newMaxHp = Math.max(1, props.member.max_hp - choice.hp_gained - retroHp);
    memberUpdate.max_hp = newMaxHp;
    memberUpdate.current_hp = Math.min(props.member.current_hp, newMaxHp);

    // ASI reversal
    if (choice.asi && choice.asi.mode !== 'feat') {
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
    const subclassToClear = !!choice.subclass;
    if (subclassToClear && entry.is_primary) memberUpdate.subclass = null;

    // Spell slots — recompute over the POST-de-level class list, not just the
    // de-leveled class. A Cleric 5 / Wizard 1 removing the Wizard dip must keep
    // the Cleric's slots (the old single-class path wiped them to []).
    const postClasses = props.characterClasses
      .map(c => ({ class_name: c.class_name, levels: c.id === entry.id ? newClassLevel : c.levels }))
      .filter(c => c.levels > 0);
    let rawSlots: SpellSlotEntry[] = [];
    if (postClasses.length === 1 && postClasses[0].class_name === activeClassName.value && theClass.value?.spell_slots) {
      // The single remaining class is the one just de-leveled — use its own table
      // (handles custom-class casters that getDefaultSpellSlots doesn't cover).
      const row = theClass.value.spell_slots[Math.min(postClasses[0].levels, 20) - 1];
      if (row) rawSlots = (row as number[]).map((max, i) => ({ level: i + 1, max, used: 0 })).filter(s => s.max > 0);
    } else if (postClasses.length > 0) {
      rawSlots = getMulticlassSpellSlots(postClasses, ruleset.value);
    }
    memberUpdate.spell_slots = rawSlots
      .map((s): SpellSlotEntry => ({
        ...s,
        // Clamp carried-over used to the new (lower) max so de-level can't leave used > max.
        used: Math.min(s.max, props.member.spell_slots?.find(e => e.level === s.level)?.used ?? 0),
      }))
      .filter(s => s.max > 0);

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
    const newChoices = { ...props.member.level_choices };
    delete newChoices[currentLevel];
    memberUpdate.level_choices = newChoices;

    // Spells to remove: learned at this level and not also at an earlier level.
    const learnedHere = [...(choice.spells_learned ?? []), ...(choice.cantrips_learned ?? [])];
    const earlierSpells = new Set(
      Object.entries(props.member.level_choices ?? {})
        .filter(([lvl]) => parseInt(lvl) < currentLevel)
        .flatMap(([, e]) => [...(e.spells_learned ?? []), ...(e.cantrips_learned ?? [])]),
    );
    const spellIds = learnedHere.filter(id => !earlierSpells.has(id));

    // character_classes op + member class/subclass changes when a class empties.
    let classOp: Record<string, unknown> | null = null;
    if (newClassLevel === 0) {
      const remaining = props.characterClasses.filter(c => c.id !== entry.id);
      if (remaining.length > 0 && entry.is_primary) {
        classOp = { op: 'delete', id: entry.id, promote_id: remaining[0].id };
        memberUpdate.class = remaining[0].class_name;
        memberUpdate.subclass = remaining[0].subclass_name ?? null;
      } else {
        classOp = { op: 'delete', id: entry.id };
        if (remaining.length === 0) {
          memberUpdate.class = null;
          memberUpdate.subclass = null;
        }
      }
    } else {
      classOp = { op: 'update', id: entry.id, levels: newClassLevel, clear_subclass: subclassToClear };
    }

    // One atomic RPC — all-or-nothing, no half-de-leveled state (mirrors apply_level_up).
    const { error: rpcError } = await supabase.rpc('apply_de_level', {
      p_member_id: props.member.id,
      p_member_update: memberUpdate,
      p_class_op: classOp,
      p_spell_ids: spellIds,
    });
    if (rpcError) throw rpcError;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['party'] }),
      queryClient.invalidateQueries({ queryKey: ['my-characters'] }),
      queryClient.invalidateQueries({ queryKey: ['character_classes', props.member.id] }),
      queryClient.invalidateQueries({ queryKey: ['characterSpells', props.member.id] }),
      queryClient.invalidateQueries({ queryKey: ['characterSpellsDetails', props.member.id] }),
    ]);

    showConfirmation.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to de-level.';
  } finally {
    isPending.value = false;
  }
}
</script>
