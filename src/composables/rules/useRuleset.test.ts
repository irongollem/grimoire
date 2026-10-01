import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, ref, type Ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { RulesetKey } from "@/types/ruleset.types";
import {
  provideCharacterRuleset,
  provideRuleset,
  type RulesetScopeMember,
  useRuleset,
  useTableRuleset,
} from "./useRuleset";

type Seen = { build: RulesetKey; table: RulesetKey };

function setCampaign(id: string | null, ruleset: RulesetKey | null) {
  const store = useCampaignStore();
  store.activeCampaignId = id;
  store.activeCampaign = id && ruleset ? ({ id, ruleset } as Campaign) : null;
}

/** Reads both views in its own setup and exposes them. */
function Reader(out: Seen[]) {
  return defineComponent({
    setup() {
      const build = useRuleset();
      const table = useTableRuleset();
      out.push({ get build() { return build.ruleset.value; }, get table() { return table.ruleset.value; } } as Seen);
      return () => h("i");
    },
  });
}

function Provider(member: Ref<RulesetScopeMember | null>, child: ReturnType<typeof defineComponent>, out?: Seen[]) {
  return defineComponent({
    setup() {
      const scope = provideCharacterRuleset(member);
      if (out) out.push({ get build() { return scope.build.value; }, get table() { return scope.table.value; } } as Seen);
      return () => h(child);
    },
  });
}

describe("useRuleset scope", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("falls back to the campaign with no scope provided", () => {
    setCampaign("c1", "2024");
    const seen: Seen[] = [];
    mount(Reader(seen));
    expect(seen[0]).toEqual({ build: "2024", table: "2024" });
  });

  it("falls back to 2014 with no campaign and no scope", () => {
    setCampaign(null, null);
    const seen: Seen[] = [];
    mount(Reader(seen));
    expect(seen[0]).toEqual({ build: "2014", table: "2014" });
  });

  it("splits build and table for a member seated at the active campaign", () => {
    setCampaign("c1", "2024");
    const seen: Seen[] = [];
    mount(Provider(ref({ ruleset: "2014", campaign_id: "c1" }), Reader(seen)));
    expect(seen[0]).toEqual({ build: "2014", table: "2024" });
  });

  it("uses the member's edition for both when campaign-less", () => {
    setCampaign("c1", "2024");
    const seen: Seen[] = [];
    mount(Provider(ref({ ruleset: "2014", campaign_id: null }), Reader(seen)));
    expect(seen[0]).toEqual({ build: "2014", table: "2014" });
  });

  it("uses the member's edition for both when seated at a campaign that is not active", () => {
    setCampaign("c1", "2024");
    const seen: Seen[] = [];
    mount(Provider(ref({ ruleset: "2014", campaign_id: "c2" }), Reader(seen)));
    expect(seen[0]).toEqual({ build: "2014", table: "2014" });
  });

  it("falls back to the enclosing scope while the member is loading, then resolves", () => {
    setCampaign("c1", "2024");
    const member = ref<RulesetScopeMember | null>(null);
    const seen: Seen[] = [];
    mount(Provider(member, Reader(seen)));
    expect(seen[0]).toEqual({ build: "2024", table: "2024" });
    member.value = { ruleset: "2014", campaign_id: "c1" };
    expect(seen[0]).toEqual({ build: "2014", table: "2024" });
  });

  it("lets an inner scope win for its subtree", () => {
    setCampaign("c1", "2024");
    const seen: Seen[] = [];
    const inner = Provider(ref({ ruleset: "2014", campaign_id: null }), Reader(seen));
    const outer = defineComponent({
      setup() {
        provideRuleset("2024");
        return () => h(inner);
      },
    });
    mount(outer);
    expect(seen[0]).toEqual({ build: "2014", table: "2014" });
  });

  it("falls back to the outer character scope when the inner member is null", () => {
    setCampaign("c1", "2024");
    const seen: Seen[] = [];
    const inner = Provider(ref(null), Reader(seen));
    const outer = Provider(ref({ ruleset: "2014", campaign_id: "c1" }), inner);
    mount(outer);
    expect(seen[0]).toEqual({ build: "2014", table: "2024" });
  });

  it("lets the providing component see its own scope", () => {
    setCampaign("c1", "2024");
    const own: Seen[] = [];
    const Self = defineComponent({
      setup() {
        provideCharacterRuleset({ ruleset: "2014", campaign_id: "c1" });
        const build = useRuleset();
        const table = useTableRuleset();
        own.push({ build: build.ruleset.value, table: table.ruleset.value });
        return () => h("i");
      },
    });
    mount(Self);
    expect(own[0]).toEqual({ build: "2014", table: "2024" });
  });

  it("provideRuleset gives the same edition to both", () => {
    setCampaign("c1", "2014");
    const seen: Seen[] = [];
    const wizard = defineComponent({
      setup() {
        provideRuleset("2024");
        return () => h(Reader(seen));
      },
    });
    mount(wizard);
    expect(seen[0]).toEqual({ build: "2024", table: "2024" });
  });
});
