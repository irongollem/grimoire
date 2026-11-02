import type { Locator, Page } from "playwright";
import { setupYtGettingStarted, teardownYtGettingStarted } from "../setup/yt-getting-started.ts";
import type { Episode, ShotContext } from "../types.ts";

/**
 * The invite link a player opens in the join shot. The signed-out page shows its form for any well-formed token, and
 * nothing in this episode joins with it, so a fixed made-up one keeps `startAt` static (the link the DM generates
 * on camera has a token nobody knows until it exists). It must look like a UUID: the Adventurer's Rest join box
 * checks that shape before it accepts a pasted code.
 */
const JOIN_TOKEN = "7c1f2e3a-5b4d-4c6e-9a8f-0b1c2d3e4f5a";

/** The label typed into the invite form; `setup/yt-getting-started.ts` removes invites that carry it. */
const INVITE_LABEL = "For Alice";

/** A sidebar link by its label. The settings page has an `aside` of its own, but only the sidebar holds links. */
function sidebarLink(page: Page, label: string): Locator {
  return page.locator("aside").getByRole("link", { name: label, exact: true });
}

/** Clicks a sidebar link, waits for the page's own text to show, and for the skeletons to go. */
async function visit({ page, tap, settled }: ShotContext, label: string, ready: Locator): Promise<void> {
  await tap(sidebarLink(page, label), 300);
  await ready.filter({ visible: true }).first().waitFor({ timeout: 15_000 });
  await settled();
}

