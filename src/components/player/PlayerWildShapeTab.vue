<template>
  <div class="space-y-4">
    <!-- Usage pips -->
    <div class="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-4">
      <div class="flex items-center gap-1.5">
        <span class="text-label text-muted-foreground">Uses</span>
        <span v-if="wildshapeMaxUses === null" class="text-label text-muted-foreground">Unlimited</span>
        <template v-else>
          <div class="flex gap-1">
            <span
              v-for="i in wildshapeMaxUses"
              :key="i"
              class="h-3 w-3 rounded-full border-2 transition-colors"
              :class="i <= wildshapesUsed ? 'border-primary bg-primary/80' : 'border-muted-foreground/30'"
            />
          </div>
          <span class="text-label text-muted-foreground">{{ wildshapesUsed }}/{{ wildshapeMaxUses }}</span>
        </template>
      </div>
      <span class="text-caption-sm text-muted-foreground italic">{{ wildshapeFacts }}</span>
    </div>

    <!-- Active form -->
    <div v-if="activeWildshape" class="rounded-lg border border-primary/40 bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2.5 bg-primary/10 border-b border-border">
        <span class="text-heading-sm font-bold text-primary">🐺 {{ activeWildshape.beast_name }}</span>
        <div class="flex items-center gap-1.5">
          <!-- Taking another form spends a use, the same as the first. -->
          <AppButton
            variant="outline"
            size="xs"
            :label="showWildshapePicker ? 'Cancel' : 'Change'"
            :disabled="!canWildshape && !showWildshapePicker"
            @click="showWildshapePicker = !showWildshapePicker"
          />
          <AppButton
            variant="outline"
            size="xs"
            label="Revert"
            @click="doRevertWildshape(); showWildshapePicker = false"
          />
        </div>
      </div>
      <div class="flex gap-6 px-4 py-2.5">
        <div class="text-center">
          <p class="text-eyebrow text-muted-foreground">HP</p>
          <p class="text-heading-sm font-bold">{{ formHpLabel }}</p>
        </div>
        <div class="text-center">
          <p class="text-label text-muted-foreground">AC</p>
          <p class="text-heading-sm font-bold">{{ activeWildshape.beast_ac }}</p>
        </div>
        <div v-if="beastMonster?.stat_block?.speed" class="text-center">
          <p class="text-label text-muted-foreground">SPEED</p>
          <p class="text-heading-sm font-bold">{{ beastMonster.stat_block.speed }}</p>
        </div>
      </div>
      <!-- 2014 Circle of the Moon, Combat Wild Shape: the beast has its own pool to heal. -->
      <div v-if="canCombatHeal" class="border-t border-border px-4 py-2.5 space-y-1.5">
        <p class="text-label text-muted-foreground">Combat Wild Shape</p>
        <PlayerWildShapeSlotTrade
          v-if="spendableSlots.length"
          :slots="spendableSlots"
          button-label="Heal with a slot"
          :disabled="!canManage"
          :pending="healing"
          @trade="healWithSlot"
        />
        <p v-else class="text-caption text-muted-foreground italic">You have no spell slot to spend.</p>
        <p class="text-caption-sm text-muted-foreground italic">Heals the beast 1d8 per level of the slot.</p>
      </div>
    </div>

    <!-- Picker / Choose Form. The list opens from the button, as it does in
         the encounter runner; "Change" on the active form opens the same one. -->
    <div v-if="!activeWildshape || showWildshapePicker" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-4 py-2.5">
        <div class="min-w-0">
          <p class="text-label-lg font-semibold">Choose Beast Form</p>
          <p v-if="!activeWildshape && !canWildshape" class="text-caption-sm text-muted-foreground italic">
            {{ wildshapeMaxUses !== 0 ? "No uses left. Rest to regain them." : "Wild Shape unlocks at druid level 2." }}
          </p>
        </div>
        <AppButton
          v-if="!activeWildshape"
          variant="outline"
          size="xs"
          class="shrink-0"
          :label="showWildshapePicker ? 'Cancel' : '🐺 Choose Form'"
          :disabled="!canWildshape"
          @click="showWildshapePicker = !showWildshapePicker"
        />
      </div>
      <Transition v-bind="drawerTransition()">
        <div v-show="showWildshapePicker" class="border-t border-border">
          <p v-if="!wildshapeForms.length" class="text-caption text-muted-foreground italic px-4 py-3">
            {{ rules.edition === "2024"
              ? "No forms yet. Learn forms under Known forms below, or ask your DM to pin forms."
              : "No eligible forms yet. Discover beasts in the Bestiary or ask your DM to pin forms." }}
          </p>
          <div v-else class="divide-y divide-border pb-1">
            <!-- A beast the party has met but whose stats the DM has not
                 revealed has no hit points or AC to take on yet. -->
            <AppButton
              v-for="m in wildshapeForms"
              :key="m.id"
              variant="menu"
              size="body"
              block
              :disabled="!m.stat_block"
              @click="previewBeast = m"
            >
              <span class="text-caption font-semibold flex-1 min-w-0 truncate">{{ m.name }}</span>
              <template v-if="m.stat_block">
                <span class="text-caption-sm text-muted-foreground shrink-0">CR {{ m.stat_block.challenge_rating }}</span>
                <span v-if="formCost(m.id) > 1" class="text-caption-sm text-muted-foreground shrink-0">{{ formCost(m.id) }} uses</span>
                <span class="text-caption-sm text-muted-foreground shrink-0">AC {{ m.stat_block.armor_class }}</span>
              </template>
              <span v-else class="text-caption-sm text-muted-foreground italic shrink-0">Stats not revealed</span>
            </AppButton>
          </div>
        </div>
      </Transition>
    </div>

    <PlayerWildShapeKnownForms
      v-if="rules.knownForms !== null && isDruid"
      :member="member"
      :rules="rules"
      :monsters="heldList"
      :can-manage="canManage"
    />

    <PlayerWildShapeResurgence
      v-if="rules.wildResurgence"
      :member="member"
      :rules="rules"
      :slots="effectiveSlots"
      :can-manage="canManage"
    />
  </div>

  <!-- Beast preview lightbox -->
  <WildshapePreviewLightbox
    :beast="previewBeast"
    :can-wildshape="canTakePreview"
    @close="previewBeast = null"
    @confirm="confirmWildshape"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import PlayerWildShapeKnownForms from "@/components/player/PlayerWildShapeKnownForms.vue";
