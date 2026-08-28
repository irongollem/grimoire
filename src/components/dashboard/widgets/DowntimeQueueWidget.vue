<template>
  <DashboardWidget
    title="Downtime queue"
    tone="caution"
    :count="rows.length || null"
    to="/downtime"
    action-label="The Interlude →"
    :loading="isLoading"
    :empty="!rows.length"
    empty-text="Nothing waiting. Every draw has been resolved."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.drawId"
        to="/downtime"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.characterName }}
            <span v-if="row.playerName" class="font-sans text-caption font-normal text-muted-foreground">
              ({{ row.playerName }})
            </span>
          </p>
          <p class="text-caption text-muted-foreground italic">Drew {{ row.activityTitle }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="timeAgo(row.drawnAt)"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { useDowntimeDraws } from "@/composables/downtime/useDowntime";
import { useParty } from "@/composables/party/useParty";
import { buildDowntimeQueue } from "@/lib/dashboard/downtimeQueue";
import { timeAgo } from "@/lib/utils";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * The between-sessions to-do: player downtime draws waiting on the DM to
 * resolve (#764).
 *
 * `caution` tone because this is a standing job for the DM, same reasoning as
 * `PrepGapsWidget` — but the empty state is the *good* outcome here, unlike a
 * prep gap. There is no route that deep-links to one draw; the resolution
 * board (`/downtime`, nav label "The Interlude") is a single page, so every
 * row and the header action both send the DM there and its own oldest-first
 * queue does the rest.
 */
const { data: draws, isLoading: drawsLoading } = useDowntimeDraws();
const { data: party, isLoading: partyLoading } = useParty();
const isLoading = computed(() => drawsLoading.value || partyLoading.value);

/**
 * The `?? []` here is load-bearing on `isLoading` above: while either query is
 * unloaded `DashboardWidget` renders its spinner and never reaches the body,
 * so the empty rows this produces are not shown. Without that gate it would
 * tell the DM every draw had been resolved before it had looked, which is the
 * exact failure the loading/empty split exists to prevent.
 */
const rows = computed(() => buildDowntimeQueue(draws.value ?? [], party.value ?? []));
</script>
