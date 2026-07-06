import { useState } from 'react';
import { PlusCircle, RefreshCw } from 'lucide-react';
import { AssetItem, AssetType, TransactionItem } from '@/types';
import { useAssetStore } from '@/store/useAssetStore';
import { api, getErrorMessage } from '@/lib/api';

interface TransactionFormProps {
  asset: AssetItem;
}

function quoteKind(asset: AssetItem) {
  if (asset.type === AssetType.FUND || asset.type === AssetType.BOND) return 'fund';
  return 'stock';
}

export function TransactionForm({ asset }: TransactionFormProps) {
  const { addTransaction } = useAssetStore();
  const [type, setType] = useState<TransactionItem['type']>('buy');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState(asset.current_price ? String(asset.current_price) : '');
  const [fee, setFee] = useState('0');
  const [exchangeRate, setExchangeRate] = useState(String(asset.exchange_rate_to_cny || 1));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const canSyncQuote = Boolean(asset.market && asset.symbol);

  const syncQuote = async () => {
    if (!asset.market || !asset.symbol) return;
    setSyncing(true);
    setError('');
    try {
      const quote = await api.quoteMarket(asset.market, asset.symbol, quoteKind(asset));
      setUnitPrice(String(quote.price));
      setExchangeRate(String(quote.exchange_rate_to_cny));
      setNote((current) => current || `按 ${quote.quote_source} 同步行情`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '同步行情失败，请手动填写单价和汇率。'));
    } finally {
      setSyncing(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQuantity = parseFloat(quantity || '0');
    const parsedPrice = parseFloat(unitPrice || '0');
    const parsedFee = parseFloat(fee || '0');
    const parsedExchangeRate = parseFloat(exchangeRate || '1');

    if (
      isNaN(parsedQuantity)
      || parsedQuantity < 0
      || isNaN(parsedPrice)
      || parsedPrice < 0
      || isNaN(parsedExchangeRate)
      || parsedExchangeRate <= 0
    ) {
      setError('请输入有效的份额、价格和汇率');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addTransaction(asset.id, {
        type,
        quantity: parsedQuantity,
        unit_price: parsedPrice,
        fee: isNaN(parsedFee) ? 0 : parsedFee,
        currency: asset.currency,
        exchange_rate_to_cny: parsedExchangeRate,
        note: note || undefined,
      });
      setQuantity('');
      setNote('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '保存流水失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-ink-100 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-ink-900">交易流水</h3>
          <p className="mt-1 text-xs text-ink-400">记录买入、卖出或价格调整，保存后更新持仓估值。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-500">{asset.currency}</span>
          <button
            type="button"
            onClick={syncQuote}
            disabled={!canSyncQuote || syncing || saving}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-40"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            同步行情
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TransactionItem['type'])}
          className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-brand-500"
        >
          <option value="buy">买入/追加</option>
          <option value="sell">卖出/减少</option>
          <option value="adjustment">价格/手动调整</option>
        </select>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          step="0.0001"
          min="0"
          placeholder="份额/股数"
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
        <input
          type="number"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          step="0.0001"
          min="0"
          placeholder="成交/最新单价"
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
        <input
          type="number"
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          step="0.0001"
          min="0"
          placeholder="兑人民币"
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
        <input
          type="number"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          step="0.01"
          min="0"
          placeholder="费用"
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注，可选"
          className="h-10 flex-1 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <PlusCircle size={16} />
          保存
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-ink-400">
        “价格/手动调整”可用于记录最新净值；份额填 0 时只更新价格和估值快照。
      </p>
    </form>
  );
}
