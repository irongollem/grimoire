<template>
  <div class="space-y-4">
    <p class="text-caption text-muted-foreground italic">
      In-app bug reports and feature requests. The GitHub issue carries no
      reporter and no screenshot — both are here (#633, #634). Screenshots are
      kept 90 days, reports 365.
    </p>

    <div v-if="reportsQuery.isPending.value" class="text-muted-foreground text-body">
      Loading reports…
    </div>
    <div v-else-if="reportsQuery.isError.value" class="text-destructive text-body">
      Failed to load reports.
    </div>
    <p
      v-else-if="!reports.length"
      class="text-muted-foreground text-body italic"
    >
      No reports have been filed yet.
    </p>

    <div v-else class="space-y-3">
      <div
        v-for="report in reports"
        :key="report.id"
        class="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <AppButton
            as="span"
            variant="tinted"
            size="xs"
            :tone="report.kind === 'bug' ? 'danger' : 'info'"
            :icon="report.kind === 'bug' ? IconBug : IconLightbulb"
            :label="report.kind === 'bug' ? 'Bug' : 'Feature'"
          />

          <AppButton
            v-if="report.issue_number"
            variant="link"
            size="inline"
            :href="`https://github.com/irongollem/grimoire/issues/${report.issue_number}`"
            target="_blank"
            rel="noopener noreferrer"
            :label="`#${report.issue_number}`"
            :icon-right="IconExternalLink"
          />
          <!-- The GitHub call failed or the follow-up link lost its race with a
               cold start; the report itself is intact. -->
          <span v-else class="text-caption text-muted-foreground italic">
            No issue linked
          </span>

          <span class="text-caption text-muted-foreground">
            {{ reporterLabel(report.user_id) }}
          </span>

          <span class="text-caption text-muted-foreground ml-auto">
            {{ formatDate(report.created_at) }}
          </span>
        </div>

        <AppButton
          v-if="report.has_screenshot"
          variant="subtle"
          size="xs"
          :icon="IconImage"
          :label="expandedId === report.id ? 'Hide screenshot' : 'Show screenshot'"
          @click="toggle(report.id)"
        />
        <p
          v-else-if="report.screenshot_purged_at"
          class="text-caption text-muted-foreground italic"
        >
          Screenshot purged {{ formatDate(report.screenshot_purged_at) }} (90-day retention).
        </p>

        <div v-if="expandedId === report.id" class="rounded-md border border-border bg-background p-2">
          <p v-if="screenshotQuery.isPending.value" class="text-caption text-muted-foreground">
            Loading screenshot…
          </p>
          <p v-else-if="screenshotQuery.isError.value" class="text-caption text-destructive">
            Failed to load the screenshot.
          </p>
          <img
            v-else-if="screenshotQuery.data.value"
            :src="screenshotQuery.data.value"
            alt="Reporter's screenshot"
            class="w-full rounded object-contain"
          />
          <p v-else class="text-caption text-muted-foreground italic">
            The screenshot is no longer stored.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin → Reports. The counterpart to #633/#634: attribution and screenshots
 * were removed from the public GitHub issue, so this is where a maintainer
 * picks them back up.
 *
 * Reporter identity is resolved against the existing admin user list rather
 * than joined in SQL — `bug_reports` holds only a user id, and `get_admin_users`
 * is already loaded on the neighbouring tab. Showing a reporter's email to the
 * operator administering their account is lawful under Art. 6(1)(b) (see #646);
 * what #633 fixed was publishing it, not holding it.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconBug, IconExternalLink, IconImage, IconLightbulb } from "@/lib/icons";
import { useAdminBugReports, useAdminBugReportScreenshot } from "@/composables/admin/useAdminBugReports";
import { useAdminUsers } from "@/composables/admin/useAdminUsers";

const reportsQuery = useAdminBugReports();
const usersQuery = useAdminUsers();

const reports = computed(() => reportsQuery.data.value ?? []);

const expandedId = ref<string | null>(null);
const screenshotQuery = useAdminBugReportScreenshot(expandedId);

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

const usersById = computed(() => {
  const map = new Map<string, string>();
  for (const user of usersQuery.data.value ?? []) {
    map.set(user.user_id, user.display_name ?? user.email);
  }
  return map;
});

/**
 * A missing entry means the reporter's account is gone: `bug_reports.user_id`
 * cascades on erasure, so the row itself would be gone too — this only shows
 * during the window where the admin user list is still loading.
 */
function reporterLabel(userId: string): string {
  return usersById.value.get(userId) ?? "…";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
</script>
