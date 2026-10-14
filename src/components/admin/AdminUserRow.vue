<template>
  <div class="rounded-lg border border-border bg-card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
    <div class="flex-1 min-w-0 space-y-1">
      <div class="flex items-center gap-2 min-w-0">
        <p class="text-body text-foreground truncate">{{ user.email }}</p>
        <AppButton
          as="span"
          variant="tinted"
          size="xs"
          :tone="SEGMENT_TONE[segment]"
          emphasis="soft"
          :label="SEGMENT_INFO[segment].label"
          :title="SEGMENT_INFO[segment].description"
        />
      </div>
      <p class="text-caption text-muted-foreground">
        {{ user.display_name ?? "No name" }}
        <span class="mx-1 opacity-40">·</span>
        Joined {{ formatDate(user.created_at) }}
        <span class="mx-1 opacity-40">·</span>
        Last active {{ formatDate(user.last_active_at) }}
      </p>
      <p v-if="campaignsLine" class="text-caption text-muted-foreground">{{ campaignsLine }}</p>
      <p v-if="retentionLine" class="text-caption" :class="retentionClass">{{ retentionLine }}</p>
      <p v-else-if="exemptLine" class="text-caption text-muted-foreground">{{ exemptLine }}</p>
    </div>
    <div class="flex items-center gap-2 shrink-0 flex-wrap justify-end">
      <AppButton v-if="user.banned" as="span" variant="tinted" size="xs" tone="danger" label="Locked" />
      <AppButton v-else-if="user.suspended_at" as="span" variant="tinted" size="xs" tone="caution" label="Frozen" />
      <AppButton as="span" variant="tinted" size="xs" emphasis="outline" :tone="planTone(user.plan_id)" :label="user.plan_id" />
      <AppButton v-if="user.product_news" as="span" variant="tinted" size="xs" tone="info" emphasis="outline" label="News" />
      <span class="text-caption text-muted-foreground">{{ user.ai_credits }} cr</span>
      <div class="flex gap-1">
        <!-- The current plan is the `active` one; AppButton blocks the click
             while disabled, so no handler guard is needed. -->
        <AppButton
          v-for="pid in PLAN_IDS"
          :key="pid"
          variant="subtle"
          size="xs"
          :active="user.plan_id === pid"
          :label="pid"
          :disabled="user.plan_id === pid || busy.plan"
          @click="emit('set-plan', user, pid)"
        />
      </div>

      <AppButton
        v-if="!user.is_child"
        variant="subtle"
        size="xs"
        label="Email"
        :href="mailto"
      />

      <!-- Soft freeze (paid actions) -->
      <AppButton
        size="xs"
        :variant="user.suspended_at ? 'tinted' : 'subtle'"
        :tone="user.suspended_at ? 'caution' : undefined"
        :emphasis="user.suspended_at ? 'outline' : undefined"
        :label="user.suspended_at ? 'Unfreeze' : 'Freeze'"
        :disabled="busy.freeze"
        @click="emit('toggle-freeze', user)"
      />

      <!-- Hard lock-out (login ban) -->
      <AppButton
        size="xs"
        :variant="user.banned ? 'tinted' : 'destructive'"
        :tone="user.banned ? 'success' : undefined"
        :emphasis="user.banned ? 'outline' : undefined"
        :label="user.banned ? 'Unlock' : 'Lock out'"
        :disabled="busy.ban"
        @click="emit('toggle-ban', user)"
      />

      <!-- Permanent erasure (#631) -->
      <AppButton
        size="xs"
        variant="tinted"
        tone="danger"
        emphasis="soft"
        label="Delete"
        :disabled="busy.delete"
        @click="emit('delete', user)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One account in Admin → Users. Shows how the account is used (segment, last
 * activity, campaigns), where it stands in the inactivity retention flow, and
 * the admin's controls. The parent owns the data and the confirmations; this
 * only reports what was clicked.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { AdminUser, ExemptReason } from "@/composables/admin/useAdminUsers";
import { accountSegment, SEGMENT_INFO, type AccountSegment } from "@/lib/admin/accountSegments";
import { outreachMailto, renderOutreach, type OutreachTemplate } from "@/lib/admin/outreachEmail";
import { NOTICE_GRACE_DAYS } from "@/lib/account/retentionPeriods";
import type { PlanId } from "@/types/subscription.types";

const { user, template, now } = defineProps<{
  user: AdminUser;
  template: OutreachTemplate;
  now: Date;
  busy: { plan: boolean; freeze: boolean; ban: boolean; delete: boolean };
}>();

const emit = defineEmits<{
  (e: "set-plan", user: AdminUser, planId: PlanId): void;
  (e: "toggle-freeze", user: AdminUser): void;
  (e: "toggle-ban", user: AdminUser): void;
  (e: "delete", user: AdminUser): void;
}>();

const PLAN_IDS: PlanId[] = ["free", "tester", "pro"];

const SEGMENT_TONE: Record<AccountSegment, "info" | "success" | "arcane" | "caution" | "danger"> = {
  new: "info",
  active: "success",
  exploring: "arcane",
  lapsed: "caution",
  bounced: "danger",
};

const EXEMPT_TEXT: Record<ExemptReason, string> = {
  plan: "Kept: paid, tester or admin plan",
  parent: "Kept: parents a child account",
  banned: "Kept: locked out",
  seated: "Kept: plays in an active game",
};

const segment = computed(() => accountSegment(user, now));

const mailto = computed(() => outreachMailto(user.email, renderOutreach(template, user)));

const campaignsLine = computed(() => {
  const parts: string[] = [];
  if (user.campaigns_owned > 0) {
    parts.push(`${user.campaigns_owned} ${user.campaigns_owned === 1 ? "campaign" : "campaigns"}`);
  }
  if (user.campaigns_playing > 0) parts.push(`plays in ${user.campaigns_playing}`);
  return parts.join(" · ");
});

const retentionLine = computed(() => {
  if (user.retention_state === "notice_due") return "Notice due";
  if (user.retention_state === "deletable") return "Ready to delete";
  if (user.retention_state === "notice_sent" && user.inactivity_notice_sent_at) {
    const sent = new Date(user.inactivity_notice_sent_at);
    const deletable = new Date(sent.getTime() + NOTICE_GRACE_DAYS * 86_400_000);
    return `Notice sent ${formatDate(user.inactivity_notice_sent_at)}, deletable from ${formatDate(deletable.toISOString())}`;
  }
  return "";
});

const retentionClass = computed(() =>
  user.retention_state === "deletable" ? "text-destructive" : "text-ink-caution",
);

const exemptLine = computed(() =>
  user.retention_state === "exempt" && user.exempt_reason ? EXEMPT_TEXT[user.exempt_reason] : "",
);

function planTone(planId: string): "caution" | "info" | "neutral" {
  if (planId === "pro") return "caution";
  if (planId === "tester") return "info";
  return "neutral";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
</script>
