import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
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

        if (user.value) {
          await loadMembership(user.value.id);
        }

        initialized.value = true;

        // Unsubscribe any previous listener before registering a new one.
        // Without this, every HMR hot-reload stacks up another listener and
        // causes concurrent getSession() calls that fight over navigator.locks.
        authListener?.unsubscribe();
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          session.value = newSession;
          user.value = newSession?.user ?? null;
          if (user.value) {
            await loadMembership(user.value.id);
          } else {
            membership.value = null;
          }
        });
        authListener = subscription;
      } catch (err) {
        // Clear initPromise so callers can retry (e.g. after an AbortError from
        // navigator.locks contention during HMR or multi-tab lock stealing).
        console.error("[auth] initialize() failed, will retry on next navigation:", err);
        initPromise = null;
        throw err;
      }
    })();

    return initPromise;
  }

  async function signIn(email: string, password: string) {
    loading.value = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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
  }

  // Called after a player successfully joins via invite, to refresh membership state
  async function refreshMembership() {
    if (user.value) await loadMembership(user.value.id);
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
    signIn,
    signUp,
    signOut,
    refreshMembership,
  };
});
