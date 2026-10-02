<template>
  <!--
    What is waiting on the DM (#943, wave 4). A character joins a table with
    whatever its player built, but one with a choice the table has not approved
    is benched: it cannot be made anyone's active character until the DM decides
    or the player changes the choice. Without this the DM would only learn of it
    from a player asking why their character will not play.
  -->
  <section
    v-if="groups.length > 0"
    class="rounded-lg border border-border bg-card p-4 space-y-3"
    aria-labelledby="character-approval-queue-title"
  >
    <div class="space-y-2">
      <h2 id="character-approval-queue-title" class="font-cinzel text-sm font-semibold text-foreground">
        Waiting for your approval
      </h2>
      <CautionNotice class="text-caption">
        A character with something here has joined, but it stays benched until you decide, or until its player
        changes the choice.
      </CautionNotice>
    </div>

    <div v-for="group in groups" :key="group.characterId" class="space-y-2" data-testid="approval-group">
      <h3 class="font-cinzel text-xs font-semibold text-foreground">{{ group.heading }}</h3>
      <ul class="space-y-2">
        <li
          v-for="review in group.reviews"
          :key="review.id"
          class="rounded-md border border-border px-3 py-2 space-y-2"
          data-testid="approval-flag"
        >
          <div class="min-w-0">
            <p class="text-body text-foreground">
              <span class="text-caption text-muted-foreground uppercase tracking-wide mr-1.5">{{
                contentKindLabel(review.kind)
              }}</span>
              <span class="font-semibold">{{ review.label }}</span>
            </p>
            <p class="text-caption text-muted-foreground">{{ reviewReasonText(review) }}</p>
          </div>

          <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
            <!--
              View only where there is something to read: another table's content
              is never shown, and a missing choice has none. First in the row, so
              looking comes before approving: an approval made from the dialog
              is the one that is refused if the player edits the row meanwhile.
            -->
            <AppButton
              v-if="review.reason === 'homebrew'"
              variant="subtle"
              size="sm"
              label="View"
              :disabled="busyId !== null"
              @click="viewing = review"
            />
            <div v-for="option in approvalOptions(review)" :key="option.scope" class="max-w-xs space-y-1">
              <AppButton
                :variant="option.scope === 'table' ? 'subtle' : 'primary'"
                size="sm"
                :label="option.label"
                :loading="busyId === review.id"
                :disabled="busyId !== null"
                @click="decide(review, option)"
              />
              <p class="text-caption text-muted-foreground">{{ option.effect }}</p>
            </div>
            <div v-if="isRemovalOnly(review)" class="max-w-xs space-y-1">
              <AppButton
                variant="subtle"
                size="sm"
                label="Remove from character"
                :loading="busyId === review.id"
                :disabled="busyId !== null"
                @click="remove(review)"
              />
              <p class="text-caption text-muted-foreground">
                It points at nothing. Removing it changes nothing the character can use.
              </p>
            </div>
            <p v-if="review.reason === 'foreign'" class="text-caption text-muted-foreground">
              Only its player can change this.
            </p>
          </div>
        </li>
      </ul>
    </div>

    <CharacterContentItemDialog
      :open="viewing !== null"
      :review="viewing"
      @close="viewing = null"
      @approve="approveFromDialog"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/AppButton.vue";
import CautionNotice from "@/components/common/CautionNotice.vue";
import CharacterContentItemDialog from "@/components/campaign/CharacterContentItemDialog.vue";
import {
  CONTENT_REVIEWS_KEY,
  approvalOptions,
  contentKindLabel,
  isChangedSinceSeen,
  isRemovalOnly,
  reviewReasonText,
  useApproveCharacterContent,
  useRemoveMissingContent,
  useCampaignPendingContentReviews,
  type ApprovalOption,
  type ApprovalScope,
  type CharacterContentReview,
} from "@/composables/party/useCharacterContentReviews";
import { useParty } from "@/composables/party/useParty";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";

const pendingQuery = useCampaignPendingContentReviews();
const partyQuery = useParty();
const approve = useApproveCharacterContent();
const removeMissing = useRemoveMissingContent();
const queryClient = useQueryClient();
const { confirm } = useConfirm();
const toast = useToast();

/** The flag a decision is running for; its buttons load and every other one waits. */
const busyId = ref<string | null>(null);
const viewing = ref<CharacterContentReview | null>(null);

interface Group {
  characterId: string;
  heading: string;
  reviews: CharacterContentReview[];
}

const groups = computed<Group[]>(() => {
  const names = new Map((partyQuery.data.value ?? []).map((member) => [member.id, member.name]));
  const byCharacter = new Map<string, Group>();
  for (const review of pendingQuery.data.value ?? []) {
    let group = byCharacter.get(review.party_member_id);
    if (!group) {
      // The party list can lag the queue by a moment; a neutral heading beats a blank.
      group = {
        characterId: review.party_member_id,
        heading: names.get(review.party_member_id) ?? "A character at your table",
        reviews: [],
      };
      byCharacter.set(review.party_member_id, group);
    }
    group.reviews.push(review);
  }
  return [...byCharacter.values()];
});

function characterName(review: CharacterContentReview): string {
  return groups.value.find((group) => group.characterId === review.party_member_id)?.heading ?? "the character";
}

/** Naming the reach is the point: "for everyone" is a different decision from "for this character". */
function tableConfirmation(review: CharacterContentReview): { message: string; title: string; confirmLabel: string } {
  const book = review.source_title ?? review.source_slug ?? "this book";
  if (review.reason === "blocked") {
    return {
      title: `Unblock ${review.label} for the table?`,
      message: `${review.label} is no longer blocked for anyone at this table. Every player may pick it again.`,
      confirmLabel: "Unblock",
    };
  }
  return {
    title: `Enable ${book} for the table?`,
    message: `${book} becomes available to everyone at this table, not only ${characterName(review)}. Every character that was waiting on it is cleared.`,
    confirmLabel: "Enable",
  };
}

async function decide(review: CharacterContentReview, option: ApprovalOption, seenUpdatedAt?: string) {
  if (busyId.value !== null) return;
  if (option.scope === "table") {
    const { message, ...options } = tableConfirmation(review);
    if (!(await confirm(message, { ...options, danger: false }))) return;
  }
  busyId.value = review.id;
  try {
    const remaining = await approve.mutateAsync({ reviewId: review.id, scope: option.scope, seenUpdatedAt });
    const done =
      option.scope === "table"
        ? `${review.label} is now approved for the whole table.`
        : `${review.label} is approved for ${characterName(review)}.`;
    succeed(review, done, remaining);
  } catch (error) {
    if (isChangedSinceSeen(error)) {
      // The player edited it after the DM opened it. Show the DM the new one;
      // the dialog stays open on purpose.
      void queryClient.invalidateQueries({ queryKey: [CONTENT_REVIEWS_KEY, "item"] });
      toast.error(`${review.label} was changed after you opened it. Look again before approving.`);
    } else {
      toast.error(toast.fromError(error));
    }
  } finally {
    busyId.value = null;
  }
}

function succeed(review: CharacterContentReview, done: string, remaining: number) {
  const name = characterName(review);
  toast.success(remaining === 0 ? `${done} ${name} can now be made active.` : done);
  viewing.value = null;
}

/** Nothing to approve: the choice points at something gone, so it comes off the character. */
async function remove(review: CharacterContentReview) {
  if (busyId.value !== null) return;
  busyId.value = review.id;
  try {
    const remaining = await removeMissing.mutateAsync(review.id);
    succeed(review, `Removed from ${characterName(review)}.`, remaining);
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    busyId.value = null;
  }
}

function approveFromDialog(scope: ApprovalScope, seenUpdatedAt: string | undefined) {
  const review = viewing.value;
  if (!review) return;
  const option = approvalOptions(review).find((candidate) => candidate.scope === scope);
  if (option) void decide(review, option, seenUpdatedAt);
}
</script>
