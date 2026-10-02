import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref, type Ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { RulesetKey } from "@/types/ruleset.types";
import {
  provideCharacterRuleset,
  provideRuleset,
  type RulesetScopeMember,
  useContentScope,
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

  it("provideRuleset with no edition chosen yet falls back to the campaign, then follows the choice", () => {
    setCampaign("c1", "2024");
    const chosen = ref<RulesetKey | null>(null);
    const seen: Seen[] = [];
    mount(defineComponent({
      setup() {
        provideRuleset(chosen);
        return () => h(Reader(seen));
      },
    }));
    expect(seen[0]).toEqual({ build: "2024", table: "2024" });
    chosen.value = "2014";
    expect(seen[0]).toEqual({ build: "2014", table: "2014" });
  });

  it("provideRuleset with no edition and no campaign falls back to 2014, and to an enclosing scope when there is one", () => {
    setCampaign(null, null);
    const seen: Seen[] = [];
    mount(defineComponent({
      setup() {
        provideRuleset(() => undefined);
        return () => h(Reader(seen));
      },
    }));
    expect(seen[0]).toEqual({ build: "2014", table: "2014" });

    const nested: Seen[] = [];
    const outerMember = ref<RulesetScopeMember | null>({ ruleset: "2024", campaign_id: null });
    const inner = defineComponent({
      setup() {
        provideRuleset(null);
        return () => h(Reader(nested));
      },
    });
    mount(Provider(outerMember, inner));
    expect(nested[0]).toEqual({ build: "2024", table: "2024" });
  });
});

describe("useContentScope standalone", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function readStandalone() {
    const seen: boolean[] = [];
    const reader = defineComponent({
      setup() {
        const { standalone } = useContentScope();
        seen.push(standalone.value);
        return () => h("i");
      },
    });
    return { seen, reader };
  }

  it("is true with no scope and no active campaign", () => {
    setCampaign(null, null);
    const { seen, reader } = readStandalone();
    mount(reader);
    expect(seen[0]).toBe(true);
  });

  it("is false with no scope and an active campaign", () => {
    setCampaign("c1", "2024");
    const { seen, reader } = readStandalone();
    mount(reader);
    expect(seen[0]).toBe(false);
  });

  it("follows a campaign-less member even inside an active campaign", () => {
    setCampaign("c1", "2024");
    const { seen, reader } = readStandalone();
    mount(Provider(ref({ ruleset: "2014", campaign_id: null }), reader));
    expect(seen[0]).toBe(true);
  });

  it("is false for a member seated at a table", () => {
    setCampaign(null, null);
    const { seen, reader } = readStandalone();
    mount(Provider(ref({ ruleset: "2014", campaign_id: "c9" }), reader));
    expect(seen[0]).toBe(false);
  });

  it("falls back to the enclosing scope while the member is loading", async () => {
    setCampaign("c1", "2024");
    const member = ref<RulesetScopeMember | null>(null);
    const seen: boolean[] = [];
    const reader = defineComponent({
      setup() {
        const { standalone } = useContentScope();
        seen.push(standalone.value);
        return () => h("i");
      },
    });
    const host = defineComponent({
      setup() {
        const scope = provideCharacterRuleset(member);
        return () => h("div", [String(scope.standalone.value), h(reader)]);
      },
    });
    const wrapper = mount(host);
    expect(seen[0]).toBe(false);
    member.value = { ruleset: "2014", campaign_id: null };
    await nextTick();
    expect(wrapper.text()).toBe("true");
  });

  it("provideRuleset takes an explicit standalone, and otherwise inherits", () => {
    setCampaign("c1", "2024");
    const explicit = readStandalone();
    mount(defineComponent({
      setup() {
        provideRuleset("2014", { standalone: () => true });
        return () => h(explicit.reader);
      },
    }));
    expect(explicit.seen[0]).toBe(true);

    const inherited = readStandalone();
    mount(defineComponent({
      setup() {
        provideRuleset("2014");
        return () => h(inherited.reader);
      },
    }));
    expect(inherited.seen[0]).toBe(false);
  });
});
