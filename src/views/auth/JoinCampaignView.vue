<template>
  <div>
    <!-- Pending: not yet authenticated -->
    <template v-if="!auth.isAuthenticated">
      <h2 class="text-heading-lg font-semibold text-foreground mb-1">
        You've been invited!
      </h2>
      <p class="text-body text-muted-foreground italic mb-6">
        Create an account or sign in to join the campaign.
      </p>

      <!-- Tab: signup / login. The selected tab used to be a neutral `bg-card`
           chip in a trough, held back through the #648 sweep on the theory that
           the gold `active` tint was wrong here. It is not — it is the app's one
           selected treatment, and three rival neutral versions were the whole
           problem. -->
      <SegmentedControl
        :model-value="activeTab"
        :options="AUTH_TABS"
        size="sm"
        block
        class="mb-6"
        @update:model-value="(v) => (activeTab = v)"
      />

      <!-- Login tab -->
      <form v-if="activeTab === 'login'" class="space-y-4" @submit.prevent="handleAuth">
        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="join-email">Email or login name</label>
          <AppInput
            id="join-email"
            v-model="identifier"
            type="text"
            size="body"
            autocomplete="username"
            required
            placeholder="wizard@faerûn.com"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="join-password">Password</label>
          <AppInput
            id="join-password"
            v-model="password"
            type="password"
            size="body"
            autocomplete="current-password"
            required
            placeholder="••••••••"
          />
        </div>

        <p v-if="authMessage" class="text-body text-elven-green">{{ authMessage }}</p>
        <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

        <CaptchaGate ref="captchaGate" />

        <AppButton
          type="submit"
          variant="primary"
          size="lg"
          block
          class="py-2.5"
          :disabled="auth.loading || !!authMessage"
          :label="auth.loading ? 'Entering the realm…' : 'Sign In & Join'"
        />
      </form>

      <!-- Signup tab, step 1: the age question, asked before anything else
           can be typed in — nothing about the answer is stored for an adult,
           only the under-16 branch below writes anything down (#919). -->
      <template v-else-if="signupStep === 'age'">
        <AgeQuestionStep
          button-class="py-2.5"
          @adult="signupStep = 'form'"
          @under16="signupStep = 'parent-request'"
        />
      </template>

      <!-- Signup tab, step 2a: under 16 — no self-signup, a parent sets the
           account up and is handed this invite to bring the child along.
           ParentRequestForm's own opening line explains why. -->
      <template v-else-if="signupStep === 'parent-request'">
        <ParentRequestForm :invite-token="token" />
      </template>

      <!-- Signup tab, step 2b: 16 or older — the ordinary signup form -->
      <form v-else class="space-y-4" @submit.prevent="handleAuth">
        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="join-display-name">Username</label>
          <AppInput
            id="join-display-name"
            v-model="displayName"
            type="text"
            size="body"
            autocomplete="username"
            required
            placeholder="Shadowmere"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="join-signup-email">Email</label>
          <AppInput
            id="join-signup-email"
            v-model="email"
            type="email"
            size="body"
            autocomplete="email"
            required
            placeholder="wizard@faerûn.com"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-body text-foreground" for="join-signup-password">Password</label>
          <AppInput
            id="join-signup-password"
            v-model="password"
            type="password"
            size="body"
            autocomplete="new-password"
            required
            minlength="8"
            placeholder="At least 8 characters"
          />
        </div>

        <p v-if="authMessage" class="text-body text-elven-green">{{ authMessage }}</p>
        <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

        <SignupConsent v-model="agreedToTerms" />

        <CaptchaGate ref="captchaGate" />

        <AppButton
          type="submit"
          variant="primary"
          size="lg"
          block
          class="py-2.5"
          :disabled="auth.loading || !!authMessage || !agreedToTerms"
          :label="auth.loading ? 'Creating your tome…' : 'Create Account & Join'"
        />
      </form>
    </template>

    <!-- Authenticated: joining in progress, or choosing a character first -->
    <template v-else>
      <div class="text-center py-4">
        <div v-if="joining || isDecidingAutoJoin" class="space-y-3">
          <div class="flex justify-center">
            <BannerLoader class="h-10" />
          </div>
          <p class="text-body text-muted-foreground italic">
            {{ joining ? "Joining the campaign…" : "Loading your characters…" }}
          </p>
        </div>

        <div v-else-if="waitingForParent" class="space-y-4" data-testid="join-waiting">
          <h2 class="text-heading font-semibold text-foreground">Almost there</h2>
          <p class="text-body text-muted-foreground italic">
            A parent needs to say yes before you can join this table. Once they do, it will appear in your campaigns.
          </p>
          <RouterLink
            to="/dashboard"
            class="inline-block mt-2 text-body text-primary underline hover:text-primary/80"
          >
            Go to your dashboard
          </RouterLink>
        </div>

        <div v-else-if="joinError" class="space-y-4">
          <p class="text-heading-lg font-semibold text-destructive">Invalid Invite</p>
          <p class="text-body text-muted-foreground italic">{{ joinError }}</p>
          <RouterLink
            to="/dashboard"
            class="inline-block mt-2 text-body text-primary underline hover:text-primary/80"
          >
            Go to your dashboard
          </RouterLink>
        </div>

        <div v-else-if="showChooser" class="text-left space-y-4">
          <div class="text-center">
            <h2 class="text-heading font-semibold text-foreground mb-1">Bring a character?</h2>
            <p class="text-body text-muted-foreground italic">
              Choose one of your characters to bring along, or join without one.
            </p>
          </div>

          <div class="space-y-2">
            <label
              v-for="pm in unattachedCharacters"
              :key="pm.id"
              class="flex items-start gap-2.5 cursor-pointer group"
            >
              <input
                v-model="selectedCharacterId"
                type="radio"
                :value="pm.id"
                class="mt-1 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
              />
              <div class="min-w-0">
                <span class="text-body text-foreground group-hover:text-primary transition-colors block truncate">
                  {{ pm.name }}
                </span>
                <span class="text-caption text-muted-foreground italic block truncate">
                  {{ pm.class || "Adventurer" }}{{ pm.level ? ` · Level ${pm.level}` : "" }} · {{ rulesetYear(pm.ruleset) }}
                </span>
              </div>
            </label>
            <label class="flex items-start gap-2.5 cursor-pointer group">
              <input
                v-model="selectedCharacterId"
                type="radio"
                value=""
                class="mt-1 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
              />
              <span class="text-body text-foreground group-hover:text-primary transition-colors">
                Join without a character
              </span>
            </label>
          </div>

          <AppButton
            variant="primary"
            size="md"
            block
            label="Join"
            :disabled="selectedCharacterId === null"
            @click="confirmChoice"
          />
        </div>
      </div>
    </template>

    <RulesetBounceDialog
      v-if="bounce"
      :character="bounce.character"
      :campaign-ruleset="bounce.campaignRuleset"
      :campaign-name="null"
      :bring="joinWithConvertedCopy"
      @close="bounce = null"
      @choose-another="chooseAnotherCharacter"
      @joined="bounce = null"
    />
  </div>
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { ref, computed, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useQueryClient } from "@tanstack/vue-query";
import { joinCampaignViaInvite, type JoinResult } from "@/composables/campaign/useCampaignMembers";
import { postgrestMessage } from "@/composables/campaign/chatSendErrors";
import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import { useCharacterPool } from "@/composables/party/useCharacterPool";
import { useModeSwitch } from "@/composables/useModeSwitch";
import { useToast } from "@/composables/useToast";
import { benchedMessage, useBenchedAfterAttach } from "@/composables/party/useBenchedAfterAttach";
import { usePlayerCampaigns } from "@/composables/campaign/useCampaigns";
import { wasAnsweredUnder16 } from "@/lib/ageGateSession";
import AppButton from "@/components/common/AppButton.vue";
import RulesetBounceDialog from "@/components/player/RulesetBounceDialog.vue";
import { parseRulesetBounce, rulesetYear } from "@/composables/party/useCharacterRuleset";
import { replayStartingGrants } from "@/composables/party/useCharacterEquipmentSeeding";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";
import AppInput from "@/components/common/AppInput.vue";
import SignupConsent from "@/components/auth/SignupConsent.vue";
import AgeQuestionStep from "@/components/auth/AgeQuestionStep.vue";
import ParentRequestForm from "@/components/auth/ParentRequestForm.vue";
import CaptchaGate from "@/components/auth/CaptchaGate.vue";
import { authErrorMessage, captchaSource } from "@/lib/auth/captcha";

const auth = useAuthStore();
const campaign = useCampaignStore();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { switchMode } = useModeSwitch();
const toast = useToast();
const { refetch: refetchCampaigns } = usePlayerCampaigns();
// One ref for both forms: only one of the two tabs is mounted at a time.
const captcha = captchaSource(useTemplateRef<InstanceType<typeof CaptchaGate>>("captchaGate"));

const token = route.params.token as string;
const AUTH_TABS = [
  { value: "signup", label: "New Account" },
  { value: "login", label: "Sign In" },
] as const satisfies readonly SegmentedOption<string>[];

const activeTab = ref<"signup" | "login">("signup");

// Signup tab: the age question, asked before anything else (#919). Skips
// straight to the parent-request branch if this browser session already
// answered "under 16" — same rule as SignupView, and the same session key, so
// switching between /signup and a join link can't be used to re-answer it.
type SignupStep = "age" | "parent-request" | "form";
const signupStep = ref<SignupStep>(wasAnsweredUnder16() ? "parent-request" : "age");

// Login tab: email or a child's login name (#919) — auth.signIn maps it.
// Kept separate from the signup tab's `email`, which is always a real address.
const identifier = ref("");
const displayName = ref("");
const email = ref("");
const password = ref("");
const agreedToTerms = ref(false);
const errorMessage = ref("");
const authMessage = ref("");
const joining = ref(false);
const joinError = ref("");
const decidingJoin = ref(false);
// A join that involves a young player waits for a parent's yes; no membership
// exists yet, so this is a resting state rather than a redirect.
const waitingForParent = ref(false);

// #730: characters are durable and campaign-agnostic until attached — only
// ones with no campaign yet can be brought along here.
const myCharactersQuery = useCharacterPool();
const unattachedCharacters = computed(() =>
  (myCharactersQuery.data.value ?? []).filter((pm) => pm.campaign_id === null),
);

// Transient chooser state — never the ui store, this view never reopens with
// a stale selection. null = nothing picked yet; "" = "join without one".
const selectedCharacterId = ref<string | null>(null);
const hasChosen = ref(false);

const showChooser = computed(
  () =>
    !joining.value &&
    !joinError.value &&
    !waitingForParent.value &&
    (!hasChosen.value || bounce.value !== null) &&
    !myCharactersQuery.isPending.value &&
    unattachedCharacters.value.length > 0,
);

// True only while we're still finding out whether a chooser is even needed —
// keeps the zero-character path looking the same as a plain auto-join.
const isDecidingAutoJoin = computed(() => !hasChosen.value && decidingJoin.value);

// A table that does not take the chosen character's edition (#943). Not an
// invalid invite: the player is offered a converted copy, or another character.
// The edition comes from the refusal itself, since a non-member cannot read the
// campaign row before joining.
const bounce = ref<{ character: PartyMember; campaignRuleset: RulesetKey } | null>(null);

async function attemptJoin(partyMemberId?: string) {
  joining.value = true;
  joinError.value = "";
  try {
    await finishJoin(await joinCampaignViaInvite(token, partyMemberId), partyMemberId);
  } catch (err) {
    const refused = parseRulesetBounce(err);
    const refusedCharacter = unattachedCharacters.value.find((pm) => pm.id === partyMemberId);
    if (refused && refusedCharacter) {
      bounce.value = { character: refusedCharacter, campaignRuleset: refused.campaignRuleset };
      joining.value = false;
      return;
    }
    joinError.value = postgrestMessage(err) ?? "This invite link is invalid or has expired.";
    joining.value = false;
  }
}

// The dialog's way in once the copy exists. Throws, so the dialog can say so.
async function joinWithConvertedCopy(partyMemberId: string) {
  await finishJoin(await joinCampaignViaInvite(token, partyMemberId), partyMemberId);
}

function chooseAnotherCharacter() {
  bounce.value = null;
  joinError.value = "";
  selectedCharacterId.value = null;
  hasChosen.value = false;
}

// A character brought along may have been benched by the table's approval
// review, which runs inside the join. Say so on the way in, since the player
// would otherwise arrive at a table where "Set Active" quietly does nothing.
const { waitingAfterAttach } = useBenchedAfterAttach();

async function tellIfBenched(partyMemberId: string, table: string | null) {
  try {
    const waiting = await waitingAfterAttach(partyMemberId);
    if (waiting === 0) return;
    toast.info(benchedMessage(null, table, waiting));
  } catch (err) {
    toast.error(toast.fromError(err));
  }
}

async function finishJoin(result: JoinResult, partyMemberId?: string) {
  if (result.status === "pending") {
    waitingForParent.value = true;
    joining.value = false;
    await notifyParents(result.requestId);
    return;
  }
  const campaignId = result.campaignId;
  // The character arrives with the starting equipment it was made with; the
  // table is where it goes (#973). The join already succeeded, so a failure here
  // is said out loud and the player carries on (the equipment waits for a retry).
  if (partyMemberId) {
    try {
      await replayStartingGrants(partyMemberId, campaignId, queryClient);
    } catch (err) {
      toast.error(toast.fromError(err, "You joined, but your starting equipment couldn't be added."));
    }
  }
  // Preserve the current DM campaign in its per-mode slot before activating
  // the joined campaign. When already in player mode, the explicit cache
  // invalidation still exposes the newly-created membership immediately.
  await switchMode("player", { navigate: false });
  await queryClient.invalidateQueries();
  await auth.refreshMembership(campaignId);

  // Hydrate the whole campaign row. Assigning only activeCampaignId can
  // leave the previous mode's theme, calendar and BYOK-bearing object alive.
  const { data: freshCampaigns } = await refetchCampaigns();
  const joined = freshCampaigns?.find((c) => c.id === campaignId) ?? null;
  if (joined) {
    campaign.switchToCampaign(joined);
  } else {
    campaign.clearActiveCampaign();
    campaign.activeCampaignId = campaignId;
  }
  await router.replace({ name: "play" });
  if (partyMemberId) await tellIfBenched(partyMemberId, joined?.name ?? null);
}

// Emails the parents. A failure must not break the page: the request already
// exists and shows in the parents' family view, so report it and move on.
async function notifyParents(requestId: string) {
  try {
    const { error } = await supabase.functions.invoke("notify-join-request", {
      body: { request_id: requestId },
    });
    if (error) throw error;
  } catch (err) {
    reportHandledError(err, "JoinCampaignView.notifyParents", { requestId });
  }
}

function confirmChoice() {
  if (selectedCharacterId.value === null) return;
  hasChosen.value = true;
  attemptJoin(selectedCharacterId.value || undefined);
}

async function handleAuth() {
  errorMessage.value = "";
  authMessage.value = "";
  try {
    if (activeTab.value === "signup") {
      if (!agreedToTerms.value) {
        errorMessage.value = "Please accept the Terms of Service and Privacy Policy to continue.";
        return;
      }
      await auth.signUp({
        email: email.value,
        password: password.value,
        captcha,
        displayName: displayName.value.trim() || undefined,
        redirectTo: window.location.href,
      });
      authMessage.value = "Check your email to confirm. The link brings you straight back here to join.";
    } else {
      await auth.signIn(identifier.value, password.value, captcha);
      // onAuthStateChange will fire → watch(isAuthenticated) below decides
    }
  } catch (err) {
    errorMessage.value = authErrorMessage(err, "Authentication failed. Please try again.");
  }
}

// Once authenticated (via sign-in tab, or already logged in on mount) and the
// character pool has loaded, auto-join only when there is nothing to choose
// from — otherwise the chooser above takes over and the player picks first.
async function decideHowToJoin() {
  if (!auth.user?.id || hasChosen.value || joining.value || decidingJoin.value) return;
  decidingJoin.value = true;
  try {
    // refetch() also works when the query was initially disabled while auth
    // initialized, avoiding TanStack's disabled-query isPending limbo.
    const result = await myCharactersQuery.refetch();
    if (result.error) {
      joinError.value = "Couldn't load your characters. Please try again.";
      return;
    }
    if ((result.data ?? []).every((pm) => pm.campaign_id !== null)) {
      await attemptJoin();
    }
  } finally {
    decidingJoin.value = false;
  }
}

watch(() => auth.user?.id, () => { void decideHowToJoin(); }, { immediate: true });
</script>
