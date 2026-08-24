<template>
  <!--
    Self-hiding: most campaigns' players never share a journal entry, and a
    permanent card saying so is dead weight. Registry and component agree —
    `v-if`, no `loading`/`empty` props.
  -->
  <DashboardWidget
    v-if="rows.length > 0"
    title="Players wrote"
    tone="caution"
    :count="rows.length"
    to="/party?tab=journal"
    action-label="Journals →"
    max-height="none"
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.id"
        to="/party?tab=journal"
        class="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
        @click="markRead(row.id)"
      >
        <div class="min-w-0 flex-1">
          <p
            class="truncate font-cinzel text-sm font-semibold text-foreground transition-colors group-hover:text-primary"
          >
            {{ row.title }}
          </p>
          <p class="text-caption text-muted-foreground italic">{{ row.authorName }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="timeAgo(row.updatedAt)"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * Player journal entries the DM has not read (#764).
 *
 * **The catalogue expected this to need a migration and it does not.**
 * `player_read_items` is keyed `(user_id, campaign_id, entity_type, entity_id)`
 * and gated by four plain `auth.uid() = user_id` policies — nothing in it is
 * player-specific but the name. The DM is an authenticated user who owns the
 * campaign, so a DM row is an ordinary row, and `useReadItems("journal_entry")`
 * is the "DM has seen" marker the issue thought had to be built. The table's
 * name is now slightly wrong and that is written down rather than migrated.
 *
 * Opening an entry marks it read, so the card empties itself as the DM works
 * through it — which is why it can be self-hiding without ever going quiet on
 * something unread.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useSharedJournalEntries } from "@/composables/usePlayerJournal";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import { buildSharedJournalRows, toSharedJournalInput } from "@/lib/dashboard/sharedJournal";
import { timeAgo } from "@/lib/utils";

const ENTITY_TYPE = "journal_entry";
const LIMIT = 6;

const { data: entries } = useSharedJournalEntries();
const { data: members } = useCampaignMembers();
const { isNew } = useReadItems(ENTITY_TYPE);
const markReadMutation = useMarkRead();

/**
 * A member with no `display_name` set has never named themselves; the map
 * simply has no entry for them, which the row builder reports as an unknown
 * author rather than an empty byline.
 */
const authorNames = computed(() => {
  const names = new Map<string, string>();
  const loaded = members.value;
  if (loaded === undefined) return names;
  for (const member of loaded) {
    if (member.display_name !== null && member.display_name !== "") {
      names.set(member.user_id, member.display_name);
    }
  }
  return names;
});

/**
 * Unloaded and "nothing unread" both render nothing, because the card is
 * self-hiding — so no distinction is lost by treating them alike. The explicit
 * branch is kept: it costs a line and it is the shape to copy if this ever
 * grows an empty state.
 */
const rows = computed(() => {
  const loaded = entries.value;
  if (loaded === undefined) return [];
  return buildSharedJournalRows(
    loaded.map(toSharedJournalInput),
    authorNames.value,
    // `isNew` needs the edit time: an entry the DM read and the player then
    // revised is unread again, which is the behaviour the player portal's own
    // unread dots already have.
    (entry) => isNew(entry.id, entry.updated_at),
    LIMIT,
  );
});

function markRead(entityId: string) {
  markReadMutation.mutate({ entityType: ENTITY_TYPE, entityId });
}
</script>
