<template>
  <MenuPopover :label="`${row.person.name} is…`" data-testid="kin-picker">
    <template #trigger="{ toggle, open }">
      <AppButton
        variant="link"
        size="inline-caption"
        class="max-md:min-h-11"
        :label="row.word"
        :tooltip="`Change how ${row.person.name} is related`"
        aria-haspopup="menu"
        :aria-expanded="open"
        data-testid="kin-word"
        @click="toggle"
      />
    </template>

    <template #default="{ close }">
      <div v-for="o in kin" :key="o.id">
        <AppButton
          variant="menu"
          size="md"
          block
          class="rounded-none max-md:min-h-11"
          role="menuitemradio"
          :aria-checked="o.current"
          :active="o.current"
          :disabled="o.blocked"
          :label="o.label"
          :data-kin-option="o.id"
          @click="pickKin(o, close)"
        />
        <p v-if="o.problem" class="px-3 pb-1.5 text-caption italic text-muted-foreground" data-testid="kin-problem">{{ o.problem }}</p>
      </div>

      <template v-if="bonds.length > 0">
        <div class="mx-3 my-1 border-t border-border" role="separator" />
        <p class="px-3 pb-1 text-eyebrow text-muted-foreground">Or make it a bond (moves to Connections)</p>
        <AppButton
          v-for="c in bonds"
          :key="`${c.key}:${c.subjectIsFrom}`"
          variant="menu"
          size="md"
          block
          class="rounded-none max-md:min-h-11"
          role="menuitem"
          :label="c.word"
          :data-bond-option="`${c.key}:${c.subjectIsFrom}`"
          @click="pickBond(c, close)"
        />
      </template>
    </template>
  </MenuPopover>
</template>

<script setup lang="ts">
/**
 * The relation word on a Family row, as a picker (#1084: every type word is a
 * picker, nothing is re-added). Kin relations first, with the birth-year check
 * speaking inline on a choice it contradicts; the bonds below a rule, which
 * move the tie to Connections. The popover shell and its keys are `MenuPopover`.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import type { FamilyRow, KinOption } from "@/components/kinship/familyRows";
import type { TypeChoice } from "@/lib/worldLinks/connections";

const { row, kin, bonds } = defineProps<{
  row: FamilyRow;
  kin: readonly KinOption[];
  bonds: readonly TypeChoice[];
}>();
const emit = defineEmits<{ kin: [option: KinOption]; bond: [choice: TypeChoice] }>();

function pickKin(o: KinOption, close: (refocus: boolean) => void) {
  close(true);
  if (!o.current) emit("kin", o);
}

function pickBond(c: TypeChoice, close: (refocus: boolean) => void) {
  close(true);
  emit("bond", c);
}
</script>
