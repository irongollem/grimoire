<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label class="block">
        <span class="field-label">Delivery</span>
        <AppSelect v-model="attack.delivery" tone="filled" size="body">
          <option value="melee">Melee</option>
          <option value="ranged">Ranged</option>
          <option value="melee_or_ranged">Melee or ranged</option>
        </AppSelect>
      </label>
      <label class="block">
        <span class="field-label">To hit</span>
        <AppInput
          :model-value="attack.bonus"
          type="number"
          tone="filled"
          size="body"
          @update:model-value="(v) => (attack.bonus = toInt(v, 0))"
        />
      </label>
      <label class="block">
        <span class="field-label">Reach (ft)</span>
        <AppInput
          :model-value="attack.reach ?? ''"
          type="number"
          min="0"
          tone="filled"
          size="body"
          @update:model-value="(v) => (attack.reach = toOptional(v))"
        />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="field-label">Range</span>
          <AppInput
            :model-value="attack.range?.normal ?? ''"
            type="number"
            min="0"
            tone="filled"
            size="body"
            @update:model-value="(v) => setRange('normal', v)"
          />
        </label>
        <label class="block">
          <span class="field-label">Long</span>
          <AppInput
            :model-value="attack.range?.long ?? ''"
            type="number"
            min="0"
            tone="filled"
            size="body"
            @update:model-value="(v) => setRange('long', v)"
          />
        </label>
      </div>
    </div>
    <div>
      <span class="field-label">Damage on a hit</span>
      <StatBlockDamagePartsEditor v-model="attack.hit" label="Hit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import StatBlockDamagePartsEditor from "@/components/common/StatBlockDamagePartsEditor.vue";
import { toInt, toOptional } from "@/lib/statBlock/inputNumbers";
import type { AttackStructure } from "@/types/statBlock.types";

/**
 * The fields of one attack (#1017). Edits the object it is given in place: it is
 * always a draft owned by the roll editor, never the stat block itself.
 */
const { attack } = defineProps<{ attack: AttackStructure }>();

function setRange(which: "normal" | "long", v: string | number | null | undefined) {
  const n = toOptional(v);
  if (which === "normal") {
    attack.range = n === undefined ? undefined : { normal: n, long: attack.range?.long };
  } else if (attack.range) {
    attack.range = { normal: attack.range.normal, long: n };
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
