import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

/**
 * What a seated character has that its table has not approved (#943, wave 4).
 *
 * Content works the way the edition does: a player builds what they like, and
 * the table decides what sits down. A character that arrives with a choice the
 * table has not approved still joins, but **benched**: one row here per choice,
 * and it cannot be made anyone's active character while one is pending. The
 * player changes the choice or the DM approves it.
 *
 * The rows are written only by the database (the review that runs when a
 * character's choices or a table's approvals change, and the approval RPC).
 * This module reads them, and holds the words both sides are told, so the
 * player's notice and the DM's queue cannot describe the same flag differently.
 */

export type ContentKind = "species" | "background" | "class" | "subclass" | "spell" | "feat";

/**
 * Why the table has not approved it:
 * - `source`: a library entry from a book the table has not enabled.
 * - `blocked`: the table blocked this species or class.
 * - `homebrew`: the player's own content, whatever book it says it is from. A
 *   row's claims about itself are not trusted (anyone can write anything into
 *   their own row), so it is the DM's to approve.
 * - `foreign`: somebody else's content, made at another table. It cannot be
 *   approved here (approving would copy that person's work without them), is
 *   never named or shown, and has to be changed.
 * - `missing`: it points at something that no longer exists. It cannot be
 *   approved, only removed from the character.
 */
export type ContentReviewReason = "source" | "blocked" | "homebrew" | "foreign" | "missing";

export interface CharacterContentReview {
  id: string;
  campaign_id: string;
  party_member_id: string;
  kind: ContentKind;
  /** What the character points at: a library slug, a content row's uuid, or `system:<class name>`. */
  ref: string;
  /** Its name when flagged. */
  label: string;
  reason: ContentReviewReason;
  source_slug: string | null;
  source_title: string | null;
  /** `approved` is the DM allowing it for this character; it no longer benches anyone. */
  status: "pending" | "approved";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

/** How far an approval reaches: this character only, or everyone at the table. */
export type ApprovalScope = "character" | "table";

export const CONTENT_REVIEWS_KEY = "character-content-reviews";

const KIND_LABELS: Record<ContentKind, string> = {
  species: "Species",
  background: "Background",
  class: "Class",
  subclass: "Subclass",
  spell: "Spell",
  feat: "Feat",
};

export function contentKindLabel(kind: ContentKind): string {
  return KIND_LABELS[kind];
}

/** The flags that still bench the character. */
export function pendingReviews(reviews: readonly CharacterContentReview[] | undefined): CharacterContentReview[] {
  return (reviews ?? []).filter((review) => review.status === "pending");
}

/** The book a flag names, or the plain word when the table only gave a key. */
function bookName(review: CharacterContentReview): string {
  return review.source_title ?? review.source_slug ?? "another book";
}

/**
 * Why a choice is waiting, as one sentence that is true for whoever reads it:
 * the player and the DM are shown the same words.
 */
export function reviewReasonText(review: CharacterContentReview): string {
  switch (review.reason) {
    case "source":
      return `From ${bookName(review)}, which this table has not enabled.`;
    case "blocked":
      return "This table has blocked it.";
    case "homebrew":
      return "The player's own content, which this table does not have.";
    case "foreign":
      return "Made at another table. It cannot be approved here and has to be changed.";
    case "missing":
      return "It no longer exists, so it has to be removed from the character.";
  }
}

/**
 * Whether a flag can only be cleared by taking the choice off the character.
 * Its owner and the table's DM may both do that (`useRemoveMissingContent`).
 */
export function isRemovalOnly(review: CharacterContentReview): boolean {
  return review.reason === "missing";
}

export interface ApprovalOption {
  scope: ApprovalScope;
  label: string;
  /** What approving does, for the DM deciding. */
  effect: string;
}

/**
 * What the DM may approve. Empty for `foreign` (the player has to change the
 * choice) and for `missing` (there is nothing to approve; see `isRemovalOnly`).
 */
export function approvalOptions(review: CharacterContentReview): ApprovalOption[] {
  switch (review.reason) {
    case "source":
      return [
        { scope: "character", label: "Allow for this character", effect: "Only this character may use it." },
        {
          scope: "table",
          label: `Enable ${bookName(review)}`,
          effect: "Everyone at the table may use this book from now on.",
        },
      ];
    case "blocked":
      return [
        { scope: "character", label: "Allow for this character", effect: "It stays blocked for everyone else." },
        { scope: "table", label: "Unblock for the table", effect: "Everyone at the table may pick it again." },
      ];
    case "homebrew":
      return [
        {
          scope: "character",
          label: "Approve",
          effect: "A copy is added to your table's content, which you can edit. The player's original is not changed.",
        },
      ];
    case "foreign":
    case "missing":
      return [];
  }
}

/**
 * SQLSTATE raised when someone tries to make a flagged character an active one.
 * A code of this app's own, like the edition bounce's RS001.
 */
export const APPROVAL_WAIT_CODE = "CR001";

export function isApprovalWait(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === APPROVAL_WAIT_CODE;
}

/**
 * SQLSTATE raised when the DM approves a player's own content after looking at
 * it, and the player has changed the row since. A player's row stays theirs to
 * edit, so without this they could show one thing and have another copied.
 */
export const CHANGED_SINCE_SEEN_CODE = "CR002";

export function isChangedSinceSeen(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === CHANGED_SINCE_SEEN_CODE;
}

async function fetchReviewsForCharacter(partyMemberId: string): Promise<CharacterContentReview[]> {
  const { data, error } = await supabase
    .from("character_content_reviews")
    .select("*")
    .eq("party_member_id", partyMemberId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CharacterContentReview[];
}

async function fetchPendingReviewsForCampaign(campaignId: string): Promise<CharacterContentReview[]> {
  const { data, error } = await supabase
    .from("character_content_reviews")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CharacterContentReview[];
}

/** Every flag on one character, approved ones included. */
export function useCharacterContentReviews(partyMemberId: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [CONTENT_REVIEWS_KEY, "character", toValue(partyMemberId)] as const),
    queryFn: ({ queryKey: [, , id] }) => {
      if (!id) throw new Error("useCharacterContentReviews fetched without a character");
      return fetchReviewsForCharacter(id);
    },
    enabled: () => !!toValue(partyMemberId),
  });
}