import PlayerWildShapeResurgence from "@/components/player/PlayerWildShapeResurgence.vue";
import PlayerWildShapeSlotTrade from "@/components/player/PlayerWildShapeSlotTrade.vue";
import WildshapePreviewLightbox from "@/components/play/WildshapePreviewLightbox.vue";
import { usePromptedRoll } from "@/composables/dice/usePromptedRoll";
import { usePlayerDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import { fetchLibraryMonsterArtEntry, withLibraryArt } from "@/composables/library/useLibraryMonsterArt";
import { usePlayerMonstersByIds } from "@/composables/monsters/usePlayerMonstersByIds";
import { useClassFeatureGroups } from "@/composables/party/useClassFeatureGroups";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { usePinnedForms } from "@/composables/play/usePinnedForms";
import { useWildShapeExchange } from "@/composables/play/useWildShapeExchange";
import { useWildshapeDruid } from "@/composables/play/useWildshapeDruid";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useToast } from "@/composables/useToast";
import { drawerTransition } from "@/lib/motion";
import { betterTempHp } from "@/rules/hitPoints";
import { deriveEffectiveSpellSlots, slotPool } from "@/rules/spellSlots";
import { availableWildShapeForms, knownFormIds, wildshapeCrDisplay, wildshapeStateFor } from "@/rules/wildshape";
import type { WildshapeState } from "@/types/encounter.types";
import type { PlayerVisibleMonster } from "@/types/monster.types";
import type { PartyMember, PartyMemberUpdate, SpellSlotEntry } from "@/types/party.types";

