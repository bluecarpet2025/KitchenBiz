export type DateMode = "today" | "week" | "month" | "ytd" | "custom";

export type Range = {
  mode: DateMode;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (exclusive end)
};

export type DefinitionsItem = {
  label: string;
  formula: string;
  note?: string;
};
