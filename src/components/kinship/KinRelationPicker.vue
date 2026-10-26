<template>
  <div ref="triggerRef" class="inline-flex">
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
  </div>

  <!-- Teleported: a card clips overflow, which would cut the list off. -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      class="z-300 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
      role="menu"
      :aria-label="`${row.person.name} is…`"
      data-testid="kin-picker"
      @keydown="onKeydown"
    >
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
          @click="pickKin(o)"
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
          @click="pickBond(c)"
        />
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The relation word on a Family row, as a picker (#1084: every type word is a
 * picker, nothing is re-added). Kin relations first, with the birth-year check
 * speaking inline on a choice it contradicts; the bonds below a rule, which
 * move the tie to Connections. Arrow keys, Home and End move between the
 * entries, Escape closes and hands focus back to the word.
 */
import { nextTick, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { FamilyRow, KinOption } from "@/components/kinship/familyRows";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import type { TypeChoice } from "@/lib/worldLinks/connections";

const { row, kin, bonds } = defineProps<{
  row: FamilyRow;
  kin: readonly KinOption[];
  bonds: readonly TypeChoice[];
}>();
const emit = defineEmits<{ kin: [option: KinOption]; bond: [choice: TypeChoice] }>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function items(): HTMLButtonElement[] {
  return floatingRef.value ? [...floatingRef.value.querySelectorAll<HTMLButtonElement>("button:not([disabled])")] : [];
}

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  // Wait for the panel to mount, then put focus on the current relation (or the first entry).
  await nextTick();
  const all = items();
  (all.find((b) => b.getAttribute("aria-checked") === "true") ?? all[0])?.focus();
}

function close(refocus: boolean) {
  open.value = false;
  if (refocus) triggerRef.value?.querySelector("button")?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    close(true);
    return;
  }
  const all = items();
  if (all.length === 0) return;
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | null = null;
  if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % all.length;
  else if (e.key === "ArrowUp") next = at <= 0 ? all.length - 1 : at - 1;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = all.length - 1;
  if (next === null) return;
  e.preventDefault();
  all[next]?.focus();
}

function pickKin(o: KinOption) {
  close(true);
  if (!o.current) emit("kin", o);
}

function pickBond(c: TypeChoice) {
  close(true);
  emit("bond", c);
}
</script>