// The Wild Shape tab of the player's sheet: uses, the active form, the form
// picker, and the per-edition extras (2024 Known Forms and Wild Resurgence,
// 2014 Moon Combat Wild Shape).
const { member, canManage } = defineProps<{
  member: PartyMember;
  /** The character's owner or the DM; everyone else reads. */
  canManage: boolean;
}>();

const toast = useToast();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { promptRoll } = usePromptedRoll();
const { ruleset } = useRuleset();
// Wildshape resolves stored discovery/pinned-form/wildshape_state monster ids,
// and asks for those ids only (`usePlayerMonstersByIds`, #972), not the library.
// A player cannot read the `monsters` table at all, so a beast the DM made (and
// pinned or revealed for this druid) comes through the projection; a DM gets
// their own rows. Neither branch filters by campaign scope.
const { data: discoveries } = usePlayerDiscoveries();
const { data: pinnedForms } = usePinnedForms();

const memberId = computed(() => member.id);
const { isDruid, isCircleOfMoon, rules } = useWildshapeDruid(memberId, () => member);

const activeWildshape = computed<WildshapeState | null>(() => (member.wildshape_state as WildshapeState | null) ?? null);

// Both lists are narrowed to THIS character. A player's own reads already
// are, by RLS; a DM looking at one sheet reads every member's pins and every
// discovery, and would otherwise offer this druid another character's forms.
const discoveredKeys = computed(() => new Set<string>(
  (discoveries.value ?? [])
    .filter((d) => d.visible_to === null || d.visible_to.includes(member.id))
    .flatMap((d) => [d.monster_id, d.library_monster_id].filter(Boolean) as string[]),
));
const pinnedKeys = computed(() => new Set<string>(
  (pinnedForms.value ?? [])
    .filter((p) => p.party_member_id === member.id)
    .flatMap((p) => p.monster_id ?? p.library_monster_id ?? []),
));
const knownKeys = computed(() => new Set(knownFormIds(member.class_choices)));
const heldIds = computed<string[]>(() => [
  activeWildshape.value?.monster_id,
  ...discoveredKeys.value,
  ...pinnedKeys.value,
  ...knownKeys.value,
].filter((id): id is string => !!id));
const { data: heldMonsters } = usePlayerMonstersByIds(heldIds);
const heldList = computed(() => [...heldMonsters.value.values()]);

const beastMonster = computed(() =>
  activeWildshape.value ? (heldMonsters.value.get(activeWildshape.value.monster_id) ?? null) : null,
);

// Uses by the edition's table: 0 below druid level 2, null = unlimited (2014 Archdruid).
const wildshapeMaxUses = computed(() => rules.value.maxUses);
const wildshapesUsed = computed(() => member.wildshapes_used ?? 0);
/** Whether `cost` more uses fit (an elemental form costs two). */
function canSpend(cost: number): boolean {
  const max = wildshapeMaxUses.value;
  return isDruid.value && max !== 0 && (max === null || wildshapesUsed.value + cost <= max);
}
const canWildshape = computed(() => canSpend(1));

/** The edition facts a player reads at a glance: cap, movement, action type, duration. */
const wildshapeFacts = computed(() => {
  const r = rules.value;
  const parts = [`Max CR ${wildshapeCrDisplay(r.maxCr)}${isCircleOfMoon.value ? " (Moon)" : ""}`];
  if (!r.flyAllowed && !r.swimAllowed) parts.push("No flying or swimming");
  else if (!r.flyAllowed) parts.push("No flying");
  else if (!r.swimAllowed) parts.push("No swimming");
  parts.push(r.bonusAction ? "Bonus action" : "Action");
  parts.push(`Lasts ${r.durationHours} ${r.durationHours === 1 ? "hour" : "hours"}`);
  if (r.shortRestRegain === 1) parts.push("Short rest restores one use");
  return parts.join(" · ");
});

