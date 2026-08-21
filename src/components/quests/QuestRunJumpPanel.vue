<template>
  <section class="space-y-3 rounded-xl border border-primary/30 bg-card p-3" aria-label="Jump to another story beat">
    <div class="flex items-center gap-2">
      <div class="flex-1">
        <h2 class="font-cinzel text-sm font-bold text-foreground">Jump story</h2>
        <p class="text-caption text-muted-foreground">The authored graph stays untouched. Choose whether this detour needs a return point.</p>
      </div>
      <AppButton label="Close" size="xs" variant="subtle" @click="emit('close')" />
    </div>
    <AppInput v-model="search" placeholder="Search quest or beat…" autofocus />
    <div class="max-h-80 space-y-1 overflow-y-auto">
      <AppButton
        v-for="target in targets"
        :key="target.beat_id"
        variant="menu"
        size="body"
        block
        @click="selected = target"
      >
        <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ groupLabel(target.group) }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-body font-semibold text-foreground">{{ target.beat_title }}</span>
          <span class="block truncate text-caption text-muted-foreground">{{ target.quest_title }}</span>
        </span>
        <span v-if="target.recentRank < 999" class="text-label text-primary">Recent</span>
      </AppButton>
      <p v-if="!targets.length" class="p-3 text-caption italic text-muted-foreground">No eligible beats match.</p>
    </div>
    <div v-if="selected" class="space-y-2 rounded-lg border border-border bg-background p-3">
      <p class="text-caption font-semibold text-foreground">Jump to {{ selected.beat_title }}</p>
      <AppInput v-model="reason" placeholder="Why did the story jump?" />
      <AppCheckbox v-model="pushReturn" label-role="caption" label="Save the current beat as a return point" />
      <div class="flex justify-end gap-2">
        <AppButton label="Cancel" size="sm" variant="subtle" @click="selected = null" />
        <AppButton label="Jump" size="sm" variant="primary" :disabled="!reason.trim()" @click="submit" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { RankedQuestJumpTarget, QuestJumpGroup } from "@/lib/quests/run";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";

defineProps<{ targets: RankedQuestJumpTarget[] }>();
const search = defineModel<string>({ required: true });
const emit = defineEmits<{
  close: [];
  jump: [target: RankedQuestJumpTarget, reason: string, pushReturn: boolean];
}>();
const selected = ref<RankedQuestJumpTarget | null>(null);
const reason = ref("");
const pushReturn = ref(true);

function groupLabel(group: QuestJumpGroup) {
  return { current: "Current quest", side: "Side quest", campaign: "Campaign" }[group];
}

function submit() {
  if (!selected.value || !reason.value.trim()) return;
  emit("jump", selected.value, reason.value.trim(), pushReturn.value);
}
</script>
