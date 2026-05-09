import { Suspense, lazy, useState } from 'react';
import { ArrowLeft, Edit2, Loader2, Save, X } from 'lucide-react';
import { AssetItem } from '@/types';
import { useAssetStore } from '@/store/useAssetStore';
import { AssetInfo } from './AssetInfo';
import { TransactionForm } from './TransactionForm';

const AssetSpecificChart = lazy(() => import('./AssetSpecificChart').then((module) => ({ default: module.AssetSpecificChart })));
const AssetSpecificHistory = lazy(() => import('./AssetSpecificHistory').then((module) => ({ default: module.AssetSpecificHistory })));

interface AssetDetailProps {
  asset: AssetItem | null;
  onBack?: () => void;
}

const ranges = [
  { value: 'week', label: '\u5468' },
  { value: 'month', label: '\u6708' },
  { value: 'year', label: '\u5e74' },
] as const;

export function AssetDetail({ asset, onBack }: AssetDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');
  const [editForm, setEditForm] = useState({
    name: '',
    group: '',
    market: '',
    symbol: '',
    currency: 'CNY',
    exchangeRate: '1',
  });

  const { updateAsset } = useAssetStore();

  if (!asset) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-lg font-medium">{'\u8bf7\u9009\u62e9\u4e00\u4e2a\u8d44\u4ea7'}</p>
          <p className="text-sm">{'\u70b9\u51fb\u5de6\u4fa7\u76ee\u5f55\u67e5\u770b\u8be6\u60c5'}</p>
        </div>
      </div>
    );
  }

  const startEdit = () => {
    setEditForm({
      name: asset.name || '',
      group: asset.group || '',
      market: asset.market || '',
      symbol: asset.symbol || '',
      currency: asset.currency || 'CNY',
      exchangeRate: String(asset.exchange_rate_to_cny || 1),
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    await updateAsset(asset.id, {
      name: editForm.name || undefined,
      group: editForm.group || undefined,
      market: editForm.market || undefined,
      symbol: editForm.symbol || undefined,
      currency: editForm.currency || undefined,
      exchange_rate_to_cny: parseFloat(editForm.exchangeRate) || 1,
    });
    setIsEditing(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            title={'\u8fd4\u56de\u603b\u89c8'}
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="truncate text-xl font-bold text-gray-900">
            {asset.name || '\u8d44\u4ea7\u8be6\u60c5'}
          </h2>
        </div>

        <button
          onClick={startEdit}
          className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
        >
          <Edit2 size={16} />
          {'\u4fee\u6539\u8d44\u4ea7'}
        </button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-6">
        <section>
          <AssetInfo asset={asset} />
        </section>

        <section>
          <TransactionForm asset={asset} />
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{'\u8d8b\u52bf\u5206\u6790'}</h3>
              <p className="text-xs text-gray-500">{'\u4ece\u9996\u6b21\u884c\u60c5\u66f4\u65b0\u65e5\u8d77\uff0c\u6309\u9009\u5b9a\u533a\u95f4\u663e\u793a\u8d44\u4ea7\u603b\u989d'}</p>
            </div>
            <div className="flex rounded-lg bg-gray-100 p-1">
              {ranges.map((range) => (
                <button
                  key={range.value}
                  onClick={() => setTimeRange(range.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    timeRange === range.value
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-[300px]">
            <Suspense fallback={
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" />
              </div>
            }>
              <AssetSpecificChart asset={asset} timeRange={timeRange} />
            </Suspense>
          </div>
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-gray-900">{'\u5386\u53f2\u8bb0\u5f55'}</h3>
          <Suspense fallback={
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          }>
            <AssetSpecificHistory assetId={asset.id} />
          </Suspense>
        </section>
      </div>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md animate-in rounded-xl bg-white p-6 shadow-2xl duration-200 fade-in zoom-in">
            <button
              onClick={() => setIsEditing(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
            <h2 className="mb-4 text-xl font-bold">{'\u4fee\u6539\u8d44\u4ea7\u4fe1\u606f'}</h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{'\u8d44\u4ea7\u540d\u79f0'}</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{'\u5b50\u6587\u4ef6\u5939/\u5206\u7ec4'}</label>
                <input
                  type="text"
                  value={editForm.group}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, group: e.target.value }))}
                  className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={'\u8f93\u5165\u5206\u7ec4\u540d\u79f0'}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u5e02\u573a'}</label>
                  <input
                    value={editForm.market}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, market: e.target.value }))}
                    className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u4ee3\u7801'}</label>
                  <input
                    value={editForm.symbol}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, symbol: e.target.value }))}
                    className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u5e01\u79cd'}</label>
                  <input
                    value={editForm.currency}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
                    className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{'\u5151\u4eba\u6c11\u5e01\u6c47\u7387'}</label>
                  <input
                    type="number"
                    value={editForm.exchangeRate}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, exchangeRate: e.target.value }))}
                    className="w-full rounded-md border p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  {'\u53d6\u6d88'}
                </button>
                <button
                  onClick={handleSave}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Save size={16} /> {'\u4fdd\u5b58\u4fee\u6539'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
