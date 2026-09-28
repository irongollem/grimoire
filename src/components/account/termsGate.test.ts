import { describe, it, expect } from "vitest";
import { TERMS_VERSION } from "@/lib/legal";
import { isTermsGateExemptPath, shouldShowTermsGate, type TermsGateState } from "./termsGate";

function baseState(overrides: Partial<TermsGateState> = {}): TermsGateState {
  return {
    isAuthenticated: true,
    subscriptionLoading: false,
    childLoading: false,
    isActiveChild: false,
    termsVersion: "2020-01-01",
    currentPath: "/dashboard",
    ...overrides,
  };
}

describe("isTermsGateExemptPath", () => {
  it("exempts /account itself but not the Family pages under it", () => {
    expect(isTermsGateExemptPath("/account")).toBe(true);
    expect(isTermsGateExemptPath("/account/family")).toBe(false);
    expect(isTermsGateExemptPath("/account/family/add")).toBe(false);
  });

  it("exempts /billing and everything nested under it", () => {
    expect(isTermsGateExemptPath("/billing")).toBe(true);
    expect(isTermsGateExemptPath("/billing/history")).toBe(true);
  });

  it("does not exempt an unrelated path, including one that merely starts with the same letters", () => {
    expect(isTermsGateExemptPath("/dashboard")).toBe(false);
    expect(isTermsGateExemptPath("/accountability")).toBe(false);
  });
});

describe("shouldShowTermsGate", () => {
  it("shows when signed in, loaded, not a child, and the version is stale", () => {
    expect(shouldShowTermsGate(baseState())).toBe(true);
  });

  it("never shows when signed out", () => {
    expect(shouldShowTermsGate(baseState({ isAuthenticated: false }))).toBe(false);
  });

  it("waits for the subscription row to load rather than flashing open", () => {
    expect(shouldShowTermsGate(baseState({ subscriptionLoading: true }))).toBe(false);
  });

  it("waits for the child-account link to load rather than flashing open", () => {
    expect(shouldShowTermsGate(baseState({ childLoading: true }))).toBe(false);
  });

  it("never shows for an active child account", () => {
    expect(shouldShowTermsGate(baseState({ isActiveChild: true }))).toBe(false);
  });

  it("never shows once the current version is recorded", () => {
    expect(shouldShowTermsGate(baseState({ termsVersion: TERMS_VERSION }))).toBe(false);
  });

  it("shows for a row that predates the terms_version column (null)", () => {
    expect(shouldShowTermsGate(baseState({ termsVersion: null }))).toBe(true);
  });

  it("stays out of the way on /account and /billing so the decline links work", () => {
    expect(shouldShowTermsGate(baseState({ currentPath: "/account" }))).toBe(false);
    expect(shouldShowTermsGate(baseState({ currentPath: "/billing" }))).toBe(false);
  });

  it("shows on the Family pages, since adding a young player needs the current Terms", () => {
    expect(shouldShowTermsGate(baseState({ currentPath: "/account/family/add" }))).toBe(true);
  });
});
