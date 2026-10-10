import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { supabase, setCachedUser, readStoredSession } from "@/lib/supabase";
import { setErrorTrackingUser } from "@/lib/observability/sentry";
import { TERMS_VERSION } from "@/lib/legal";
import { signInEmail } from "@edge-shared/childAccount.ts";
import { CHILD_ACCOUNT_COLUMNS, isActiveChildLink } from "@/lib/childAccount";
import { accountLabel } from "@/lib/accountLabel";
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from "@/lib/authSnapshot";
import {
  isAuthRetryableFetchError,
  type AuthChangeEvent,
  type Session,
  type User,
} from "@supabase/supabase-js";
import type { CaptchaSource } from "@/lib/auth/captcha";
import type { CampaignMember, CampaignRole } from "@/types/campaign.types";
import type { ChildAccountLink } from "@/types/childAccount.types";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

/**
 * How long a boot waits on a token refresh before it starts on the stored
 * session. A refresh on a working network answers in well under a second;
 * waiting longer only keeps a phone whose radio is still coming up on the
 * splash, because auth-js retries a failing refresh for up to 30 seconds.
 */
const BOOT_SESSION_WAIT_MS = 4_000;

/**
 * The session a boot starts on, and the refresh it may still be waiting for.
 *
 * `getSession()` answers `session: null` both when nobody is signed in and when
 * the access token expired and the refresh could not reach the server. The boot
 * used to treat both as signed out, so a phone opened with its radio still
 * waking up landed on the login page with a perfectly good session on disk,
 * and signing in again was the only way back. A refresh that is slow or failed
 * for want of a network now starts the app on the stored session instead (see
 * persistedSession.ts): reads wait on the refresh or are refused by
 * `authAwareFetch` until it lands, and main.ts refetches on TOKEN_REFRESHED.
 * A refresh the server actually rejects still answers null, and signs out.
 */
