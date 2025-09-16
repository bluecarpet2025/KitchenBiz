export type ImportType = 'receipts' | 'sales' | 'expenses';

export type ColumnSpec = {
  key: string;              // internal field name
  label: string;            // shown in UI
  required?: boolean;
  type: 'string' | 'number' | 'date' | 'money';
  synonyms?: string[];      // for fuzzy header match
  example?: string;
};

export type ImportTemplate = {
  type: ImportType;
  version: number;
  description: string;
  columns: ColumnSpec[];
};

export type ParsedRow = Record<string, string | number | null>;

export type ImportMapping = Record<string, string>; // csvHeader -> columnSpec.key

export type ImportDryRunResult = {
  ok: boolean;
  accepted: number;
  rejected: number;
  errors: { row: number; message: string }[];
  preview: ParsedRow[];
};
