<template>
  <PageHeader title="The table" description="Play a character while an AI Dungeon Master tells the story. Every character in it speaks in their own box.">
    <div class="px-4 pb-8 pt-4 md:px-6" data-testid="table-start">
      <SoloAiOff v-if="!campaign.isAiEnabled" class="mx-0" />

      <div v-else class="flex max-w-2xl flex-col gap-6">
        <section class="flex flex-col gap-2" aria-labelledby="table-who">
          <h2 id="table-who" class="text-heading-sm text-foreground">Who you play</h2>
          <ListSkeleton v-if="party.isLoading.value" variant="stack" :count="3" />
          <p v-else-if="party.isError.value" role="alert" class="text-body text-destructive">The party could not be read. Reload to try again.</p>
          <p v-else-if="!characters.length" class="text-body italic text-muted-foreground">
            The party has no one to play yet.
            <AppButton to="/party/new" variant="link" size="inline" label="Add a hero" />
          </p>
          <CardRadioGroup v-else v-model="characterId" :options="characterOptions" label="Who you play" />
        </section>

        <section class="flex flex-col gap-2" aria-labelledby="table-where">
          <h2 id="table-where" class="text-heading-sm text-foreground">Where you begin</h2>
          <div class="flex items-center gap-2">
            <EntityCombobox v-model="placeId" :options="places" placeholder="Anywhere the story starts" class="flex-1" />
            <AppButton v-if="placeId" variant="ghost" size="md" label="Clear" @click="placeId = ''" />
          </div>
          <p class="text-caption text-muted-foreground">Optional. Leave it empty and the Dungeon Master starts where the campaign says the party is.</p>
        </section>

        <div>
          <AppButton variant="live" size="md" label="Sit down" :disabled="!characterId" @click="sitDown" />
        </div>

        <section class="flex flex-col gap-2" aria-labelledby="table-record">
          <h2 id="table-record" class="text-heading-sm text-foreground">The story so far</h2>
          <p class="text-caption text-muted-foreground">What the table has settled, kept as plain facts you can read and correct.</p>
          <div><AppButton to="/table/story" variant="outline" size="md" label="Read the record" /></div>
        </section>

        <section class="flex flex-col gap-2" aria-labelledby="table-earlier">
          <h2 id="table-earlier" class="text-heading-sm text-foreground">Earlier sittings</h2>
          <ListSkeleton v-if="sessions.isLoading.value" variant="stack" :count="3" />
          <p v-else-if="sessions.isError.value" role="alert" class="text-body text-destructive">Earlier sittings could not be read. Reload to try again.</p>
          <p v-else-if="!sessions.sittings.value.length" class="text-body italic text-muted-foreground">Nothing yet. Your first sitting will be kept here.</p>
          <ul v-else class="flex flex-col divide-y divide-border border border-border bg-card">
            <li v-for="sitting in sessions.sittings.value" :key="sitting.id" class="flex items-center gap-3 px-3 py-2.5" data-testid="table-sitting">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-label-lg font-semibold text-foreground">{{ sittingWho(sitting.characterName, sitting.party_member_id) }}</span>
                <span class="truncate text-caption text-muted-foreground">
                  <template v-if="sitting.placeName">{{ sitting.placeName }} · </template>{{ dayOf(sitting.updated_at) }}
                </span>
              </div>
              <AppButton :to="`/table/${sitting.id}`" variant="outline" size="md" :label="sitting.left_at === null ? 'Continue' : 'Read'" />
            </li>
          </ul>
        </section>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { sittingWho } from "@/lib/table/sittingLabel";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import CardRadioGroup from "@/components/common/controls/CardRadioGroup.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import SoloAiOff from "@/components/table/solo/SoloAiOff.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useTableSessions } from "@/composables/table/useTableSessions";
import { useCampaignStore } from "@/stores/campaign";

const campaign = useCampaignStore();
const router = useRouter();

const party = useActiveParty();
const characters = computed(() => party.data.value ?? []);
const characterOptions = computed(() =>
  characters.value.map((member) => ({
    value: member.id,
    label: member.name,
    description: ["Level " + member.level, member.class].filter(Boolean).join(" "),
  })),
);

const { data: locations } = useAllLocations();
const places = computed(() => (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })));

const sessions = useTableSessions(() => campaign.activeCampaignId);

// Required: a character is who the story is about. "" is the combobox's empty value.
const characterId = ref<string | null>(null);
const placeId = ref("");

function sitDown(): void {
  if (!characterId.value) return;
  void router.push({ path: "/table/new", query: { character: characterId.value, ...(placeId.value ? { place: placeId.value } : {}) } });
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
</script>
