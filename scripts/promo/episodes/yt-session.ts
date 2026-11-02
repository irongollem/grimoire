import type { Page } from "playwright";
import { NOTED_NPC, setupYtSession, teardownYtSession } from "../setup/yt-session.ts";
import type { Episode, ShotContext } from "../types.ts";

type Target = ReturnType<Page["locator"]>;

/**
 * How one video shows two people.
 *
 * The episode is filmed as the DM (`account: "dm"`, desktop). The player chapter's shots override both
 * (`account: "player"`, `device: "phone"`), so the phone is the real player fixture's own signed-in portal,
 * not a preview. The offstage DM presses the reveal while the phone is filmed, as `session-player` does, so
 * the arrival in the chat is live.
 */

/** The soundboard panel that opens by itself when the session's scene starts playing; its close button sits after "Stop All" (as in `session-dm`). */
function closeSoundboardPanel(page: Page): Target {
  return page.getByRole("button", { name: "Stop All" }).first().locator("xpath=following-sibling::button");
}

/** Taps a control only when it is on the page: for labels read from the code but never seen in a take. */
async function tapIfThere(tap: ShotContext["tap"], target: Target, holdMs: number): Promise<boolean> {
  if ((await target.count()) === 0) return false;
  await tap(target.first(), holdMs);
  return true;
}

/** A pad on the soundboard: `SoundPad` is a bare `<button>` whose class carries `group/pad`. */
function pads(page: Page): Target {
  return page.locator('button[class*="group/pad"]');
}

/** A pinned link in the player portal's phone bottom nav (Hearth, Character, Spellbook, Journal by default). */
function portalLink(page: Page, label: string): Target {
  // The bottom nav has a hidden twin for wider screens; only the visible link can be tapped. An unread dot
  // (aria-label "New") prefixes the name, so "Journal" reads "New Journal": match the label at the end.
  return page.getByRole("link", { name: new RegExp(`(^|\\s)${label}$`) }).filter({ visible: true });
}

