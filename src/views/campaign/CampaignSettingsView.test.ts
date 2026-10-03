import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignSettingsView from "./CampaignSettingsView.vue";

const mocks = vi.hoisted(() => ({
  aiEnabled: true,
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
  useCampaignStore: () => ({ activeCampaign: { id: "c1", name: "Test" }, isAiEnabled: mocks.aiEnabled }),
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
    mocks.query = {};
  });

  it("lists Import Document with AI on", () => {
    expect(labels(mountView())).toContain("Import Document");
  });

  it("drops Import Document with AI off", () => {
    mocks.aiEnabled = false;
    expect(labels(mountView())).not.toContain("Import Document");
  });

  it("falls back to Details when deep-linked to import with AI off", () => {
    mocks.aiEnabled = false;
    mocks.query = { tab: "import" };
    const wrapper = mountView();
    expect(wrapper.find('[data-stub="DocumentImportTab"]').exists()).toBe(false);
    expect(wrapper.find('[data-stub="DetailsTab"]').exists()).toBe(true);
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
});
