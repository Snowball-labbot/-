import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ExternalLink,
  Info,
  Loader2,
  MessageSquareText,
  RefreshCw,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { MarketScore, SocialMention, WatchlistItem } from '@/types';
import { useAssetStore } from '@/store/useAssetStore';
import { cn } from '@/lib/utils';


const componentLabels = [
  ['valuation_score', '估值'],
  ['trend_score', '趋势'],
  ['macro_score', '宏观/流动性'],
  ['volatility_score', '波动环境'],
] as const;

function scoreLabel(score: number) {
  if (score >= 70) return '环境偏积极';
  if (score >= 55) return '中性偏强';
  if (score >= 45) return '中性';
  if (score >= 30) return '中性偏弱';
  return '环境偏谨慎';
}

function rankDelta(item: SocialMention) {
  if (!item.rank_24h_ago) return null;
  return item.rank_24h_ago - item.rank;
}

export function MarketObservation() {
  const { assets } = useAssetStore();
  const [scores, setScores] = useState<MarketScore[]>([]);
  const [social, setSocial] = useState<SocialMention[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (refresh = false) => {
    setError('');
    try {
      const [scoresResult, socialResult, watchlistResult] = await Promise.allSettled([
        api.marketScores(refresh),
        api.socialTopTen(refresh),
        api.watchlist(),
      ]);
      const failures: string[] = [];
      if (scoresResult.status === 'fulfilled') setScores(scoresResult.value);
      else failures.push(getErrorMessage(scoresResult.reason, '市场评分暂不可用'));
      if (socialResult.status === 'fulfilled') setSocial(socialResult.value);
      else failures.push(getErrorMessage(socialResult.reason, 'ApeWisdom 排名暂不可用'));
      if (watchlistResult.status === 'fulfilled') setWatchlist(watchlistResult.value);
      else failures.push(getErrorMessage(watchlistResult.reason, '观察名单暂不可用'));
      setError(failures.join('；'));
    } catch (loadError) {
      setError(getErrorMessage(loadError, '市场观察数据加载失败'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const ownedSymbols = useMemo(() => new Set(assets.map((asset) => asset.symbol?.toUpperCase()).filter(Boolean)), [assets]);
  const watchedSymbols = useMemo(() => new Set(watchlist.map((item) => item.symbol.toUpperCase())), [watchlist]);

  if (loading) return <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 p-4 md:p-5 lg:p-6">
      <section className="flex flex-col gap-5 rounded-lg border border-ink-100 bg-white p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-ink-950 text-white"><BarChart3 size={20} /></div>
          <div><div className="text-xs font-semibold uppercase text-ink-400">Market Observation</div><h2 className="mt-1 text-xl font-bold text-ink-950">市场环境与讨论热度</h2><p className="mt-1 text-sm text-ink-400">评分用于统一观察，不代表买卖信号；社交热度不等于看多情绪。</p></div>
        </div>
        <button type="button" disabled={refreshing} onClick={() => { setRefreshing(true); load(true); }} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-ink-200 px-4 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> 刷新数据
        </button>
      </section>

      {error && <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-2">
        {scores.map((score) => (
          <section key={score.symbol} className="rounded-lg border border-ink-100 bg-white">
            <div className="flex items-start justify-between border-b border-ink-100 px-5 py-4 md:px-6">
              <div><div className="flex items-center gap-2"><span className="rounded bg-ink-950 px-2 py-1 text-xs font-bold text-white">{score.symbol}</span><h3 className="font-bold text-ink-900">{score.label}</h3></div><p className="mt-2 text-xs text-ink-400">数据截至 {score.as_of_date}{score.data.stale ? ' · 使用最近缓存' : ''}</p></div>
              <div className="text-right"><div className="text-3xl font-bold tabular-nums text-ink-950">{Number(score.score).toFixed(0)}</div><div className="mt-1 text-xs font-semibold text-brand-700">{scoreLabel(Number(score.score))}</div></div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-[1fr_0.72fr] md:p-6">
              <div className="space-y-4">
                {componentLabels.map(([field, label]) => {
                  const value = Number(score[field]);
                  return (
                    <div key={field}>
                      <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium text-ink-600">{label}</span><span className="tabular-nums text-ink-400">{value.toFixed(0)}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-ink-100 pt-5 md:grid-cols-1 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <Metric label="最新价" value={score.data.price == null ? '—' : `$${Number(score.data.price).toLocaleString()}`} />
                <Metric label="6 个月" value={score.data.return_6m_pct == null ? '—' : `${Number(score.data.return_6m_pct) >= 0 ? '+' : ''}${Number(score.data.return_6m_pct).toFixed(1)}%`} />
                <Metric label="10 年实际利率" value={score.data.real_yield_10y == null ? '—' : `${Number(score.data.real_yield_10y).toFixed(2)}%`} />
                <Metric label="VIX" value={score.data.vix == null ? '—' : Number(score.data.vix).toFixed(1)} />
              </div>
            </div>
          </section>
        ))}
        {!scores.length && <div className="col-span-full rounded-lg border border-ink-100 bg-white px-6 py-16 text-center text-sm text-ink-400">市场评分首次计算需要访问 Yahoo Finance 与 FRED，请稍后刷新。</div>}
      </div>

      <section className="overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div><div className="flex items-center gap-2"><MessageSquareText size={17} className="text-ink-500" /><h3 className="font-bold text-ink-900">社交讨论 Top 10</h3></div><p className="mt-1 text-xs text-ink-400">打开页面时获取 ApeWisdom 当前排名，不补齐小时历史。</p></div>
          <a href="https://apewisdom.io/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900">数据来源 ApeWisdom <ExternalLink size={13} /></a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead><tr className="border-b border-ink-100 bg-ink-50 text-[11px] uppercase text-ink-400"><th className="w-20 px-6 py-3 font-semibold">排名</th><th className="px-4 py-3 font-semibold">股票</th><th className="px-4 py-3 text-right font-semibold">提及次数</th><th className="px-4 py-3 text-right font-semibold">赞同数</th><th className="px-6 py-3 text-right font-semibold">24h 变化</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {social.map((item) => {
                const delta = rankDelta(item);
                const owned = ownedSymbols.has(item.ticker.toUpperCase());
                const watched = watchedSymbols.has(item.ticker.toUpperCase());
                return (
                  <tr key={item.ticker} className="hover:bg-ink-50/60">
                    <td className="px-6 py-4 text-sm font-bold tabular-nums text-ink-700">{String(item.rank).padStart(2, '0')}</td>
                    <td className="px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-8 min-w-12 items-center justify-center rounded bg-ink-50 px-2 text-xs font-bold text-ink-800">{item.ticker}</span><div><div className="text-sm font-semibold text-ink-900">{item.name}</div><div className="mt-0.5 flex gap-2 text-[11px]">{owned && <span className="text-brand-700">当前持仓</span>}{watched && <span className="text-amber-700">观察名单</span>}{!owned && !watched && <span className="text-ink-400">未关注</span>}</div></div></div></td>
                    <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-ink-800">{item.mentions.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-ink-500">{item.upvotes.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">{delta === null || delta === 0 ? <span className="text-xs text-ink-400">—</span> : <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', delta > 0 ? 'text-red-600' : 'text-emerald-600')}>{delta > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{Math.abs(delta)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-lg border border-ink-100 bg-white px-5 py-4 text-xs leading-6 text-ink-500">
        <Info size={16} className="mt-1 shrink-0 text-ink-400" />
        <p>内部评分只比较估值、价格趋势、实际利率/期限利差和波动率四个维度。数据缺失时该维度回到中性值 50；评分不使用第三方网站的最终结论，也不构成投资建议。</p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] text-ink-400">{label}</div><div className="mt-1 text-sm font-semibold tabular-nums text-ink-800">{value}</div></div>;
}
