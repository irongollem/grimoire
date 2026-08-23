<template>
  <AppModal :open="open" size="sm" @close="emit('update:open', false)">
    <ModalHeader
      title="Start the session"
      subtitle="Four things change while it runs."
      :icon="IconEncounter"
      tone="primary"
    />

    <!--
      The entire teaching budget for the session, spent here.

      Nowhere else in the interface lists what the session changes, and that is
      deliberate: this is the one moment a DM will read four lines, because it
      is the moment they become true. The control this replaces explained
      itself in a tooltip that named one consequence out of five, and by then
      broadcasting was the minority behaviour.
    -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <ul class="space-y-3">
        <li v-for="change in CHANGES" :key="change.title" class="flex gap-3">
          <component :is="change.icon" class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-label-lg font-semibold text-foreground">{{ change.title }}</p>
            <p class="text-caption text-muted-foreground">{{ change.detail }}</p>
          </div>
        </li>
      </ul>

      <AppCheckbox
        v-model="dontShowAgain"
        size="sm"
        label-role="caption"
        label="Don't show this again"
        class="mt-5"
        label-class="text-muted-foreground"
      />
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('update:open', false)" />
      <AppButton
        variant="primary"
        size="sm"
        :disabled="pending"
        label="Start session"
        @click="onConfirm"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  IconMessage,
  IconNavSoundboard,
  IconNavQuests,
  IconNavDashboard,
  IconEncounter,
} from "@/lib/icons";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";

const { open, pending = false } = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

/** Written from the DM's side of the screen: what they will notice, not which
 *  store changed. Ordered by how far the consequence reaches — chat leaves the
 *  building, the rest stay on the DM's own screen. */
const CHANGES = [
  {
    icon: IconMessage,
    title: "Reveals announce themselves",
    detail: "Showing an NPC to the party posts it to your players' chat.",
  },
  {
    icon: IconNavSoundboard,
    title: "The soundboard switches to Perform",
    detail: "Pads and artwork instead of edit controls and drag handles.",
  },
  {
    icon: IconNavQuests,
    title: "Quests open on the run cockpit",
    detail: "Where the party is standing, rather than the quest's premise.",
  },
  {
    icon: IconNavDashboard,
    title: "The bottom bar reshuffles",
    detail: "Table-side sections first, and the dice roller takes the centre button.",
  },
] as const;

const dontShowAgain = ref(false);

function onConfirm() {
  if (dontShowAgain.value) localStorage.setItem("grimoire:session-start-explained", "true");
  emit("confirm");
}
</script>