export const ytSession: Episode = {
  id: "yt-session",
  title: "Running a session with Grimoire",
  account: "dm",
  format: "youtube",
  device: "desktop",
  setup: setupYtSession,
  teardown: teardownYtSession,
  // The offstage DM is opened before the first shot so its first, slow load is not on camera.
  async prepare({ offstage }) {
    const dm = await offstage("dm");
    await dm.open("/npcs");
  },
  seed: 3,
  shots: [
    // ---------------------------------------------------------------- Preparing
    {
      id: "intro",
      chapter: "Preparing the night",
      caption: "Prepare the night, then run it",
      narration:
        "A game night in Grimoire has two halves: the preparing, and the table. This video follows both, from the DM's screen, and from what lands on your players' phones.",
      startAt: "/dashboard",
      async run({ page, hold, focus }) {
        await hold(3500);
        // The Prep / At the table switch is the dashboard's whole idea in two words.
        await focus(page.getByRole("button", { name: "At the table", exact: true }), { padding: 120 });
        await hold(3500);
        await focus(null);
        await hold(2500);
      },
    },
    {
      id: "arrange",
      caption: "Arrange your DM screen your way",
      narration:
        "Your dashboard is yours to arrange. Press Customize, make a widget wider or taller, and press Done. Every change saves as you make it, per campaign, so the layout follows you to any device.",
      async run({ page, tap, hold, focus }) {
        await hold(1500);
        await tap(page.getByRole("button", { name: "Customize" }), 1800);
        await tap(page.getByRole("button", { name: /^Wider, currently/ }).first(), 2000);
        await tap(page.getByRole("button", { name: /^Taller, currently 1/ }).first(), 2200);
        await focus(null);
        await hold(1200);
        await tap(page.getByRole("button", { name: "Done" }), 2200);
      },
    },
    {
      id: "surfaces",
      caption: "Two boards: Prep and At the table",
      narration:
        "The dashboard keeps two boards. Prep shows what still needs work. At the table shows what matters while you run the game. It switches by itself when you start a session, and you can look at the other one whenever you like.",
      async run({ page, tap, hold }) {
        await hold(1800);
        await tap(page.getByRole("button", { name: "At the table", exact: true }), 4500);
        // Back to the board the session state would pick anyway, which also clears the override.
        await tap(page.getByRole("button", { name: "Prep", exact: true }), 4500);
        await hold(2000);
      },
    },
    {
      id: "prep-sounds",
      caption: "Sounds are prepared in Arrange mode",
      narration:
        "Sounds belong to preparing too. Outside a session the soundboard is in arrange mode, with every control in reach. Drag sounds into order, trim one that is too loud, build ambient scenes that layer on top of each other, and music playlists that play one track at a time.",
      startAt: "/soundboard",
      async run({ page, hold, scroll, settled }) {
        await page.getByText("Ambient sounds & music for your sessions").filter({ visible: true }).first().waitFor();
        await settled();
        await hold(4500);
        await scroll(260, 1600);
        await hold(4000);
        await scroll(-260, 1200);
        await hold(1500);
      },
    },

    // ----------------------------------------------------------------- Starting
    {
      id: "start",
      chapter: "Starting the session",
      caption: "Start the session. Players see it.",
      narration:
        "When the table sits down, press Start session. Grimoire suggests the next number, and fills in the title if today is a scheduled date. Both are yours to change. Press Start, and the whole screen turns to the table.",
      startAt: "/dashboard",
      async run({ page, tap, hold }) {
        await hold(1200);
        await tap(page.getByRole("button", { name: "Start session", exact: true }).first(), 3500);
        // The button names the number: setup leaves two ended sessions, so this one is the third.
        await tap(page.getByRole("dialog").getByRole("button", { name: "Start session 3" }).last(), 2500);
        await page.getByText(/session 3 live/i).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await hold(1500);
      },
    },
    {
      id: "changes",
      caption: "What changes while it runs",
      narration:
        "A live rail under the session control keeps the time, and lists whatever is running: a fight, quests in play, sounds playing. The dashboard shows the table board. Quests open on the run cockpit. The soundboard turns to performance pads. And a reveal now announces itself to your players.",
      async run({ page, tap, hold, focus }) {
        const rail = page.getByText(/session 3 live/i).first();
        await focus(rail.locator("xpath=../.."), { padding: 40 });
        await hold(5000);
        await focus(null);
        await tap(closeSoundboardPanel(page), 1500);
        await hold(6000);
      },
    },

    // ------------------------------------------------------------------ Quests
    {
      id: "cockpit",
      chapter: "Running a quest",
      caption: "Quests open ready to run",
      narration:
        "Open a quest during a session and it lands on Run, the cockpit. It walks one thread of the story at a time, with a thread bar across the top to switch between them. You see the current beat, its read-aloud text, and what can happen next.",
      startAt: "/quests",
      async run({ page, tap, hold, scroll, settled }) {
        await page.getByText("The Locked Workshop").filter({ visible: true }).first().waitFor();
        await settled();
        await hold(1200);
        await tap(page.getByText("The Locked Workshop").first(), 400);
        await page.getByText("Threads in this quest", { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(4000);
        await scroll(420, 2200);
        await hold(3500);
      },
    },
    {
      id: "advance",
      caption: "Advance, jump, or improvise",
      narration:
        "Choosing a route opens the Advance dialog, the one place a move is recorded. Jump reaches any beat, even a closed one, and always asks you for a reason, because it overrides the story's gates. And moving the party never reveals anything to your players by itself.",
      async run({ page, hold, scroll }) {
        await hold(1500);
        await scroll(-420, 1500);
        await hold(2500);
        // J opens Jump (quests-running manual); Escape closes it with nothing recorded.
        await page.keyboard.press("j");
        await hold(4500);
        await page.keyboard.press("Escape");
        await hold(3000);
      },
    },

    // -------------------------------------------------------------- Atmosphere
    {
      id: "pads",
      chapter: "Atmosphere",
      caption: "The soundboard becomes your pads",
      narration:
        "With a session running, the soundboard switches to Perform. The same sounds, as big pads with their artwork, and none of the editing controls, so you cannot rearrange the board by accident mid-scene. Tap a pad to fire it. Double-tap to loop it.",
      startAt: "/soundboard",
      async run({ page, tap, hold, scroll, settled }) {
        await page.getByText("Ambient sounds & music for your sessions").filter({ visible: true }).first().waitFor();
        await settled();
        await hold(4500);
        await tapIfThere(tap, pads(page), 4000);
        await scroll(260, 1600);
        await hold(3500);
      },
    },
    {
      id: "pads-more",
      caption: "Keys 1 to 9, mixer, shared music",
      narration:
        "Keys one to nine fire the first nine pads, in the order you set. The mixer pulls down a whole group, the ambience say, without touching your music. And in Board settings you can share the playing music with players who are not in the room. It is off by default, it is music only, and each player presses Join audio on their own device.",
      async run({ page, tap, hold, scroll }) {
        await scroll(-260, 1200);
        await hold(1500);
        await tapIfThere(tap, page.getByRole("button", { name: "Mixer" }), 4500);
        await tap(page.getByRole("button", { name: "Board settings", exact: true }), 6000);
        await page.keyboard.press("Escape");
        await hold(2000);
      },
    },

    // ---------------------------------------------------------- Notes and reveals
    {
      id: "dm-notes",
      chapter: "Notes and reveals",
      caption: "A private note on everything",
      narration:
        "Every NPC, place, monster and quest has a DM note: one private box your players never see. It saves as you type, so you never open an editor to jot something down at the table.",
      startAt: "/npcs",
      async run({ page, tap, type, hold, settled }) {
        await page.getByText(NOTED_NPC).filter({ visible: true }).first().waitFor();
        await settled();
        await hold(1000);
        // An NPC card is covered by a stretched link (a.absolute.inset-0) that takes the click, not the name.
        await tap(
          page
            .getByText(NOTED_NPC, { exact: true })
            .first()
            .locator("xpath=ancestor::*[.//a[starts-with(@href, '/npcs/')]][1]//a[starts-with(@href, '/npcs/')]")
            .first(),
          1500,
        );
        const box = page.getByRole("region", { name: "DM notes" });
        await box.waitFor({ timeout: 15_000 });
        const editor = box.locator('[contenteditable="true"]').first();
        await tap(editor, 400);
        await type(editor, "Follow up next session: what does she want in return?");
        // "Saved" is the autosave status line under the note.
        await box.getByText("Saved").filter({ visible: true }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
        await hold(3000);
      },
    },
    {
      id: "scratchpad",
      caption: "The scratchpad follows you around",
      narration:
        "Press Command and semicolon, or the DM notes button, and the scratchpad opens beside whatever you are looking at. Pin a note to keep it while you browse. Under it, This session lists everything you wrote on since you started, ready for next week's prep.",
      async run({ page, tap, hold }) {
        // The NPC sheet from the last shot covers the sidebar's DM notes button; close it first.
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").filter({ hasText: NOTED_NPC }).waitFor({ state: "hidden", timeout: 5000 });
        await hold(500);
        await tap(page.getByRole("button", { name: "DM notes" }).first(), 3500);
        await page.getByText("This session").filter({ visible: true }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
        await hold(3500);
        await tapIfThere(tap, page.getByRole("button", { name: "Pin this note" }), 2500);
        await hold(2000);
        await tap(page.getByRole("button", { name: "Close DM scratchpad" }), 1500);
      },
    },
    {
      id: "reveal-control",
      caption: "Reveal a character to your party",
      narration:
        "Sharing a character is one button. While a session runs, revealing someone to the party posts a line in their chat. With no session running, the same reveal is silent. Watch the phone.",
      async run({ page, hold, focus }) {
        const reveal = page.getByRole("button", { name: `Reveal ${NOTED_NPC} to players` }).first();
        await hold(1500);
        await focus(reveal, { padding: 80 });
        await hold(4000);
        await focus(null);
        await hold(1500);
      },
    },

    // ------------------------------------------------------------ What players see
    {
      id: "phone-live",
      chapter: "What your players see",
      caption: "The player's Hearth turns to the table",
      narration:
        "Now the player's own phone. The moment you start, it knows. Their Hearth turns from waiting to the table, with a Live now banner and how long the session has been running. On a wider screen a quiet live marker sits in the header too.",
      device: "phone",
      account: "player",
      startAt: "/play",
      async run({ page, hold, settled }) {
        await settled();
        // The Hearth's session band (HearthLiveBanner), read for a seated member through get_player_session_state.
        await page.getByText("Live now").filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await hold(8000);
      },
    },
    {
      id: "phone-chat",
      caption: "Reveals land in the chat",
      narration:
        "The chat announces that the session begins. And when you reveal someone the party has met, they appear in the chat while players watch.",
      device: "phone",
      account: "player",
      async run({ page, offstage, tap, hold }) {
        const dm = await offstage("dm");
        await tap(page.getByRole("button", { name: /chat/i }).first(), 1500);
        // The line also sits in a hidden copy of the chat elsewhere on the page, so wait for the one on screen.
        await page.getByText("The session begins.").filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await hold(2000);
        // Not `dm.open`: it waits for a network that never goes quiet, and nobody is filming the DM's page.
        await dm.page.goto(`${dm.base}/npcs`);
        await dm.page.getByRole("button", { name: `Reveal ${NOTED_NPC} to players` }).click();
        await dm.page.getByRole("button", { name: "Whole party" }).click();
        await page.getByText(NOTED_NPC).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await hold(4500);
      },
    },
    {
      id: "phone-journal",
      caption: "Handouts and notice boards",
      narration:
        "The Journal keeps what you share: the quest log, handouts, and any notice board you reveal. A handout is a Scriptorium document you give to players. A notice board is a tavern board you pin quests to. Players can read any pin, but they only take a notice when you present the board to the table.",
      device: "phone",
      account: "player",
      async run({ page, tap, hold }) {
        // The chat sheet from the last shot covers the page and Escape does not close it: use its own button.
        await tap(page.getByRole("button", { name: "Close chat" }).filter({ visible: true }).first(), 800);
        // Journal is one of the four pinned links in the phone bottom nav (PlayerBottomNav). Not optional: without it the shot shows the wrong page.
        await tap(portalLink(page, "Journal").first(), 2000);
        // The Journal's tab bar scrolls sideways on a phone; these two sit off screen until tapped into view.
        await tap(page.getByRole("tab", { name: /Handouts/ }).filter({ visible: true }).first(), 6500);
        await tap(page.getByRole("tab", { name: /Notice Boards/ }).filter({ visible: true }).first(), 8000);
        await hold(2000);
      },
    },

    // ------------------------------------------------------------------- Ending
    {
      id: "end",
      chapter: "Ending the night",
      caption: "End the session. Nothing else moves.",
      narration:
        "When the night is over, press the cross beside the live pill. Ending closes the entry in your log and nothing more. Quest threads stay where the party left them, and a fight in progress stays live for next time. A toast offers Undo, in case you pressed it by mistake.",
      device: "desktop",
      startAt: "/dashboard",
      async run({ page, tap, hold }) {
        await hold(2500);
        await tap(page.getByRole("button", { name: "End session" }).first(), 5000);
        await hold(5000);
      },
    },
    {
      id: "log",
      caption: "Every evening, remembered",
      narration:
        "The Sessions page remembers every evening, newest first, with its length and what came of it. Open one and it lists what the party learned: people met, places, handouts, creatures discovered, quests and combat. You never log that by hand. Whatever you shared while the session ran is filed under it. And a session with no notes says so, so you can write them, or have the Chronicler draft them.",
      startAt: "/sessions",
      async run({ page, tap, hold, scroll, settled }) {
        await settled();
        await hold(5000);
        const row = page.getByRole("link", { name: /^Session 3/ }).first();
        if ((await row.count()) > 0) {
          await tap(row, 800);
          await page.getByText("People met").filter({ visible: true }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
          await settled();
          await hold(6000);
          await scroll(300, 1800);
        }
        await hold(6000);
      },
    },
  ],
};