/** The nearest card (`rounded-lg`) around a piece of text, for pointing the camera at a whole panel. */
function cardAround(target: Locator): Locator {
  return target.first().locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

/** Dismisses the one-time "press and hold to pick advantage" tip without a tap ring, so it never sits on a shot. */
async function dismissTip(page: Page): Promise<void> {
  const got = page.getByText("Got it", { exact: true });
  if (await got.count()) await got.first().dispatchEvent("click");
}

/**
 * The first long-form YouTube video: how a new DM starts and how their players join.
 *
 * Player shots use `account: "player"` on the phone (the real player view). The invite page is shown signed out on the
 * DM's desktop, whose session is cleared at the end of the members shot (nothing later on the desktop needs it).
 * DM Preview is shown on the DM's phone only to explain that feature.
 */
export const ytGettingStarted: Episode = {
  id: "yt-getting-started",
  title: "Getting started with Dungeon Grimoire",
  account: "dm",
  device: "desktop",
  format: "youtube",
  setup: setupYtGettingStarted,
  teardown: teardownYtGettingStarted,
  seed: 5,
  shots: [
    // ── 1. What Grimoire is for ─────────────────────────────────────────────
    {
      id: "intro",
      chapter: "What Grimoire is for",
      caption: "Your campaign, in one place",
      narration:
        "Dungeon Grimoire is a campaign manager for fifth edition Dungeons and Dragons. It keeps your world, your story and your table in one place, and it gives your players a view of their own. This is the campaign dashboard, where the app opens.",
      startAt: "/dashboard",
      async run({ page, hold, focus, scroll, settled }) {
        await page.getByText("Campaign Dashboard", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(2500);
        await focus(page.getByText("Campaign Dashboard", { exact: true }).filter({ visible: true }).first(), { padding: 60 });
        await hold(3000);
        await focus(null);
        await scroll(500, 4000);
        await hold(3000);
        await scroll(-500, 3000);
        await hold(1500);
      },
    },
    {
      id: "dashboard-views",
      caption: "Prep between sessions, At the table in play",
      narration:
        "Here you see the party, the quests in play and what still needs preparing. Every card is a widget, and Customize lets you arrange the page your way. There are two views. Prep is for the days between sessions, and At the table takes over when you are playing.",
      async run({ page, tap, hold, focus, settled }) {
        await hold(1000);
        // Only pointed at, never pressed: leaving customize mode can save the layout, and this video should not write one.
        await focus(page.getByRole("button", { name: "Customize" }), { padding: 140 });
        await hold(3500);
        await focus(null);
        // The view switch is a query string, nothing is saved. "At the table" is exact: the page title is "At the Table".
        await tap(page.getByText("At the table", { exact: true }).first(), 400);
        await settled();
        await hold(5500);
        await tap(page.getByText("Prep", { exact: true }).first(), 400);
        await settled();
        await hold(5500);
      },
    },

    // ── 2. Starting a campaign ──────────────────────────────────────────────
    {
      id: "switcher",
      chapter: "Starting a campaign",
      caption: "Pick your campaign in the switcher",
      narration:
        "Everything in Grimoire belongs to a campaign, and you pick yours in the switcher at the top of the sidebar. This one is marked Demo. Open the switcher and you see every campaign you run, with New Campaign at the bottom.",
      async run({ page, tap, hold, focus }) {
        // The switcher is the one sidebar button that carries the Demo marker.
        const switcher = page.locator("aside button").filter({ hasText: "Demo" }).first();
        await focus(switcher, { padding: 50 });
        await hold(3500);
        await focus(null);
        await tap(switcher, 1500);
        // The dropdown is the floating slip (data-slip) that holds New Campaign.
        const menu = page.locator("[data-slip]").filter({ hasText: "New Campaign" }).first();
        await menu.waitFor({ timeout: 10_000 });
        await focus(menu, { padding: 30 });
        await hold(6500);
      },
    },
    {
      id: "new-campaign",
      caption: "Rules edition, name, world, calendar",
      narration:
        "Choose New Campaign and the form asks first for a rules edition, the 2014 or the 2024 version of fifth edition. Then a name, and a world. Type any world you like, or pick Forgotten Realms, Eberron, Homebrew and so on. The calendar and the starting year come with it. Create Campaign finishes it, but I will cancel here, because we are going to use the demo.",
      async run({ page, tap, type, hold, focus }) {
        await tap(page.getByRole("button", { name: "New Campaign", exact: true }), 600);
        // If the paywall opened instead, the fixture is at its campaign limit: setup puts it on Pro to avoid that.
        await page.getByRole("radiogroup", { name: "Rules edition" }).waitFor({ timeout: 10_000 });
        await focus(page.getByRole("radiogroup", { name: "Rules edition" }), { padding: 40 });
        await hold(1200);
        await tap(page.getByRole("radio", { name: /2024/ }).first(), 3500);
        await focus(null);
        await type(page.getByPlaceholder(/Lost Mine of Phandelver/), "The Sunken Spire");
        await hold(800);
        await type(page.getByPlaceholder(/Forgotten Realms, Eberron/), "Homebrew");
        await hold(3000);
        await focus(page.getByText("CALENDAR", { exact: true }).locator("xpath=../.."), { padding: 40 });
        await hold(4500);
        await focus(page.getByRole("button", { name: "Create Campaign" }), { padding: 80 });
        await hold(3500);
        await focus(null);
        // Cancel, never Create: this form must not leave a campaign behind.
        await tap(page.getByRole("button", { name: "Cancel", exact: true }), 1500);
      },
    },
    {
      id: "demo",
      caption: "Or explore the ready-made demo",
      narration:
        "If you would rather look around first, load the demo campaign. A new account is offered it on its first screen, as Explore the demo, and the New Campaign form has a button for it too. It is Sugarwell, a small side trip with NPCs, a quest, a mapped site and music already set up. It is a real campaign in your account, so change whatever you like. It does not count towards your plan, and Reset demo puts it back as it was.",
      async run({ page, hold, focus, scroll, settled }) {
        await sidebarLink(page, "Settings").click();
        const note = page.getByText(/This is the Grimoire demo campaign/);
        await note.waitFor({ timeout: 15_000 });
        await settled();
        await hold(2000);
        await focus(cardAround(note), { padding: 60 });
        await hold(10_000);
        await focus(null);
        await hold(1500);
        await scroll(400, 4000);
        await hold(4000);
        await scroll(-400, 3000);
        await hold(2500);
      },
    },

    // ── 3. A tour of the sidebar ────────────────────────────────────────────
    {
      id: "tour-notes",
      chapter: "A tour of the sidebar",
      caption: "Notes: logs, lore and secrets",
      narration:
        "Now a quick walk down the sidebar, one area at a time. Notes holds your session logs, your lore and your secrets, all in one place.",
      async run(ctx) {
        await visit(ctx, "Notes", ctx.page.getByText("Session logs, lore, and secrets of the realm"));
        await ctx.hold(2500);
        await ctx.scroll(300, 2500);
        await ctx.hold(2500);
      },
    },
    {
      id: "tour-quests",
      caption: "Quests: your quest log",
      narration:
        "Quests is your quest log. Every quest has its objectives and a story flow behind it, so you always know where the party stands.",
      async run(ctx) {
        await visit(ctx, "Quests", ctx.page.getByText("Quest Log", { exact: true }));
        await ctx.hold(4500);
        await ctx.scroll(300, 2500);
        await ctx.hold(3000);
      },
    },
    {
      id: "tour-npcs",
      caption: "NPCs: everyone who is not a hero",
      narration: "NPCs tracks everyone who is not a player character: the allies, the enemies and the unknowns.",
      async run(ctx) {
        await visit(ctx, "NPCs", ctx.page.getByText("The denizens of your realm"));
        await ctx.hold(4000);
        await ctx.scroll(300, 2500);
        await ctx.hold(1500);
      },
    },
    {
      id: "tour-atlas",
      caption: "Atlas: places, from realms to dungeons",
      narration:
        "The Atlas holds your places, from whole continents down to single dungeons. Populate Setting adds the well-known places of your world, so you never start from a blank map.",
      async run(ctx) {
        const { page, hold, focus } = ctx;
        await visit(ctx, "Atlas", page.getByText("Continents, cities, dungeons, and every place in between"));
        await hold(3500);
        // Pointed at, not pressed: it would add places to the demo.
        await focus(page.getByRole("button", { name: /Populate Setting/ }).first(), { padding: 120 });
        await hold(6000);
        await focus(null);
        await hold(1500);
      },
    },
    {
      id: "tour-encounters",
      caption: "Encounters: build and run combat",
      narration:
        "Encounters is where you build fights ahead of time and run them at the table. Combat gets a video of its own.",
      async run(ctx) {
        await visit(ctx, "Encounters", ctx.page.getByText("Build and run combat encounters"));
        await ctx.hold(4000);
        await ctx.scroll(250, 2000);
        await ctx.hold(2500);
      },
    },
    {
      id: "tour-soundboard",
      caption: "Soundboard: ambience and music",
      narration:
        "The Soundboard keeps ambient sounds and music for your sessions, ready for whenever the scene changes.",
      async run(ctx) {
        await visit(ctx, "Soundboard", ctx.page.getByText("Ambient sounds & music for your sessions"));
        await ctx.hold(3500);
        await ctx.scroll(250, 2000);
        await ctx.hold(2000);
      },
    },
    {
      id: "tour-party",
      caption: "Party: your heroes at a glance",
      narration:
        "Party tracks your heroes, with their hit points, initiative and passive skills. Remember this page, because it holds the button we will use to see the game through a player's eyes.",
      async run(ctx) {
        await visit(ctx, "Party", ctx.page.getByText("Track your heroes' HP, initiative, and passive skills"));
        await ctx.hold(5000);
        await ctx.scroll(300, 2500);
        await ctx.hold(4000);
      },
    },
    {
      id: "tour-more",
      caption: "Search with Ctrl+K. Ⓘ opens the manual.",
      narration:
        "The sidebar goes on: Calendar, Factions, Sessions and more, and the Compendium group holds the bestiary, the spellbook and the item vault. Press Command K, or Control K, to search the whole campaign. Every screen has a small info icon that opens the matching page of the manual.",
      async run({ page, hold, focus }) {
        await focus(page.locator("aside").first(), { padding: 0 });
        await hold(3000);
        // The sidebar scrolls on its own; the page wheel would scroll the main column instead.
        await page.locator("aside nav").first().evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
        await hold(5000);
        await page.locator("aside nav").first().evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
        await hold(4000);
        await focus(page.locator("aside").getByRole("textbox").first(), { padding: 80 });
        await hold(4000);
        await focus(null);
        await hold(1500);
      },
    },

    // ── 4. Inviting your players ────────────────────────────────────────────
    {
      id: "members",
      chapter: "Inviting your players",
      caption: "Settings, then Members & Invites",
      narration:
        "Players join through a link that you make. Open Settings, then the Members and Invites tab. The member list comes first: you, and every player who joins, with a dot that shows who is online.",
      async run({ page, tap, hold, focus, settled }) {
        await tap(sidebarLink(page, "Settings"), 300);
        await tap(page.getByRole("button", { name: /^Members & Invites/ }), 300);
        await page.getByText("Invite Links", { exact: true }).waitFor({ timeout: 15_000 });
        await settled();
        await hold(2000);
        // DM rows are the ones that say "Dungeon Master" under the name.
        await focus(cardAround(page.getByText("Dungeon Master", { exact: true })), { padding: 60 });
        await hold(5500);
        await focus(null);
        await hold(3000);
      },
    },
    {
      id: "invite-form",
      caption: "Label it, then Generate Link",
      narration:
        "Below that is the invite panel. Give the link a label that only you can see, such as the player's name. You can add an expiry date and a maximum number of uses, or leave both empty. Joins as is Player, and Co-DM is there for someone who will run the game in your place. Then press Generate Link.",
      async run({ page, tap, type, hold, focus, scrollTo }) {
        const panel = cardAround(page.getByText("New Invite Link", { exact: true }));
        await scrollTo(page.getByText("New Invite Link", { exact: true }), 1200, 120);
        await focus(panel, { padding: 30 });
        await hold(3500);
        await type(page.getByPlaceholder("e.g. For Alice"), INVITE_LABEL);
        await hold(2500);
        // Expiry and max uses are named, not filled: an invite with neither never stops working.
        await focus(page.getByText("Joins as", { exact: true }).locator("xpath=.."), { padding: 80 });
        await hold(5500);
        await focus(panel, { padding: 30 });
        await hold(1500);
        await tap(page.getByRole("button", { name: "Generate Link" }), 2500);
      },
    },
    {
      id: "invite-copy",
      caption: "Copy it, send it, revoke it any time",
      narration:
        "The new link appears in the list, with how many times it has been used. Copy puts it on your clipboard, ready to paste into Discord, WhatsApp or an email. Revoke it with the bin icon and it stops working at once, though anyone who already joined stays.",
      async run({ page, tap, hold, focus }) {
        const url = page.locator("code").filter({ hasText: "/join/" }).first();
        await url.waitFor({ timeout: 15_000 });
        // Copy writes to the clipboard, which a fresh browser context may not allow.
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        const invite = cardAround(url);
        await focus(invite, { padding: 50 });
        await hold(5000);
        await tap(page.getByRole("button", { name: "Copy", exact: true }).first(), 2500);
        await hold(2500);
        // Pointed at, not pressed: revoking is not needed, and teardown removes the invite.
        await focus(page.getByRole("button", { name: "Revoke invite" }).first(), { padding: 100 });
        await hold(5500);
        await focus(null);
        await hold(2500);
      },
    },
    {
      id: "members-row",
      caption: "Give each player a character",
      narration:
        "Once someone has joined, they appear in the member list above. If you made a character for them, pick it from the Character list on their row. If they would rather, they can build their own, as we will see. Remove takes someone out of the campaign, and their character goes back to their own pool, nothing is deleted.",
      async run({ page, hold, focus, scroll }) {
        await scroll(-1500, 1500);
        const row = cardAround(page.getByText("Character:", { exact: true }));
        await row.waitFor({ timeout: 10_000 });
        await focus(row, { padding: 50 });
        await hold(7000);
        await focus(page.getByRole("button", { name: "Remove from campaign" }).first(), { padding: 120 });
        await hold(6500);
        await focus(null);
        await hold(2000);
        // The desktop page ends this video's DM side: the next shot is the invite page as a stranger sees it, so the
        // session goes now, while nothing on screen can show it. The page keeps running on what it has in memory
        // until the next shot reloads it signed out.
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
      },
    },

    // ── 5. What your players see ────────────────────────────────────────────
    {
      id: "join",
      chapter: "What your players see",
      caption: "The player opens the link",
      narration:
        "Your player opens the link in any browser. Without an account they see You've been invited, with New Account and Sign In. A new account starts with a birth month and year, and a player under sixteen is sent through a parent's approval instead. With an account, Sign In and Join adds them as a player straight away. If they have characters of their own that are not at a table yet, they are asked whether to bring one along.",
      startAt: `/join/${JOIN_TOKEN}`,
      async run({ page, tap, hold, focus }) {
        const heading = page.getByText("You've been invited!", { exact: true });
        // If the DM is still signed in here, the page tries to join and shows an invalid-invite message instead.
        await heading.waitFor({ timeout: 15_000 });
        await hold(3500);
        await focus(page.getByRole("button", { name: "Continue" }).locator("xpath=.."), { padding: 60 });
        await hold(6500);
        await focus(null);
        await tap(page.getByText("Sign In", { exact: true }).first(), 1000);
        await focus(page.locator("form").first(), { padding: 60 });
        await hold(8000);
        await focus(null);
        await tap(page.getByText("New Account", { exact: true }).first(), 1000);
        await hold(5000);
      },
    },
    {
      id: "hearth",
      caption: "Hearth: the player's home screen",
      narration:
        "Here is the player's own phone. This is Hearth, their home screen, as Chicory's player sees it. It shows the date in the realm, the character's numbers, the next session, anything new that you have shared, their quests and a place for notes. The bar at the bottom holds the main tabs, Hearth, Character, Spellbook and Journal, and More opens everything else.",
      device: "phone",
      account: "player",
      startAt: "/play",
      async run({ page, hold, scroll, settled }) {
        await page.getByRole("link", { name: /Hearth/ }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(4500);
        await scroll(450, 3500);
        await hold(3500);
        await scroll(450, 3500);
        await hold(3500);
        await scroll(-900, 2500);
        await hold(3500);
      },
    },
    {
      id: "claim",
      // Continues on the player's phone; without these the shot would fall back to the episode's desktop DM.
      device: "phone",
      account: "player",
      caption: "Claim a prepared hero, or make your own",
      narration:
        "A player with no character yet is offered the choice twice, on Hearth and here in their settings: Create character, which walks them through species, background and stats, or Claim existing. Claim lists every character you prepared that nobody else has taken. They pick theirs and press Claim, and it is theirs. You can also do this for them from the Members tab, as we saw.",
      async run({ page, open, tap, hold, focus, scrollTo, settled }) {
        await open("/play/settings");
        const mine = page.getByText("My Character", { exact: true }).first();
        await mine.waitFor({ timeout: 15_000 });
        await settled();
        await scrollTo(mine, 1200, 90);
        await hold(3000);
        // This player already has a character, so the same picker opens from Change. Only opened: pressing Claim would move a character.
        await tap(page.getByRole("button", { name: "Change", exact: true }).first(), 1500);
        await focus(page.getByText("Select your character:", { exact: true }).locator("xpath=.."), { padding: 30 });
        await hold(9000);
        await focus(null);
        await hold(3500);
      },
    },
    {
      id: "join-box",
      // Continues on the player's phone; without these the shot would fall back to the episode's desktop DM.
      device: "phone",
      account: "player",
      caption: "Already signed in? Paste the link.",
      narration:
        "A player who already has an account does not have to open the link in a browser. On Adventurer's Rest, under Home in the More menu, there is a Join a Campaign box. They paste the invite link, or just the code at the end of it, and press Join. It is also where their characters and campaigns are listed.",
      async run({ page, tap, type, hold, focus, scrollTo, settled }) {
        await tap(page.getByRole("button", { name: "More", exact: true }), 1800);
        await tap(page.getByRole("link", { name: "Home", exact: true }), 600);
        await page.getByText("Adventurer's Rest", { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(3500);
        await scrollTo(page.getByText("Join a Campaign", { exact: true }), 1200, 120);
        await focus(page.getByText("Join a Campaign", { exact: true }).locator("xpath=.."), { padding: 30 });
        await hold(2500);
        // Typed, never submitted: Join would go to the invite page with a token nobody holds.
        await type(page.getByPlaceholder("Invite link or code"), JOIN_TOKEN);
        await hold(6500);
        await focus(null);
        await hold(2500);
      },
    },
    {
      id: "preview",
      caption: "DM Preview: see what they see",
      narration:
        "You do not need a second account to see what a player sees, and this is the DM's side of it. In the Party tracker, tap the eye beside a character. Grimoire opens the player portal as that character, under a banner that says Previewing as, with an Exit Preview button. It is for looking around, and the player's own private notes stay private.",
      device: "phone",
      account: "dm",
      startAt: "/party",
      async run({ page, tap, hold, focus, scrollTo, settled }) {
        await page.getByRole("link", { name: "Chicory" }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(2500);
        await scrollTo(page.getByRole("link", { name: "Chicory" }).first(), 1200, 150);
        // The eye sits in the same row as the name link; its label comes from its tooltip.
        const eye = page
          .locator("div.flex.items-center.gap-1")
          .filter({ hasText: "Chicory" })
          .getByRole("button", { name: "Preview player portal as this character" })
          .first();
        await focus(eye, { padding: 80 });
        await hold(3500);
        await focus(null);
        await tap(eye, 800);
        await page.getByText("Previewing as:", { exact: true }).waitFor({ timeout: 15_000 });
        await settled();
        await dismissTip(page);
        await focus(page.getByText("Previewing as:", { exact: true }).locator("xpath=.."), { padding: 20 });
        await hold(7000);
        await focus(null);
        await hold(2500);
      },
    },
    // ── 6. Where to go next ─────────────────────────────────────────────────
    {
      id: "next",
      // Continues on the dm's phone; without these the shot would fall back to the episode's desktop DM.
      device: "phone",
      account: "dm",
      chapter: "Where to go next",
      caption: "Next: combat, sheets, running a session",
      narration:
        "That is the whole way in: make a campaign or load the demo, send a link, and your players are at the table. Exit Preview brings you back to your own dashboard. The next videos go deeper, into combat, into character sheets, and into running a session from the first tap to the last note. Thanks for watching.",
      async run({ page, tap, hold, scroll, settled }) {
        await tap(page.getByRole("button", { name: "Exit Preview" }), 800);
        // On a phone the title is truncated ("Campaign Da..."), so wait for the dashboard's own Customize button.
        await page.getByRole("button", { name: "Customize" }).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(4500);
        await scroll(500, 4000);
        await hold(4000);
        await scroll(-500, 3500);
        await hold(4500);
      },
    },
  ],
};
