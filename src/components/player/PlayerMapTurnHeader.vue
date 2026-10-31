<template>
  <header class="turn-header" :class="{ 'is-mine': mine }" data-testid="map-turn-header">
    <RouterLink to="/play/encounter" class="back" aria-label="Back to the encounter">
      <IconChevronLeft class="h-5 w-5" />
    </RouterLink>
    <span class="portrait" :class="{ 'portrait-ring': mine }">
      <img v-if="portraitUrl" :src="portraitUrl" alt="" class="portrait-img" />
    </span>
    <div class="words">
      <p class="title" data-testid="map-turn-title">{{ title }}</p>
      <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    </div>
    <div class="aside">
      <span v-if="hp" class="hp" data-testid="map-turn-hp">{{ hp.current }}/{{ hp.max }} HP</span>
      <AppButton
        v-if="!mine"
        variant="chip"
        size="xs"
        :active="following"
        :aria-pressed="following"
        label="Follow"
        data-testid="map-follow"
        @click="emit('toggle-follow')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronLeft } from "@/lib/icons";

/**
 * The phone battle map's header (#1125 frame 14): "Your turn" with the round and the feet left, or whose turn it is
 * and where the player stands in the order. HP rides the right edge in gilt. Follow only shows when the map is
 * following someone else; on your own turn it is already on you.
 */
defineProps<{
  mine: boolean;
  title: string;
  subtitle: string | null;
  portraitUrl: string | null;
  hp: { current: number; max: number } | null;
  following: boolean;
}>();
const emit = defineEmits<{ "toggle-follow": [] }>();
</script>

<style scoped>
.turn-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: rgb(0 0 0 / 0.55);
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
  color: #ece6d6;
}
.back {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  color: rgb(255 255 255 / 0.7);
}
.portrait {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 9999px;
  overflow: hidden;
  background: #1d1a24;
  border: 2px solid rgb(255 255 255 / 0.2);
}
.portrait-ring {
  border-color: #8c2f2b;
}
.portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.words {
  min-width: 0;
  flex: 1;
}
.title {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-weight: 700;
  font-size: 1rem;
  line-height: 1.2;
}
.subtitle {
  font-size: 0.8125rem;
  color: rgb(255 255 255 / 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}
.hp {
  font-weight: 700;
  font-size: 0.9375rem;
  font-variant-numeric: tabular-nums;
  color: #c9a227;
}
</style>
