// Single source of truth for all icons.
// To swap icon libraries, edit only this file.
export type { LucideIcon as AppIcon } from 'lucide-vue-next'

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
  Gamepad2, Gem, Ghost, Gift, Globe, Globe2, GraduationCap, GripVertical,
  Hammer, Hand, Handshake, Hash, Hexagon, Highlighter, Home, Image, ImagePlus, Images, Info,
  Cloud,
  KeyRound, Landmark, Layers, LayoutDashboard, LayoutGrid, LayoutList,
  Leaf, Library, LibraryBig, Lightbulb, Link, Link2, List, ListOrdered, ListTodo,
  Loader2, LoaderCircle, Lock, LogOut,
  Map, MapPin, Maximize2, Megaphone, Menu, MessageCircle, MessageSquare, Minus, Monitor, MoreHorizontal,
  Moon, MoveHorizontal, MoveVertical, Music, Music2,
  Navigation, Network,
  Package, PackageOpen, PackagePlus, PaintBucket, Paintbrush, Pause, PawPrint, Pen, PenLine, Pencil,
  PencilLine, Pickaxe, Pin, Play, Plus, Printer,
  Puzzle, Quote, Radio, RectangleHorizontal, Redo2, RefreshCw,
  Repeat, Repeat1, RotateCcw,
  Save, ScanEye, Scissors, Scroll, ScrollText, Search, Send, Settings, Settings2,
  Share2, Shield, ShieldCheck, ShoppingBag, Shuffle, SkipBack, SkipForward, Skull,
  Sparkles, Square, SquareCode, SquareSplitVertical, Stamp, Star, Strikethrough, Sun, Sword, Swords,
  Table2, Tag, Trash2, Truck,
  Underline, Undo2, Upload, UploadCloud,
  User, UserPlus, UserRound, UserX, Users, UtensilsCrossed,
  VolumeX, Wand2, Wind, Wine, WrapText, Wrench, X, XCircle, Zap, ZoomIn, ZoomOut,
} from 'lucide-vue-next'

// ── Actions ───────────────────────────────────────────────────────────────────
export { Plus as IconAdd }
export { Minus as IconMinus }
export { Trash2 as IconDelete }
export { Pencil as IconEdit }
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
export { Settings as IconSettingsAlt }
export { Sparkles as IconGenerate }    // AI generation — standardized across all generators
export { BookOpen as IconPopulate }    // populate-from-settings action — standardized
export { Wand2 as IconWand }           // magic wand (spells, decorative)
export { Loader2 as IconLoading }
export { LoaderCircle as IconLoadingAlt }
export { RefreshCw as IconRefresh }
export { RotateCcw as IconReset }
export { Eye as IconReveal }
export { EyeOff as IconHide }
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
export { BrickWall as IconWall }
export { BrickWall as IconWrapWalls }
export { PaintBucket as IconFill }
export { DoorClosed as IconDoor }
export { Box as IconCube }
export { Package as IconObjectStamp }
export { PenLine as IconAnnotate }
export { Link2 as IconEntityLink }
export { Hexagon as IconRoomTemplate }
export { Cloud as IconCave }
export { KeyRound as IconKey }
export { Highlighter as IconHighlight }

// ── Navigation / Layout ───────────────────────────────────────────────────────
export { Menu as IconMenu }
export { MoreHorizontal as IconMore }
export { Home as IconHome }
export { LayoutDashboard as IconDashboard }
export { LayoutList as IconListView }
export { LayoutGrid as IconGridView }
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
export { PenLine as IconPenLine }
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
// art + pipeline live in art-src/nav-campaign/. Swap one by re-running the
// generator and the matching NAV_GLYPHS entry updates here automatically.
import { glyph } from "./glyph";
import { NAV_GLYPHS } from "./navGlyphs.generated";
import { NAV_GLYPHS as ASSET_GLYPHS } from "./navGlyphs.assets.generated";
export const IconNavDashboard = glyph(NAV_GLYPHS.dashboard);
export const IconNavNotes = glyph(NAV_GLYPHS.notes);
export const IconNavCalendar = glyph(NAV_GLYPHS.calendar);
export const IconNavInterlude = glyph(NAV_GLYPHS.interlude);
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

// ── Custom crafting-discipline glyphs ─────────────────────────────────────────
// Hand-drawn, vectorized icons for the Workshop's crafting disciplines, in the
// same style as the nav glyphs. Source art + pipeline live in art-src/crafting/.
// Wired into src/lib/crafting-disciplines.ts.
import { CRAFTING_GLYPHS } from "./craftingGlyphs.generated";
export const IconCraftAlchemy = glyph(CRAFTING_GLYPHS.alchemy);
export const IconCraftSmithing = glyph(CRAFTING_GLYPHS.smithing);
export const IconCraftLeathercraft = glyph(CRAFTING_GLYPHS.leathercraft);
export const IconCraftWoodcraft = glyph(CRAFTING_GLYPHS.woodcraft);
export const IconCraftJewelcrafting = glyph(CRAFTING_GLYPHS.jewelcrafting);
export const IconCraftHerbalism = glyph(CRAFTING_GLYPHS.herbalism);
export const IconCraftPoisoncraft = glyph(CRAFTING_GLYPHS.poisoncraft);
export const IconCraftTinkering = glyph(CRAFTING_GLYPHS.tinkering);
export const IconCraftCooking = glyph(CRAFTING_GLYPHS.cooking);
export const IconCraftScribing = glyph(CRAFTING_GLYPHS.scribing);
export const IconCraftBrewing = glyph(CRAFTING_GLYPHS.brewing);
export const IconCraftWeaving = glyph(CRAFTING_GLYPHS.weaving);
export const IconCraftMasonry = glyph(CRAFTING_GLYPHS.masonry);
export const IconCraftPainting = glyph(CRAFTING_GLYPHS.painting);

// ── Custom polyhedral-dice glyphs ─────────────────────────────────────────────
// Hand-drawn, vectorized dice in the same style as the nav/crafting glyphs.
// Source art + pipeline live in art-src/dice/. The generic IconDice/IconDiceRoll
// point at the iconic d20; per-die glyphs feed the DiceRoller grid.
import { DICE_GLYPHS } from "./diceGlyphs.generated";
export const IconDie2 = glyph(DICE_GLYPHS.d2);
export const IconDie4 = glyph(DICE_GLYPHS.d4);
export const IconDie6 = glyph(DICE_GLYPHS.d6);
export const IconDie8 = glyph(DICE_GLYPHS.d8);
export const IconDie10 = glyph(DICE_GLYPHS.d10);
export const IconDie12 = glyph(DICE_GLYPHS.d12);
export const IconDie20 = glyph(DICE_GLYPHS.d20);
export const IconDie100 = glyph(DICE_GLYPHS.d100);
export const IconDice = glyph(DICE_GLYPHS.d20);
export const IconDiceRoll = glyph(DICE_GLYPHS.d20);

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
