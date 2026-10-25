<template>
  <div class="space-y-4">
    <p class="text-caption text-muted-foreground italic">
      In-app bug reports and feature requests. The GitHub issue carries no
      reporter and no screenshot; both are here (#633, #634). Screenshots are
      kept 90 days, reports 365. A report GitHub refused keeps its text here
      until it is filed.
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
          <!-- Not filed: GitHub refused it (an expired token, an outage) and
               the text waits below; or, on rows from before the text was
               kept, there is nothing left to file. -->
          <span v-else-if="report.has_report_text" class="text-caption text-ink-caution">
            Not filed yet
          </span>
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

        <div v-if="report.issue_number === null && report.has_report_text" class="space-y-2">
          <p
            v-if="filingNote(report.bug_report_filings)"
            class="text-caption"
            :class="report.bug_report_filings?.uncertain ? 'text-ink-caution' : 'text-destructive'"
          >
            {{ filingNote(report.bug_report_filings) }}
          </p>
          <div class="flex flex-wrap gap-2">
            <!-- "File anyway" when GitHub may already hold it: the function
                 refuses that one without force, and the label says why. -->
            <AppButton
              :variant="report.bug_report_filings?.uncertain ? 'outline' : 'primary'"
              size="xs"
              :icon="IconSend"
              :label="report.bug_report_filings?.uncertain ? 'File anyway' : 'File on GitHub'"
              :loading="refile.isPending.value && refile.variables.value?.id === report.id"
              :disabled="refile.isPending.value"
              @click="fileOnGitHub(report.id, report.bug_report_filings?.uncertain === true)"
            />
            <AppButton
              variant="subtle"
              size="xs"
              :icon="IconDocument"
              :label="textOpenId === report.id ? 'Hide report' : 'Show report'"
              @click="textOpenId = textOpenId === report.id ? null : report.id"
            />
          </div>
          <div
            v-if="textOpenId === report.id"
            class="rounded-md border border-border bg-muted/40 p-2"
          >
            <p v-if="textQuery.isPending.value" class="text-caption text-muted-foreground">
              Loading the report…
            </p>
            <p v-else-if="textQuery.isError.value" class="text-caption text-destructive">
              Failed to load the report.
            </p>
            <!-- Plain interpolation, never rendered: the reporter's text is
                 untrusted. -->
            <dl v-else-if="textQuery.data.value" class="space-y-1.5">
              <template v-for="field in reportFields(report.kind, textQuery.data.value)" :key="field.label">
                <dt class="text-caption-sm text-muted-foreground">{{ field.label }}</dt>
                <dd class="whitespace-pre-wrap wrap-break-word text-caption text-foreground">{{ field.value }}</dd>
              </template>
            </dl>
          </div>
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

        <div v-if="expandedId === report.id" class="rounded-md border border-border bg-muted/40 p-2">
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
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconBug, IconDocument, IconExternalLink, IconImage, IconLightbulb, IconSend } from "@/lib/icons";
import {
  useAdminBugReports,
  useAdminBugReportScreenshot,
  useAdminBugReportText,
  useRefileBugReport,
  type AdminBugReport,
  type BugReportFiling,
  type BugReportText,
} from "@/composables/admin/useAdminBugReports";
import { useAdminUsers } from "@/composables/admin/useAdminUsers";
import { useToast } from "@/composables/useToast";

const reportsQuery = useAdminBugReports();
const usersQuery = useAdminUsers();

const reports = computed(() => reportsQuery.data.value ?? []);

const expandedId = ref<string | null>(null);
const screenshotQuery = useAdminBugReportScreenshot(expandedId);

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

const textOpenId = ref<string | null>(null);
const textQuery = useAdminBugReportText(textOpenId);
const refile = useRefileBugReport();
const toast = useToast();

/** A filing in flight says so; otherwise the reason the last one failed. */
function filingNote(filing: BugReportFiling | null): string | null {
  if (filing === null) return null;
  if (filing.claimed_at !== null) {
    return `Being filed since ${new Date(filing.claimed_at).toLocaleTimeString()}.`;
  }
  return filing.error;
}

const FIELD_LABELS: Record<AdminBugReport["kind"], [keyof BugReportText, string][]> = {
  bug: [
    ["where", "Where in the app"],
    ["action", "What they were doing"],
    ["expected", "What they expected"],
    ["actual", "What actually happened"],
  ],
  feature: [
    ["summary", "What they'd like to see"],
    ["problem", "What problem it solves"],
    ["where", "Where in the app"],
  ],
};

function reportFields(kind: AdminBugReport["kind"], text: BugReportText): { label: string; value: string }[] {
  return FIELD_LABELS[kind].flatMap(([key, label]) => {
    const value = text[key];
    return value === undefined || value.trim() === "" ? [] : [{ label, value }];
  });
}

// The function records a failure on the filing too, so the list shows the new
// reason after the refetch; the toast is what says the click did something.
function fileOnGitHub(id: string, force: boolean) {
  refile.mutate({ id, force }, {
    onSuccess: (issueNumber) => toast.success(`Filed as #${issueNumber}.`),
    onError: (e) => toast.error(toast.fromError(e, "Could not file the report.")),
  });
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
