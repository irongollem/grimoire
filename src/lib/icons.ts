// Single source of truth for all icons.
// To swap icon libraries, edit only this file.
export type { LucideIcon as AppIcon } from '@lucide/vue'

import {
  AlertCircle, AlertTriangle, AlignCenter, AlignLeft, AlignRight,
  Archive, ArrowUpFromLine, Award, Axe,
  Backpack, BarChart2, BetweenHorizontalEnd, BetweenVerticalEnd, Cast,
  BookMarked, BookOpen, BookPlus, BookText, BookUser, Bookmark, Box, Brain, BrickWall, Brush, Bug,
  Calendar, CalendarCheck, CalendarDays, CalendarPlus, CalendarX,
  Check, CheckCheck, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  ChevronsUpDown, Circle, CircleCheck, CircleUser, Clipboard, Clock, Code, Coins,
  Columns2, Component, Copy, CreditCard, Crosshair, Crown,
  Dna, DoorClosed, DoorOpen, Download, Droplets,
  Eraser, ExternalLink, Eye, EyeOff,
  Feather, FileDown, FileText, Flag, Flame, FlaskConical,
  Gamepad2, Gem, Ghost, Gift, Globe, Globe2, GraduationCap, GripVertical, Grid3x3,
  Hammer, Hand, Handshake, Hash, Hexagon, Highlighter, Home, Image, ImagePlus, Images, Info,
  Cloud,
  Keyboard, KeyRound, Landmark, Layers, LayoutDashboard, LayoutGrid, LayoutList,
  Shrink,
  Leaf, Library, LibraryBig, Lightbulb, Link, Link2, List, ListOrdered, ListTodo,
  Lock, LogOut,
  Map, MapPin, Maximize2, Megaphone, Menu, MessageCircle, MessageSquare, Minus, Monitor, MoreHorizontal,
  Moon, MousePointer2, MoveHorizontal, MoveVertical, Music, Music2,
  Navigation, Network,
  Package, PackageOpen, PackagePlus, PaintBucket, Paintbrush, Pause, PawPrint, Pen,
  PencilLine, PencilRuler, Pickaxe, Pin, Play, Plus, Printer,
  Puzzle, Quote, Radio, RectangleHorizontal, Redo2, RefreshCw,
  Repeat, Repeat1, RotateCcw, Ruler,
  PictureInPicture2,
  Save, ScanEye, Scissors, Scroll, ScrollText, Search, Send, Settings, Settings2,
  Share2, Shield, ShieldCheck, ShoppingBag, Shuffle, SkipBack, SkipForward, Skull, SlidersHorizontal,
  Sparkles, Square, SquareCode, SquareSplitVertical, Stamp, Star, Strikethrough, Sun, Sword, Swords,
  Table2, Tag, Trash2, Truck,
  Aperture, TrendingUp,
  Underline, Undo2, Upload, UploadCloud,
  User, UserPlus, UserRound, UserX, Users, UtensilsCrossed,
  VolumeX, Wand2, Wind, Wine, WrapText, Wrench, X, XCircle, Zap, ZoomIn, ZoomOut,
  Fence, Type,
} from '@lucide/vue'

// ── Actions ───────────────────────────────────────────────────────────────────
export { PictureInPicture2 as IconPopOut }
export { Plus as IconAdd }
export { Minus as IconMinus }
export { Trash2 as IconDelete }
export { Feather as IconEdit }
export { Save as IconSave }
export { Copy as IconCopy }
export { X as IconClose }
export { XCircle as IconCloseCircle }
export { Search as IconSearch }
export { Upload as IconUpload }
export { UploadCloud as IconUploadCloud }
export { Download as IconDownload }
export { FileDown as IconExport }
export { Share2 as IconShare }
export { Send as IconSend }
export { ExternalLink as IconExternalLink }
export { Link as IconLink }
export { Link2 as IconLinkAlt }
export { Settings2 as IconSettings }
export { SlidersHorizontal as IconMixer }   // fader bank — the soundboard mixer drawer
export { Settings as IconSettingsAlt }
export { Sparkles as IconGenerate }    // AI generation — standardized across all generators
export { BookOpen as IconPopulate }    // populate-from-settings action — standardized
export { Wand2 as IconWand }           // magic wand (spells, decorative)
export { RefreshCw as IconRefresh }
export { RotateCcw as IconReset }
export { Eye as IconReveal }
export { EyeOff as IconHide }
export { EyeOff as IconSecret }
export { Pin as IconPin }
export { Archive as IconArchive }
export { Printer as IconPrint }
export { Lock as IconLock }
export { LogOut as IconLogOut }
export { Check as IconCheck }
export { CheckCheck as IconCheckDouble }
export { CheckCircle as IconCheckCircle }
export { CircleCheck as IconCircleCheck }
export { Redo2 as IconRedo }
export { Undo2 as IconUndo }
export { UserPlus as IconAddUser }
export { UserX as IconRemoveUser }
export { ImagePlus as IconAddImage }
export { BookPlus as IconAddBook }
export { PackagePlus as IconAddItem }
export { CalendarPlus as IconAddEvent }
export { CalendarX as IconRemoveEvent }
export { CalendarCheck as IconCalendarCheck }
export { Clipboard as IconClipboard }
export { ScanEye as IconScan }
export { Stamp as IconStamp }
export { Scissors as IconScissors }
export { Paintbrush as IconPaint }
export { Brush as IconBrush }
export { Eraser as IconEraser }
export { Hand as IconHand }
/** The Cartographer's Select tool — the default tool, so it needs its
 *  own glyph distinct from Pan's `IconHand`: a click-to-select cursor, not a
 *  grabbing hand. */
