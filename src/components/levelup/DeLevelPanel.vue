<template>
  <!-- Nothing to show if already at level 1 -->
  <template v-if="member.level > 1">
    <!-- No history warning (subtle) -->
    <div v-if="!lastChoice" class="flex items-center gap-2 pt-2">
      <span class="text-eyebrow text-ink-caution/70">No level history</span>
      <span class="text-caption text-muted-foreground">This character started at this level, so there is no level to take back.</span>
    </div>

    <template v-else>
      <!-- Confirmation details (shown above the action row when active) -->
      <div v-if="showConfirmation" class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
        <p class="text-eyebrow text-muted-foreground">Reversing level {{ member.level }} · {{ lastChoice.class_name }}</p>

        <div class="space-y-1">
          <p class="text-caption text-foreground">
            HP: <span class="text-destructive">−{{ member.max_hp - newMaxHp }}</span>
            <span class="text-muted-foreground ml-1">({{ member.max_hp }} → {{ newMaxHp }})</span>
          </p>
          <p v-if="profWillDrop" class="text-caption text-foreground">
            Proficiency bonus: +{{ member.proficiency_bonus }} → +{{ newProfBonus }}
          </p>
          <p v-for="line in revertedLines" :key="line" class="text-caption text-foreground">{{ line }}</p>
          <p v-if="lastChoice.subclass" class="text-caption text-foreground">
            Subclass "{{ lastChoice.subclass }}" cleared
          </p>
          <p v-if="lastChoice.is_new_class" class="text-caption text-foreground">
            {{ lastChoice.class_name }} class entry removed
          </p>
          <p class="text-caption text-muted-foreground italic">
            Spell slots and class resources are recalculated for the lower level.
          </p>
        </div>

        <p v-if="notReadyReason" class="text-caption text-muted-foreground">{{ notReadyReason }}…</p>
        <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
      </div>

      <!-- Action row -->
      <div class="flex items-center justify-between gap-4 pt-1">
        <!-- De-level trigger / confirm -->
        <AppButton
          v-if="!showConfirmation"
          variant="ghost"
          tone="danger"
          size="inline"
          @click="showConfirmation = true"
        >← Back to level {{ member.level - 1 }}</AppButton>
        <div v-else class="flex items-center gap-3">
          <AppButton
            variant="ghost"
            size="inline"
            @click="showConfirmation = false"
          >× cancel</AppButton>
          <AppButton
            variant="tinted"
            tone="danger"
            emphasis="solid"
            size="sm"
            :disabled="isPending || !payload"
            :label="isPending ? 'Applying…' : `Confirm: remove level ${member.level}`"
            @click="confirmDeLevel"
          />
        </div>
      </div>
    </template>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, toRef } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/AppButton.vue";
import { supabase } from "@/lib/supabase";
import { SKILLS } from "@/types/party.types";
import type { PartyMember } from "@/types/party.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import { buildDeLevelPayload, proficiencyBonusAt } from "@/levelup/buildDeLevelPayload";
import { useDeLevel } from "@/levelup/useDeLevel";

const props = defineProps<{
  member: PartyMember;
  characterClasses: CharacterClass[];
}>();

const showConfirmation = ref(false);
const isPending = ref(false);
const error = ref("");

provideCharacterRuleset(() => props.member);
const queryClient = useQueryClient();

const { entry: lastChoice, classRow, ruleset, classSlotTable, classResources, isLoading, notReadyReason, featuresById } =
  useDeLevel(() => props.member, toRef(props, "characterClasses"));

// Everything the de-level writes, built the moment it is shown so the preview and the write cannot differ.
const payload = computed(() => {
  if (!lastChoice.value || !classRow.value || isLoading.value) return null;
  return buildDeLevelPayload({
    member: props.member,
    entry: lastChoice.value,
    classRow: classRow.value,
    characterClasses: props.characterClasses,
    ruleset: ruleset.value,
    classSlotTable: classSlotTable.value,
    classResources: classResources.value,
  });
});

const newMaxHp = computed(() => {
  const value = payload.value?.memberUpdate.max_hp;
  return typeof value === "number" ? value : props.member.max_hp;
});
const newProfBonus = computed(() => proficiencyBonusAt(props.member.level - 1));
const profWillDrop = computed(() => newProfBonus.value < props.member.proficiency_bonus);

const ABILITY_NAME: Record<string, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

/** One line per thing the level's picks gave that now goes back. */
const revertedLines = computed<string[]>(() => {
  const e = lastChoice.value;
  if (!e || !e.record) return [];
  const lines: string[] = [];
  for (const [ability, by] of Object.entries(e.record.abilityIncreases)) lines.push(`${ABILITY_NAME[ability]} −${by}`);
  for (const id of e.record.feats) lines.push(`Feat removed: ${featuresById.value.get(id)?.name ?? "a feat"}`);
  for (const [key, delta] of Object.entries(e.record.choices)) {
    const label = key.replaceAll("_", " ");
    if (delta.added.length > 0) lines.push(`${label}: ${delta.added.join(", ")} removed`);
    if (delta.removed.length > 0) lines.push(`${label}: ${delta.removed.join(", ")} restored`);
  }
  for (const [key, change] of Object.entries(e.skills ?? {})) {
    const label = SKILLS.find((s) => s.key === key)?.label ?? key;
    lines.push(`${label}: ${change.to} back to ${change.from ?? "none"}`);
  }
  if (e.masteries && e.masteries.added.length > 0) lines.push(`${e.masteries.added.length} weapon mastery removed`);
  if (e.masteries && e.masteries.removed.length > 0) lines.push(`${e.masteries.removed.length} weapon mastery restored`);
  const swaps = Object.keys(e.record.swaps).length;
  if (swaps > 0) lines.push(`${swaps} optional feature swap undone`);
  if ((e.spells_learned?.length ?? 0) > 0) lines.push(`${e.spells_learned?.length} spell(s) from this level removed`);
  if ((e.cantrips_learned?.length ?? 0) > 0) lines.push(`${e.cantrips_learned?.length} cantrip(s) from this level removed`);
  return lines;
});

async function confirmDeLevel() {
  const built = payload.value;
  if (!built) return;

  isPending.value = true;
  error.value = "";
  try {
    // One atomic RPC — all-or-nothing, no half-de-leveled state (mirrors apply_level_up).
    const { error: rpcError } = await supabase.rpc("apply_de_level", {
      p_member_id: props.member.id,
      p_member_update: built.memberUpdate,
      p_class_op: built.classOp,
      p_spell_ids: built.spellIds,
    });
    if (rpcError) throw rpcError;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["party"] }),
      queryClient.invalidateQueries({ queryKey: ["my-characters"] }),
      queryClient.invalidateQueries({ queryKey: ["character_classes", props.member.id] }),
      queryClient.invalidateQueries({ queryKey: ["characterSpells", props.member.id] }),
      queryClient.invalidateQueries({ queryKey: ["characterSpellsDetails", props.member.id] }),
    ]);

    showConfirmation.value = false;
  } catch (e) {
    // A PostgREST error is a plain object with a message, not an Error.
    if (e instanceof Error) error.value = e.message;
    else if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") error.value = e.message;
    else error.value = "Failed to de-level.";
  } finally {
    isPending.value = false;
  }
}
</script>
