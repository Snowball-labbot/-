export enum AssetType {
  CASH = 'cash',
  STOCK = 'stock',
  BOND = 'bond',
  FUND = 'fund',
  PROPERTY = 'property',
  OTHER = 'other'
}

export interface AssetItem {
  id: string;
  type: AssetType;
  name: string;
  group?: string | null;
  market?: string | null;
  symbol?: string | null;
  instrument_name?: string | null;
  quote_source?: string | null;
  currency: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  current_value: number;
  current_value_cny: number;
  exchange_rate_to_cny: number;
  price_updated_at?: string | null;
  unrealized_gain_native: number;
  unrealized_gain_cny: number;
  unrealized_gain_pct: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionItem {
  id: string;
  holding_id: string;
  type: 'buy' | 'sell' | 'adjustment' | 'cash_in' | 'cash_out';
  trade_date: string;
  quantity: number;
  unit_price: number;
  fee: number;
  currency: string;
  exchange_rate_to_cny: number;
  note?: string | null;
  created_at: string;
}

export interface AssetTypeConfig {
  label: string;
  color: string;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

export interface HoldingCreateInput {
  type: AssetType;
  name: string;
  group?: string | null;
  market?: string | null;
  symbol?: string | null;
  currency: string;
  quantity: number;
  unit_price: number;
  current_price?: number | null;
  fee: number;
  exchange_rate_to_cny: number;
  trade_date?: string;
  note?: string | null;
}

export interface HoldingUpdateInput {
  name?: string;
  group?: string | null;
  market?: string | null;
  symbol?: string | null;
  currency?: string;
  exchange_rate_to_cny?: number;
}

export interface TransactionCreateInput {
  type: TransactionItem['type'];
  quantity: number;
  unit_price: number;
  fee: number;
  currency: string;
  exchange_rate_to_cny: number;
  trade_date?: string;
  note?: string | null;
}

export interface Summary {
  total_value_cny: number;
  total_cost_cny: number;
  unrealized_gain_cny: number;
  slices: Array<{ type: AssetType; value_cny: number; count: number }>;
}

export interface TrendPoint {
  date: string;
  value_cny: number;
}

export interface PortfolioBackupTransaction {
  type: TransactionItem['type'];
  trade_date?: string | null;
  quantity: number;
  unit_price: number;
  fee: number;
  currency: string;
  exchange_rate_to_cny: number;
  note?: string | null;
}

export interface PortfolioBackupHolding {
  type: AssetType | string;
  name: string;
  group?: string | null;
  market?: string | null;
  symbol?: string | null;
  instrument_name?: string | null;
  quote_source?: string | null;
  currency: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  exchange_rate_to_cny: number;
  price_updated_at?: string | null;
  transactions: PortfolioBackupTransaction[];
}

export interface PortfolioBackupFile {
  schema_version: 'portfolio_backup_v1' | string;
  exported_at?: string;
  base_currency?: string;
  holdings: PortfolioBackupHolding[];
}

export interface PortfolioImportResult {
  imported: number;
}

export interface MarketInstrument {
  symbol: string;
  name: string;
  market: 'CN' | 'US' | string;
  kind: 'fund' | 'stock' | string;
  currency: string;
  price?: number | null;
  price_updated_at?: string | null;
  quote_source?: string | null;
}

export interface MarketQuote extends MarketInstrument {
  price: number;
  exchange_rate_to_cny: number;
  price_updated_at: string;
  quote_source: string;
}

export interface StrategyAdviceRequest {
  selected_strategy: Record<string, unknown>;
  allocation_rows: Array<Record<string, unknown>>;
  custom_context?: string | null;
  chat_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface StrategyAdviceResponse {
  advice_markdown: string;
  risk_flags: string[];
  rebalance_notes: string[];
}

export interface ExtractedHolding {
  type: AssetType | string;
  market?: string | null;
  symbol?: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  current_price?: number | null;
  currency: string;
  exchange_rate_to_cny: number;
  group?: string | null;
  note?: string | null;
  confidence?: number | null;
}

export interface HoldingsImageExtractResponse {
  holdings: ExtractedHolding[];
}

export interface ImportExtractedHoldingsResult {
  imported: number;
  holdings: AssetItem[];
}
