import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

/**
 * What a parent sees of their young players' tables (#927): who is at each
 * campaign a child plays in, and the join requests waiting on the parent.
 *
 * A parent is not a member of those campaigns, so RLS would show them nothing;
 * `get_family_campaigns` is the one read that returns exactly their own
 * children's tables. The three RPCs live in `20260929211745_parent_approved_tables`.
 *
 * No `refetchInterval`: a parent arrives from an emailed link and the query
 * refetches on mount and on focus. Polling here would be a second sync
 * mechanism for a page that changes on a human timescale.
 */

const FAMILY_CAMPAIGNS_QUERY_KEY = ["family-campaigns"] as const;

export interface FamilyCampaignMember {
  userId: string;
  displayName: string;
  role: string;
  isOwner: boolean;
  isYoungPlayer: boolean;
  isYou: boolean;
}

export interface FamilyCampaign {
  campaignId: string;
  name: string;
  childRole: string;
  childRunsIt: boolean;
  members: FamilyCampaignMember[];
}

export interface FamilyChildTables {
  childUserId: string;
  campaigns: FamilyCampaign[];
}

export type JoinRequestKind = "child_joining" | "joining_child_campaign";

export interface FamilyJoinRequest {
  requestId: string;
  campaignId: string;
  campaignName: string;
  joinerUserId: string;
  joinerName: string;
  joinerIsYoungPlayer: boolean;
  childUserId: string;
  kind: JoinRequestKind;
  /** The campaign owner's name at their own table; null when the owner has no
   *  member row there (the copy then names only the campaign). */
  dmName: string | null;
  waitingOnOtherParent: boolean;
  createdAt: string;
}

export interface FamilyCampaigns {
  children: FamilyChildTables[];
  requests: FamilyJoinRequest[];
}

export type JoinDecision = "joined" | "pending" | "declined";

// ── Shape validation ─────────────────────────────────────────────────────────
// The RPC returns jsonb, so the client cannot trust its shape. A mismatch throws
// rather than rendering a half-empty page: a parent deciding on a request the
// page could not describe is worse than an error.

type Obj = Record<string, unknown>;

function asObject(value: unknown, what: string): Obj {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Obj;
  throw new Error(`get_family_campaigns: ${what} is not an object`);
}

function asArray(value: unknown, what: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error(`get_family_campaigns: ${what} is not a list`);
}

function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v === "string") return v;
  throw new Error(`get_family_campaigns: ${key} is not text`);
}

function nullableStr(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v === "string") return v;
  throw new Error(`get_family_campaigns: ${key} is not text or null`);
}

function bool(o: Obj, key: string): boolean {
  const v = o[key];
  if (typeof v === "boolean") return v;
  throw new Error(`get_family_campaigns: ${key} is not true or false`);
}

function parseMember(raw: unknown): FamilyCampaignMember {
  const o = asObject(raw, "a member");
  return {
    userId: str(o, "user_id"),
    displayName: str(o, "display_name"),
    role: str(o, "role"),
    isOwner: bool(o, "is_owner"),
    isYoungPlayer: bool(o, "is_young_player"),
    isYou: bool(o, "is_you"),
  };
}

function parseCampaign(raw: unknown): FamilyCampaign {
  const o = asObject(raw, "a campaign");
  return {
    campaignId: str(o, "campaign_id"),
    name: str(o, "name"),
    childRole: str(o, "child_role"),
    childRunsIt: bool(o, "child_runs_it"),
    members: asArray(o.members, "members").map(parseMember),
  };
}

function parseChild(raw: unknown): FamilyChildTables {
  const o = asObject(raw, "a child");
  return {
    childUserId: str(o, "child_user_id"),
    campaigns: asArray(o.campaigns, "campaigns").map(parseCampaign),
  };
}

function parseRequest(raw: unknown): FamilyJoinRequest {
  const o = asObject(raw, "a request");
  const kind = o.kind;
  if (kind !== "child_joining" && kind !== "joining_child_campaign") {
    throw new Error("get_family_campaigns: unknown request kind");
  }
  return {
    requestId: str(o, "request_id"),
    campaignId: str(o, "campaign_id"),
    campaignName: str(o, "campaign_name"),
    joinerUserId: str(o, "joiner_user_id"),
    joinerName: str(o, "joiner_name"),
    joinerIsYoungPlayer: bool(o, "joiner_is_young_player"),
    childUserId: str(o, "child_user_id"),
    kind,
    dmName: nullableStr(o, "dm_name"),
    waitingOnOtherParent: bool(o, "waiting_on_other_parent"),
    createdAt: str(o, "created_at"),
  };
}

