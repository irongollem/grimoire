<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MechField label="Shown on the damage roll as">
        <AppInput :model-value="rider.label" tone="card" size="body" placeholder="Sneak Attack, Rage…" @update:model-value="emit('update:rider', { ...rider, label: String($event) })" />
      </MechField>
      <MechField label="Added to">
        <AppSelect :model-value="rider.applies_to" tone="card" size="body" weight="normal" block @update:model-value="emit('update:rider', { ...rider, applies_to: $event })">
          <option v-for="t in RIDER_TARGETS" :key="t" :value="t">{{ TARGET_LABELS[t] }}</option>
        </AppSelect>
      </MechField>
    </div>

    <MechField label="Extra damage">
      <AppSelect :model-value="rider.dice.kind" tone="card" size="body" weight="normal" block @update:model-value="setDiceKind($event)">
        <option v-for="k in RIDER_DICE_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
    </MechField>
    <MechField v-if="rider.dice.kind === 'fixed'" label="Roll or number" hint="Like 1d6, 2d8 or +2.">
      <AppInput :model-value="rider.dice.expression" tone="card" size="body" placeholder="1d6" @update:model-value="emit('update:rider', { ...rider, dice: { kind: 'fixed', expression: String($event) } })" />
    </MechField>
    <div v-else-if="rider.dice.kind === 'slot'" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <MechField label="At base level">
        <AppInput :model-value="rider.dice.base" tone="card" size="body" @update:model-value="setSlot({ base: String($event) })" />
      </MechField>
      <MechField label="Base slot level">
        <AppInput :model-value="rider.dice.base_level" type="number" tone="card" size="body" min="1" max="9" @update:model-value="setSlot({ base_level: Number($event) })" />
      </MechField>
      <MechField label="Per level above">
        <AppInput :model-value="rider.dice.per_level" tone="card" size="body" @update:model-value="setSlot({ per_level: String($event) })" />
      </MechField>
      <MechField label="Most dice">
        <AppInput :model-value="rider.dice.max_dice" type="number" tone="card" size="body" min="1" @update:model-value="setSlot({ max_dice: Number($event) })" />
      </MechField>
    </div>
    <p v-else class="text-caption text-muted-foreground">Uses the value from this feature's level table.</p>

    <MechField label="Damage type" hint="Leave empty for the weapon's own type.">
      <AppInput :model-value="rider.damage_type ?? ''" tone="card" size="body" placeholder="radiant" @update:model-value="setDamageType(String($event))" />
    </MechField>

    <div class="flex flex-col gap-2">
      <AppCheckbox :model-value="rider.once_per_turn" label="Once per turn" label-role="caption" @update:model-value="emit('update:rider', { ...rider, once_per_turn: $event })" />
      <AppCheckbox
        v-if="toggleKey"
        :model-value="rider.requires_toggle === toggleKey"
        :label="`Only while ${toggleLabel || 'the toggle'} is on`"
        label-role="caption"
        @update:model-value="setRequiresToggle($event)"
      />
    </div>

    <MechField label="What adding it spends">
      <AppSelect :model-value="costKind" tone="card" size="body" weight="normal" block @update:model-value="setCostKind($event)">
        <option value="free">Nothing</option>
        <option value="uses">Uses from a pool</option>
        <option value="spell_slot">A spell slot</option>
      </AppSelect>
    </MechField>
    <UsesCostFields
      v-if="rider.cost?.kind === 'uses'"
      :cost="{ key: rider.cost.key, amount: rider.cost.amount }"
      @update:cost="setUsesCost($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { RIDER_TARGETS, type DamageRider, type RiderDice, type RiderTarget, type UsesCost } from "@/rules/features/mechanics.types";
import { RIDER_DICE_KINDS, riderDiceOfKind } from "./mechanicsDraft";
import MechField from "./MechField.vue";
import UsesCostFields from "./UsesCostFields.vue";

const { rider, toggleKey = null, toggleLabel = "" } = defineProps<{
  rider: DamageRider;
  /** The key of this feature's toggle, when it has one: a rider can wait on it. */
  toggleKey?: string | null;
  toggleLabel?: string;
}>();
const emit = defineEmits<{ "update:rider": [value: DamageRider] }>();

const TARGET_LABELS: Record<RiderTarget, string> = {
  weapon: "Any weapon attack",
  melee_weapon: "A melee weapon attack",
  melee_strength: "A melee attack using Strength",
  finesse_or_ranged: "A finesse or ranged weapon attack",
  unarmed: "An unarmed strike",
  spell: "A spell",
};

type CostKind = "free" | "uses" | "spell_slot";
const costKind = computed<CostKind>(() => rider.cost?.kind ?? "free");

function setDiceKind(kind: RiderDice["kind"]) {
  if (kind !== rider.dice.kind) emit("update:rider", { ...rider, dice: riderDiceOfKind(kind) });
}

function setSlot(patch: Partial<Extract<RiderDice, { kind: "slot" }>>) {
  if (rider.dice.kind !== "slot") return;
  emit("update:rider", { ...rider, dice: { ...rider.dice, ...patch } });
}

function setDamageType(value: string) {
  const { damage_type: _type, ...rest } = rider;
  emit("update:rider", value.trim() === "" ? rest : { ...rest, damage_type: value });
}

function setRequiresToggle(on: boolean) {
  const { requires_toggle: _toggle, ...rest } = rider;
  emit("update:rider", on && toggleKey ? { ...rest, requires_toggle: toggleKey } : rest);
}

function setCostKind(kind: CostKind) {
  const { cost: _cost, ...rest } = rider;
  if (kind === "free") emit("update:rider", rest);
  else if (kind === "spell_slot") emit("update:rider", { ...rest, cost: { kind: "spell_slot" } });
  else emit("update:rider", { ...rest, cost: { kind: "uses", key: "", amount: 1 } });
}

function setUsesCost(cost: UsesCost | undefined) {
  const { cost: _cost, ...rest } = rider;
  emit("update:rider", cost ? { ...rest, cost: { kind: "uses", ...cost } } : rest);
}
</script>
