<template>
  <CardFlip :flipped="flipped">
    <template #front>
      <MemorialCard v-bind="cardProps" side="front" v-on="handlers" />
    </template>
    <template #back>
      <MemorialCard v-bind="cardProps" side="back" v-on="handlers" />
    </template>
  </CardFlip>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CardFlip from "@/components/common/CardFlip.vue";
import MemorialCard from "@/components/memorials/MemorialCard.vue";
import type { CharacterMemorial } from "@/types/memorial.types";

/** One memorial card that turns over (#982): the wall's grid cell and the phone's full-size modal share it. */
const props = defineProps<{
  memorial: CharacterMemorial;
  viewer: "owner" | "dm" | "other";
  candleCount: number;
  litByMe: boolean;
  flipped: boolean;
}>();

const emit = defineEmits<{
  flip: [];
  "light-candle": [];
  "edit-words": [];
  "edit-account": [];
}>();

const cardProps = computed(() => ({
  memorial: props.memorial,
  viewer: props.viewer,
  candleCount: props.candleCount,
  litByMe: props.litByMe,
}));

const handlers = {
  flip: () => emit("flip"),
  "light-candle": () => emit("light-candle"),
  "edit-words": () => emit("edit-words"),
  "edit-account": () => emit("edit-account"),
};
</script>
