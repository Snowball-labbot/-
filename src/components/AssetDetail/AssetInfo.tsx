import { useState } from 'react';
import dayjs from 'dayjs';
import { Calendar, RefreshCw, Tag, TrendingUp, Wallet } from 'lucide-react';
import { AssetItem } from '@/types';
import { ASSET_CONFIG } from '@/constants/assets';
import { useAssetStore } from '@/store/useAssetStore';

interface AssetInfoProps {
  asset: AssetItem;
}

function currencySymbol(currency: string) {
  if (currency === 'USD') return '$';
  if (currency === 'CNY') return '\u00a5';
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
  const gainClass = gainCny > 0 ? 'text-red-500' : gainCny < 0 ? 'text-green-600' : 'text-gray-500';
  const nativeSymbol = currencySymbol(asset.currency);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      await refreshAssetPrice(asset.id);
    } catch (error: any) {
      setRefreshError(error.message || '\u5237\u65b0\u4ef7\u683c\u5931\u8d25\uff0c\u53ef\u4ee5\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{asset.name || '\u672a\u547d\u540d\u8d44\u4ea7'}</h2>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${config.color}20`, color: config.color }}
            >
              {config.label}
            </span>
            {asset.symbol && <span className="text-xs text-gray-500">{asset.market}:{asset.symbol}</span>}
            <span className="font-mono text-xs text-gray-500">ID: {asset.id.slice(0, 8)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="mb-1 text-sm text-gray-500">{'\u5f53\u524d\u4ef7\u503c'}</p>
          <p className="font-mono text-3xl font-bold text-gray-900">
            {'\u00a5'}{Number(asset.current_value_cny).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">
            {asset.currency} {Number(asset.current_value).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
          <div className="rounded-md bg-white p-2 text-blue-500 shadow-sm">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500">{'\u521b\u5efa\u65f6\u95f4'}</p>
            <p className="text-sm font-medium text-gray-900">
              {dayjs(asset.created_at).format('YYYY-MM-DD HH:mm')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
          <div className="rounded-md bg-white p-2 text-green-500 shadow-sm">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500">{'\u4efd\u989d / \u5747\u4ef7'}</p>
            <p className="text-sm font-medium text-gray-900">
              {Number(asset.quantity).toLocaleString()} / {Number(asset.avg_cost).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
          <div className="rounded-md bg-white p-2 text-purple-500 shadow-sm">
            <Tag size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500">{'\u6700\u65b0\u4ef7 / \u6c47\u7387'}</p>
            <p className="text-sm font-medium text-gray-900">
              {Number(asset.current_price).toLocaleString()} / {Number(asset.exchange_rate_to_cny).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
          <div className="rounded-md bg-white p-2 text-red-500 shadow-sm">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-500">{'\u6d6e\u76c8/\u6d6e\u4e8f'}</p>
            <p className={`text-sm font-bold ${gainClass}`}>
              {'\u00a5'}{gainCny.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="ml-2 text-xs">
                ({nativeSymbol}{gainNative.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {gainPct.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3">
          <div>
            <p className="text-xs text-gray-500">{'\u4ef7\u683c/\u51c0\u503c\u65e5\u671f'}</p>
            <p className="text-sm font-medium text-gray-900">
              {asset.price_updated_at ? dayjs(asset.price_updated_at).format('YYYY-MM-DD HH:mm') : '\u6682\u65e0\u884c\u60c5\u5237\u65b0'}
            </p>
            <p className="text-xs text-gray-400">
              {'\u672c\u5730\u66f4\u65b0'} {dayjs(asset.updated_at).format('YYYY-MM-DD HH:mm')}
            </p>
            {asset.quote_source && <p className="text-xs text-gray-400">{asset.quote_source}</p>}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || !asset.symbol || !asset.market}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {'\u5237\u65b0'}
          </button>
        </div>
      </div>

      {refreshError && <p className="mt-3 text-sm text-red-500">{refreshError}</p>}
    </div>
  );
}
