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

  const isAuthenticated = computed(() => !!user.value);
  const userEmail = computed(() => user.value?.email ?? null);
  const isAppAdmin = computed(() => user.value?.email === "jeffrey@crocode.nl");
  const currentRole = computed<CampaignRole | null>(() => membership.value?.role ?? null);
  const isDM = computed(() => currentRole.value === "dm");
  const isPlayer = computed(() => currentRole.value === "player");
  const linkedPartyMemberId = computed(() => membership.value?.party_member_id ?? null);

  async function loadMembership(userId: string) {
    const { data } = await supabase
      .from("campaign_members")
      .select("*")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
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
          await loadMembership(user.value.id);
        }

        initialized.value = true;

        // Unsubscribe any previous listener before registering a new one.
        // Without this, every HMR hot-reload stacks up another listener and
        // causes concurrent getSession() calls that fight over navigator.locks.
        authListener?.unsubscribe();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
            setTimeout(() => void loadMembership(userId), 0);
          } else {
            membership.value = null;
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Eagerly set user/session and load membership so the router guard sees
      // the correct role before the post-login navigation happens. Without this
      // the onAuthStateChange callback fires asynchronously (via setTimeout) and
      // the player lands on the DM dashboard before membership is loaded.
      if (data.user) {
        user.value = data.user;
        session.value = data.session;
        setCachedUser(data.user);
        await loadMembership(data.user.id);
      }
    } finally {
      loading.value = false;
    }
  }

  async function signUp(email: string, password: string, displayName?: string) {
    loading.value = true;
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: displayName ? { data: { display_name: displayName } } : undefined,
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
    setCachedUser(null);
  }

  // Called after a player successfully joins via invite, to refresh membership state
  async function refreshMembership() {
    if (user.value) await loadMembership(user.value.id);
  }

  // Ensure the current JWT is fresh before making DB calls. Called from the router
  // guard on every navigation so components always mount with a valid token and
  // don't have to wait for the navigator.locks refresh race themselves.
  //
  // If the session refresh takes longer than TIMEOUT_MS (lock stuck due to network
  // hang), we reload the page — this clears the stuck lock and lets the app restart
  // cleanly. Better a hard reload than an infinite spinner.
  async function ensureFreshSession(): Promise<void> {
    if (!user.value) return; // not logged in — nothing to refresh
    const expiresAt = session.value?.expires_at; // unix seconds
    const nowSec = Date.now() / 1000;
    if (expiresAt && expiresAt > nowSec + 30) {
      return;
    }

    const TIMEOUT_MS = 8_000;
    const result = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session ?? null),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS)),
    ]);

    if (result === "timeout") {
      window.location.reload();
      return;
    }

    session.value = result;
    user.value = result?.user ?? null;
    setCachedUser(user.value);
  }

  return {
    user,
    session,
    loading,
    initialized,
    membership,
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
