<template>
  <div class="space-y-3">

    <!-- Custom attack list — only rendered when non-empty (compact empty state below) -->
    <div v-if="localAttacks.length" class="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
      <div v-for="attack in localAttacks" :key="attack.id" class="px-4 py-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-body text-foreground font-semibold">{{ attack.name }}</span>
          <div class="flex items-center gap-1 shrink-0">
            <AppButton
              variant="ghost"
              tone="primary"
              fill="tone"
              size="icon-xs"
              class="text-muted-foreground/40"
              tooltip="Edit attack"
              :icon="IconEdit"
              icon-size="xs"
              @click="startEdit(attack)"
            />
            <AppButton
              variant="ghost"
              tone="danger"
              fill="tone"
              size="icon-xs"
              class="text-muted-foreground/40"
              tooltip="Delete attack"
              :icon="IconDelete"
              icon-size="xs"
              @click="removeAttack(attack.id)"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <AppButton
            v-if="attack.attack_bonus !== null"
            v-roll-mode="(mode: RollMode | null) => rollAttack(attack, mode)"
            variant="subtle"
            fill="muted"
            size="sm"
            class="group"
          >
            <IconSword class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span class="font-cinzel text-xs text-foreground">Attack</span>
            <span class="font-cinzel text-xs" :class="attack.attack_bonus >= 0 ? 'text-elven-green' : 'text-destructive'">
              {{ signedNum(attack.attack_bonus) }}
            </span>
            <span v-if="attackBadgeLabel" class="text-label text-amber-500">{{ attackBadgeLabel }}</span>
          </AppButton>
          <AppButton
            variant="subtle"
            fill="muted"
            tone="caution"
            size="sm"
            class="group"
            @click="rollDamage(attack)"
          >
            <IconLightning class="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-400 transition-colors" />
            <span class="font-cinzel text-xs text-foreground">{{ attack.damage }}</span>
            <span v-if="attack.damage_type" class="font-cinzel text-xs text-muted-foreground">{{ attack.damage_type }}</span>
          </AppButton>
        </div>
      </div>
    </div>

    <!-- Add / edit form -->
    <AppButton
      v-if="!showForm"
      variant="ghost"
      size="inline-xs"
      :icon="IconAdd"
      label="Add attack"
      @click="startAdd"
    />
    <div v-else class="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
      <AppInput
        v-model="formName"
        type="text"
        tone="muted"
        size="body"
        placeholder="Name (e.g. Companion Bite)"
      />
      <AppCheckbox v-model="formAutoHit" label-role="caption" label="Auto-hit / no attack roll" />
      <AppInput
        v-if="!formAutoHit"
        v-model="formAttackBonus"
        type="number"
        tone="muted"
        size="body"
        placeholder="Attack bonus (e.g. 5)"
      />
      <AppInput
        v-model="formDamage"
        type="text"
        tone="muted"
        size="body"
        placeholder="Damage (e.g. 2d4+2)"
      />
      <AppInput
        v-model="formDamageType"
        type="text"
        tone="muted"
        size="body"
        placeholder="Damage type (optional, e.g. piercing)"
      />
      <p v-if="formError" class="text-caption text-destructive">{{ formError }}</p>
      <div class="flex gap-2">
        <AppButton
          variant="primary"
          size="xs"
          :disabled="saving"
          :label="editingId ? 'Save' : 'Add'"
          @click="confirmForm"
        />
        <AppButton
          variant="subtle"
          size="xs"
          label="Cancel"
          @click="cancelForm"
        />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconAdd, IconDelete, IconEdit, IconLightning, IconSword } from "@/lib/icons";
import { rollParsed, combineModes } from "@/lib/dice/roller";
import type { RollMode } from "@/lib/dice/roller";
import { parsedToCounts } from "@/lib/dice/dice";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useUpdatePartyMember } from "@/composables/useParty";
import { validateCustomAttack, customAttackDamageExpression } from "@/rules/customAttack";
import { signedNum } from "@/rules/weaponAttack";
import type { PartyMember, CustomAttack } from "@/types/party.types";

const { member, attackDisadvantage, attackPenalty } = defineProps<{
  member: PartyMember;
  attackDisadvantage: boolean;
  /** 2024-only flat Exhaustion penalty to every attack roll (0 under 2014). */
  attackPenalty: number;
}>();
const emit = defineEmits<{
  roll: [result: { label: string; dice: number; modifier: number; total: number }];
  /** Fired after a completed to-hit roll so the parent can clear the Hidden condition. */
  attacked: [];
}>();

const { promptRoll } = usePromptedRoll();
const { sendRoll } = useCampaignMessages();
const { mutateAsync: updateMember } = useUpdatePartyMember();

