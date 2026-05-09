import ReactECharts from 'echarts-for-react';
import { useAssetStore } from '@/store/useAssetStore';
import { ASSET_CONFIG } from '@/constants/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function AssetChart() {
  const { assets } = useAssetStore();

  const totalAssets = assets.reduce((sum, asset) => sum + Number(asset.current_value_cny || 0), 0);

  const chartData = Object.values(
    assets.reduce(
      (acc, asset) => {
        if (!acc[asset.type]) {
          acc[asset.type] = {
            value: 0,
            name: ASSET_CONFIG[asset.type].label,
            itemStyle: { color: ASSET_CONFIG[asset.type].color },
            assets: [] as typeof assets,
          };
        }
        acc[asset.type].value += Number(asset.current_value_cny || 0);
        acc[asset.type].assets.push(asset);
        return acc;
      },
      {} as Record<
        string,
        {
          value: number;
          name: string;
          itemStyle: { color: string };
          assets: typeof assets;
        }
      >,
    ),
  );

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const { name, value, percent, data } = params;
        const typeAssets = data.assets as typeof assets;

        const groupedAssets: Record<string, typeof assets> = {};
        const noGroupAssets: typeof assets = [];

        typeAssets.forEach((asset) => {
          if (asset.group) {
            if (!groupedAssets[asset.group]) {
              groupedAssets[asset.group] = [];
            }
            groupedAssets[asset.group].push(asset);
          } else {
            noGroupAssets.push(asset);
          }
        });

        const formatCurrency = (val: number) => `\u00a5${val.toLocaleString('zh-CN')}`;
        const formatPercent = (val: number) => {
          if (totalAssets <= 0) return '0.00%';
          const p = (val / totalAssets) * 100;
          return p < 0.01 ? '<0.01%' : `${p.toFixed(2)}%`;
        };

        let html = `<div class="font-bold border-b pb-1 mb-1">${name}: ${formatCurrency(Number(value))} (${percent}%)</div>`;
        html += '<div class="text-xs max-h-[200px] overflow-y-auto custom-scrollbar">';

        Object.entries(groupedAssets).forEach(([groupName, groupAssets]) => {
          const groupTotal = groupAssets.reduce((sum, asset) => sum + Number(asset.current_value_cny || 0), 0);
          html += `<div class="mt-1 font-semibold text-blue-500 flex justify-between">
            <span>\u5206\u7ec4: ${groupName}</span>
            <span>${formatPercent(groupTotal)}</span>
          </div>`;

          groupAssets.forEach((asset) => {
            html += `<div class="pl-3 flex justify-between text-gray-600">
              <span>${asset.name}</span>
              <span>${formatPercent(Number(asset.current_value_cny || 0))}</span>
            </div>`;
          });
        });

        if (noGroupAssets.length > 0) {
          if (Object.keys(groupedAssets).length > 0) {
            html += `<div class="mt-1 font-semibold text-gray-500">\u5176\u4ed6</div>`;
          }
          noGroupAssets.forEach((asset) => {
            html += `<div class="${Object.keys(groupedAssets).length > 0 ? 'pl-3' : ''} flex justify-between mt-1 text-gray-600">
              <span>${asset.name}</span>
              <span>${formatPercent(Number(asset.current_value_cny || 0))}</span>
            </div>`;
          });
        }

        html += '</div>';
        return html;
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: {
        color: '#333',
      },
      extraCssText: 'box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); border-radius: 8px; padding: 10px;',
    },
    legend: {
      bottom: '0%',
      left: 'center',
    },
    series: [
      {
        name: '\u8d44\u4ea7\u5206\u5e03',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
          position: 'center',
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold',
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
        labelLine: {
          show: false,
        },
        data: chartData,
      },
    ],
  };

  if (assets.length === 0) {
    return (
      <Card className="min-h-[400px] w-full">
        <CardHeader>
          <CardTitle>{'\u8d44\u4ea7\u5206\u5e03'}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center">
          <div className="text-gray-500">
            {'\u6682\u65e0\u6570\u636e\uff0c\u8bf7\u6dfb\u52a0\u8d44\u4ea7\u4ee5\u67e5\u770b\u56fe\u8868'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full w-full">
      <CardHeader>
        <CardTitle>{'\u8d44\u4ea7\u5206\u5e03'}</CardTitle>
      </CardHeader>
      <CardContent>
        <ReactECharts option={option} style={{ height: '350px', width: '100%' }} />
      </CardContent>
    </Card>
  );
}
