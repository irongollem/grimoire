import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignSettingsView from "./CampaignSettingsView.vue";

const mocks = vi.hoisted(() => ({
  aiEnabled: true,
  isOwner: true,
  query: {} as Record<string, string>,
  replace: vi.fn(),
  waiting: 0,
}));

vi.mock("@/composables/party/useCharacterContentReviews", () => ({
  useCampaignPendingContentReviews: () => ({ data: { value: Array.from({ length: mocks.waiting }, (_, i) => i) } }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive({ query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: { id: "c1", name: "Test" }, isAiEnabled: mocks.aiEnabled, isOwner: mocks.isOwner }),
}));

const stub = (name: string) => ({ name, template: `<div data-stub="${name}" />` });
const stubs = {
  PageHeader: { template: "<div><slot /></div>" },
  ManualHelpLink: true,
  DetailsTab: stub("DetailsTab"),
  MembersTab: true,
  InvitesTab: true,
  SchedulingTab: true,
  RulesTab: true,
  ClassesTab: true,
  SpeciesTab: true,
  AiTab: true,
  AiConnectionTab: true,
  SpotifyTab: true,
  BackupTab: true,
  WorldBundleTab: true,
  DangerZoneTab: true,
  DocumentImportTab: stub("DocumentImportTab"),
};

function mountView() {
  return mount(CampaignSettingsView, { global: { stubs } });
}

function labels(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("label"));
}

describe("CampaignSettingsView tabs", () => {
  beforeEach(() => {
    mocks.waiting = 0;
    mocks.aiEnabled = true;
    mocks.isOwner = true;
    mocks.query = {};
    mocks.replace.mockClear();
  });

  it("shows the owner every tab, including AI Assistant and Danger Zone", () => {
    const l = labels(mountView());
    expect(l).toContain("AI Assistant");
    expect(l).toContain("Danger Zone");
  });

  it("hides the owner-only tabs from a co-DM but keeps AI Connections (#590)", () => {
    mocks.isOwner = false;
    const l = labels(mountView());
    expect(l).not.toContain("AI Assistant");
    expect(l).not.toContain("Danger Zone");
    expect(l).toContain("AI Connections");
    expect(l).toContain("Scheduling");
  });

  it("falls back to Details when a co-DM deep-links to the Danger Zone (#590)", () => {
    mocks.isOwner = false;
    mocks.query = { tab: "danger" };
    const w = mountView();
    expect(w.find('[data-stub="DetailsTab"]').exists()).toBe(true);
  });

  it("lists Import Document with AI on", () => {
    expect(labels(mountView())).toContain("Import Document");
  });

  it("keeps Import Document with AI off, because a wiki export needs no AI (#932)", () => {
    mocks.aiEnabled = false;
    expect(labels(mountView())).toContain("Import Document");
  });

  it("opens import when deep-linked with AI off", () => {
    mocks.aiEnabled = false;
    mocks.query = { tab: "import" };
    expect(mountView().find('[data-stub="DocumentImportTab"]').exists()).toBe(true);
  });

  it("still opens import when AI is on", () => {
    mocks.query = { tab: "import" };
    expect(mountView().find('[data-stub="DocumentImportTab"]').exists()).toBe(true);
  });

  it("shows how many characters wait on the DM on the Members tab", () => {
    mocks.waiting = 2;
    expect(labels(mountView())).toContain("Members & Invites (2)");
    mocks.waiting = 0;
    expect(labels(mountView())).toContain("Members & Invites");
  });

  it("hides Open Book from a co-DM too, and falls back to Details for a deep link to it or to AI Assistant", () => {
    mocks.isOwner = false;
    expect(labels(mountView())).not.toContain("Open Book");
    for (const tab of ["openbook", "ai"]) {
      mocks.query = { tab };
      expect(mountView().find('[data-stub="DetailsTab"]').exists()).toBe(true);
    }
  });

  it("opens the Danger Zone for the owner on a deep link, and Details for an unknown tab", () => {
    mocks.query = { tab: "danger" };
    const owner = mountView();
    expect(owner.find('[data-stub="DetailsTab"]').exists()).toBe(false);
    expect(owner.findComponent({ name: "DangerZoneTab" }).exists()).toBe(true);
    mocks.query = { tab: "nonsense" };
    expect(mountView().find('[data-stub="DetailsTab"]').exists()).toBe(true);
  });

  it("choosing a tab switches the route's tab and keeps the other query parameters", async () => {
    mocks.query = { tab: "details", from: "x" };
    const w = mountView();
    await w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Scheduling")!.trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { tab: "scheduling", from: "x" } });
  });
});
