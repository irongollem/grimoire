<template>
  <section class="w-full" data-testid="connections-block" aria-labelledby="connections-heading">
    <div class="mb-1 flex w-full flex-wrap items-center justify-between gap-2">
      <h2 id="connections-heading" class="text-heading-sm font-bold text-foreground">Connections</h2>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconNetwork"
          icon-size="xs"
          label="In the web"
          :to="{ path: '/web', query: { focus: `${subject.kind}:${subject.id}` } }"
        />
        <AppButton
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconAdd"
          icon-size="xs"
          label="Add connection"
          @click="addOpen = true"
        />
      </div>
    </div>
    <div class="gold-divider mb-3" />

    <!-- The AI's suggestions (when the campaign has AI): the same slips, with Accept and Dismiss under them. -->
    <ConnectionSuggestions :subject="subject" :subject-name="subjectName" />

    <ListSkeleton v-if="isLoading" variant="rows" :count="2" />
    <p v-else-if="isError" class="text-body text-destructive">Could not load the connections.</p>
    <p v-else-if="groups.length === 0" class="text-body italic text-muted-foreground">No connections yet.</p>
    <div v-else class="flex flex-col gap-4">
      <div v-for="g in groups" :key="g.group" :data-group="g.group">
        <h3 class="mb-1 text-eyebrow text-muted-foreground">{{ g.title }}</h3>
        <ul class="flex flex-col gap-2">
          <template v-for="entry in g.entries" :key="entry.key">
            <ConnectionRow
              v-if="entry.kind === 'row'"
              :connection="entry.connection"
              :subject="subject"
              :subject-name="subjectName"
              :all="connections"
            />
            <li
              v-else
              class="flex flex-wrap items-center gap-x-2 rounded-md border border-dashed border-border px-3 py-2 text-body text-foreground"
              data-testid="connections-summary"
            >
              <span>{{ entry.text }}</span>
              <span class="text-caption italic text-muted-foreground">· {{ entry.points }}</span>
              <span class="rounded-sm border border-dashed border-border px-1.5 py-0.5 text-label text-muted-foreground">{{ entry.home }}</span>
            </li>
          </template>
        </ul>
      </div>
    </div>

    <AddConnectionDialog
      :open="addOpen"
      :subject="subject"
      :subject-name="subjectName"
      :connections="connections"
      @close="addOpen = false"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * Everything a thing is tied to, in one block (#1084): the same component, in
 * the same place and group order, on an NPC, a character, a faction, a place,
 * a deity and an item. The groups follow the other end's kind (people,
 * factions, places, deities, items, quests) and an empty group is not drawn.
 * A tie that already has a home (a membership, a residence, a pack) is read
 * from there and says so; a long list of those folds into one line that points
 * at the section which already lists them.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AddConnectionDialog from "@/components/connections/AddConnectionDialog.vue";
import ConnectionRow from "@/components/connections/ConnectionRow.vue";
import ConnectionSuggestions from "@/components/connections/ConnectionSuggestions.vue";
import { groupConnections } from "@/components/connections/connectionRows";
import { useConnections } from "@/composables/connections/useConnections";
import { IconAdd, IconNetwork } from "@/lib/icons";
import type { Connection, WorldRef } from "@/types/connections.types";

const { subject, subjectName } = defineProps<{ subject: WorldRef; subjectName: string }>();

const { data, isLoading, isError } = useConnections(() => subject.kind, () => subject.id);
const addOpen = ref(false);

const connections = computed<readonly Connection[]>(() => data.value ?? []);
const groups = computed(() => groupConnections(subject, connections.value));
</script>
