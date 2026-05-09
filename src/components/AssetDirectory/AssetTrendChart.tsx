import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useAssetStore } from '@/store/useAssetStore';
import { TrendPoint } from '@/types';
import dayjs from 'dayjs';

interface AssetTrendChartProps {
  timeRange: 'week' | 'month' | 'year';
}

export function AssetTrendChart({ timeRange }: AssetTrendChartProps) {
  const { getTrend } = useAssetStore();
  const [points, setPoints] = useState<TrendPoint[]>([]);

  useEffect(() => {
    getTrend(timeRange)
      .then(setPoints)
      .catch((error) => console.error('Load trend failed:', error));
  }, [getTrend, timeRange]);

  const chartOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        const value = Number(params[0].value);
        return `<div>${params[0].axisValue}</div><strong>¥${value.toLocaleString()}</strong>`;
      },
    },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => point.date),
      axisLabel: { formatter: (value: string) => dayjs(value).format('MM-DD') },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => `¥${value >= 10000 ? `${(value / 10000).toFixed(1)}w` : value}` },
    },
    series: [{
      name: '总资产',
      type: 'line',
      smooth: true,
      data: points.map((point) => Number(point.value_cny)),
      itemStyle: { color: '#2563eb' },
      areaStyle: { opacity: 0.08 },
      showSymbol: false,
    }],
  }), [points]);

  return (
    <div className="w-full h-[300px]">
      <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
