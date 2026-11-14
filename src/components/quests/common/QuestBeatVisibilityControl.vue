<template>
  <span class="inline-flex flex-col items-center gap-0.5">
    <QuestVisibilityTrack :size="size" :floor="floor" :model-value="beat.visibility" @update:model-value="pick" />
    <AppButton
      ref="whoButton"
      variant="link"
      size="inline-caption"
      :label="who"
      :aria-label="`Shown to: ${who}`"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    />
    <Teleport to="body">
      <div
        v-if="open"
        :ref="(el) => (floatingRef = el as HTMLElement | null)"
        data-slip
        role="dialog"
        aria-label="Who sees this beat"
        class="z-300 flex w-60 flex-col gap-2 rounded-md border border-border bg-popover p-3 text-foreground shadow-lg"
        :style="floatingStyle"
      >
        <AppCheckbox
          :model-value="beat.visible_to === null"
          :disabled="beat.visible_to === null"
          label="Whole party"
          @update:model-value="setAudience(null)"
        />
        <div class="flex flex-col gap-1.5 border-t border-border pt-2">
          <AppCheckbox
            v-for="member in members"
            :key="member.id"
            :model-value="beat.visible_to === null || beat.visible_to.includes(member.id)"
            :disabled="beat.visible_to !== null && beat.visible_to.length === 1 && beat.visible_to[0] === member.id"
            :label="member.name"
            @update:model-value="setAudience(toggleAudienceMember(beat.visible_to, member.id, members))"
          />
        </div>
        <p class="text-caption text-muted-foreground">Hidden beats keep this and use it once shown.</p>
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useParty } from "@/composables/party/useParty";
import { useSetBeatAudience } from "@/composables/quests/useSetBeatAudience";
import { useSetBeatVisibility } from "@/composables/quests/useSetBeatVisibility";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useToast } from "@/composables/useToast";
import { audienceLabel, toggleAudienceMember } from "@/lib/quests/visibility";
import type { QuestBeat, QuestBeatVisibility } from "@/types/quest.types";
import QuestVisibilityTrack from "./QuestVisibilityTrack.vue";

/**
 * What players know of one beat, set by hand (#1194): the three circles, wired
 * to the one visibility write, and beneath them who it is shown to (the whole
 * party, or only some members). A move sets visibility on the server; only a
 * step the DM picks comes through here, and never below `floor`.
 */
const { beat, floor = "hidden", size = "sm" } = defineProps<{
  beat: QuestBeat;
  /** The lowest the DM may set it (`visibilityFloor()`). */
  floor?: QuestBeatVisibility;
  size?: "sm" | "lg";
}>();

const toast = useToast();
const setBeatVisibility = useSetBeatVisibility();
const setBeatAudience = useSetBeatAudience();
const { data: party } = useParty();
const members = computed(() => (party.value ?? []).map((member) => ({ id: member.id, name: member.name })));
const who = computed(() => audienceLabel(beat.visible_to, members.value));

const open = ref(false);
const whoButton = ref<InstanceType<typeof AppButton> | null>(null);
const trigger = ref<Element | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(trigger, open, () => (open.value = false));
// AppButton is a component, so its root element is what the popover anchors to.
watchEffect(() => {
  const root: unknown = whoButton.value?.$el;
  trigger.value = root instanceof Element ? root : null;
});

async function pick(visibility: QuestBeatVisibility) {
  if (visibility === beat.visibility) return;
  try {
    await setBeatVisibility(beat, visibility);
  } catch (caught) {
    toast.error(toast.fromError(caught));
  }
}

async function setAudience(visibleTo: string[] | null) {
  const same = visibleTo === null ? beat.visible_to === null : beat.visible_to !== null && visibleTo.length === beat.visible_to.length && visibleTo.every((id) => beat.visible_to?.includes(id));
  if (same) return;
  try {
    await setBeatAudience(beat, visibleTo);
  } catch (caught) {
    toast.error(toast.fromError(caught));
  }
}
</script>
