import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { supabase, setCachedUser } from "@/lib/supabase";
import { setErrorTrackingUser } from "@/lib/observability/sentry";
import type { User, Session } from "@supabase/supabase-js";
import type { CampaignMember, CampaignRole } from "@/types/campaign.types";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  const membership = ref<CampaignMember | null>(null);
  const username = ref<string | null>(null);

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
   * `userEmail` stays available and is still correct for showing a user their
   * *own* address — the account page and the sidebar do exactly that.
   */
  const publicName = computed<string | null>(
    () => membership.value?.display_name?.trim() || username.value?.trim() || null,
  );
  const isAppAdmin = computed(
    () => user.value?.app_metadata?.["role"] === "admin",
  );
  const currentRole = computed<CampaignRole | null>(
    () => membership.value?.role ?? null,
  );
  const isDM = computed(() => currentRole.value === "dm");
  const isPlayer = computed(() => currentRole.value === "player");
  const linkedPartyMemberId = computed(
    () => membership.value?.party_member_id ?? null,
  );

  async function loadUsername(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .single();
    username.value = data?.username ?? null;
  }

  async function loadMembership(userId: string, campaignId?: string) {
    let query = supabase
      .from("campaign_members")
      .select("*")
      .eq("user_id", userId);

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    } else {
      query = query.order("joined_at", { ascending: true }).limit(1);
    }

    const { data } = await query.maybeSingle();
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
  }

  let initPromise: Promise<void> | null = null;
  let authListener: { unsubscribe: () => void } | null = null;

  async function initialize() {
    if (initialized.value) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        session.value = data.session;
        user.value = data.session?.user ?? null;
        setCachedUser(user.value);

        if (user.value) {
          const storedCampaignId =
            localStorage.getItem("grimoire_active_campaign") ?? undefined;
          await Promise.all([
            loadMembership(user.value.id, storedCampaignId),
            loadUsername(user.value.id),
          ]);
        }

        initialized.value = true;

        // Unsubscribe any previous listener before registering a new one.
        // Without this, every HMR hot-reload stacks up another listener and
        // causes concurrent getSession() calls that fight over navigator.locks.
        authListener?.unsubscribe();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
          // IMPORTANT: this callback is invoked *inside* the exclusive navigator.locks lock
          // that supabase-js holds during getSession() / token refresh. If we call
          // supabase.from() here (even indirectly via loadMembership), it tries to acquire
          // the same lock → deadlock → all DB queries hang forever with no network activity.
          //
          // Fix: update synchronous state immediately, then schedule the DB call with
          // setTimeout so it runs after the lock is released.
          session.value = newSession;
          user.value = newSession?.user ?? null;
          setCachedUser(user.value);
          if (user.value) {
            const userId = user.value.id;
            setTimeout(() => {
              const storedCampaignId =
                localStorage.getItem("grimoire_active_campaign") ?? undefined;
              void loadMembership(userId, storedCampaignId);
              void loadUsername(userId);
            }, 0);
          } else {
            membership.value = null;
            username.value = null;
            // TOKEN_REFRESHED failure, reuse detection, or explicit sign-out — all
            // arrive here as SIGNED_OUT. The router guard will redirect to /login on
            // the next navigation; if we're mid-session we do it immediately.
            if (event === "SIGNED_OUT" && initialized.value) {
              setTimeout(() => {
                if (!user.value) window.location.href = "/login";
              }, 0);
            }
          }
        });
        authListener = subscription;
      } catch (err) {
        // Clear initPromise so callers can retry (e.g. after an AbortError from
        // navigator.locks contention during HMR or multi-tab lock stealing).
        initPromise = null;
        throw err;
      }
    })();

    return initPromise;
  }

  async function signIn(email: string, password: string) {
    loading.value = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Eagerly set user/session and load membership so the router guard sees
      // the correct role before the post-login navigation happens. Without this
      // the onAuthStateChange callback fires asynchronously (via setTimeout) and
      // the player lands on the DM dashboard before membership is loaded.
      if (data.user) {
        user.value = data.user;
        session.value = data.session;
        setCachedUser(data.user);
        const storedCampaignId =
          localStorage.getItem("grimoire_active_campaign") ?? undefined;
        await Promise.all([
          loadMembership(data.user.id, storedCampaignId),
          loadUsername(data.user.id),
        ]);
      }
    } finally {
      loading.value = false;
    }
  }

  async function signUp(
    email: string,
    password: string,
    displayName?: string,
    redirectTo?: string,
    inviteToken?: string,
    termsVersion?: string,
  ) {
    loading.value = true;
    try {
      // invite_token + terms consent ride in user metadata so the on-insert
      // subscription trigger can act on them server-side — works even before
      // email confirm (no session / auth.uid() yet at signup time).
      const data: Record<string, string> = {};
      if (displayName) data.display_name = displayName;
      if (inviteToken) data.invite_token = inviteToken;
      if (termsVersion) {
        data.terms_version = termsVersion;
        data.terms_accepted_at = new Date().toISOString();
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          ...(Object.keys(data).length ? { data } : {}),
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
        },
      });
      if (error) throw error;
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

  // No-op: autoRefreshToken:true handles all proactive refresh internally, and
  // every supabase.from() call refreshes the token if needed via _getAccessToken().
  // The old getSession() call here was racing with the SDK's own refresh timer —
  // both would send the same (single-use) refresh token, triggering reuse detection
  // and killing the session. The SIGNED_OUT handler above redirects to /login if
  // a refresh ever fails. Kept as a function so the router guard call site is unchanged.
  async function ensureFreshSession(): Promise<void> {}

  return {
    user,
    session,
    loading,
    initialized,
    membership,
    username,
    isAuthenticated,
    isAppAdmin,
    userEmail,
    publicName,
    currentRole,
    isDM,
    isPlayer,
    linkedPartyMemberId,
    initialize,
    ensureFreshSession,
    signIn,
    signUp,
    signOut,
    refreshMembership,
    inferUserMode,
    clearMembership,
  };
});
