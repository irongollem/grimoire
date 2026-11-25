<template>
  <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4" data-chapter="world">
    <header class="flex flex-col gap-0.5">
      <h2 class="m-0 text-heading-sm font-bold">{{ chapter.label }}</h2>
      <p class="m-0 text-caption italic text-muted-foreground">
        Facts about the world that the rules happen to use: how it keeps time, where it is now, its weather and what it pays with. Sessions, downtime, prices and the Narrator read them from here.
      </p>
    </header>
    <CanonBlock title="Time and weather">
      <WorldTime />
    </CanonBlock>
    <CanonBlock title="What it pays with">
      <WorldCoins />
    </CanonBlock>
  </div>
</template>

<script setup lang="ts">
/** How the world works, as a sheet: time, today's date, weather and coins. The timeline is its own chapter. Each saves as it is changed, the coins on their explicit Save. */
import { chapterOf } from "@/lib/canon/canonParts";
import CanonBlock from "./kit/CanonBlock.vue";
import WorldCoins from "./WorldCoins.vue";
import WorldTime from "./WorldTime.vue";

const chapter = chapterOf("world");
</script>
