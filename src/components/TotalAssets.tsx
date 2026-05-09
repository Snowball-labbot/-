import { useAssetStore } from '@/store/useAssetStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function TotalAssets() {
  const { getTotalAssets } = useAssetStore();
  const total = getTotalAssets();

  return (
    <Card className="w-full bg-primary text-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium opacity-90">{'\u603b\u8d44\u4ea7'}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold">
          {'\u00a5 '}
          {total.toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </CardContent>
    </Card>
  );
}
