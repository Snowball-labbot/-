import { useEffect, useMemo, useState } from 'react';
import { PlusCircle, RefreshCw } from 'lucide-react';
import { AssetItem, AssetType, FlowClass, TransactionItem } from '@/types';
import { useAssetStore } from '@/store/useAssetStore';
import { api, getErrorMessage } from '@/lib/api';

interface TransactionFormProps {
  asset: AssetItem;
}

function quoteKind(asset: AssetItem) {
  if (asset.type === AssetType.FUND || asset.type === AssetType.BOND) return 'fund';
  return 'stock';
}

function formatNative(value: number, currency: string) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function TransactionForm({ asset }: TransactionFormProps) {
  const { addTransaction, assets } = useAssetStore();
  const isCash = asset.type === AssetType.CASH;
  const cashAccounts = useMemo(
    () => assets
      .filter((item) => item.type === AssetType.CASH)
      .sort((left, right) => {
        const leftScore = Number(left.group === asset.group) * 2 + Number(left.currency === asset.currency);
        const rightScore = Number(right.group === asset.group) * 2 + Number(right.currency === asset.currency);
        return rightScore - leftScore;
      }),
    [asset.currency, asset.group, assets],
  );
  const preferredCash = useMemo(
    () => cashAccounts.find((item) => item.group === asset.group && item.currency === asset.currency)
      || cashAccounts.find((item) => item.group === asset.group)
      || cashAccounts.find((item) => item.currency === asset.currency)
      || cashAccounts[0],
    [asset.currency, asset.group, cashAccounts],
  );

  const [type, setType] = useState<TransactionItem['type']>(isCash ? 'cash_in' : 'buy');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState(isCash ? '1' : asset.current_price ? String(asset.current_price) : '');
  const [fee, setFee] = useState('0');
  const [exchangeRate, setExchangeRate] = useState(String(asset.exchange_rate_to_cny || 1));
  const [note, setNote] = useState('');
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [flowClass, setFlowClass] = useState<FlowClass>(isCash ? 'external_contribution' : 'internal_trade');
  const [settleCash, setSettleCash] = useState(Boolean(!isCash && preferredCash));
  const [cashHoldingId, setCashHoldingId] = useState(preferredCash?.id || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const nextCash = cashAccounts.find((item) => item.group === asset.group && item.currency === asset.currency)
      || cashAccounts.find((item) => item.group === asset.group)
      || cashAccounts.find((item) => item.currency === asset.currency)
      || cashAccounts[0];
    setType(isCash ? 'cash_in' : 'buy');
    setQuantity('');
    setUnitPrice(isCash ? '1' : asset.current_price ? String(asset.current_price) : '');
    setExchangeRate(String(asset.exchange_rate_to_cny || 1));
    setCashHoldingId(nextCash?.id || '');
    setSettleCash(Boolean(!isCash && nextCash));
    setFee('0');
    setNote('');
    setTradeDate(new Date().toISOString().slice(0, 10));
    setFlowClass(isCash ? 'external_contribution' : 'internal_trade');
    setError('');
  }, [asset.id, asset.current_price, asset.exchange_rate_to_cny, asset.group, asset.currency, cashAccounts, isCash]);

  useEffect(() => {
    if (settleCash && !isCash) {
      setFlowClass('internal_trade');
    } else if (isCash) {
      setFlowClass(type === 'cash_out' ? 'external_withdrawal' : 'external_contribution');
    }
  }, [isCash, settleCash, type]);

  const canSyncQuote = Boolean(!isCash && asset.market && asset.symbol);
  const selectedCash = cashAccounts.find((item) => item.id === cashHoldingId);
  const parsedQuantity = Number(quantity || 0);
  const parsedPrice = isCash ? 1 : Number(unitPrice || 0);
  const parsedFee = Number(fee || 0);
  const grossTradeValue = parsedQuantity * parsedPrice;
  const settlementRatio = selectedCash
    ? Number(exchangeRate || asset.exchange_rate_to_cny || 1)
      / Number(selectedCash.exchange_rate_to_cny || 1)
    : 1;
  const cashEffect = type === 'buy'
    ? -(grossTradeValue + parsedFee) * settlementRatio
    : type === 'sell'
      ? (grossTradeValue - parsedFee) * settlementRatio
      : type === 'income'
        ? (parsedQuantity - parsedFee) * settlementRatio
      : 0;
  const estimatedRealizedGain = type === 'sell'
    ? grossTradeValue - parsedFee - parsedQuantity * Number(asset.avg_cost || 0)
    : 0;

  const syncQuote = async () => {
    if (!asset.market || !asset.symbol) return;
    setSyncing(true);
    setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const quote = tradeDate && tradeDate < today
        ? await api.historicalQuote(asset.market, asset.symbol, quoteKind(asset), tradeDate)
        : await api.quoteMarket(asset.market, asset.symbol, quoteKind(asset));
      setUnitPrice(String(quote.price));
      setExchangeRate(String(quote.exchange_rate_to_cny));
      setNote((current) => current || `按 ${quote.quote_source} 同步行情`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '同步行情失败，请手动填写单价和汇率。'));
    } finally {
      setSyncing(false);
    }
  };

  const changeType = (nextType: TransactionItem['type']) => {
    setType(nextType);
    if (nextType === 'income') {
      setUnitPrice('1');
      setFlowClass('internal_trade');
      setSettleCash(true);
    } else if (!isCash && unitPrice === '1') {
      setUnitPrice(asset.current_price ? String(asset.current_price) : '');
    }
  };

  const syncCashRate = async () => {
    setSyncing(true);
    setError('');
    try {
      const quote = await api.fxRate(asset.currency);
      setExchangeRate(String(quote.exchange_rate_to_cny));
    } catch (err: unknown) {
      setError(getErrorMessage(err, '同步汇率失败，请手动填写。'));
    } finally {
      setSyncing(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedExchangeRate = Number(exchangeRate || 1);
    if (
      !Number.isFinite(parsedQuantity)
      || parsedQuantity < 0
      || !Number.isFinite(parsedPrice)
      || parsedPrice < 0
      || !Number.isFinite(parsedExchangeRate)
      || parsedExchangeRate <= 0
      || parsedFee < 0
    ) {
      setError('请输入有效的金额、价格、费用和汇率');
      return;
    }
    if (type !== 'adjustment' && parsedQuantity <= 0) {
      setError(isCash ? '请输入现金金额' : '请输入交易份额');
      return;
    }
    if (type === 'sell' && parsedQuantity > Number(asset.quantity)) {
      setError('卖出份额超过当前持仓');
      return;
    }
    if (type === 'cash_out' && parsedQuantity + parsedFee > Number(asset.quantity)) {
      setError('取出金额与费用超过当前现金余额');
      return;
    }
    if (!isCash && settleCash && !cashHoldingId) {
      setError('请选择用于结算的现金账户');
      return;
    }
    if (type === 'income' && (!settleCash || !cashHoldingId)) {
      setError('分红或利息必须进入一个现金账户');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await addTransaction(asset.id, {
        type,
        quantity: parsedQuantity,
        unit_price: parsedPrice,
        fee: parsedFee,
        currency: asset.currency,
        exchange_rate_to_cny: parsedExchangeRate,
        settle_cash: !isCash && type !== 'adjustment' && settleCash,
        cash_holding_id: !isCash && type !== 'adjustment' && settleCash ? cashHoldingId : undefined,
        trade_date: `${tradeDate}T12:00:00Z`,
        flow_class: settleCash && !isCash ? 'internal_trade' : flowClass,
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

  const options = isCash
    ? [
      { value: 'cash_in', label: '存入现金' },
      { value: 'cash_out', label: '取出现金' },
    ]
    : [
      { value: 'buy', label: '买入/追加' },
      { value: 'sell', label: '卖出/减少' },
      { value: 'income', label: '分红/利息' },
      { value: 'adjustment', label: '价格/手动调整' },
    ];

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-ink-100 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-ink-900">{isCash ? '现金流水' : '交易流水'}</h3>
          <p className="mt-1 text-xs text-ink-400">
            {isCash
              ? '记录外部存取；账户之间移动资金请使用下方资金划转。'
              : '买卖可选择任意币种现金账户；分红和利息进入现金账户，不改变持仓成本。'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-ink-50 px-2.5 py-1 text-xs font-semibold text-ink-500">{asset.currency}</span>
          <button
            type="button"
            onClick={isCash || type === 'income' ? syncCashRate : syncQuote}
            disabled={(type !== 'income' && !isCash && !canSyncQuote) || syncing || saving}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-40"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {isCash || type === 'income' ? '同步汇率' : '同步行情'}
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${isCash ? 'md:grid-cols-4' : 'md:grid-cols-5'}`}>
        <select
          value={type}
          onChange={(event) => changeType(event.target.value as TransactionItem['type'])}
          className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-brand-500"
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input
          type="number"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          step="0.0001"
          min="0"
          placeholder={isCash ? `金额 ${asset.currency}` : type === 'income' ? `分红金额 ${asset.currency}` : '份额/股数'}
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
        {!isCash && type !== 'income' && (
          <input
            type="number"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            step="0.0001"
            min="0"
            placeholder="成交/最新单价"
            className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
          />
        )}
        <input
          type="number"
          value={exchangeRate}
          onChange={(event) => setExchangeRate(event.target.value)}
          step="any"
          min="0"
          placeholder="兑人民币"
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
        <input
          type="number"
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          step="0.01"
          min="0"
          placeholder={`费用 ${asset.currency}`}
          className="h-10 rounded-md border border-ink-200 px-3 text-sm text-ink-800 outline-none placeholder:text-ink-300 focus:border-brand-500"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-ink-500">
          交易日期
          <input
            type="date"
            value={tradeDate}
            onChange={(event) => setTradeDate(event.target.value)}
            className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm font-normal text-ink-800 outline-none focus:border-brand-500"
          />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-ink-500">
          资金性质
          <select
            value={flowClass}
            onChange={(event) => setFlowClass(event.target.value as FlowClass)}
            disabled={settleCash && !isCash}
            className="h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm font-normal text-ink-800 outline-none focus:border-brand-500 disabled:bg-ink-50"
          >
            <option value="internal_trade">内部交易，不计入入金</option>
            <option value="external_contribution">外部入金</option>
            <option value="external_withdrawal">外部取现</option>
            <option value="opening_balance">补录期初持仓</option>
            <option value="valuation_correction">估值修正</option>
          </select>
        </label>
      </div>

      {!isCash && type !== 'adjustment' && (
        <div className="rounded-md border border-ink-100 bg-ink-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700">
              <input
                type="checkbox"
                checked={settleCash}
                onChange={(event) => setSettleCash(event.target.checked)}
                disabled={cashAccounts.length === 0 || type === 'income'}
                className="h-4 w-4 rounded border-ink-300 text-brand-600"
              />
              {type === 'sell'
                ? '卖出款自动进入现金账户'
                : type === 'income'
                  ? '分红/利息自动进入现金账户'
                  : '从现金账户自动扣款'}
            </label>
            <select
              value={cashHoldingId}
              onChange={(event) => setCashHoldingId(event.target.value)}
              disabled={!settleCash || cashAccounts.length === 0}
              className="h-9 min-w-[230px] rounded-md border border-ink-200 bg-white px-3 text-xs text-ink-700 disabled:opacity-50"
            >
              <option value="">选择现金结算账户</option>
              {cashAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {formatNative(item.quantity, item.currency)}
                </option>
              ))}
            </select>
          </div>
          {cashAccounts.length === 0 ? (
            <p className="mt-2 text-xs text-amber-600">
              暂无现金账户，请先新增现金账户后再启用自动结算。
            </p>
          ) : parsedQuantity > 0 && parsedPrice > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500">
              <span>
                {type === 'buy' ? '预计扣款' : '预计到账'}：
                {formatNative(Math.abs(cashEffect), selectedCash?.currency || asset.currency)}
              </span>
              {selectedCash && selectedCash.currency !== asset.currency && (
                <span>
                  参考换算：1 {asset.currency} ≈ {settlementRatio.toFixed(6)} {selectedCash.currency}
                  （提交时更新汇率）
                </span>
              )}
              {['sell', 'income'].includes(type) && (
                <span className={estimatedRealizedGain >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {type === 'income' ? '本次投资收益' : '预计已实现盈亏'}：
                  {type === 'income'
                    ? formatNative(Math.max(parsedQuantity - parsedFee, 0), asset.currency)
                    : `${estimatedRealizedGain >= 0 ? '+' : ''}${formatNative(estimatedRealizedGain, asset.currency)}`}
                </span>
              )}
              {selectedCash && type === 'buy' && (
                <span>
                  扣款后余额：
                  {formatNative(Number(selectedCash.quantity) + cashEffect, selectedCash.currency)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
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
    </form>
  );
}
