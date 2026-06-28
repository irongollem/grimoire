import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase, setCachedUser } from "@/lib/supabase";
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

    // Backfill display_name on first login: prefer the username stored in
    // auth metadata (set at signup), fall back to email only as a last resort.
    if (data && !data.display_name) {
      const u = user.value ?? session.value?.user;
      const fallback =
        (u?.user_metadata?.display_name as string | undefined)?.trim() ||
        u?.email;
      if (fallback) {
        await supabase
          .from("campaign_members")
          .update({ display_name: fallback })
          .eq("id", data.id);
        membership.value = { ...data, display_name: fallback };
      }
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
  };
});
