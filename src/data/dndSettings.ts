export const DND_SETTINGS = [
  { value: "faerun",       label: "Forgotten Realms"          },
  { value: "eberron",      label: "Eberron"                   },
  { value: "ravenloft",    label: "Ravenloft"                 },
  { value: "dragonlance",  label: "Dragonlance"               },
  { value: "greyhawk",     label: "Greyhawk"                  },
  { value: "planescape",   label: "Planescape"                },
  { value: "spelljammer",  label: "Spelljammer"               },
  { value: "dark_sun",     label: "Dark Sun"                  },
  { value: "mystara",      label: "Mystara"                   },
  { value: "homebrew",     label: "Homebrew"                  },
  { value: "other",        label: "Other"                     },
] as const;

export type DndSettingValue = (typeof DND_SETTINGS)[number]["value"];