export { MousePointer2 as IconSelect }
export { BrickWall as IconWall }
/** Wrap walls: a wall run all the way round a floor area. Not the brick
 *  glyph `IconWall` uses: the Cartographer palette shows both tools side by
 *  side, and two identical buttons read as one tool twice. */
export { Fence as IconWrapWalls }
export { PaintBucket as IconFill }
export { DoorClosed as IconDoor }
export { Box as IconCube }
/** Object stamp: not `Package`, which beside `IconCube` (Solid block) in the
 *  same palette read as the same box twice. */
export { Stamp as IconObjectStamp }
/** Annotate places text on the map (shortcut T), so a text glyph, not the
 *  pen the Line tool used to share with it. */
export { Type as IconAnnotate }
export { Link2 as IconEntityLink }
export { Hexagon as IconRoomTemplate }
export { Cloud as IconCave }
/** The site map's Fog layer toggle (#884, wave 4, S12) — same glyph as
 *  `IconCave`, reused deliberately under its own alias: "cave" (an entity
 *  type icon) and "fog" (a played map layer) never appear side by side, so
 *  there is no ambiguity to resolve. */
export { Cloud as IconFog }
export { KeyRound as IconKey }
export { Keyboard as IconKeyboard }
export { Highlighter as IconHighlight }

// ── Navigation / Layout ───────────────────────────────────────────────────────
export { Menu as IconMenu }
export { MoreHorizontal as IconMore }
export { Home as IconHome }
export { LayoutDashboard as IconDashboard }
export { LayoutList as IconListView }
export { LayoutGrid as IconGridView }
/** The site map's Grid layer toggle (#868) — distinct from `IconGridView`,
 *  which means "list vs. grid layout" elsewhere in the app. */
export { Grid3x3 as IconGrid }
/** Dense grid packing — the Customize-mode "Pack tightly" toggle (#768). */
export { Shrink as IconPack }
export { Columns2 as IconColumns }
export { ChevronDown as IconChevronDown }
export { ChevronUp as IconChevronUp }
export { ChevronLeft as IconChevronLeft }
export { ChevronRight as IconChevronRight }
export { ChevronsUpDown as IconSort }
export { GripVertical as IconDrag }
export { MoveHorizontal as IconMoveH }
export { MoveVertical as IconMoveV }
export { ArrowUpFromLine as IconArrowUp }
export { ZoomIn as IconZoomIn }
export { ZoomOut as IconZoomOut }
export { Maximize2 as IconMaximize }
export { Navigation as IconNavigate }
export { Ruler as IconRuler }

// ── Status / Feedback ─────────────────────────────────────────────────────────
export { Info as IconInfo }
export { AlertTriangle as IconWarning }
export { AlertCircle as IconAlertCircle }
export { Lightbulb as IconTip }
export { Star as IconStar }
export { Flag as IconFlag }
export { Bookmark as IconBookmark }
export { Tag as IconTag }
export { Hash as IconHash }
export { Radio as IconLive }
export { Circle as IconCircle }
export { RectangleHorizontal as IconRect }

// ── People / Auth ─────────────────────────────────────────────────────────────
export { User as IconUser }
export { UserRound as IconUserRound }
export { Users as IconParty }
export { Crown as IconDM }
export { CircleUser as IconUserCircle }
export { GraduationCap as IconLevel }
export { Award as IconAward }
export { CreditCard as IconBilling }
export { Handshake as IconInvite }
export { Network as IconNetwork }