// Local optimistic array — mirrors the weapon_masteries pattern in PlayerCombatTab,
// avoiding a flash back to the stale value before refetch.
const localAttacks = ref<CustomAttack[]>([...member.custom_attacks]);
watch(() => [member.id, member.custom_attacks] as const, () => {
  localAttacks.value = [...member.custom_attacks];
}, { immediate: true });

// Same "Dis" / numeric-penalty badge as the equipped-weapons card.
const attackBadgeLabel = computed(() => {
  if (attackDisadvantage) return "Dis";
  if (attackPenalty !== 0) return String(attackPenalty);
  return null;
});

function modeTag(mode: RollMode) {
  return mode === "advantage" ? " (Adv)" : mode === "disadvantage" ? " (Dis)" : "";
}

async function rollAttack(attack: CustomAttack, override: RollMode | null = null) {
  if (attack.attack_bonus === null) return;
  // Player-picked mode merged with condition-imposed disadvantage — opposing
  // sources cancel to normal (5e RAW), same as PlayerCombatTab's rollAttackWith.
  const mode: RollMode = combineModes(override ?? "normal", attackDisadvantage ? "disadvantage" : "normal");
  const totalMod = attack.attack_bonus + attackPenalty;
  const label = `${attack.name} — Attack` + modeTag(mode);
  const result = await promptRoll({ counts: { 20: 1 }, modifier: totalMod, label, mode });
  if (!result) return;
  const kept = result.breakdown.find((d) => !d.dropped)!;
  emit("roll", { label, dice: kept.val, modifier: totalMod, total: result.total });
  emit("attacked");
}

async function rollDamage(attack: CustomAttack) {
  const parsed = customAttackDamageExpression(attack);
  if (!parsed) return;
  const label = attack.damage_type ? `${attack.name} — Damage (${attack.damage_type})` : `${attack.name} — Damage`;
  const counts = parsedToCounts(parsed.terms);
  if (Object.keys(counts).length === 0) {
    // Flat expression (e.g. "4") — no physical-dice prompt needed.
    const { total, breakdown } = rollParsed(parsed);
    emit("roll", { label, dice: total - parsed.modifier, modifier: parsed.modifier, total });
    void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true });
    return;
  }
  const result = await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
  if (!result) return;
  const diceTotal = result.total - result.modifier;
  emit("roll", { label, dice: diceTotal, modifier: result.modifier, total: result.total });
}

// ── Manage (add / edit / delete) ────────────────────────────────────────────

const showForm = ref(false);
const editingId = ref<string | null>(null);
const formName = ref("");
const formAutoHit = ref(false);
const formAttackBonus = ref("");
const formDamage = ref("");
const formDamageType = ref("");
const formError = ref<string | null>(null);
const saving = ref(false);

function resetForm() {
  formName.value = "";
  formAutoHit.value = false;
  formAttackBonus.value = "";
  formDamage.value = "";
  formDamageType.value = "";
  formError.value = null;
}

function startAdd() {
  editingId.value = null;
  resetForm();
  showForm.value = true;
}

function startEdit(attack: CustomAttack) {
  editingId.value = attack.id;
  formName.value = attack.name;
  formAutoHit.value = attack.attack_bonus === null;
  formAttackBonus.value = attack.attack_bonus === null ? "" : String(attack.attack_bonus);
  formDamage.value = attack.damage;
  formDamageType.value = attack.damage_type ?? "";
  formError.value = null;
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  formError.value = null;
}

async function persist(next: CustomAttack[]) {
  localAttacks.value = next; // optimistic
  await updateMember({ id: member.id, update: { custom_attacks: next } });
}

function parsedFormAttackBonus(): number | null {
  if (formAutoHit.value) return null;
  const n = Number(formAttackBonus.value);
  return Number.isFinite(n) ? n : 0;
}

async function confirmForm() {
  if (saving.value) return;
  const draft = {
    name: formName.value,
    attack_bonus: parsedFormAttackBonus(),
    damage: formDamage.value,
    damage_type: formDamageType.value.trim() ? formDamageType.value.trim() : null,
  };
  const error = validateCustomAttack(draft);
  if (error) {
    formError.value = error;
    return;
  }
  saving.value = true;
  try {
    const next = editingId.value
      ? localAttacks.value.map((a) => (a.id === editingId.value ? { ...draft, id: a.id } : a))
      : [...localAttacks.value, { ...draft, id: crypto.randomUUID() }];
    await persist(next);
    showForm.value = false;
    editingId.value = null;
  } finally {
    saving.value = false;
  }
}

async function removeAttack(id: string) {
  const next = localAttacks.value.filter((a) => a.id !== id);
  await persist(next);
}
</script>
