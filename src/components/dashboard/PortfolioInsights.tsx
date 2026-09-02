import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, Pencil, ShieldCheck } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import type { FamilySafetySnapshot, PortfolioPerspective, PerspectiveRow } from '@/types';
import { formatCny, formatPercent } from '@/lib/format';

const views = [
  { key: 'core', label: '核心暴露' },
  { key: 'asset_class', label: '大类资产' },
  { key: 'region', label: '地区' },
  { key: 'sector', label: '行业' },
] as const;

type ViewKey = typeof views[number]['key'];

export function PortfolioInsights({ personalValue }: { personalValue: number }) {
  const [perspective, setPerspective] = useState<PortfolioPerspective | null>(null);
  const [family, setFamily] = useState<FamilySafetySnapshot | null>(null);
  const [view, setView] = useState<ViewKey>('core');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [termDeposits, setTermDeposits] = useState('');
  const [cashFunds, setCashFunds] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.portfolioPerspective(), api.familySafetyLatest()])
      .then(([nextPerspective, nextFamily]) => {
        setPerspective(nextPerspective);
        setFamily(nextFamily);
        if (nextFamily) {
          setTermDeposits(String(nextFamily.term_deposits_cny));
          setCashFunds(String(nextFamily.cash_funds_cny));
          setNote(nextFamily.note || '');
        }
      })
      .catch((reason) => setError(getErrorMessage(reason, '组合透视加载失败')));
  }, [personalValue]);

  const rows = useMemo(() => perspective?.views[view] || [], [perspective, view]);
  const safetyTotal = Number(family?.term_deposits_cny || 0) + Number(family?.cash_funds_cny || 0);

  const saveFamily = async () => {
    try {
      const saved = await api.saveFamilySafety({
        term_deposits_cny: Number(termDeposits || 0),
        cash_funds_cny: Number(cashFunds || 0),
        note: note || null,
        as_of_date: dayjs().format('YYYY-MM-DD'),
      });
      setFamily(saved);
      setEditing(false);
      setError('');
    } catch (reason) {
      setError(getErrorMessage(reason, '家庭安全垫保存失败'));
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 md:px-6">
          <div>
            <h2 className="text-base font-bold text-ink-900">组合透视</h2>
            <p className="mt-1 text-xs text-ink-400">
              按产品对应的核心指数或资产策略归并，不穿透到基金成分股
            </p>
          </div>
          <div className="flex rounded-md bg-ink-50 p-1">
            {views.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                className={`h-8 rounded px-3 text-xs font-semibold ${view === item.key ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-400'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-ink-100">
          {rows.map((row: PerspectiveRow) => {
            const isOpen = view === 'core' && expanded === row.name;
            return (
              <div key={row.name}>
                <button
                  type="button"
                  onClick={() => view === 'core' && setExpanded(isOpen ? null : row.name)}
                  className="grid w-full grid-cols-[minmax(150px,1fr)_minmax(180px,3fr)_110px] items-center gap-4 px-5 py-3 text-left md:px-6"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                    {view === 'core' && (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
                    {row.name}
                  </span>
                  <span className="h-2 overflow-hidden rounded bg-ink-50">
                    <span className="block h-full bg-brand-600" style={{ width: `${Math.min(100, Number(row.percent))}%` }} />
                  </span>
                  <span className="text-right">
                    <strong className="block text-sm tabular-nums text-ink-900">{formatCny(Number(row.value_cny), 0)}</strong>
                    <small className="text-ink-400">{formatPercent(Number(row.percent), 1)}</small>
                  </span>
                </button>
                {isOpen && row.contributors.length > 0 && (
                  <div className="border-t border-ink-50 bg-ink-50/50 px-10 py-2 md:px-12">
                    {row.contributors.map((item) => (
                      <div key={item.holding_id} className="flex items-center justify-between py-1.5 text-xs text-ink-500">
                        <span>{item.name} <em className="not-italic text-ink-300">· {item.mapping_source === 'manual' ? '手动' : '自动'}</em></span>
                        <span className="tabular-nums">{formatCny(Number(item.value_cny), 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-ink-100 px-5 py-3 text-[11px] text-ink-400 md:px-6">
          <span>未分类 {formatPercent(Number(perspective?.unclassified_pct || 0), 1)}</span>
          <span>{perspective?.source || '等待生成映射'} · 数据日期 {perspective?.as_of_date || '-'}</span>
        </div>
      </section>

      <section className="rounded-lg border border-ink-100 bg-white px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <ShieldCheck size={20} className="mt-0.5 text-emerald-600" />
            <div>
              <h2 className="text-sm font-bold text-ink-900">家庭安全垫</h2>
              <p className="mt-1 text-xs text-ink-400">仅作家庭背景，不进入个人配置比例和收益计算；建议半年更新一次。</p>
            </div>
          </div>
          <button type="button" onClick={() => setEditing(!editing)} className="inline-flex h-8 items-center gap-1.5 rounded border border-ink-200 px-2.5 text-xs font-semibold text-ink-600">
            <Pencil size={13} /> 更新
          </button>
        </div>
        {editing ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <input type="number" value={termDeposits} onChange={(event) => setTermDeposits(event.target.value)} placeholder="家庭定存总额" className="h-9 rounded border border-ink-200 px-3 text-sm" />
            <input type="number" value={cashFunds} onChange={(event) => setCashFunds(event.target.value)} placeholder="家庭现金基金总额" className="h-9 rounded border border-ink-200 px-3 text-sm" />
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注" className="h-9 rounded border border-ink-200 px-3 text-sm" />
            <button type="button" onClick={saveFamily} className="h-9 rounded bg-ink-950 px-4 text-xs font-semibold text-white">保存快照</button>
          </div>
        ) : family ? (
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span><small className="mr-2 text-ink-400">定存</small><strong>{formatCny(Number(family?.term_deposits_cny || 0), 0)}</strong></span>
            <span><small className="mr-2 text-ink-400">现金基金</small><strong>{formatCny(Number(family?.cash_funds_cny || 0), 0)}</strong></span>
            <span><small className="mr-2 text-ink-400">家庭参考金融资产</small><strong>{formatCny(personalValue + safetyTotal, 0)}</strong></span>
            <span className="text-xs text-ink-400">数据日 {family?.as_of_date || '尚未记录'} · 下次建议更新 {family?.next_review_date || '-'}</span>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-400">尚未记录家庭安全垫。点击“更新”保存第一条半年快照。</p>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </section>
    </>
  );
}