/**
 * What is waiting at the active table. For the DM this is the whole queue; RLS
 * shows a player only the flags on their own characters.
 */
export function useCampaignPendingContentReviews() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CONTENT_REVIEWS_KEY, "campaign", campaign.activeCampaignId] as const),
    queryFn: ({ queryKey: [, , id] }) => {
      if (!id) throw new Error("useCampaignPendingContentReviews fetched without a campaign");
      return fetchPendingReviewsForCampaign(id);
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

// An approval can re-point the character at a copy, enable a book, lift a
// block and fill a seat, so most of what renders a character or the table's
// content is stale after one.
const STALE_AFTER_APPROVAL = [
  CONTENT_REVIEWS_KEY, "party", "my-characters", "character-pool", "campaign-members", "my-memberships",
  "character_classes", "character_spells", "enabled-sources", "campaigns",
  "species", "backgrounds", "custom_classes", "custom_subclasses", "spells", "class_features",
  "library-species", "library-spells",
] as const;

/**
 * The DM clears one flag. Resolves to how many the character still has pending.
 *
 * `seenUpdatedAt` is the `updated_at` of the item as the DM saw it in the view
 * dialog. Pass it when approving after looking: the approval is then refused
 * (`isChangedSinceSeen`) if the player has edited the row since. Leave it out
 * when the DM approves without opening it, which is their call to make.
 */
export function useApproveCharacterContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reviewId: string;
      scope: ApprovalScope;
      seenUpdatedAt?: string;
    }): Promise<number> => {
      const { data, error } = await supabase.rpc("approve_character_content", {
        p_review_id: input.reviewId,
        p_scope: input.scope,
        // The RPC reads null as "approved without looking".
        p_seen_updated_at: input.seenUpdatedAt === undefined ? null : input.seenUpdatedAt,
      });
      if (error) throw error;
      if (typeof data !== "number") throw new Error("The approval came back without a count.");
      return data;
    },
    onSuccess: () => {
      for (const key of STALE_AFTER_APPROVAL) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

/**
 * Takes a reference to something that no longer exists off the character.
 * Resolves to how many flags the character still has pending.
 */
export function useRemoveMissingContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reviewId: string): Promise<number> => {
      const { data, error } = await supabase.rpc("remove_missing_character_content", { p_review_id: reviewId });
      if (error) throw error;
      if (typeof data !== "number") throw new Error("The removal came back without a count.");
      return data;
    },
    onSuccess: () => {
      for (const key of STALE_AFTER_APPROVAL) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
}

/**
 * What a flag is about. The DM cannot read a player's own content through RLS,
 * so this goes through an RPC that is reachable only by way of a flag at the
 * caller's own table. The shape depends on the kind, so it is a plain record.
 * Null for a `foreign` or `missing` flag: another person's content is never
 * shown, and there is nothing to show for something that is not there.
 */
export function useCharacterContentItem(reviewId: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [CONTENT_REVIEWS_KEY, "item", toValue(reviewId)] as const),
    queryFn: async ({ queryKey: [, , id] }): Promise<Record<string, unknown> | null> => {
      if (!id) throw new Error("useCharacterContentItem fetched without a flag");
      const { data, error } = await supabase.rpc("get_character_content_item", { p_review_id: id });
      if (error) throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
    enabled: () => !!toValue(reviewId),
  });
}