// ── DnD Domain ────────────────────────────────────────────────────────────────
export { Map as IconMap }
export { Calendar as IconCalendar }
export { CalendarDays as IconCalendarDays }
export { BookText as IconNote }
export { Scroll as IconQuest }
export { LibraryBig as IconScriptorium }
export { Library as IconLibrary }
export { Swords as IconEncounter }
export { Sword as IconSword }
export { Shield as IconShield }
export { ShieldCheck as IconShieldCheck }
export { Skull as IconMonster }
export { Backpack as IconInventory }
export { Package as IconPackage }
export { PackageOpen as IconPackageOpen }
export { MapPin as IconLocation }
export { DoorOpen as IconDungeon }
// Way-out kinds (#868) — DOOR_KINDS in locationDoor.types.ts. `door` reuses
// IconDoor above; these four are the rest of that set, kept together so a
// glance at this block matches the enum. Lucide ships no stair/shaft/portal
// icon, so each borrows the closest existing shape: an arch is an open
// doorway (the same glyph as IconDungeon, under its own name so callers never
// have to know the two concepts share an icon), a stair reads as an ascending
// line, a shaft as travel straight up/down, a portal as an iris/aperture.
export { DoorOpen as IconArch }
export { TrendingUp as IconStairs }
export { MoveVertical as IconShaft }
export { Aperture as IconPortal }
export { Crosshair as IconTrap }
export { Crosshair as IconCenter }
export { Puzzle as IconPuzzle }
export { Globe as IconFaction }
export { Globe2 as IconGlobe }
export { Coins as IconCoins }
export { Gem as IconGem }
export { FlaskConical as IconPotion }
export { Flame as IconFire }
export { Droplets as IconWater }
export { Leaf as IconNature }
export { Wind as IconWind }
export { Zap as IconLightning }
export { Sun as IconSun }
export { Moon as IconMoon }
export { Ghost as IconUndead }
export { PawPrint as IconBeast }
export { Axe as IconAxe }
export { Pickaxe as IconPickaxe }
export { Hammer as IconCraft }
export { Wrench as IconTool }
export { Dna as IconSpecies }
export { Brain as IconMind }
export { Feather as IconFeather }
export { Gift as IconLoot }
export { ShoppingBag as IconShop }
export { Truck as IconCaravan }
export { Wine as IconTavern }
export { UtensilsCrossed as IconFood }
export { Landmark as IconLandmark }

// ── Multimedia / Soundboard ───────────────────────────────────────────────────
export { Play as IconPlay }
export { Pause as IconPause }
export { Square as IconStop }
export { SkipBack as IconSkipBack }
export { SkipForward as IconSkipForward }
export { Repeat as IconRepeat }
export { Repeat1 as IconRepeatOne }
export { Shuffle as IconShuffle }
export { VolumeX as IconMute }
export { Music as IconMusic }
export { Music2 as IconMusicNote }
export { Cast as IconCast }

// ── Content / Rich Text ───────────────────────────────────────────────────────
export { AlignLeft as IconAlignLeft }
export { AlignCenter as IconAlignCenter }
export { AlignRight as IconAlignRight }
export { List as IconList }
export { ListOrdered as IconListOrdered }
export { ListTodo as IconListTodo }
export { Quote as IconQuote }
export { Code as IconCodeInline }
export { SquareCode as IconCodeBlock }
export { Strikethrough as IconStrikethrough }
export { Underline as IconUnderline }
export { WrapText as IconWrapText }
export { Pen as IconPen }
/** The Cartographer's Line tool: straight lines, so a pencil and ruler. */
export { PencilRuler as IconDrawLine }
export { PencilLine as IconPencilLine }
export { Table2 as IconTable }
export { BetweenHorizontalEnd as IconInsertRow }
export { BetweenVerticalEnd as IconInsertColumn }
export { SquareSplitVertical as IconSplitCell }
export { FileText as IconDocument }
export { ScrollText as IconScrollText }
export { Image as IconImage }
export { Images as IconImages }
export { BookUser as IconBookUser }
export { BookMarked as IconBookMarked }
export { Layers as IconLayers }

// ── Custom nav glyphs ─────────────────────────────────────────────────────────
// Hand-drawn, vectorized icons for the Campaign nav section. Dedicated names so
// repointing them never disturbs the shared Lucide icons used elsewhere. Source
// art is in the local art-src/nav-campaign/ dump and the pipeline is
// scripts/glyphs (the /glyph skill); adding or replacing a glyph there updates
// the matching NAV_GLYPHS entry here automatically.
// These are on the startup path (the sidebar is on every page), so they stay
// in this module; the generated data is already optimised by the pipeline.
import { glyph } from "@/lib/glyph";
import { NAV_GLYPHS } from "@/lib/navGlyphs.generated";
import { NAV_GLYPHS as ASSET_GLYPHS } from "@/lib/navGlyphs.assets.generated";

// Brand marks are NOT here. A third-party logo may not be recoloured or
// redrawn, and everything in this file is built to tint with `currentColor`.
// They live in src/components/brand/ and render verbatim — see BrandMark.vue.