/** A 2014 form has its own HP pool; a 2024 form is the character's own HP plus temp HP. */
const formHpLabel = computed(() => {
  const ws = activeWildshape.value;
  if (!ws) return "";
  if (ws.beast_hp !== null && ws.beast_max_hp !== null) return `${ws.beast_hp}/${ws.beast_max_hp}`;
  const temp = member.temp_hp ?? 0;
  return `${member.current_hp}/${member.max_hp}${temp > 0 ? ` +${temp} temp` : ""}`;
});

const showWildshapePicker = ref(false);
const previewBeast = ref<PlayerVisibleMonster | null>(null);
const availableForms = computed(() => {
  if (!isDruid.value) return [];
  return availableWildShapeForms({
    monsters: heldList.value,
    rules: rules.value,
    discoveredIds: discoveredKeys.value,
    pinnedIds: pinnedKeys.value,
    knownIds: knownKeys.value,
  });
});
const wildshapeForms = computed<PlayerVisibleMonster[]>(() => availableForms.value.map((f) => f.monster));
const formCost = (id: string) => availableForms.value.find((f) => f.monster.id === id)?.usesCost ?? 1;
const canTakePreview = computed(() => (previewBeast.value ? canSpend(formCost(previewBeast.value.id)) : false));

async function handleWildshape(monster: PlayerVisibleMonster) {
  // A library beast's picture usually lives in the art tables, not on its row,
  // so merge it before the form copies it — the runner already did, and a form
  // taken here without it showed every viewer the placeholder (5 Oct 2026).
  let beast = monster;
  if (monster.is_shared) {
    try {
      beast = withLibraryArt(monster, (await fetchLibraryMonsterArtEntry(monster.id)) ?? undefined);
    } catch (error) {
      toast.error(toast.fromError(error));
      return;
    }
  }
  // Null when the DM has not revealed this beast's stats (no hit point pool or
  // AC to assume; the picker disables such a row) or it is not a legal form.
  const entry = wildshapeStateFor(beast, rules.value);
  if (!entry || !canSpend(entry.usesCost)) return;
  const update: PartyMemberUpdate = {
    wildshape_state: entry.form,
    wildshapes_used: wildshapesUsed.value + entry.usesCost,
  };
  // 2024: the form grants temp HP (it does not stack, so the better value wins).
  if (entry.tempHp > 0) update.temp_hp = betterTempHp(member.temp_hp ?? 0, entry.tempHp);
  await updateMember({ id: member.id, update });
  showWildshapePicker.value = false;
}

async function confirmWildshape() {
  if (!previewBeast.value) return;
  await handleWildshape(previewBeast.value);
  previewBeast.value = null;
}

async function doRevertWildshape() {
  await updateMember({ id: member.id, update: { wildshape_state: null } });
}

// ── Spell slots (Combat Wild Shape, Wild Resurgence) ──────────────────────────
// Same derivation as the Features tab, so the slots offered here are the ones
// the character sees there; the server spends from them when none are stored.
const { characterClasses, classDefinitionFor } = useClassFeatureGroups(computed(() => member));
const effectiveSlots = computed<SpellSlotEntry[]>(() =>
  deriveEffectiveSpellSlots(member, characterClasses.value ?? [], ruleset.value, classDefinitionFor),
);
const spendableSlots = computed(() => effectiveSlots.value.filter((slot) => slot.used < slot.max));

// Combat Wild Shape needs a beast pool to heal; a 2024 form has none.
const canCombatHeal = computed(() => rules.value.slotHealing && activeWildshape.value?.beast_hp !== null);
const { mutateAsync: exchange, isPending: healing } = useWildShapeExchange();

async function healWithSlot(slot: SpellSlotEntry) {
  const result = await promptRoll({
    counts: { 8: slot.level },
    modifier: 0,
    label: `Combat Wild Shape (${slot.level}d8)`,
    isDamage: true,
  });
  if (!result) return;
  try {
    await exchange({
      partyMemberId: member.id,
      action: "slot_for_healing",
      slotLevel: slot.level,
      slotPool: slotPool(slot),
      slotTemplate: effectiveSlots.value,
      healing: result.total,
    });
    toast.success(`${activeWildshape.value?.beast_name ?? "Your form"} heals up to ${result.total} hit points.`);
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}
</script>
