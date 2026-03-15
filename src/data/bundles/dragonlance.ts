import type { SettingBundle } from "./index";

/**
 * Dragonlance (Krynn) — major historical events.
 * All dates in Age of Despair / Age of Mortals calendar (AC = After Cataclysm).
 * Default year: 351 AC (War of the Lance, as per Shadow of the Dragon Queen).
 * Month numbers: 1=Newkolt, 2=Deepkolt, 3=Brookgreen, 4=Yurthgreen,
 * 5=Fleurgreen, 6=Holden, 7=Fierswelt, 8=Reapember, 9=Paleswelt,
 * 10=Havesthold, 11=Frostkolt, 12=Darkember.
 */
const dragonlanceBundle: SettingBundle = {
  calendarId: "dragonlance",
  name: "Dragonlance — Major Historical Events",
  description:
    "The pivotal events of Krynn's history: the Cataclysm that shattered the Kingpriest's hubris, the War of the Lance that returned true gods to the world, the Chaos War, and the Age of Mortals. Essential context for any campaign on Ansalon.",
  events: [
    // ── Age of Dreams ──────────────────────────────────────────────────────────
    {
      title: "The All-Saints War",
      description:
        "The first major religious war on Krynn. The Kingpriest of Istar begins a systematic campaign to classify all sentient beings as good or evil, outlawing neutrality. Clerics of Gilean and neutral orders are persecuted. This marks the beginning of the moral absolutism that will eventually doom Istar.",
      event_type: "boss_fight",
      harptos_year: -118,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: true,
      end_year: -118,
      end_month: 12,
      end_day: 28,
      color: "#C0392B",
    },
    {
      title: "The Kingpriest Demands the Gods Appear",
      description:
        "Beldinas Pilofiro, the Kingpriest of Istar at the height of his power, performs the Kingpriest's Prayer — a ritual demanding that the gods of Good appear before him and give him the power to destroy all evil. He believes his righteousness is so pure that he has earned the right to compel the divine. The gods see only unforgivable pride.",
      event_type: "world",
      harptos_year: -1,
      harptos_month: 10,
      harptos_day: 14,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#6A1B9A",
    },

    // ── The Cataclysm ─────────────────────────────────────────────────────────
    {
      title: "The Cataclysm — The Fiery Mountain Falls",
      description:
        "The gods, answering the Kingpriest's demand in the most terrible way possible, hurl a mountain of fire from the sky into the heart of Istar. The continent of Ansalon is reshaped: coastlines shift, new seas flood the interior, cities are swallowed by the earth. The Kingpriest and all of Istar are obliterated. The gods go silent — they will not answer prayers for 300 years. Year 0 AC (After Cataclysm) begins.",
      event_type: "world",
      harptos_year: 0,
      harptos_month: 10,
      harptos_day: 15,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#E67E22",
    },

    // ── Age of Despair ────────────────────────────────────────────────────────
    {
      title: "The Gods Withdraw — Age of Despair Begins",
      description:
        "Following the Cataclysm, the gods of Krynn withdraw from the world. True clerical magic ceases. Healers can no longer call on divine power. The world is thrown into centuries of spiritual darkness, with false religions and charlatans filling the void. The dragons and draconians will not emerge for centuries, but the seeds of the next great evil are already being planted.",
      event_type: "world",
      harptos_year: 0,
      harptos_month: 10,
      harptos_day: 16,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#7F8C8D",
    },
    {
      title: "Takhisis Rediscovers Krynn",
      description:
        "The Dark Queen Takhisis, goddess of evil dragons, rediscovers the pathway back to Krynn. She brings the corrupted eggs of good dragons with her, using them to create draconians — the first new soldiers of her coming army. She begins corrupting dragon eggs and recruiting mortal followers, laying the groundwork for the Dragon Armies.",
      event_type: "world",
      harptos_year: 328,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#6A1B9A",
    },
    {
      title: "The Dragon Armies Form",
      description:
        "Takhisis's chosen general, the Dragon Highlord Ariakas, assembles the Dragon Armies: five armies each led by a Highlord and supported by flights of chromatic dragons. The armies begin their conquests, sweeping through the nations of Ansalon. Most of the continent falls within years.",
      event_type: "boss_fight",
      harptos_year: 348,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: true,
      end_year: 350,
      end_month: 12,
      end_day: 28,
      color: "#C0392B",
    },

    // ── War of the Lance ───────────────────────────────────────────────────────
    {
      title: "The War of the Lance Begins",
      description:
        "The Dragon Armies of Takhisis invade Ansalon in force. Solace falls. The Heroes of the Lance — Tanis Half-Elven, Sturm Brightblade, Caramon and Raistlin Majere, Flint Fireforge, Tasslehoff Burrfoot, Goldmoon, and Riverwind — are reunited at the Inn of the Last Home. Goldmoon carries a blue crystal staff that can perform true healing — the first proof the gods still exist.",
      event_type: "boss_fight",
      harptos_year: 351,
      harptos_month: 10,
      harptos_day: 22,
      festival_day: null,
      is_multi_day: true,
      end_year: 353,
      end_month: 12,
      end_day: 28,
      color: "#C0392B",
    },
    {
      title: "Return of the True Gods",
      description:
        "Through the efforts of the Heroes of the Lance, the staff of Mishakal is returned to the gods. Goldmoon becomes the first true cleric in 300 years. The news spreads quickly: the gods did not abandon Krynn — mortals turned away from them. True healing magic returns to the world alongside clerics of all the pantheons.",
      event_type: "world",
      harptos_year: 352,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#2E7D32",
    },
    {
      title: "Death of Sturm Brightblade — Battle of the High Clerist's Tower",
      description:
        "Knight of Solamnia Sturm Brightblade dies defending the High Clerist's Tower against the Dragon Army of the Blue Highlord Kitiara Uth Matar (half-sister of Caramon and Raistlin). Sturm's death holds the tower long enough for the Dragon Orb to destroy the attacking dragons. He dies in the armor of a Knight of the Rose though he never earned that rank in life — an honor granted posthumously.",
      event_type: "npc_death",
      harptos_year: 352,
      harptos_month: 3,
      harptos_day: 8,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#7F8C8D",
    },
    {
      title: "Fall of the Dragon Highlords — End of the War of the Lance",
      description:
        "The Heroes of the Lance infiltrate the Temple of Takhisis in Neraka, the Dark Queen's foothold in the world. Dragon Highlord Ariakas is slain. Takhisis is banished back to the Abyss. The Dragon Armies splinter and collapse without unified command. Ansalon is free — though scarred. The war is over.",
      event_type: "boss_fight",
      harptos_year: 353,
      harptos_month: 7,
      harptos_day: 15,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#C0392B",
    },

    // ── Post-Lance & Chaos War ─────────────────────────────────────────────────
    {
      title: "Raistlin Majere Attempts to Become a God",
      description:
        "The archmage Raistlin Majere, now the most powerful mortal wizard on Krynn, enters the Abyss to challenge Takhisis herself. He destroys her and takes her place — but at the cost of having already destroyed all life on Krynn. In the ruined future he witnesses his own victory and its meaninglessness. He chooses not to return to the present, sacrificing his life to prevent his own success.",
      event_type: "npc_death",
      harptos_year: 357,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#6A1B9A",
    },
    {
      title: "The Chaos War — Father of All & Nothing",
      description:
        "The god Chaos — the primordial force of entropy from which all creation sprang — is freed from his imprisonment within the Graygem. Chaos unleashes his children (fire dragons, shadow wights, chaos wraiths) across Krynn in an attempt to destroy it utterly. The armies of light and darkness must fight side by side. Many heroes die. Ultimately, Chaos is re-imprisoned using the blood of mortals.",
      event_type: "boss_fight",
      harptos_year: 383,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: true,
      end_year: 384,
      end_month: 6,
      end_day: 1,
      color: "#E67E22",
    },
    {
      title: "The Gods Depart — Age of Mortals Begins",
      description:
        "As the price for Chaos's imprisonment, the gods of Krynn depart from the world entirely — both good and evil. Divine magic vanishes once more. The mystical power of the heart (sorcery and mysticism) slowly replaces arcane and divine magic. The metallic and chromatic dragons agree to leave Krynn as well, with a few remaining. The Age of Mortals begins — Krynn's destiny is now entirely in mortal hands.",
      event_type: "world",
      harptos_year: 384,
      harptos_month: 6,
      harptos_day: 2,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#7F8C8D",
    },

    // ── Age of Mortals ────────────────────────────────────────────────────────
    {
      title: "Dragon Overlords Rise",
      description:
        "Massive, ancient dragons — far larger and more powerful than any seen before — emerge from their lairs and begin claiming entire nations as their personal territories. Beryllinthranox (Beryl) claims the Qualinesti forest. Malystryx (Malys) takes the Goodlund Peninsula. Others stake claims across Ansalon. Without the gods or the great metallic dragons to oppose them, mortals can do little.",
      event_type: "world",
      harptos_year: 390,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#C0392B",
    },
    {
      title: "The War of Souls — Takhisis Steals the World",
      description:
        "The goddess Takhisis, having secretly moved the entire world of Krynn to a new location in the cosmos during the Chaos War, now returns as Mina — a mysterious golden-eyed girl who wields the magic of the One God. She leads an undead army called the Knights of Neraka. Her goal: to claim all mortal souls for herself and ascend to the position of sole deity of Krynn.",
      event_type: "boss_fight",
      harptos_year: 421,
      harptos_month: 1,
      harptos_day: 1,
      festival_day: null,
      is_multi_day: true,
      end_year: 422,
      end_month: 12,
      end_day: 28,
      color: "#6A1B9A",
    },
    {
      title: "Death of Takhisis — The Gods Return",
      description:
        "Takhisis is slain by Silvanoshei, prince of Silvanesti, at Mina's urging. The world is restored to its rightful place in the cosmos. The gods — both good and evil — return to Krynn. Paladine, god of Good, sacrifices his immortality and becomes the mortal elf Valthonis as the price for Takhisis's crime. Divine magic is restored, though Ansalon must process the return of divine powers it had abandoned.",
      event_type: "npc_death",
      harptos_year: 422,
      harptos_month: 12,
      harptos_day: 28,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      color: "#2E7D32",
    },
  ],
};

export default dragonlanceBundle;
