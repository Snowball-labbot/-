import { useState } from 'react';
import dayjs from 'dayjs';
import { RefreshCw } from 'lucide-react';
import { AssetItem } from '@/types';
import { ASSET_CONFIG } from '@/constants/assets';
import { useAssetStore } from '@/store/useAssetStore';
import { formatCny, formatPercent, formatQuantity } from '@/lib/format';

interface AssetInfoProps {
  asset: AssetItem;
}

function currencySymbol(currency: string) {
  if (currency === 'USD') return '$';
  if (currency === 'CNY') return '¥';
  if (currency === 'KRW') return '₩';
  return `${currency} `;
}

export function AssetInfo({ asset }: AssetInfoProps) {
  const config = ASSET_CONFIG[asset.type];
  const { refreshAssetPrice } = useAssetStore();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const gainCny = Number(asset.unrealized_gain_cny || 0);
  const gainNative = Number(asset.unrealized_gain_native || 0);
  const gainPct = Number(asset.unrealized_gain_pct || 0);
  const gainClass = gainCny > 0 ? 'text-red-600' : gainCny < 0 ? 'text-emerald-600' : 'text-ink-500';
  const nativeSymbol = currencySymbol(asset.currency);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      await refreshAssetPrice(asset.id);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : '刷新行情失败，可以稍后重试。');
    } finally {
      setRefreshing(false);
    }
  };

  const facts = [
    { label: '持有份额', value: formatQuantity(asset.quantity), helper: asset.currency },
    { label: '平均成本', value: `${nativeSymbol}${formatQuantity(asset.avg_cost)}`, helper: '买入单位成本' },
    {
      label: '最新价格',
      value: `${nativeSymbol}${formatQuantity(asset.current_price)}`,
      helper: asset.quote_source || '手动估值',
    },
    { label: '汇率', value: formatQuantity(asset.exchange_rate_to_cny), helper: `${asset.currency}/CNY` },
    {
      label: '浮盈/浮亏',
      value: `${gainCny >= 0 ? '+' : ''}${formatCny(gainCny, 0)}`,
      helper: `${nativeSymbol}${formatQuantity(gainNative)} · ${formatPercent(gainPct)}`,
      className: gainClass,
    },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-ink-100 bg-white">
      <div className="flex flex-col gap-6 p-5 md:flex-row md:items-start md:justify-between md:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded px-2 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: `${config.color}14`, color: config.color }}
            >
              {config.label}
            </span>
            {asset.symbol && (
              <span className="rounded bg-ink-50 px-2 py-1 text-[11px] font-semibold text-ink-500">
                {asset.market || '-'} · {asset.symbol}
              </span>
            )}
            {asset.group && <span className="text-xs text-ink-400">{asset.group}</span>}
          </div>
          <h2 className="mt-3 truncate text-2xl font-bold text-ink-950 md:text-3xl">{asset.name}</h2>
          <p className="mt-2 text-xs text-ink-400">
            价格更新于 {asset.price_updated_at ? dayjs(asset.price_updated_at).format('YYYY-MM-DD HH:mm') : '暂无记录'}
          </p>
        </div>

        <div className="shrink-0 md:text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Current Value</div>
          <div className="mt-2 text-3xl font-semibold text-ink-950">{formatCny(asset.current_value_cny)}</div>
          <div className="mt-1 text-xs text-ink-400">
            {asset.currency} {formatQuantity(asset.current_value)}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || !asset.symbol || !asset.market}
            className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-600 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            刷新行情
          </button>
        </div>
      </div>

      <div className="grid border-t border-ink-100 sm:grid-cols-2 lg:grid-cols-5">
        {facts.map((item) => (
          <div
            key={item.label}
            className="min-w-0 border-b border-ink-100 p-5 sm:border-r lg:border-b-0 last:border-r-0"
          >
            <div className="text-xs text-ink-400">{item.label}</div>
            <div className={`mt-2 truncate text-lg font-bold ${item.className || 'text-ink-900'}`}>{item.value}</div>
            <div className="mt-1 truncate text-[11px] text-ink-400">{item.helper}</div>
          </div>
        ))}
      </div>

      {refreshError && <p className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">{refreshError}</p>}
    </div>
  );
}
