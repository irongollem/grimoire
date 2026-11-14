import { advanceToNextBeat, arriveAtEntry, setupQuests, teardownQuests } from "../setup/quests.ts";
import type { Episode } from "../types.ts";

/** A player's phone while the DM runs the quest. Its pair, `quests-dm`, is the DM's side of it. */
export const questsPlayer: Episode = {
  id: "quests-player",
  title: "Quests: your party's story, as it happens",
  pairedWith: "quests-dm",
  account: "player",
  device: "phone",
  setup: setupQuests,
  teardown: teardownQuests,
  seed: 6,
  shots: [
    {
      id: "log",
      caption: "Your DM shares a quest with you",
      narration: "Your DM shares a quest, and it appears in your Journal, under Quest Log.",
      startAt: "/play/journal?tab=quest-log",
      async run({ page, tap, hold }) {
        await page.getByText("The Locked Workshop").first().waitFor({ timeout: 20_000 });
        await hold(2200);
        await tap(page.getByText("The Locked Workshop").first(), 1200);
        await page.getByText("Objectives").first().waitFor({ timeout: 20_000 });
        await hold(2000);
      },
    },
    {
      id: "story",
      caption: "The story fills in live",
      narration: "Then your DM reveals the first scene, and Story so far fills in on your own phone. Happening now marks where the party stands.",
      async run({ page, offstage, hold, scroll, scrollTo }) {
        const dm = await offstage("dm");
        await scroll(520, 900);
        await hold(900);
        await arriveAtEntry(dm);
        await page.getByText("Story so far").first().waitFor({ timeout: 20_000 });
        await scrollTo(page.getByText("Story so far").first(), 900, 110);
        await hold(4200);
      },
    },
    {
      id: "moves",
      caption: "The party moves on. So does your page.",
      narration: "The party moves on, and the next scene joins the story. You never refresh.",
      async run({ page, offstage, hold }) {
        const dm = await offstage("dm");
        await advanceToNextBeat(dm);
        await page.getByText("glazed shut").first().waitFor({ timeout: 20_000 });
        await hold(4200);
      },
    },
    {
      id: "objective",
      caption: "An objective ticks off",
      narration: "And the Objectives tick off as the party completes them.",
      async run({ page, hold, scrollTo }) {
        await scrollTo(page.getByText("Objectives").first(), 1000, 110);
        await page.getByText("1/4").first().waitFor({ timeout: 10_000 });
        await hold(4000);
      },
    },
  ],
};
