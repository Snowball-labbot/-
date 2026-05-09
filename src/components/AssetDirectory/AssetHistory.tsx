import { useAssetStore } from '@/store/useAssetStore';
import dayjs from 'dayjs';
import { History } from 'lucide-react';

export function AssetHistory() {
  const { transactionsByAsset, assets } = useAssetStore();
  const allTransactions = Object.values(transactionsByAsset)
    .flat()
    .sort((a, b) => new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime());

  if (allTransactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400">
        <History size={48} className="mb-2 opacity-20" />
        <p>暂无已加载的历史记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allTransactions.slice(0, 30).map((item) => {
        const asset = assets.find((candidate) => candidate.id === item.holding_id);
        return (
          <div key={item.id} className="border-b border-gray-100 pb-2">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium text-gray-800">{asset?.name || '未知资产'}</span>
              <span className="font-mono">{item.currency} {(Number(item.quantity) * Number(item.unit_price)).toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500">{item.type} · {dayjs(item.trade_date).format('YYYY-MM-DD HH:mm')}</p>
          </div>
        );
      })}
    </div>
  );
}
