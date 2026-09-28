import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { functionErrorCode } from "@/lib/functionError";
import { useAuthStore } from "@/stores/auth";
import {
  CHILD_ACCOUNT_COLUMNS,
  type ChildAccountLink,
} from "@/composables/account/useChildAccount";
import {
  PARENTAL_CONSENT_VERSION,
  isUnderAdultAge,
  isValidBirthMonth,
  isValidLoginName,
  type BirthMonth,
} from "@edge-shared/childAccount.ts";

/**
 * The Family page (#919): a parent's list of the young players' accounts they
 * manage, plus the "Add a young player" flow and the two per-child actions
 * (reset password, inspect an incoming request). One file because all four
 * operate on the same `child_accounts` rows and share the same query key.
 */

const FAMILY_QUERY_KEY = ["family-children"] as const;

/** A `child_accounts` row plus the display name `profiles.username` carries. */
export interface FamilyChild extends ChildAccountLink {
  displayName: string;
}

async function fetchFamilyChildren(parentId: string): Promise<FamilyChild[]> {
  const { data: links, error } = await supabase
    .from("child_accounts")
    .select(CHILD_ACCOUNT_COLUMNS)
    .eq("parent_user_id", parentId)
    .order("consented_at", { ascending: true });
  if (error) throw error;

  const rows = (links ?? []) as ChildAccountLink[];
  if (rows.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, username")
    .in(
      "user_id",
      rows.map((r) => r.child_user_id),
    );
  if (profilesError) throw profilesError;

  const nameByUserId = new Map<string, string>(
    (profiles ?? []).map((p) => [p.user_id as string, p.username as string]),
  );

  // A missing profile row (deleted between the two queries) falls back to the
  // login name rather than disappearing the child from their own parent's list.
  return rows.map((r) => ({ ...r, displayName: nameByUserId.get(r.child_user_id) ?? r.login_name }));
}

/** The parent's list of young players' accounts. */
export function useFamily() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const parentId = computed(() => auth.user?.id ?? null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: FAMILY_QUERY_KEY,
    queryFn: () => fetchFamilyChildren(parentId.value as string),
    enabled: computed(() => parentId.value !== null),
  });

  const children = computed(() => data.value ?? []);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEY });
  }

  return { children, isLoading, error, refetch, invalidate };
}

async function invokeChildAccount<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("child-account", { body });
  if (error) throw new Error(await functionErrorCode(error));
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

export interface CreateChildInput {
  displayName: string;
  loginName: string;
  password: string;
  birth: BirthMonth;
  /** Present when this account is created by approving an incoming request. */
  requestToken?: string;
}

export interface CreateChildResult {
  childUserId: string;
  loginName: string;
  joinedCampaign: { id: string; name: string } | null;
}

/** Creates a young player's account. Invalidates the family list on success. */
export function useCreateChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChildInput) =>
      invokeChildAccount<CreateChildResult>({
        action: "create",
        displayName: input.displayName,
        loginName: input.loginName,
        password: input.password,
        birth: input.birth,
        consentVersion: PARENTAL_CONSENT_VERSION,
        ...(input.requestToken ? { requestToken: input.requestToken } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEY }),
  });
}

/** Resets a young player's sign-in password. Nothing to invalidate — the
 *  password itself is not part of any cached row. */
export function useResetChildPassword() {
  return useMutation({
    mutationFn: ({ childUserId, password }: { childUserId: string; password: string }) =>
      invokeChildAccount<{ ok: true }>({ action: "reset-password", childUserId, password }),
  });
}

export interface InspectRequestResult {
  existingAccount: boolean;
  campaignName: string | null;
  expiresAt: string;
}

/** Looks up what a `?request=` token on `/account/family/add` is asking for,
 *  before the parent commits to creating (or converting) an account. */
export function useInspectChildRequest() {
  return useMutation({
    mutationFn: (requestToken: string) =>
      invokeChildAccount<InspectRequestResult>({ action: "inspect-request", requestToken }),
  });
}