// Compass rose: where an entity is (NPC card locations). A drawn glyph
// rather than Lucide's map pin, which reads as a phone maps app.
export const IconCompassRose = glyph(
  '<path d="M71 29 59 50 71 71 50 59 29 71 41 50 29 29 50 41Z" opacity=".55"/>' +
    '<path fill-rule="evenodd" d="M50 3 58 42 97 50 58 58 50 97 42 58 3 50 42 42Z M50 44a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z"/>',
);
// Hearth (#977): the campfire from the maintainer's sheet (art-src/nav-campaign/hearth-sheet.png).
export const IconNavHearth = glyph(NAV_GLYPHS.hearth);
// Hall of the Fallen (#982): the candle in a shrine from the maintainer's sheet
// (art-src/nav-campaign/hall of the fallen.png). It honours the retired as well as the dead.
export const IconNavFallen = glyph(NAV_GLYPHS.fallen);
export const IconNavDashboard = glyph(NAV_GLYPHS.dashboard);
export const IconNavNotes = glyph(NAV_GLYPHS.notes);
export const IconNavCalendar = glyph(NAV_GLYPHS.calendar);
export const IconNavInterlude = glyph(NAV_GLYPHS.interlude);
export const IconNavSessions = glyph(NAV_GLYPHS.sessions);
export const IconNavSimulacrum = glyph(NAV_GLYPHS.simulacrum);
export const IconNavQuests = glyph(NAV_GLYPHS.quests);
export const IconNavAtlas = glyph(NAV_GLYPHS.atlas);
export const IconNavPantheon = glyph(NAV_GLYPHS.pantheon);
export const IconNavFactions = glyph(NAV_GLYPHS.factions);
export const IconNavNpcs = glyph(NAV_GLYPHS.npcs);
export const IconNavEncounters = glyph(NAV_GLYPHS.encounters);
export const IconNavParty = glyph(NAV_GLYPHS.party);
export const IconNavWorkshop = glyph(NAV_GLYPHS.workshop);
export const IconNavSoundboard = glyph(NAV_GLYPHS.soundboard);
export const IconNavSettings = glyph(NAV_GLYPHS.settings);
export const IconNavReliquary = glyph(NAV_GLYPHS.reliquary);
export const IconNavCampaign = glyph(NAV_GLYPHS.campaign);
// Assets + Publish nav sections
export const IconNavGallery = glyph(ASSET_GLYPHS.gallery);
export const IconNavBestiary = glyph(ASSET_GLYPHS.bestiary);
export const IconNavSpellbook = glyph(ASSET_GLYPHS.spellbook);
export const IconNavItemVault = glyph(ASSET_GLYPHS.itemvault);
export const IconNavDungeonCraft = glyph(ASSET_GLYPHS.dungeoncraft);
export const IconNavCodex = glyph(ASSET_GLYPHS.codex);
export const IconNavHeroes = glyph(ASSET_GLYPHS.heroes);
export const IconNavScriptorium = glyph(ASSET_GLYPHS.scriptorium);
export const IconNavCharacterSheet = glyph(ASSET_GLYPHS.charactersheet);
export const IconNavCardForge = glyph(ASSET_GLYPHS.cardforge);
export const IconNavMint = glyph(ASSET_GLYPHS.mint);
export const IconNavIlluminator = glyph(ASSET_GLYPHS.illuminator);
export const IconNavCartographer = glyph(ASSET_GLYPHS.cartographer);

// ── Custom dice glyph (the d20) ───────────────────────────────────────────────
// Hand-drawn, vectorized d20 in the same style as the nav glyphs (source art in
// the local art-src/dice/ dump, pipeline in scripts/glyphs). Only the d20 is here: IconDice/IconDiceRoll
// have 17 consumers and sit on the startup path, so the other dice (and the
// crafting disciplines) live beside the features that draw them, in
// src/lib/dice/dieIcons.ts and src/lib/crafting/craftingIcons.ts. A glyph
// module imported here lands in the entry chunk whole, which is why they are
// not.
import { DICE_D20_GLYPHS } from "@/lib/diceGlyphs.d20.generated";
export const IconDice = glyph(DICE_D20_GLYPHS.d20);
export const IconDiceRoll = glyph(DICE_D20_GLYPHS.d20);

// ── UI / Misc ─────────────────────────────────────────────────────────────────
export { BarChart2 as IconChart }
export { Component as IconComponent }
export { Bug as IconBug }
export { Lightbulb as IconLightbulb }
export { Monitor as IconMonitor }
export { MessageCircle as IconMessage }
export { MessageSquare as IconComment }
export { Megaphone as IconAnnounce }
export { Clock as IconClock }
export { Gamepad2 as IconGamepad }
