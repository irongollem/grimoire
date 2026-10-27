import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const auth = vi.hoisted(() => ({ user: { id: "parent-1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));

import {
  childAccountErrorMessage,
  childFormErrors,
  formatAdultOn,
  useFamily,
  type ChildFormState,
} from "./useFamily";

beforeEach(() => {
  fake.reset();
  auth.user = { id: "parent-1" };
});

function childRow(over: Record<string, unknown>) {
  return {
    child_user_id: "kid",
    parent_user_id: "parent-1",
    login_name: "kid-login",
    consented_at: "2026-01-01T00:00:00Z",
    adult_on: "2040-01-01",
    ...over,
  };
}

async function mountFamily() {
  let family!: ReturnType<typeof useFamily>;
  mount(
    defineComponent({
      setup() {
        family = useFamily();
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
  );
  await vi.waitFor(() => expect(family.isLoading.value).toBe(false));
  return family;
}

describe("useFamily", () => {
  it("lists only the signed-in parent's children, never another family's (an admin's read sees every row)", async () => {
    fake.seed("child_accounts", [
      childRow({ child_user_id: "kid-a", login_name: "kid-a" }),
      childRow({ child_user_id: "kid-b", parent_user_id: "someone-else", login_name: "kid-b" }),
    ]);
    fake.seed("profiles", [
      { user_id: "kid-a", username: "Robin" },
      { user_id: "kid-b", username: "Not Mine" },
    ]);

    const { children } = await mountFamily();

    expect(children.value.map((c) => c.child_user_id)).toEqual(["kid-a"]);
    expect(children.value[0].displayName).toBe("Robin");
  });

  it("falls back to the login name when the profile row is gone, rather than dropping the child", async () => {
    fake.seed("child_accounts", [childRow({ child_user_id: "kid-a", login_name: "kid-a-login" })]);

    const { children } = await mountFamily();

    expect(children.value).toHaveLength(1);
    expect(children.value[0].displayName).toBe("kid-a-login");
  });

  it("reports a failed read as an error, not as an empty family", async () => {
    fake.seed("child_accounts", [childRow({})]);
    fake.failNext("child_accounts", { message: "boom" });

    const { children, error } = await mountFamily();

    expect(error.value).toMatchObject({ message: "boom" });
    expect(children.value).toEqual([]);
  });

  it("reports a failed profile lookup as an error too", async () => {
    fake.seed("child_accounts", [childRow({})]);
    fake.failNext("profiles", { message: "profiles down" });

    const { error } = await mountFamily();

    expect(error.value).toMatchObject({ message: "profiles down" });
  });
});

describe("formatAdultOn", () => {
  it("renders a YYYY-MM-DD adult_on date as Month YYYY", () => {
    expect(formatAdultOn("2038-10-01")).toBe("October 2038");
  });

  it("pads no leading zero into the month name lookup", () => {
    expect(formatAdultOn("2030-01-01")).toBe("January 2030");
    expect(formatAdultOn("2030-12-01")).toBe("December 2030");
  });
});

describe("childAccountErrorMessage", () => {
  it("maps a known edge function error code to human copy", () => {
    expect(childAccountErrorMessage("login_name_taken")).toBe(
      "That login name is already taken. Try another.",
    );
  });

  it("explains why an account that is not a verified adult cannot add a young player", () => {
    expect(childAccountErrorMessage("awaiting_parent")).toContain("waiting for its own parent");
    expect(childAccountErrorMessage("terms_not_accepted")).toContain("Accept the updated Terms");
  });

  it("passes an unrecognised code through verbatim", () => {
    expect(childAccountErrorMessage("some_new_code")).toBe("some_new_code");
  });
});

describe("childFormErrors", () => {
  const today = new Date("2026-09-28T00:00:00Z");

  function validForm(): ChildFormState {
    return {
      displayName: "Robin",
      loginName: "robin-the-brave",
      password: "correcthorse",
      confirmPassword: "correcthorse",
      birthMonth: 5,
      birthYear: 2015,
      consented: true,
    };
  }

  it("has no errors for a fully valid form", () => {
    expect(childFormErrors(validForm(), today)).toEqual([]);
  });

  it("flags a login name that doesn't match the pattern", () => {
    const errors = childFormErrors({ ...validForm(), loginName: "Ab" }, today);
    expect(errors).toContain("Login name must be 3 to 30 lowercase letters, numbers or hyphens.");
  });

  it("flags a password of 7 characters and accepts one of 8", () => {
    const seven = childFormErrors({ ...validForm(), password: "sevench", confirmPassword: "sevench" }, today);
    expect(seven).toContain("Password must be at least 8 characters.");
    const eight = childFormErrors({ ...validForm(), password: "eightchr", confirmPassword: "eightchr" }, today);
    expect(eight).toEqual([]);
  });

  it("flags mismatched password confirmation", () => {
    const errors = childFormErrors({ ...validForm(), confirmPassword: "somethingElse1" }, today);
    expect(errors).toContain("Passwords don't match.");
  });

  it("flags a birth month that makes the child 16 or older", () => {
    const errors = childFormErrors({ ...validForm(), birthMonth: 1, birthYear: 2000 }, today);
    expect(errors.some((e) => e.includes("16 or older"))).toBe(true);
  });

  it("flags an implausible birth month", () => {
    const errors = childFormErrors({ ...validForm(), birthMonth: 13, birthYear: 2015 }, today);
    expect(errors).toContain("Enter a valid birth month and year.");
  });

  it("flags a birth month/year that hasn't been chosen yet, without coercing to a fake date", () => {
    const errors = childFormErrors({ ...validForm(), birthMonth: null, birthYear: null }, today);
    expect(errors).toContain("Choose a birth month and year.");
    expect(errors).not.toContain("Enter a valid birth month and year.");
  });

  it("flags a missing display name", () => {
    const errors = childFormErrors({ ...validForm(), displayName: "  " }, today);
    expect(errors).toContain("Enter a display name.");
  });

  it("flags an unticked consent box", () => {
    const errors = childFormErrors({ ...validForm(), consented: false }, today);
    expect(errors).toContain("Tick the consent box to continue.");
  });

  it("accumulates every violated rule at once", () => {
    const errors = childFormErrors(
      {
        displayName: "",
        loginName: "x",
        password: "a",
        confirmPassword: "b",
        birthMonth: 1,
        birthYear: 1990,
        consented: false,
      },
      today,
    );
    expect(errors).toHaveLength(6);
  });
});