// ── Pure helpers ─────────────────────────────────────────────────────────────
// Colocated with their tests (useFamily.test.ts) per the TDD-for-logic-modules
// convention — these are plain functions with no Vue reactivity.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** `child_accounts.adult_on` ("YYYY-MM-DD") as "Month YYYY", for the card's
 *  "Becomes their own account on …" line. */
export function formatAdultOn(adultOn: string): string {
  const [year, month] = adultOn.split("-").map(Number);
  const name = MONTH_NAMES[month - 1];
  return name ? `${name} ${year}` : adultOn;
}

/** `child-account` edge function error codes → human copy. An unrecognised
 *  code passes through verbatim, same convention as the other account
 *  composables' error maps. */
const CHILD_ACCOUNT_ERROR_MESSAGES: Record<string, string> = {
  child_account: "Young players' accounts can't manage other accounts.",
  stale_consent: "The consent wording has changed since this page loaded. Refresh and try again.",
  invalid_birth: "Enter a valid birth month and year.",
  not_a_child: "That birth date makes them 16 or older. They can create their own account instead of a young player's.",
  invalid_login_name: "Login name must be 3 to 30 lowercase letters, numbers or hyphens.",
  weak_password: "Password must be at least 8 characters.",
  invalid_display_name: "Enter a display name, up to 40 characters.",
  login_name_taken: "That login name is already taken. Try another.",
  request_not_found: "This request has expired, or it was sent to a different email address. Sign in with the address it was sent to.",
  // Covers both a request sent to a different parent, and a parent whose own
  // email isn't confirmed yet — the edge function can't tell them apart from a
  // token alone, and "confirm your email" reads fine either way.
  wrong_parent: "Sign in with the confirmed email address the request was sent to.",
  already_child: "This account is already a young player's account.",
  create_failed: "Something went wrong creating the account. Please try again.",
  not_your_child: "That account isn't one of the young players you manage.",
  awaiting_parent: "This account is waiting for its own parent to approve it, so it can't add young players.",
  terms_not_accepted: "Accept the updated Terms first. Reload this page and you'll be asked.",
  account_check_failed: "We couldn't check your account just now. Please try again.",
  cannot_convert: "This account can't be turned into a young player's account. Contact us at info@dungeongrimoire.com and we'll sort it out.",
};

export function childAccountErrorMessage(code: string): string {
  return CHILD_ACCOUNT_ERROR_MESSAGES[code] ?? code;
}

export interface ChildFormState {
  displayName: string;
  loginName: string;
  password: string;
  confirmPassword: string;
  /** Null until both fields are chosen — never coerced to a fake month/year,
   *  since `0` would otherwise pass straight into `isValidBirthMonth`'s range
   *  check as data rather than as "nothing chosen yet". */
  birthMonth: number | null;
  birthYear: number | null;
  consented: boolean;
}

/**
 * Every reason "Add a young player" can't submit yet, in the order the form
 * reads top to bottom. Shared between the live login-name hint (`errors[0]`
 * for that field is the same check the pattern regex enforces) and the
 * submit-button gate, so the two can never quietly disagree about what
 * "valid" means.
 */
export function childFormErrors(form: ChildFormState, today = new Date()): string[] {
  const errors: string[] = [];
  if (!form.displayName.trim()) errors.push("Enter a display name.");
  if (!isValidLoginName(form.loginName)) {
    errors.push("Login name must be 3 to 30 lowercase letters, numbers or hyphens.");
  }
  if (form.password.length < 8) errors.push("Password must be at least 8 characters.");
  if (form.password !== form.confirmPassword) errors.push("Passwords don't match.");
  if (form.birthMonth === null || form.birthYear === null) {
    errors.push("Choose a birth month and year.");
  } else {
    const birth: BirthMonth = { month: form.birthMonth, year: form.birthYear };
    if (!isValidBirthMonth(birth, today)) {
      errors.push("Enter a valid birth month and year.");
    } else if (!isUnderAdultAge(birth, today)) {
      errors.push("That birth date makes them 16 or older. They can create their own account instead.");
    }
  }
  if (!form.consented) errors.push("Tick the consent box to continue.");
  return errors;
}
