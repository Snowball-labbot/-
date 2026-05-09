import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { ArrowLeft, BarChart3, Bot, ChevronLeft, ChevronRight, Plus, Save, Target, Trash2, X } from 'lucide-react';
import { AIStrategyAssistant } from '@/components/AIStrategyAssistant';
import { ALLOCATION_STRATEGIES, AllocationStrategy } from '@/constants/allocationStrategies';
import { ASSET_CONFIG } from '@/constants/assets';
import { useAssetStore } from '@/store/useAssetStore';
import { AssetType } from '@/types';

interface AllocationStrategyPageProps {
  onBack: () => void;
}

const ASSET_TYPES = [
  AssetType.CASH,
  AssetType.STOCK,
  AssetType.BOND,
  AssetType.FUND,
  AssetType.PROPERTY,
  AssetType.OTHER,
];

const STORAGE_KEY = 'custom-allocation-strategies';
const STRATEGIES_PER_PAGE = 6;

const emptyWeights = () =>
  ASSET_TYPES.reduce((acc, type) => {
    acc[type] = '';
    return acc;
  }, {} as Record<AssetType, string>);

const formatCurrency = (value: number) =>
  `¥${value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

function loadCustomStrategies(): AllocationStrategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => ({ ...item, custom: true }));
  } catch {
    return [];
  }
}

function saveCustomStrategies(strategies: AllocationStrategy[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
}

export function AllocationStrategyPage({ onBack }: AllocationStrategyPageProps) {
  const { assets } = useAssetStore();
  const [customStrategies, setCustomStrategies] = useState<AllocationStrategy[]>(loadCustomStrategies);
  const allStrategies = useMemo(() => [...ALLOCATION_STRATEGIES, ...customStrategies], [customStrategies]);
  const [selectedStrategyId, setSelectedStrategyId] = useState(allStrategies[0]?.id ?? '');
  const [strategyPage, setStrategyPage] = useState(0);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRisk, setCustomRisk] = useState('自定义');
  const [customDescription, setCustomDescription] = useState('');
  const [customWeights, setCustomWeights] = useState<Record<AssetType, string>>(emptyWeights);
  const [customError, setCustomError] = useState('');

  const selectedStrategy =
    allStrategies.find((strategy) => strategy.id === selectedStrategyId) ?? allStrategies[0];

  const pageCount = Math.max(1, Math.ceil(allStrategies.length / STRATEGIES_PER_PAGE));
  const safePage = Math.min(strategyPage, pageCount - 1);
  const pagedStrategies = allStrategies.slice(
    safePage * STRATEGIES_PER_PAGE,
    safePage * STRATEGIES_PER_PAGE + STRATEGIES_PER_PAGE,
  );

  const customWeightTotal = ASSET_TYPES.reduce((sum, type) => sum + Number(customWeights[type] || 0), 0);

  const totalAssets = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.current_value_cny || 0), 0),
    [assets],
  );

  const rows = useMemo(() => {
    return ASSET_TYPES.map((type) => {
      const currentValue = assets
        .filter((asset) => asset.type === type)
        .reduce((sum, asset) => sum + Number(asset.current_value_cny || 0), 0);
      const currentPercent = totalAssets > 0 ? (currentValue / totalAssets) * 100 : 0;
      const targetPercent = selectedStrategy?.weights[type] ?? 0;
      const gap = currentPercent - targetPercent;
      const status = gap > 3 ? 'over' : gap < -3 ? 'under' : 'near';

      return {
        type,
        label: ASSET_CONFIG[type].label,
        color: ASSET_CONFIG[type].color,
        currentValue,
        currentPercent,
        targetPercent,
        gap,
        status,
      };
    });
  }, [assets, selectedStrategy, totalAssets]);

  const chartOption = useMemo(
    () => ({
      color: ['#1e40af', '#93c5fd'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const label = params[0]?.axisValue ?? '';
          const lines = params
            .map((item) => `${item.marker}${item.seriesName}: ${formatPercent(Number(item.value))}`)
            .join('<br/>');
          return `<strong>${label}</strong><br/>${lines}`;
        },
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: {
        left: 56,
        right: 24,
        top: 48,
        bottom: 24,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        max: 100,
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((row) => row.label),
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: '我的占比',
          type: 'bar',
          barWidth: 12,
          data: rows.map((row) => Number(row.currentPercent.toFixed(2))),
          itemStyle: { borderRadius: [0, 6, 6, 0] },
        },
        {
          name: '目标占比',
          type: 'bar',
          barWidth: 12,
          data: rows.map((row) => Number(row.targetPercent.toFixed(2))),
          itemStyle: { borderRadius: [0, 6, 6, 0] },
        },
      ],
    }),
    [rows],
  );

  const getStatusStyle = (status: string) => {
    if (status === 'over') return 'bg-red-50 text-red-600 border-red-100';
    if (status === 'under') return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'over') return '超配';
    if (status === 'under') return '低配';
    return '接近';
  };

  const resetCustomForm = () => {
    setCustomName('');
    setCustomRisk('自定义');
    setCustomDescription('');
    setCustomWeights(emptyWeights());
    setCustomError('');
  };

  const handleSaveCustomStrategy = () => {
    const name = customName.trim();
    if (!name) {
      setCustomError('请输入策略名称');
      return;
    }
    if (Math.abs(customWeightTotal - 100) > 0.01) {
      setCustomError('目标占比合计需要等于 100%');
      return;
    }

    const weights = ASSET_TYPES.reduce((acc, type) => {
      const value = Number(customWeights[type] || 0);
      if (value > 0) acc[type] = value;
      return acc;
    }, {} as Partial<Record<AssetType, number>>);

    const nextStrategy: AllocationStrategy = {
      id: `custom-${Date.now()}`,
      name,
      riskLevel: customRisk.trim() || '自定义',
      description: customDescription.trim() || '自定义目标策略',
      weights,
      custom: true,
    };

    const next = [...customStrategies, nextStrategy];
    setCustomStrategies(next);
    saveCustomStrategies(next);
    setSelectedStrategyId(nextStrategy.id);
    setStrategyPage(Math.floor((ALLOCATION_STRATEGIES.length + next.length - 1) / STRATEGIES_PER_PAGE));
    setIsCustomOpen(false);
    resetCustomForm();
  };

  const handleDeleteCustomStrategy = (id: string) => {
    const next = customStrategies.filter((strategy) => strategy.id !== id);
    setCustomStrategies(next);
    saveCustomStrategies(next);
    if (selectedStrategyId === id) {
      setSelectedStrategyId(ALLOCATION_STRATEGIES[0].id);
      setStrategyPage(0);
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-700"
            >
              <ArrowLeft size={16} />
              返回总览
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Target size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-950">资产配置策略</h2>
                <p className="mt-1 text-sm text-gray-500">
                  将你的当前持仓占比和主流策略、自定义目标做对照
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsAssistantOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <Bot size={16} />
              AI 策略助手
            </button>
            <button
              type="button"
              onClick={() => setIsCustomOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus size={16} />
              自定义策略
            </button>
            <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-right shadow-sm">
              <div className="text-sm text-gray-500">当前总资产</div>
              <div className="mt-1 text-2xl font-bold text-gray-950">{formatCurrency(totalAssets)}</div>
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-950">策略库</h3>
              <p className="text-xs text-gray-500">每页显示 6 个策略，更多策略可翻页查看</p>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStrategyPage((page) => Math.max(0, page - 1))}
                  disabled={safePage === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  aria-label="上一页"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-500">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setStrategyPage((page) => Math.min(pageCount - 1, page + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  aria-label="下一页"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="grid min-h-[344px] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pagedStrategies.map((strategy) => {
              const isSelected = strategy.id === selectedStrategy?.id;
              const preview = ASSET_TYPES
                .filter((type) => (strategy.weights[type] ?? 0) > 0)
                .slice(0, 4)
                .map((type) => `${ASSET_CONFIG[type].label} ${strategy.weights[type]}%`)
                .join(' · ');

              return (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => setSelectedStrategyId(strategy.id)}
                  className={`group flex h-40 flex-col justify-between rounded-lg border bg-white p-4 text-left shadow-sm transition-all ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-100'
                      : 'border-gray-200 hover:border-blue-200 hover:shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-950">{strategy.name}</div>
                        {strategy.custom && <div className="mt-1 text-xs text-blue-600">自定义目标</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{strategy.riskLevel}</span>
                        {strategy.custom && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteCustomStrategy(strategy.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                handleDeleteCustomStrategy(strategy.id);
                              }
                            }}
                            className="rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                            aria-label="删除自定义策略"
                          >
                            <Trash2 size={14} />
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-500">{strategy.description}</p>
                  </div>
                  <div className="truncate text-xs text-gray-400">{preview || '未设置目标占比'}</div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.9fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-950">{selectedStrategy?.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{selectedStrategy?.description}</p>
              </div>
              <BarChart3 className="shrink-0 text-blue-600" size={24} />
            </div>
            {assets.length === 0 ? (
              <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
                暂无资产数据，添加持仓后可查看策略对比
              </div>
            ) : (
              <ReactECharts option={chartOption} style={{ height: 380, width: '100%' }} />
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold text-gray-950">配置差距</h3>
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">类型</th>
                    <th className="px-4 py-3 text-right">当前金额</th>
                    <th className="px-4 py-3 text-right">我的占比</th>
                    <th className="px-4 py-3 text-right">目标</th>
                    <th className="px-4 py-3 text-right">差距</th>
                    <th className="px-4 py-3 text-right">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.type} className="bg-white">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-gray-800">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          {row.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(row.currentValue)}</td>
                      <td className="px-4 py-3 text-right text-gray-950">{formatPercent(row.currentPercent)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatPercent(row.targetPercent)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${row.gap >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {row.gap >= 0 ? '+' : ''}
                        {formatPercent(row.gap)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusStyle(row.status)}`}>
                          {getStatusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <AIStrategyAssistant
        open={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        selectedStrategy={selectedStrategy ?? {}}
        allocationRows={rows}
      />

      {isCustomOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-950">自定义目标策略</h3>
                <p className="mt-1 text-sm text-gray-500">填写名称，并给每类资产设置目标占比，合计需为 100%。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCustomOpen(false);
                  resetCustomForm();
                }}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="关闭"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">策略名称</span>
                <input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：我的长期目标"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">风险标签</span>
                <input
                  value={customRisk}
                  onChange={(event) => setCustomRisk(event.target.value)}
                  className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：中等"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-gray-700">说明</span>
                <input
                  value={customDescription}
                  onChange={(event) => setCustomDescription(event.target.value)}
                  className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="这套目标策略的用途"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {ASSET_TYPES.map((type) => (
                <label key={type} className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ASSET_CONFIG[type].color }} />
                    {ASSET_CONFIG[type].label}
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={customWeights[type]}
                      onChange={(event) =>
                        setCustomWeights((prev) => ({
                          ...prev,
                          [type]: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-md border border-gray-200 px-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${Math.abs(customWeightTotal - 100) <= 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  当前合计：{formatPercent(customWeightTotal)}
                </div>
                {customError && <div className="mt-1 text-sm text-red-500">{customError}</div>}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomOpen(false);
                    resetCustomForm();
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomStrategy}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Save size={16} />
                  保存策略
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
