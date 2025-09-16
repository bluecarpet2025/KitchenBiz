import { ImportTemplate } from './types';

export const templates: Record<string, ImportTemplate> = {
  receipts: {
    type: 'receipts',
    version: 1,
    description: 'Receipt lines (one row per item in the receipt)',
    columns: [
      { key: 'date',        label: 'Purchase date', required: true,  type: 'date',   synonyms: ['purchased_at','purchase_date'], example: '2025-09-14' },
      { key: 'vendor',      label: 'Vendor',        required: false, type: 'string', synonyms: ['supplier','store'], example: 'Restaurant Depot' },
      { key: 'note',        label: 'Note',          required: false, type: 'string', synonyms: ['invoice','memo'], example: 'Invoice 1234' },
      { key: 'item_name',   label: 'Item name',     required: true,  type: 'string', synonyms: ['item','inventory_item'], example: 'Mozzarella' },
      { key: 'qty',         label: 'Qty (base)',    required: true,  type: 'number', synonyms: ['quantity','qty_base'], example: '1000' },
      { key: 'unit',        label: 'Unit (base)',   required: false, type: 'string', synonyms: ['base_unit'], example: 'g' },
      { key: 'total_cost',  label: 'Total cost',    required: true,  type: 'money',  synonyms: ['cost','amount'], example: '57.89' },
    ],
  },

  sales: {
    type: 'sales',
    version: 1,
    description: 'Sales rows (one row per line item)',
    columns: [
      { key: 'date',       label: 'Date',      required: true,  type: 'date',   synonyms: ['sold_at'] },
      { key: 'item_name',  label: 'Item',      required: true,  type: 'string', synonyms: ['product'] },
      { key: 'qty',        label: 'Qty',       required: true,  type: 'number', synonyms: ['quantity'] },
      { key: 'unit_price', label: 'Unit $',    required: true,  type: 'money',  synonyms: ['price'] },
      { key: 'tax',        label: 'Tax $',     required: false, type: 'money' },
      { key: 'discount',   label: 'Discount $',required: false, type: 'money' },
      { key: 'channel',    label: 'Channel',   required: false, type: 'string', synonyms: ['source','pos'] },
      { key: 'order_id',   label: 'Order ID',  required: false, type: 'string' },
    ],
  },

  expenses: {
    type: 'expenses',
    version: 1,
    description: 'Expenses (one row per expense)',
    columns: [
      { key: 'date',     label: 'Date',     required: true,  type: 'date' },
      { key: 'vendor',   label: 'Vendor',   required: false, type: 'string' },
      { key: 'amount',   label: 'Amount',   required: true,  type: 'money',  synonyms: ['total','cost'] },
      { key: 'category', label: 'Category', required: true,  type: 'string' },
      { key: 'note',     label: 'Note',     required: false, type: 'string' },
      { key: 'tax',      label: 'Tax',      required: false, type: 'money' },
    ],
  },
};

export function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}
