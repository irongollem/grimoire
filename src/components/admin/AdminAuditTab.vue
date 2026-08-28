<template>
  <div class="space-y-4">
    <p class="text-caption text-muted-foreground italic">
      Every privileged admin action — erasures, plan changes, freezes, lock-outs,
      credit grants and pack refunds (#642). Append-only: entries cannot be edited
      or deleted, by anyone, including from here.
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <AppInput
        v-model="search"
        type="search"
        size="body"
        tone="muted"
        :block="false"
        placeholder="Search actor, target or details…"
        class="min-w-56 flex-1"
      />
      <AppSelect v-model="filterAction" size="body" aria-label="Filter by action">
        <option value="all">All actions</option>
        <option v-for="action in ADMIN_AUDIT_ACTIONS" :key="action" :value="action">
          {{ ADMIN_AUDIT_LABELS[action] }}
        </option>
      </AppSelect>
      <AppButton
        v-if="ui.adminAuditHasActiveFilters"
        variant="subtle"
        size="sm"
        label="Clear"
        @click="ui.resetAdminAuditFilters()"
      />
    </div>

    <div v-if="auditQuery.isPending.value" class="text-muted-foreground text-body">
      Loading audit log…
    </div>
    <div v-else-if="auditQuery.isError.value" class="text-destructive text-body">
      Failed to load the audit log.
    </div>
    <p v-else-if="!entries.length" class="text-muted-foreground text-body italic">
      No admin actions have been recorded yet.
    </p>
    <p v-else-if="!filteredEntries.length" class="text-muted-foreground text-body italic">
      No entries match these filters.
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="entry in filteredEntries"
        :key="entry.id"
        class="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5"
      >
        <div class="flex flex-wrap items-center gap-2">
          <AppButton
            as="span"
            variant="tinted"
            size="xs"
            :tone="toneFor(entry.action)"
            :label="ADMIN_AUDIT_LABELS[entry.action] ?? entry.action"
          />
          <span class="text-body text-foreground truncate">{{ targetLabel(entry) }}</span>
          <span class="text-caption text-muted-foreground ml-auto shrink-0">
            {{ formatWhen(entry.created_at) }}
          </span>
        </div>
        <p class="text-caption text-muted-foreground">
          by {{ actorLabel(entry) }}
          <template v-if="detailSummary(entry)">
            <span class="mx-1 opacity-40">·</span>{{ detailSummary(entry) }}
          </template>
        </p>
      </div>

      <p
        v-if="entries.length === ADMIN_AUDIT_LIMIT"
        class="text-caption text-muted-foreground italic pt-1"
      >
        Showing the most recent {{ ADMIN_AUDIT_LIMIT }} entries.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin → Audit. The viewer half of #642; the writers are the RPCs in
 * `20260809214703` plus the two admin edge functions.
 *
 * Identities are resolved against the admin user list rather than joined in SQL,
 * for the same reason AdminReportsTab does it: the log holds ids only, and
 * deliberately so — an entry that survives an erasure must not carry the erased
 * person's email or name. An unresolvable id therefore is not a bug, it is the
 * expected state after the account is gone, and it renders as the bare id.
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useUiStore } from "@/stores/ui";
import { useAdminUsers } from "@/composables/admin/useAdminUsers";
import {
  useAdminAuditLog,
  ADMIN_AUDIT_ACTIONS,
  ADMIN_AUDIT_LABELS,
  ADMIN_AUDIT_LIMIT,
  type AdminAuditAction,
  type AdminAuditEntry,
} from "@/composables/admin/useAdminAuditLog";

const ui = useUiStore();
const { adminAuditSearch: search, adminAuditFilterAction: filterAction } = storeToRefs(ui);

const auditQuery = useAdminAuditLog();
const usersQuery = useAdminUsers();

const entries = computed(() => auditQuery.data.value ?? []);

const usersById = computed(() => {
  const map = new Map<string, string>();
  for (const user of usersQuery.data.value ?? []) {
    map.set(user.user_id, user.display_name ?? user.email);
  }
  return map;
});

/** Falls back to the raw id — see the note above on why that is the normal case. */
function nameFor(userId: string): string {
  return usersById.value.get(userId) ?? userId;
}

/**
 * `admin_user_id` is null in two different situations and the log would be
 * misleading if they looked alike: a self-initiated erasure (the actor was the
 * target, `details.actor_kind === 'self'`), and an actor whose own account was
 * later erased (ON DELETE SET NULL).
 */
function actorLabel(entry: AdminAuditEntry): string {
  if (entry.admin_user_id) return nameFor(entry.admin_user_id);
  if (entry.details?.actor_kind === "self") return "the account holder";
  return "an admin since erased";
}

function targetLabel(entry: AdminAuditEntry): string {
  return entry.target_user_id ? nameFor(entry.target_user_id) : "—";
}

const DANGER_ACTIONS = new Set<AdminAuditAction>([
  "account_erasure",
  "account_ban",
  "account_freeze",
]);

function toneFor(action: AdminAuditAction): "danger" | "success" | "info" {
  if (DANGER_ACTIONS.has(action)) return "danger";
  if (action === "account_unban" || action === "account_unfreeze") return "success";
  return "info";
}

/** The one or two fields worth reading without expanding the raw jsonb. */
function detailSummary(entry: AdminAuditEntry): string {
  const d = entry.details ?? {};
  switch (entry.action) {
    case "plan_change":
      return `${d.from ?? "?"} → ${d.to ?? "?"}`;
    case "credit_grant":
      return `${Number(d.delta) > 0 ? "+" : ""}${d.delta} credits · ${d.reason ?? ""}`.trim();
    case "credit_pack_refund":
      return `${d.credits ?? "?"} credits · clawed back ${d.clawed_back ?? "nothing (needs reconciling)"}`;
    case "account_freeze":
      return typeof d.reason === "string" ? d.reason : "";
    case "account_erasure":
      return `${d.ledger_rows_anonymized ?? 0} ledger rows anonymized`;
    default:
      return "";
  }
}

const filteredEntries = computed(() => {
  const q = search.value.trim().toLowerCase();
  return entries.value.filter((entry) => {
    if (filterAction.value !== "all" && entry.action !== filterAction.value) return false;
    if (!q) return true;
    return [
      actorLabel(entry),
      targetLabel(entry),
      ADMIN_AUDIT_LABELS[entry.action] ?? entry.action,
      detailSummary(entry),
    ].some((field) => field.toLowerCase().includes(q));
  });
});

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
