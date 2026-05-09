import type {
  AssetItem,
  ExtractedHolding,
  HoldingCreateInput,
  HoldingUpdateInput,
  HoldingsImageExtractResponse,
  ImportResult,
  ImportExtractedHoldingsResult,
  MarketInstrument,
  MarketQuote,
  PortfolioBackupFile,
  PortfolioImportResult,
  Summary,
  StrategyAdviceRequest,
  StrategyAdviceResponse,
  TransactionCreateInput,
  TransactionItem,
  TrendPoint,
  User,
} from '@/types';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

interface ErrorPayload {
  detail?: unknown;
  message?: unknown;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = (await response.json()) as ErrorPayload;
      const payloadMessage = payload.detail ?? payload.message;
      message = typeof payloadMessage === 'string' ? payloadMessage : message;
    } catch {
      // Keep status text when the response body is not JSON.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (email: string, password: string) => request<User>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  }),
  register: (email: string, password: string, inviteCode: string) => request<User>('/api/auth/register', {
    method: 'POST',
    body: { email, password, invite_code: inviteCode },
  }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  holdings: () => request<AssetItem[]>('/api/holdings'),
  createHolding: (payload: HoldingCreateInput) => request<AssetItem>('/api/holdings', {
    method: 'POST',
    body: payload,
  }),
  updateHolding: (id: string, payload: HoldingUpdateInput) => request<AssetItem>(`/api/holdings/${id}`, {
    method: 'PATCH',
    body: payload,
  }),
  deleteHolding: (id: string) => request<{ ok: boolean }>(`/api/holdings/${id}`, { method: 'DELETE' }),
  transactions: (holdingId: string) => request<TransactionItem[]>(`/api/holdings/${holdingId}/transactions`),
  createTransaction: (holdingId: string, payload: TransactionCreateInput) => request<TransactionItem>(`/api/holdings/${holdingId}/transactions`, {
    method: 'POST',
    body: payload,
  }),
  refreshHoldingPrice: (holdingId: string) => request<AssetItem>(`/api/holdings/${holdingId}/refresh-price`, {
    method: 'POST',
  }),
  searchMarket: (query: string, market: 'CN' | 'US') => request<MarketInstrument[]>(`/api/market/search?q=${encodeURIComponent(query)}&market=${market}`),
  quoteMarket: (market: string, symbol: string, kind: string) => request<MarketQuote>(`/api/market/quote?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbol)}&kind=${encodeURIComponent(kind)}`),
  summary: () => request<Summary>('/api/analytics/summary'),
  trend: (range: 'week' | 'month' | 'year') => request<TrendPoint[]>(`/api/analytics/trend?range=${range}`),
  holdingTrend: (holdingId: string, range: 'week' | 'month' | 'year') => request<TrendPoint[]>(`/api/holdings/${holdingId}/trend?range=${range}`),
  importLocalStorage: (assets: unknown[]) => request<ImportResult>('/api/import/local-storage', {
    method: 'POST',
    body: { assets },
  }),
  exportPortfolio: () => request<PortfolioBackupFile>('/api/portfolio/export'),
  importPortfolio: (payload: PortfolioBackupFile) => request<PortfolioImportResult>('/api/portfolio/import', {
    method: 'POST',
    body: payload,
  }),
  strategyAdvice: (payload: StrategyAdviceRequest) => request<StrategyAdviceResponse>('/api/ai/strategy-advice', {
    method: 'POST',
    body: payload,
  }),
  extractHoldingsImage: (imageDataUrl: string) => request<HoldingsImageExtractResponse>('/api/ai/extract-holdings-image', {
    method: 'POST',
    body: { image_data_url: imageDataUrl },
  }),
  importExtractedHoldings: (holdings: ExtractedHolding[]) => request<ImportExtractedHoldingsResult>('/api/ai/import-extracted-holdings', {
    method: 'POST',
    body: { holdings },
  }),
};
