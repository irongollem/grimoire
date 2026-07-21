<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div class="flex flex-col gap-1.5">
      <label
        class="text-label-lg font-semibold text-muted-foreground"
        >Quest Giver</label
      >
      <EntityCombobox
        :model-value="giverNpcId"
        :options="npcs"
        placeholder="Search NPCs…"
        @update:model-value="emit('update:giverNpcId', $event)"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label
        class="text-label-lg font-semibold text-muted-foreground"
        >Location</label
      >
      <EntityCombobox
        :model-value="locationId"
        :options="locations"
        placeholder="Search locations…"
        @update:model-value="emit('update:locationId', $event)"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label
        class="text-label-lg font-semibold text-muted-foreground"
        >Part of Quest</label
      >
      <EntityCombobox
        :model-value="parentQuestId"
        :options="parentQuestOptions"
        placeholder="Search quests…"
        @update:model-value="emit('update:parentQuestId', $event)"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label
        class="text-label-lg font-semibold text-muted-foreground"
        >Reward Notes</label
      >
      <input
        :value="rewards"
        placeholder="XP, reputation, favours…"
        class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="emit('update:rewards', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Currency reward -->
    <QuestCurrencyReward
      :pp="pp"
      :gp="gp"
      :ep="ep"
      :sp="sp"
      :cp="cp"
      :is-new="isNew"
      @update:pp="emit('update:pp', $event)"
      @update:gp="emit('update:gp', $event)"
      @update:ep="emit('update:ep', $event)"
      @update:sp="emit('update:sp', $event)"
      @update:cp="emit('update:cp', $event)"
      @drop-to-chat="emit('dropCurrencyToChat')"
    />
  </div>
</template>

<script setup lang="ts">
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import QuestCurrencyReward from "@/components/quests/QuestCurrencyReward.vue";

const {
  giverNpcId,
  locationId,
  parentQuestId,
  rewards,
  npcs,
  locations,
  parentQuestOptions,
  isNew,
  pp,
  gp,
  ep,
  sp,
  cp,
} = defineProps<{
  giverNpcId: string;
  locationId: string;
  parentQuestId: string;
  rewards: string;
  npcs: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  parentQuestOptions: Array<{ id: string; name: string }>;
  isNew: boolean;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}>();

const emit = defineEmits<{
  "update:giverNpcId": [value: string];
  "update:locationId": [value: string];
  "update:parentQuestId": [value: string];
  "update:rewards": [value: string];
  "update:pp": [value: number];
  "update:gp": [value: number];
  "update:ep": [value: number];
  "update:sp": [value: number];
  "update:cp": [value: number];
  dropCurrencyToChat: [];
}>();
</script>
