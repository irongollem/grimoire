<template>
  <AppModal :open="open" size="md" label="Before you sit down" dismissable backdrop-dismiss @close="emit('decline')">
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-7">
      <SoloAiMark class="self-start" />
      <h2 class="text-title font-bold text-foreground">Before you sit down</h2>
      <p class="font-fell text-base leading-relaxed text-foreground">
        At this table nobody is in the Dungeon Master's chair. An AI model reads your campaign and tells the story with you.
      </p>
      <ul class="flex flex-col gap-2.5">
        <li v-for="point in POINTS" :key="point.lead" class="flex gap-2.5 text-body text-foreground">
          <i class="mt-2 size-1.5 shrink-0 rotate-45 bg-(--live-ink,var(--primary))" aria-hidden="true" />
          <p><b>{{ point.lead }}</b> {{ point.rest }}</p>
        </li>
      </ul>
      <div class="flex items-center gap-2 pt-1">
        <AppButton variant="primary" size="lg" label="Sit down" @click="emit('accept')" />
        <AppButton variant="ghost" size="lg" label="Not now" @click="emit('decline')" />
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import SoloAiMark from "./SoloAiMark.vue";

/**
 * The first place in the app where you talk with an AI, so the law (AI Act, Article 50) asks that you are told
 * (Disclosure, 07). The wording is the canvas's; its third point names what the privacy policy must say and is the
 * maintainer's to confirm.
 */
defineProps<{ open: boolean }>();
const emit = defineEmits<{ accept: []; decline: [] }>();

const POINTS = [
  { lead: "It can be wrong.", rest: "It may misremember a name or bend a rule. The dice and the arithmetic are not its to get wrong: Grimoire rolls and counts." },
  { lead: "The story is kept.", rest: "What you and it say is stored with your account so the game can go on next time." },
  { lead: "What you write goes to the model's maker", rest: "to be answered, and is checked for content that is not allowed. Keep real names and private matters out of it." },
  { lead: "Play costs credits,", rest: "counted from what each answer used. The bar shows the running total." },
] as const;
</script>