async function bootSession(): Promise<{ session: Session | null; loaded: ReturnType<typeof supabase.auth.getSession> }> {
  const loaded = supabase.auth.getSession();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<"slow">((resolve) => {
    timer = setTimeout(() => resolve("slow"), BOOT_SESSION_WAIT_MS);
  });
  const first = await Promise.race([loaded, slow]);
  clearTimeout(timer);

  if (first === "slow") {
    return { session: readStoredSession() ?? (await loaded).data.session, loaded };
  }
  if (first.data.session) return { session: first.data.session, loaded };
  if (first.error && isAuthRetryableFetchError(first.error)) {
    return { session: readStoredSession(), loaded };
  }
  return { session: null, loaded };
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  const membership = ref<CampaignMember | null>(null);
  const username = ref<string | null>(null);
  // Parent-managed child account link (#919). `childLinkLoaded` is distinct
  // from "isLoading": it stays false across a failed lookup (see
  // `loadChildLink`) so a gate reading it can tell "confirmed not a child"
  // from "unknown, don't act yet" — the same distinction `isAppAdmin` doesn't
  // need, because a stale-false admin check merely hides an admin control,
  // while a stale-false child check would show AI/billing UI to a child.
  const childLink = ref<ChildAccountLink | null>(null);
  const childLinkLoaded = ref(false);

  const isAuthenticated = computed(() => !!user.value);
  const userEmail = computed(() => user.value?.email ?? null);

  // Tag error reports with the account id (#644) — never the email; see
  // `setErrorTrackingUser`. Watched rather than set at each assignment to
  // `user`: there are four of them, and only two go through setCachedUser, so
  // a hand-placed call would eventually miss one and quietly report a
  // signed-out user as still signed in.
  watch(user, (current) => setErrorTrackingUser(current?.id ?? null), { immediate: true });

  /**
   * What to call this user in front of *other people* — chat messages, presence,
   * member lists, exported bundles. Null when nothing suitable is known; each
   * call site picks its own placeholder, because "Unknown", "Someone" and an
   * empty presence slot are genuinely different answers.
   *
   * Never the email (#635). Four surfaces had independently written
   * `membership?.display_name ?? userEmail`, and one of them
   * (CampaignChat.resolveClaimerName) even split the address at `@` first — which
   * publishes the local part rather than fixing anything, the same laundering
   * #636 made possible by defaulting usernames to that local part. Anything that
   * answers "what do the others see me as" resolves it here, so there is one
   * place to be wrong.
   *
   * `userEmail` stays available for showing a user their *own* address on the
   * account page — but never bare, since a child account's own "email" is an
   * internal marker (#919); see `accountLabel` below for that one.
   */
  const publicName = computed<string | null>(
    () => membership.value?.display_name?.trim() || username.value?.trim() || null,
  );
  /**
   * What to call the signed-in account in the app's own chrome (sidebar menu,
   * account settings) — prefers a display name/username exactly like
   * `publicName` above, and falls back to the account's own email *unless*
   * it's a child account's internal marker address, in which case it falls to
   * the child's login name instead (#919). See `accountLabel`'s own docblock
   * for why this never leaks the marker address even mid-load.
   */
  const accountDisplayLabel = computed<string>(() =>
    accountLabel({
      displayName: membership.value?.display_name,
      username: username.value,
      email: userEmail.value,
      childLoginName: childLink.value?.login_name,
    }),
  );
  const isAppAdmin = computed(
    () => user.value?.app_metadata?.["role"] === "admin",
  );
  /**
   * Whether the signed-in account is a parent-managed child account right now
   * (#919). An identity fact, loaded alongside membership/username rather than
   * behind a `useQuery` composable: a Pinia setup store's own computed cannot
   * open a TanStack query (no injection context outside a mounted app — every
   * store test in this repo, including this file's own, builds the store
   * without one), so `campaign.isAiEnabled` needs this to live here instead.
   * `useChildAccount()` is now a thin reader over these two refs.
   *
   * This is presentation only, same as `useChildAccount`'s original docblock:
   * the boundary is the server (`private.is_child_account` behind the spend
   * gate and `is_user_pro`, and the edge functions' account gate), so a stale
   * `false` here shows a button that then refuses, never a feature that works.
   */
  const isChildAccount = computed(
    () => childLink.value !== null && isActiveChildLink(childLink.value),
  );
  const currentRole = computed<CampaignRole | null>(
    () => membership.value?.role ?? null,
  );
  const isDM = computed(() => currentRole.value === "dm");
  const isPlayer = computed(() => currentRole.value === "player");
  const linkedPartyMemberId = computed(
    () => membership.value?.party_member_id ?? null,
  );

  /**
   * True when a read that was sent for `userId` comes back after a different
   * account has signed in. Its answer is then somebody else's and must not
   * land in the refs, from where the snapshot watcher would save it under the
   * new account's id.
   */
  function answersAnotherAccount(userId: string): boolean {
    return user.value !== null && user.value.id !== userId;
  }

  /**
   * Call before assigning a different user. Membership, username and the child
   * link describe one account; left in place across a switch that skipped
   * sign-out (a recovery or invite link opened while someone else is signed
   * in), they are read as the new account's until its own reads land, and the
   * watcher below would persist them under its id. The dangerous one is the
   * child link: a previous adult's "confirmed not a child" would show AI and
   * billing UI to a child, on this boot and on the next one from the snapshot.
   * A repeat of the same user (tab focus, a token refresh) keeps everything.
   */
  function resetIdentityFor(nextUserId: string) {
    if (user.value?.id === nextUserId) return;
    membership.value = null;
    username.value = null;
    childLink.value = null;
    childLinkLoaded.value = false;
    clearAuthSnapshot();
  }

  /** Resolves true only when the read answered; a failed or stale one is false. */
  async function loadUsername(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .single();
    if (answersAnotherAccount(userId)) return false;
    // A failed read must not read as "no username": the boot now revalidates a
    // snapshot in the background, and an offline failure would blank a good value.
    if (error) {
      console.error("Failed to load username:", error);
      return false;
    }
    username.value = data?.username ?? null;
    return true;
  }

  /**
   * Loads this account's own `child_accounts` row (RLS lets a child read it).
   * On error, deliberately leaves `childLinkLoaded` exactly as it was rather
   * than setting it true: a failed *first* load must not read as "confirmed
   * not a child" (the gates below treat unloaded as unknown, not as false),
   * and a failed *refetch* must not erase an already-known-good link. Logged
   * rather than thrown so it never breaks sign-in — the same reasoning
   * `loadMembership`/`loadUsername` already apply by swallowing their own
   * errors into a null default, made explicit here because "leave it alone"
   * needs a comment where "default to null" does not.
   */
  async function loadChildLink(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("child_accounts")
      .select(CHILD_ACCOUNT_COLUMNS)
      .eq("child_user_id", userId)
      .maybeSingle();
    if (answersAnotherAccount(userId)) return false;
    if (error) {
      console.error("Failed to load child-account link:", error);
      return false;
    }
    childLink.value = data as ChildAccountLink | null;
    childLinkLoaded.value = true;
    return true;
  }

  async function loadMembership(userId: string, campaignId?: string): Promise<boolean> {
    let query = supabase
      .from("campaign_members")
      .select("*")
      .eq("user_id", userId);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    } else {
      query = query.order("joined_at", { ascending: true }).limit(1);
    }

    const { data, error } = await query.maybeSingle();
    if (answersAnotherAccount(userId)) return false;
    // Same as loadUsername: an error leaves the current value alone, and skips
    // the display-name backfill below (there is no row to backfill). But only a
    // value that answers THIS question may stay. After a campaign switch the
    // loaded row is the previous campaign's, and keeping it would leave
    // `isDM` / `currentRole` / `linkedPartyMemberId` reporting that campaign's
    // role while another one is active, so a failed read for a named campaign
    // drops a row that belongs to a different one.
    if (error) {
      console.error("Failed to load campaign membership:", error);
      if (campaignId && membership.value && membership.value.campaign_id !== campaignId) {
        membership.value = null;
      }
      return false;
    }
    membership.value = data ?? null;

    // Backfill display_name on first login, from the display name supplied at
    // signup or the profile handle — never the email (#635).
    //
    // This is the third writer of campaign_members.display_name, alongside
    // create_dm_membership() and join_campaign_via_invite(). The issue named
    // only the two SQL ones; fixing those and leaving this would have let the
    // address back in on the next login of any member whose row has no display
    // name, which is exactly the row this branch exists to catch.
    if (data && !data.display_name) {
      const u = user.value ?? session.value?.user;
      const metaName = (
        u?.user_metadata?.display_name as string | undefined
      )?.trim();
      // initialize() runs loadUsername alongside this function, so username.value
      // is not reliably populated yet — resolve it here rather than racing it and
      // silently settling for the placeholder. Only on the rare branch where a
      // membership has no display name at all, so the common path stays parallel.
      if (!metaName && !username.value) await loadUsername(userId);
      const fallback = metaName || username.value || "(unnamed player)";
      await supabase
        .from("campaign_members")
        .update({ display_name: fallback })
        .eq("id", data.id);
      membership.value = { ...data, display_name: fallback };
    }
    return true;
  }

  /**
   * The identity trio most recently requested, and when. A sign-in or boot that
   * has just loaded it makes the SIGNED_IN / TOKEN_REFRESHED that follows a few
   * milliseconds later redundant (auth-js emits one right after getSession()
   * and after signInWithPassword), so the listener asks `identityIsFresh`
   * before reloading. Any failed read clears the record, which is what keeps
   * this fail-closed: an identity that did not fully load is never "fresh", so
   * the next event retries it, and `childLinkLoaded` stays false until it does.
   */
  let identityLoad: { userId: string; at: number } | null = null;
  // Long enough to cover the events a sign-in or boot emits, short enough that
  // returning to a tab after being away still re-reads a membership that
  // changed in the meantime.
  const IDENTITY_FRESH_MS = 30_000;

  function identityIsFresh(userId: string): boolean {
    return (
      identityLoad !== null &&
      identityLoad.userId === userId &&
      Date.now() - identityLoad.at < IDENTITY_FRESH_MS
    );
  }

  async function loadIdentity(userId: string, campaignId?: string): Promise<void> {
    const load = { userId, at: Date.now() };
    identityLoad = load;
    const results = await Promise.all([
      loadMembership(userId, campaignId),
      loadUsername(userId),
      loadChildLink(userId),
    ]);
    if (!results.every(Boolean) && identityLoad === load) identityLoad = null;
  }

  // Persist the identity facts for the next boot (see authSnapshot.ts). Watched
  // rather than written after each load: the refs are only ever assigned from
  // successful reads, so a failed load cannot cause a write of nulls never
  // read. The one thing an error changes is a membership that belongs to
  // another campaign, which becomes null, and a null membership is a miss for
  // any boot that names a campaign.
  // Written only once the child link is known: `childLinkLoaded` is the proxy
  // for "the trio has answered", so a half-loaded sign-in never persists. A
  // membership or child link belonging to another account is not persisted
  // under this one's id; resetIdentityFor is what keeps them from being there
  // in the first place, and this is the check on the way out.
  watch(
    [user, membership, username, childLink, childLinkLoaded],
    () => {
      const current = user.value;
      if (!current) {
        clearAuthSnapshot();
        return;
      }
      if (!childLinkLoaded.value) return;
      if (membership.value && membership.value.user_id !== current.id) return;
      if (childLink.value && childLink.value.child_user_id !== current.id) return;
      writeAuthSnapshot({
        v: 1,
        userId: current.id,
        membership: membership.value,
        username: username.value,
        childLink: childLink.value,
        childLinkLoaded: childLinkLoaded.value,
      });
    },
  );

  let initPromise: Promise<void> | null = null;
  let authListener: { unsubscribe: () => void } | null = null;

  /**
   * Applies an auth-js event to the store.
   *
   * IMPORTANT: auth-js awaits its listeners before it settles the refresh in
   * flight. A supabase.from() call here (even indirectly via loadMembership)
   * that needs a token can end up waiting on that same refresh, which is waiting
   * on this listener: deadlock, and the query hangs with no network activity. So
   * synchronous state is updated at once and the DB call is scheduled with
   * setTimeout, to run after the listener has returned.
   */
  function applyAuthEvent(event: AuthChangeEvent, newSession: Session | null): void {
    if (newSession?.user) resetIdentityFor(newSession.user.id);
    session.value = newSession;
    user.value = newSession?.user ?? null;
    setCachedUser(user.value);
    if (user.value) {
      const userId = user.value.id;
      // SIGNED_IN (re-emitted on tab focus) and TOKEN_REFRESHED reload: the app
      // leans on them to notice a membership that changed while it was away.
      // They do not reload when the same account's trio was requested moments
      // ago and every read of it succeeded (`identityIsFresh`): that is the
      // duplicate a boot or sign-in emits about itself.
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && identityIsFresh(userId)) {
        return;
      }
      setTimeout(() => {
        const storedCampaignId = safeLocalStorage().getItem("grimoire_active_campaign") ?? undefined;
        void loadIdentity(userId, storedCampaignId);
      }, 0);
    } else {
      identityLoad = null;
      membership.value = null;
      username.value = null;
      childLink.value = null;
      childLinkLoaded.value = false;
      clearAuthSnapshot();
      // TOKEN_REFRESHED failure, reuse detection, or explicit sign-out — all
      // arrive here as SIGNED_OUT. The router guard will redirect to /login on
      // the next navigation; if we're mid-session we do it immediately.
      if (event === "SIGNED_OUT" && initialized.value) {
        setTimeout(() => {
          if (!user.value) window.location.href = "/login";
        }, 0);
      }
    }
  }

  async function initialize() {
    if (initialized.value) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const boot = await bootSession();
        session.value = boot.session;
        user.value = boot.session?.user ?? null;
        setCachedUser(user.value);
        if (boot.session) {
          // Started on the stored session while the refresh was out: when it
          // ends, a session auth-js has removed was rejected by the server.
          // Checked here rather than left to the listener below, which may not
          // be registered yet when auth-js emits that SIGNED_OUT.
          void boot.loaded.then(({ data }) => {
            if (!data.session && readStoredSession() === null) applyAuthEvent("SIGNED_OUT", null);
          });
        }

        if (user.value) {
          const storedCampaignId =
            safeLocalStorage().getItem("grimoire_active_campaign") ?? undefined;
          const userId = user.value.id;
          const snapshot = readAuthSnapshot(userId, storedCampaignId);
          if (snapshot) {
            // The network used to be the first thing the app waited on for
            // facts it already had last time. Show the snapshot now and
            // revalidate behind it; the server is still the boundary for all
            // of these, so a stale one shows a control that then refuses.
            membership.value = snapshot.membership;
            username.value = snapshot.username;
            childLink.value = snapshot.childLink;
            childLinkLoaded.value = snapshot.childLinkLoaded;
            void loadIdentity(userId, storedCampaignId).catch((err: unknown) => {
              console.error("Failed to revalidate identity:", err);
            });
          } else {
            await loadIdentity(userId, storedCampaignId);
          }
        } else {
          // A session that ended without a SIGNED_OUT event (expired while the
          // app was closed) never reaches signOut() or the listener below, so
          // this is the only place that removes the last account's facts from
          // a device somebody else may be about to sign in on.
          clearAuthSnapshot();
        }

        initialized.value = true;

        // Unsubscribe any previous listener before registering a new one.
        // Without this, every HMR hot-reload stacks up another listener, each
        // applying every auth event again.
        authListener?.unsubscribe();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
          // INITIAL_SESSION is auth-js replaying the session initialize() just
          // loaded, and nothing in it is news. When it differs, it is the
          // refresh that bootSession() chose not to wait for, answering null
          // for a session that is still stored: applying that would sign out
          // the user the boot just kept signed in. A real end of the session
          // arrives as SIGNED_OUT.
          if (event === "INITIAL_SESSION") return;
          applyAuthEvent(event, newSession);
        });
        authListener = subscription;
      } catch (err) {
        // Clear initPromise so callers can retry (e.g. after a failed network
        // read during boot).
        initPromise = null;
        throw err;
      }
    })();

    return initPromise;
  }

  /**
   * `identifier` is either an email or a child's login name (#919) — anything
   * without an `@` is a login name, mapped to the child's internal
   * `@players.dungeongrimoire.invalid` address by `signInEmail`. Mapped here
   * rather than at each call site so every caller (LoginView, the
   * JoinCampaignView login tab) gets it for free, and none of them needs to
   * know the child-account scheme exists.
   *
   * `captcha` is awaited inside `loading`, here and in the two actions below,
   * so the submit button stays disabled while the bot check finishes and a
   * second press cannot spend the same token twice.
   */
  async function signIn(identifier: string, password: string, captcha: CaptchaSource) {
    loading.value = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: signInEmail(identifier),
        password,
        options: { captchaToken: await captcha() },
      });
      if (error) throw error;
      // Eagerly set user/session and load membership so the router guard sees
      // the correct role before the post-login navigation happens. Without this
      // the onAuthStateChange callback fires asynchronously (via setTimeout) and
      // the player lands on the DM dashboard before membership is loaded.
      if (data.user) {
        resetIdentityFor(data.user.id);
        user.value = data.user;
        session.value = data.session;
        setCachedUser(data.user);
        const storedCampaignId =
          safeLocalStorage().getItem("grimoire_active_campaign") ?? undefined;
        await loadIdentity(data.user.id, storedCampaignId);
      }
    } finally {
      loading.value = false;
    }
  }

  async function signUp({
    email,
    password,
    captcha,
    displayName,
    redirectTo,
    inviteToken,
  }: {
    email: string;
    password: string;
    captcha: CaptchaSource;
    displayName?: string;
    redirectTo?: string;
    inviteToken?: string;
  }) {
    loading.value = true;
    try {
      // invite_token + terms consent ride in user metadata so the on-insert
      // subscription trigger can act on them server-side — works even before
      // email confirm (no session / auth.uid() yet at signup time).
      //
      // Consent is not a parameter: every form that reaches here has shown
      // SignupConsent and refused to submit until it was ticked, so what was
      // agreed to is always the current Terms version.
      const data: Record<string, string> = {
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
      };
      if (displayName) data.display_name = displayName;
      if (inviteToken) data.invite_token = inviteToken;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data,
          captchaToken: await captcha(),
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });
      if (error) throw error;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Email a password-reset link that lands on `/reset-password`.
   *
   * The link signs the user in with a recovery session, which is all
   * `updatePassword` needs. Following it also confirms the address, so it is
   * the way back in for an account whose confirmation email went missing too.
   * That redirect URL must be on the project's allow-list (Supabase dashboard
   * → Authentication → URL Configuration); an unlisted one silently falls
   * back to the Site URL and the user lands on the dashboard, not the form.
   */
  async function requestPasswordReset(email: string, captcha: CaptchaSource) {
    loading.value = true;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken: await captcha(),
      });
      if (error) throw error;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Set a new password, then end the account's other sessions. Resolves to
   * whether that second step worked.
   *
   * A new password does not end the other sessions on its own, so whoever had
   * the old one would stay signed in. `others` keeps this device's session and
   * fires no SIGNED_OUT here. Its failure is reported rather than thrown: the
   * password has already changed by then, and retrying the whole call would be
   * refused for reusing that same password.
   */
  async function updatePassword(password: string): Promise<{ othersSignedOut: boolean }> {
    loading.value = true;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
      return { othersSignedOut: !signOutError };
    } finally {
      loading.value = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    user.value = null;
    session.value = null;
    membership.value = null;
    username.value = null;
    childLink.value = null;
    childLinkLoaded.value = false;
    clearAuthSnapshot();
    setCachedUser(null);
  }

  // Called after a player successfully joins via invite, or when the active campaign
  // changes, to refresh membership state for the correct campaign.
  async function refreshMembership(campaignId?: string) {
    if (user.value) await loadMembership(user.value.id, campaignId);
  }

  // Fresh-device mode inference must not depend on whichever membership row
  // happened to be loaded first. A user who owns any campaign starts in the
  // DM lens; otherwise an existing player membership selects the player lens.
  async function inferUserMode(): Promise<CampaignRole | null> {
    if (!user.value) return null;
    const { data } = await supabase
      .from("campaign_members")
      .select("role")
      .eq("user_id", user.value.id);
    if (data?.some((row) => row.role === "dm")) return "dm";
    if (data?.some((row) => row.role === "player")) return "player";
    return null;
  }

  // Mode switch (#729): drop the current membership without loading another.
  // Leaving the old one in place lets App.vue's `membership?.campaign_id`
  // fallback re-hydrate the campaign the user just switched away from; the
  // next switchToCampaign() reloads membership for the right one.
  function clearMembership() {
    membership.value = null;
  }

  return {
    user,
    session,
    loading,
    initialized,
    membership,
    username,
    childLink,
    childLinkLoaded,
    isAuthenticated,
    isAppAdmin,
    isChildAccount,
    userEmail,
    publicName,
    accountDisplayLabel,
    currentRole,
    isDM,
    isPlayer,
    linkedPartyMemberId,
    initialize,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    loadChildLink,
    refreshMembership,
    inferUserMode,
    clearMembership,
  };
});
