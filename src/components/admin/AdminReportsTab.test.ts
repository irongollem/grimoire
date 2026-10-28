import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminBugReport, BugReportText } from "@/composables/admin/useAdminBugReports";
import AdminReportsTab from "./AdminReportsTab.vue";

const reports = ref<AdminBugReport[]>([]);
const mutate = vi.fn();
const text = ref<BugReportText | null>(null);
const users = ref<{ user_id: string; display_name: string | null; email: string }[]>([]);

vi.mock("@/composables/admin/useAdminBugReports", () => ({
  useAdminBugReports: () => ({ data: reports, isPending: ref(false), isError: ref(false) }),
  useAdminBugReportScreenshot: () => ({ data: ref(null), isPending: ref(false), isError: ref(false) }),
  useAdminBugReportText: () => ({ data: text, isPending: ref(false), isError: ref(false) }),
  useRefileBugReport: () => ({ mutate, isPending: ref(false), variables: ref(undefined) }),
}));
vi.mock("@/composables/admin/useAdminUsers", () => ({ useAdminUsers: () => ({ data: users }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: (_e: unknown, f: string) => f }),
}));

function report(overrides: Partial<AdminBugReport>): AdminBugReport {
  return {
    id: "r1",
    user_id: "u1",
    kind: "bug",
    issue_number: null,
    has_screenshot: false,
    screenshot_purged_at: null,
    has_report_text: false,
    bug_report_filings: null,
    created_at: "2026-10-25T12:00:00Z",
    ...overrides,
  };
}

const fileButton = (w: ReturnType<typeof mount>, label: string) =>
  w.findAll("button").find((b) => b.text().includes(label));

beforeEach(() => {
  mutate.mockClear();
  users.value = [];
  text.value = null;
});

const refused = { claimed_at: null, error: "GitHub refused the token", uncertain: false };

describe("AdminReportsTab: reports GitHub refused", () => {
  it("shows why it is waiting and files it again on request", async () => {
    reports.value = [report({ has_report_text: true, bug_report_filings: refused })];
    const wrapper = mount(AdminReportsTab);

    expect(wrapper.text()).toContain("Not filed yet");
    expect(wrapper.text()).toContain("GitHub refused the token");
    await fileButton(wrapper, "File on GitHub")!.trigger("click");
    expect(mutate).toHaveBeenCalledWith({ id: "r1", force: false }, expect.any(Object));
  });

  // GitHub may already hold it, so the button says so and asks for force.
  it("offers File anyway when GitHub may already have it", async () => {
    reports.value = [
      report({
        has_report_text: true,
        bug_report_filings: { claimed_at: null, error: "GitHub did not answer the filing", uncertain: true },
      }),
    ];
    const wrapper = mount(AdminReportsTab);

    await fileButton(wrapper, "File anyway")!.trigger("click");
    expect(mutate).toHaveBeenCalledWith({ id: "r1", force: true }, expect.any(Object));
  });

  it("says a filing is in flight", () => {
    reports.value = [
      report({ has_report_text: true, bug_report_filings: { claimed_at: "2026-10-25T12:01:00Z", error: null, uncertain: false } }),
    ];
    const wrapper = mount(AdminReportsTab);

    expect(wrapper.text()).toContain("Being filed since");
  });

  it("shows the reporter's fields once opened, and not before", async () => {
    reports.value = [report({ has_report_text: true, bug_report_filings: refused })];
    text.value = { where: "Soundboard", action: "Pressed play", expected: "Music", actual: "Silence" };
    const wrapper = mount(AdminReportsTab);

    expect(wrapper.text()).not.toContain("Pressed play");
    await fileButton(wrapper, "Show report")!.trigger("click");
    expect(wrapper.text()).toContain("What they were doing");
    expect(wrapper.text()).toContain("Pressed play");
  });

  it("offers nothing to file for an old row that kept no text", () => {
    reports.value = [report({})];
    const wrapper = mount(AdminReportsTab);

    expect(wrapper.text()).toContain("No issue linked");
    expect(fileButton(wrapper, "File")).toBeUndefined();
  });

  it("links a filed report and offers nothing to file", () => {
    reports.value = [report({ issue_number: 1098 })];
    const wrapper = mount(AdminReportsTab);

    expect(wrapper.text()).toContain("#1098");
    expect(fileButton(wrapper, "File")).toBeUndefined();
  });
  it("names the reporter by display name, else email, else a placeholder while the user list loads", () => {
    reports.value = [
      report({ id: "r1", user_id: "u1" }),
      report({ id: "r2", user_id: "u2" }),
      report({ id: "r3", user_id: "u3" }),
    ];
    users.value = [
      { user_id: "u1", display_name: "Mira", email: "mira@example.invalid" },
      { user_id: "u2", display_name: null, email: "tor@example.invalid" },
    ];
    const wrapper = mount(AdminReportsTab);
    const rows = wrapper.text();
    expect(rows).toContain("Mira");
    expect(rows).not.toContain("mira@example.invalid");
    expect(rows).toContain("tor@example.invalid");
    expect(rows).toContain("…");
  });

  it("leaves out the fields a reporter left blank", async () => {
    reports.value = [report({ has_report_text: true, bug_report_filings: refused })];
    text.value = { where: "Soundboard", action: "   ", expected: "", actual: "Silence" };
    const wrapper = mount(AdminReportsTab);
    await fileButton(wrapper, "Show report")!.trigger("click");
    expect(wrapper.text()).toContain("What actually happened");
    expect(wrapper.text()).not.toContain("What they were doing");
    expect(wrapper.text()).not.toContain("What they expected");
  });
  it("opens a screenshot and closes it on the second click, one report at a time", async () => {
    reports.value = [report({ id: "r1", has_screenshot: true }), report({ id: "r2", has_screenshot: true })];
    const wrapper = mount(AdminReportsTab);
    await wrapper.findAll("button").filter((b) => b.text() === "Show screenshot")[0].trigger("click");
    expect(wrapper.findAll("button").filter((b) => b.text() === "Hide screenshot")).toHaveLength(1);
    await wrapper.findAll("button").filter((b) => b.text() === "Show screenshot")[0].trigger("click");
    expect(wrapper.findAll("button").filter((b) => b.text() === "Hide screenshot")).toHaveLength(1);
    await wrapper.findAll("button").find((b) => b.text() === "Hide screenshot")!.trigger("click");
    expect(wrapper.findAll("button").filter((b) => b.text() === "Hide screenshot")).toHaveLength(0);
  });
});