/** Parse the jsonb `get_family_campaigns` returns. Throws on any other shape. */
export function parseFamilyCampaigns(data: unknown): FamilyCampaigns {
  const o = asObject(data, "the response");
  return {
    children: asArray(o.children, "children").map(parseChild),
    requests: asArray(o.requests, "requests").map(parseRequest),
  };
}

// ── Error copy ───────────────────────────────────────────────────────────────

export type FamilyAction = "decide" | "remove";

// Both RPCs raise 'Not authorized', meaning different things, so the copy is
// chosen by what the parent was doing.
const RPC_ERROR_MESSAGES: Record<FamilyAction, Record<string, string>> = {
  decide: {
    "Not authorized": "That isn't yours to decide. It belongs to one of the other parents.",
    "Request not found": "That request is gone. Someone may have already answered it.",
  },
  remove: {
    "Not authorized": "You can't remove them from this table any more. Your young player may have come of age.",
    "The campaign's owner cannot be removed": "The person who runs a campaign can't be removed from it here.",
    "Campaign not found": "That campaign no longer exists.",
  },
};

/** An RPC's raise message as plain copy. Unknown messages get a generic line,
 *  never the raw database text. Read structurally: a PostgREST error is a
 *  plain object, not an Error. */
export function familyCampaignErrorMessage(err: unknown, action: FamilyAction): string {
  const message = typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
    ? err.message
    : null;
  return (message !== null ? RPC_ERROR_MESSAGES[action][message] : undefined) ?? "Something went wrong. Please try again.";
}

// ── Query and mutations ──────────────────────────────────────────────────────

/** The tables each young player is at, and the requests waiting on the parent. */
export function useFamilyCampaigns() {
  const auth = useAuthStore();
  const { data, isLoading, error } = useQuery({
    queryKey: FAMILY_CAMPAIGNS_QUERY_KEY,
    queryFn: async () => {
      const { data: raw, error: rpcError } = await supabase.rpc("get_family_campaigns");
      if (rpcError) throw rpcError;
      return parseFamilyCampaigns(raw);
    },
    enabled: computed(() => auth.user !== null),
  });

  const requests = computed(() => data.value?.requests ?? []);
  const tablesByChild = computed(
    () => new Map((data.value?.children ?? []).map((c) => [c.childUserId, c.campaigns])),
  );

  return { requests, tablesByChild, isLoading, error };
}

function parseDecision(data: unknown): JoinDecision {
  if (data === "joined" || data === "pending" || data === "declined") return data;
  throw new Error("Unexpected response from decide_campaign_join_request");
}

/** Approve or decline a join request. Refetches the page's read on success. */
export function useDecideJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, approve }: { requestId: string; approve: boolean }) => {
      const { data, error } = await supabase.rpc("decide_campaign_join_request", {
        p_request_id: requestId,
        p_approve: approve,
      });
      if (error) throw error;
      return parseDecision(data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: FAMILY_CAMPAIGNS_QUERY_KEY }),
  });
}

/** Take a member out of a campaign a young player is part of. */
export function useRemoveFromFamilyCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, userId }: { campaignId: string; userId: string }) => {
      const { error } = await supabase.rpc("remove_from_family_campaign", {
        p_campaign_id: campaignId,
        p_user_id: userId,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: FAMILY_CAMPAIGNS_QUERY_KEY }),
  });
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Whether the parent may remove `member` from `campaign`, mirroring the RPC:
 *  never the owner; the child themself anywhere; anyone else only at a table the
 *  child runs. The server re-checks; this only decides whether to show the button. */
export function canRemoveMember(
  campaign: FamilyCampaign,
  member: FamilyCampaignMember,
  childUserId: string,
): boolean {
  if (member.isOwner) return false;
  if (member.userId === childUserId) return true;
  return campaign.childRunsIt;
}

/** The toast for a request decision. */
export function decisionMessage(decision: JoinDecision, request: FamilyJoinRequest): string {
  if (decision === "declined") return "Request declined.";
  if (decision === "pending") return "Waiting for the other parent.";
  if (request.kind === "child_joining" || request.dmName === null) {
    return `${request.joinerName} can now join ${request.campaignName}.`;
  }
  return `${request.joinerName} can now join ${request.dmName}'s table.`;
}
