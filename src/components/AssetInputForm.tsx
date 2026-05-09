import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { useAssetStore } from '@/store/useAssetStore';
import { ASSET_CONFIG } from '@/constants/assets';
import { AssetType, MarketInstrument } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface AssetInputFormProps {
  onSuccess?: () => void;
}

const quoteEnabledTypes = new Set<AssetType>([AssetType.FUND, AssetType.STOCK, AssetType.BOND]);

function inferMarket(value: string, type: AssetType): 'CN' | 'US' {
  const text = value.trim();
  if (/^\d{5,6}$/.test(text)) return 'CN';
  if (type === AssetType.FUND || type === AssetType.BOND) return 'CN';
  return 'US';
}

function inferKind(market: 'CN' | 'US'): 'fund' | 'stock' {
  return market === 'CN' ? 'fund' : 'stock';
}

export function AssetInputForm({ onSuccess }: AssetInputFormProps) {
  const { addAsset, assets } = useAssetStore();
  const [type, setType] = useState<AssetType>(AssetType.FUND);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [symbol, setSymbol] = useState('');
  const [market, setMarket] = useState<'CN' | 'US'>('CN');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [latestPrice, setLatestPrice] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [fee, setFee] = useState('0');
  const [candidates, setCandidates] = useState<MarketInstrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState('');
  const [error, setError] = useState('');

  const existingGroups = useMemo(() => Array.from(new Set(
    assets.filter((asset) => asset.type === type && asset.group).map((asset) => asset.group as string)
  )), [assets, type]);

  useEffect(() => {
    const query = symbol.trim();
    if (!quoteEnabledTypes.has(type) || query.length < 2) {
      setCandidates([]);
      setQuoteMessage('');
      return;
    }

    const nextMarket = inferMarket(query, type);
    setMarket(nextMarket);
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setQuoteMessage('');
      try {
        const results = await api.searchMarket(query, nextMarket);
        setCandidates(results);
        if (results.length === 0) {
          setQuoteMessage('没有匹配行情，可以继续手动填写价格');
        }
      } catch (err: any) {
        setCandidates([]);
        setQuoteMessage(err.message || '行情查询失败，可以继续手动填写价格');
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [symbol, type]);

  const applyQuote = (quote: MarketInstrument & { exchange_rate_to_cny?: number | null }) => {
    const nextMarket = quote.market === 'US' ? 'US' : 'CN';
    setMarket(nextMarket);
    setSymbol(quote.symbol);
    setName(quote.name);
    setCurrency(quote.currency || (nextMarket === 'US' ? 'USD' : 'CNY'));
    setType((previousType) => {
      if (nextMarket === 'US') return AssetType.STOCK;
      if (previousType === AssetType.BOND) return AssetType.BOND;
      return AssetType.FUND;
    });

    if (quote.price !== undefined && quote.price !== null) {
      const price = String(quote.price);
      setLatestPrice(price);
      if (!unitPrice) setUnitPrice(price);
    }

    if (quote.exchange_rate_to_cny) {
      setExchangeRate(String(quote.exchange_rate_to_cny));
    } else if (nextMarket === 'CN') {
      setExchangeRate('1');
    }
  };

  const selectCandidate = async (candidate: MarketInstrument) => {
    applyQuote(candidate);
    setCandidates([]);
    setQuoteMessage(candidate.price ? '已带出最新价格' : '已绑定代码，正在获取最新价格');

    try {
      const quote = await api.quoteMarket(candidate.market, candidate.symbol, candidate.kind);
      applyQuote(quote);
      setQuoteMessage('已自动绑定最新价格');
    } catch (err: any) {
      setQuoteMessage(err.message || '最新价格获取失败，可以手动填写价格');
    }
  };

  const refreshTypedSymbol = async () => {
    const query = symbol.trim();
    if (!query || !quoteEnabledTypes.has(type)) return;
    const nextMarket = inferMarket(query, type);
    setSearching(true);
    setQuoteMessage('');
    try {
      const quote = await api.quoteMarket(nextMarket, query, inferKind(nextMarket));
      applyQuote(quote);
      setQuoteMessage('已自动绑定最新价格');
    } catch (err: any) {
      setQuoteMessage(err.message || '行情获取失败，可以手动填写价格');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numQuantity = parseFloat(quantity);
    const buyPrice = parseFloat(unitPrice || latestPrice);
    const currentPrice = parseFloat(latestPrice || unitPrice);
    const numFee = parseFloat(fee || '0');
    const numExchangeRate = parseFloat(exchangeRate || '1');

    if (isNaN(numQuantity) || numQuantity < 0 || isNaN(buyPrice) || buyPrice < 0 || isNaN(currentPrice) || currentPrice < 0 || isNaN(numExchangeRate) || numExchangeRate <= 0) {
      setError('请输入有效的份额、成本、价格和汇率');
      return;
    }

    try {
      await addAsset({
        type,
        name: name || symbol || `${ASSET_CONFIG[type].label}持仓`,
        group: group || undefined,
        market: symbol ? market : undefined,
        symbol: symbol || undefined,
        currency: currency.toUpperCase(),
        quantity: numQuantity,
        unit_price: buyPrice,
        current_price: currentPrice,
        fee: isNaN(numFee) ? 0 : numFee,
        exchange_rate_to_cny: numExchangeRate,
      });
    } catch (err: any) {
      setError(err.message || '添加资产失败');
      return;
    }

    setName('');
    setGroup('');
    setSymbol('');
    setQuantity('1');
    setUnitPrice('');
    setLatestPrice('');
    setCurrency('CNY');
    setExchangeRate('1');
    setFee('0');
    setCandidates([]);
    setQuoteMessage('');
    setError('');
    onSuccess?.();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>新增持仓</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">资产类型</label>
              <select
                value={type}
                onChange={(e) => {
                  const nextType = e.target.value as AssetType;
                  setType(nextType);
                  if (nextType !== AssetType.STOCK) {
                    setMarket('CN');
                    setCurrency('CNY');
                    setExchangeRate('1');
                  } else {
                    setMarket('US');
                    setCurrency('USD');
                  }
                  setCandidates([]);
                  setQuoteMessage('');
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {Object.entries(ASSET_CONFIG).map(([assetType, config]) => (
                  <option key={assetType} value={assetType}>{config.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">行情代码/名称</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value);
                    if (error) setError('');
                  }}
                  onBlur={refreshTypedSymbol}
                  placeholder="可选：017091 / 515450 / AAPL"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-10 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {symbol && (
                  <button
                    type="button"
                    onClick={() => {
                      setSymbol('');
                      setCandidates([]);
                      setQuoteMessage('');
                    }}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  >
                    <X size={14} />
                  </button>
                )}
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={16} />}
                {candidates.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {candidates.map((candidate) => (
                      <button
                        key={`${candidate.market}-${candidate.symbol}-${candidate.name}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCandidate(candidate)}
                        className="w-full border-b px-4 py-3 text-left text-sm last:border-b-0 hover:bg-gray-50"
                      >
                        <div className="font-medium text-gray-900">
                          {candidate.name} ({candidate.symbol}) - {candidate.market === 'US' ? '美股' : '基金'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {candidate.currency}{candidate.price ? ` · 最新价 ${Number(candidate.price).toLocaleString()}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {quoteMessage && <p className="text-xs text-gray-500">{quoteMessage}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">资产名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入资产名称"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">子文件夹/分组</label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="输入或选择分组"
                list="groups-list"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <datalist id="groups-list">
                {existingGroups.map((item) => <option key={item} value={item} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">持有份额/股数</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (error) setError('');
                }}
                step="0.0001"
                min="0"
                placeholder="0"
                className={cn("flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", error ? "border-red-500 focus-visible:ring-red-500" : "")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">买入单位成本</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                step="0.0001"
                min="0"
                placeholder="可改成真实买入成本"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1.35fr_1fr_1fr] gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">币种</label>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="whitespace-nowrap text-sm font-medium leading-none">最新单位价格</label>
              <input
                type="number"
                value={latestPrice}
                onChange={(e) => setLatestPrice(e.target.value)}
                step="0.0001"
                min="0"
                placeholder="自动或手动"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">兑人民币</label>
              <input
                type="number"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                step="0.0001"
                min="0"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">费用</label>
              <input
                type="number"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                step="0.01"
                min="0"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="mr-2 h-4 w-4" /> 添加持仓
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
