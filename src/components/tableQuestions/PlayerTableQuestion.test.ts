import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyMember } from "@/types/party.types";
import type { TableQuestion, TableQuestionAnswer, TableQuestionOption } from "@/types/tableQuestion.types";

const m = vi.hoisted(() => ({
  answer: vi.fn().mockResolvedValue(undefined),
  roll: vi.fn().mockResolvedValue(undefined),
  create: vi.fn().mockResolvedValue({ id: "c1" }),
  link: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/composables/tableQuestions/useTableQuestions", () => ({
  useAnswerTableQuestion: () => ({ mutateAsync: m.answer }),
  useRollTableQuestion: () => ({ mutateAsync: m.roll, isPending: { value: false } }),
  useLinkAnswerCompanion: () => ({ mutateAsync: m.link }),
}));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCreateCompanion: () => ({ mutateAsync: m.create }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));

import PlayerTableQuestion from "./PlayerTableQuestion.vue";

const opt = (id: string, over: Partial<TableQuestionOption> = {}): TableQuestionOption => ({
  id, label: `Opt ${id}`, blurb: null, image_url: null, focal: null, ref: null, min: 1, max: 1, ...over,
});
const question = (over: Partial<TableQuestion> = {}): TableQuestion =>
  ({ id: "q1", prompt: "Pick a pet", mode: "pick", exclusive: false, hidden: false, dice: null, closed_at: null,
    outcome_option_id: null, options: [opt("a"), opt("b")], ...over }) as TableQuestion;
const answer = (over: Partial<TableQuestionAnswer>): TableQuestionAnswer =>
  ({ id: "a1", question_id: "q1", user_id: "me", party_member_id: "pm1", option_id: "a", rolled: null, companion_id: null, ...over }) as TableQuestionAnswer;
const member = { id: "pm1", name: "Brindle" } as PartyMember;

function mountQ(props: { question: TableQuestion; answers?: TableQuestionAnswer[]; isChild?: boolean; readOnly?: boolean }) {
  return mount(PlayerTableQuestion, {
    props: { answers: [], member, userId: "me", memberNames: new Map([["pm2", "Wren"]]), isChild: false, readOnly: false, ...props },
    global: { stubs: { RouterLink: true } },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PlayerTableQuestion", () => {
  it("sends the tapped option for the character", async () => {
    await mountQ({ question: question() }).findAll("button")[1].trigger("click");
    expect(m.answer).toHaveBeenCalledWith({ questionId: "q1", optionId: "b", partyMemberId: "pm1" });
  });

  it("cannot press an option someone else holds on an exclusive pick", async () => {
    const w = mountQ({ question: question({ exclusive: true }), answers: [answer({ id: "a2", user_id: "other", party_member_id: "pm2", option_id: "b" })] });
    const taken = w.findAll("button")[1];
    expect(taken.attributes("disabled")).toBeDefined();
    expect(taken.text()).toContain("Taken by Wren");
    // The holder is named once: "Taken by" already says who, so the "also chose" line stays off.
    expect(taken.text().split("Wren")).toHaveLength(2);
  });

  it("answers nothing in DM preview or once closed", async () => {
    for (const props of [{ readOnly: true }, { question: question({ closed_at: "2026-11-16T10:00:00Z" }) }]) {
      const w = mountQ({ question: question(), ...props });
      await w.findAll("button")[0].trigger("click");
    }
    expect(m.answer).not.toHaveBeenCalled();
  });

  it("tells an adult a hidden vote is secret and tells a child nothing extra", () => {
    const vote = question({ mode: "vote", hidden: true });
    expect(mountQ({ question: vote }).text()).toContain("secret until the DM closes it");
    expect(mountQ({ question: vote, isChild: true }).text()).not.toContain("secret");
  });

  it("shows who else chose an option to an adult but never to a child", () => {
    const others = [answer({ id: "a2", user_id: "other", party_member_id: "pm2", option_id: "b" })];
    expect(mountQ({ question: question(), answers: others }).text()).toContain("Wren");
    expect(mountQ({ question: question(), answers: others, isChild: true }).text()).not.toContain("Wren");
  });

  it("offers a pet only for a picked monster, and makes it a linked, non-combat pet", async () => {
    const pet = question({ options: [opt("a", { ref: { kind: "monster", id: "srd_cat" } }), opt("b", { ref: { kind: "item", id: "i" } })] });
    expect(mountQ({ question: pet, answers: [answer({ option_id: "b" })] }).text()).not.toContain("Make it");
    expect(mountQ({ question: pet, answers: [answer({ option_id: "a" })], readOnly: true }).text()).not.toContain("Make it");
    const w = mountQ({ question: pet, answers: [answer({ option_id: "a" })] });
    expect(w.text()).toContain("Make it Brindle's pet");
    await w.findAll("button").at(-1)!.trigger("click");
    await vi.waitFor(() => expect(m.link).toHaveBeenCalledWith({ answerId: "a1", companionId: "c1" }));
    expect(m.create.mock.calls[0][0]).toMatchObject({ combat_ready: false, owner_party_member_id: "pm1" });
  });

  it("says nothing was on the table when a roll lands in a gap", () => {
    const w = mountQ({ question: question({ mode: "roll" }), answers: [answer({ option_id: null, rolled: 17 })] });
    expect(w.text()).toContain("Nothing on the table for a 17");
  });
});
