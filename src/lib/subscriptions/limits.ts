export const FREE_USAGE_LIMITS = {
  analysis: { dailyLimit: 3, label: "full engine analyses", displayName: "Game analysis" },
  puzzle: { dailyLimit: 10, label: "puzzles", displayName: "Puzzles" },
  puzzleRush: { dailyLimit: 1, label: "Puzzle Rush attempt", displayName: "Puzzle Rush" },
} as const;

export type LimitedFeature = keyof typeof FREE_USAGE_LIMITS;

export function isLimitedFeature(value: unknown): value is LimitedFeature {
  return typeof value === "string" && Object.hasOwn(FREE_USAGE_LIMITS, value);
}

export function localDayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}