import { Trash2 } from 'lucide-react';
import { useAssetStore } from '@/store/useAssetStore';
import { ASSET_CONFIG } from '@/constants/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function AssetList() {
  const { assets, removeAsset } = useAssetStore();

  if (assets.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{'\u8d44\u4ea7\u5217\u8868'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-gray-500">
            {'\u6682\u65e0\u8d44\u4ea7\u8bb0\u5f55\uff0c\u8bf7\u6dfb\u52a0\u8d44\u4ea7'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{'\u8d44\u4ea7\u5217\u8868'}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] space-y-4 overflow-y-auto pr-2">
          {assets.map((asset) => {
            const config = ASSET_CONFIG[asset.type];
            return (
              <div
                key={asset.id}
                className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/5"
              >
                <div className="flex items-center space-x-4">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: config.color }} />
                  <div>
                    <div className="font-medium">{config.label}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(asset.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="font-bold">
                    {'\u00a5 '}
                    {Number(asset.current_value_cny).toLocaleString('zh-CN', {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAsset(asset.id)}
                    className="p-1 text-gray-400 transition-colors hover:text-red-500"
                    title={'\u5220\u9664'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
