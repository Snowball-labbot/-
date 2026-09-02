import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  CalendarClock, CircleAlert, Clock3, History, Landmark, Loader2, Pencil, Plus,
  Save, ShieldCheck, Trash2, WalletCards, X,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { formatCny } from '@/lib/format';
import type { FamilySafetyItem, FamilySafetyItemInput, FamilySafetySnapshot } from '@/types';

interface FamilySafetyPageProps { personalValue: number }

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem: FamilySafetyItemInput = {
  category: 'term_deposit', institution: '', name: '', amount_cny: 0, purpose: '', liquidity: 'low',
  annual_rate_pct: null, term_label: '', start_date: null, maturity_date: null, expected_maturity: '',
  account_hint: '', rollover_instruction: '', status: 'active', source_note: '', sort_order: 0,
};
const categoryLabel = { term_deposit: '定期存款', cash_fund: '现金基金', cash: '银行现金' };
const liquidityLabel = { high: '随时可用', medium: '短期可取', low: '到期使用' };
const statusLabel = { active: '有效', pending_confirmation: '待确认', matured: '已到期' };

export function FamilySafetyPage({ personalValue }: FamilySafetyPageProps) {
  const [latest, setLatest] = useState<FamilySafetySnapshot | null>(null);
  const [history, setHistory] = useState<FamilySafetySnapshot[]>([]);
  const [items, setItems] = useState<FamilySafetyItem[]>([]);
  const [form, setForm] = useState<FamilySafetyItemInput>(emptyItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextLatest, nextHistory, nextItems] = await Promise.all([
        api.familySafetyLatest(), api.familySafetyHistory(), api.familySafetyItems(),
      ]);
      setLatest(nextLatest);
      setHistory(nextHistory);
      setItems(nextItems);
    } catch (loadError) {
      setError(getErrorMessage(loadError, '家庭安全垫加载失败。'));
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const metrics = useMemo(() => {
    const total = items.reduce((sum, item) => sum + Number(item.amount_cny), 0);
    const deposits = items.filter((item) => item.category === 'term_deposit').reduce((sum, item) => sum + Number(item.amount_cny), 0);
    const liquid = total - deposits;
    const cutoff = dayjs().add(12, 'month');
    const dueWithinYear = items
      .filter((item) => item.category === 'term_deposit' && item.maturity_date && dayjs(item.maturity_date).isBefore(cutoff.add(1, 'day')))
      .reduce((sum, item) => sum + Number(item.amount_cny), 0);
    const datedDeposits = items.filter((item) => item.category === 'term_deposit' && item.maturity_date)
      .sort((a, b) => String(a.maturity_date).localeCompare(String(b.maturity_date)));
    return { total, deposits, liquid, dueWithinYear, nextMaturity: datedDeposits[0] || null };
  }, [items]);

  const maturityGroups = useMemo(() => {
    const groups = new Map<string, { amount: number; count: number }>();
    items.filter((item) => item.category === 'term_deposit').forEach((item) => {
      const key = item.maturity_date?.slice(0, 4) || item.expected_maturity || '待确认';
      const current = groups.get(key) || { amount: 0, count: 0 };
      groups.set(key, { amount: current.amount + Number(item.amount_cny), count: current.count + 1 });
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const openCreate = () => { setEditingId(null); setForm(emptyItem); setFormOpen(true); };
  const openEdit = (item: FamilySafetyItem) => {
    setEditingId(item.id);
    setForm({
      category: item.category,
      institution: item.institution,
      name: item.name,
      amount_cny: item.amount_cny,
      purpose: item.purpose,
      liquidity: item.liquidity,
      annual_rate_pct: item.annual_rate_pct,
      term_label: item.term_label,
      start_date: item.start_date,
      maturity_date: item.maturity_date,
      expected_maturity: item.expected_maturity,
      account_hint: item.account_hint,
      rollover_instruction: item.rollover_instruction,
      status: item.status,
      source_note: item.source_note,
      sort_order: item.sort_order,
    });
    setFormOpen(true);
  };

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.institution.trim() || !form.name.trim() || !form.purpose.trim() || Number(form.amount_cny) < 0) {
      setError('请填写机构、资金名称、金额和准备作用。');
      return;
    }
    setSaving(true); setError('');
    try {
      if (editingId) await api.updateFamilySafetyItem(editingId, form);
      else await api.createFamilySafetyItem(form);
      setFormOpen(false); setEditingId(null); await loadData();
    } catch (saveError) { setError(getErrorMessage(saveError, '资金明细保存失败。')); }
    finally { setSaving(false); }
  };

  const removeItem = async (item: FamilySafetyItem) => {
    if (!window.confirm(`确认移除“${item.name}”吗？历史半年快照不会被删除。`)) return;
    try { await api.deleteFamilySafetyItem(item.id); await loadData(); }
    catch (removeError) { setError(getErrorMessage(removeError, '资金明细移除失败。')); }
  };

  const saveSnapshot = async () => {
    setSaving(true); setError('');
    try {
      await api.saveFamilySafety({
        term_deposits_cny: metrics.deposits, cash_funds_cny: metrics.liquid, as_of_date: today(),
        note: '由家庭安全垫逐笔明细汇总。仅作家庭背景，不进入个人配置与收益。',
      });
      await loadData();
    } catch (saveError) { setError(getErrorMessage(saveError, '半年快照保存失败。')); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4 p-5 xl:p-6">
      <section className="overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="flex items-start justify-between gap-5 border-b border-ink-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-600"><ShieldCheck size={21} /></span>
            <div><h2 className="text-lg font-bold text-ink-950">家庭安全垫</h2><p className="mt-1 text-xs text-ink-400">记录家庭成员名下的保本资金和日常现金。它只影响家庭安全判断，不稀释个人组合风险比例。</p></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={saveSnapshot} disabled={saving || items.length === 0} className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-200 px-3 text-xs font-semibold text-ink-600 hover:border-ink-400 disabled:opacity-40"><History size={15} />保存半年快照</button>
            <button type="button" onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-md bg-ink-950 px-4 text-xs font-semibold text-white"><Plus size={15} />新增一笔</button>
          </div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-ink-100">
          {[
            { label: '安全垫合计', value: metrics.total, detail: `家庭参考资产 ${formatCny(metrics.total + personalValue, 0)}`, icon: ShieldCheck },
            { label: '可随时动用', value: metrics.liquid, detail: '日常生活、医疗与突发周转', icon: WalletCards },
            { label: '12个月内到期', value: metrics.dueWithinYear, detail: '近端可释放的保本资金', icon: Clock3 },
            { label: '下一笔到期', value: metrics.nextMaturity?.amount_cny || 0, detail: metrics.nextMaturity?.maturity_date || '尚无准确到期日', icon: CalendarClock },
          ].map((item) => { const Icon = item.icon; return (
            <div key={item.label} className="px-6 py-5"><div className="flex items-center justify-between text-xs text-ink-400"><span>{item.label}</span><Icon size={16} /></div><div className="mt-2 text-xl font-semibold tabular-nums text-ink-950">{formatCny(item.value, 0)}</div><div className="mt-1 text-[11px] text-ink-400">{item.detail}</div></div>
          ); })}
        </div>
      </section>

      {formOpen && <SafetyItemForm form={form} setForm={setForm} editing={Boolean(editingId)} saving={saving} onSave={saveItem} onClose={() => setFormOpen(false)} />}
      {error && <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <section className="overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4"><div><h3 className="text-base font-bold text-ink-900">逐笔资金职责</h3><p className="mt-1 text-xs text-ink-400">先看这笔钱为什么存在，再看收益率；用途不同，不能简单合并成可投资现金。</p></div><span className="text-xs text-ink-400">{items.length} 笔记录</span></div>
        {items.length > 0 ? <div className="divide-y divide-ink-100">
          <div className="grid grid-cols-[minmax(360px,1.7fr)_150px_120px_160px_110px_74px] gap-4 bg-ink-50 px-6 py-3 text-[11px] font-semibold uppercase text-ink-400"><span>资金与准备作用</span><span className="text-right">金额</span><span>流动性</span><span>到期时间</span><span>状态/利率</span><span /></div>
          {items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(360px,1.7fr)_150px_120px_160px_110px_74px] items-center gap-4 px-6 py-4">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-ink-50 px-2 py-1 text-[10px] font-semibold text-ink-500">{categoryLabel[item.category]}</span><strong className="truncate text-sm text-ink-900">{item.institution} · {item.name}</strong></div><p className="mt-2 text-xs leading-5 text-ink-500">{item.purpose}</p>{item.source_note && <p className="mt-1 truncate text-[11px] text-ink-300">{item.source_note}</p>}</div>
            <div className="text-right text-sm font-semibold tabular-nums text-ink-900">{formatCny(item.amount_cny, 0)}</div>
            <div className="text-xs text-ink-500">{liquidityLabel[item.liquidity]}</div>
            <div><div className="text-xs font-semibold text-ink-700">{item.maturity_date || item.expected_maturity || '无需到期'}</div>{item.term_label && <div className="mt-1 text-[11px] text-ink-400">{item.term_label} · {item.rollover_instruction || '到期复核'}</div>}</div>
            <div><span className={`text-xs font-semibold ${item.status === 'pending_confirmation' ? 'text-amber-600' : 'text-ink-600'}`}>{statusLabel[item.status]}</span>{item.annual_rate_pct != null && <div className="mt-1 text-[11px] text-ink-400">{Number(item.annual_rate_pct).toFixed(2)}%</div>}</div>
            <div className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(item)} title="修改" className="rounded-md p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-800"><Pencil size={15} /></button><button type="button" onClick={() => removeItem(item)} title="移除" className="rounded-md p-2 text-ink-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div>
          </div>)}
        </div> : <div className="flex h-40 items-center justify-center text-sm text-ink-400"><CircleAlert size={17} className="mr-2" />尚无逐笔明细，请新增第一笔家庭安全垫。</div>}
      </section>

      <section className="grid grid-cols-[1.25fr_0.75fr] overflow-hidden rounded-lg border border-ink-100 bg-white">
        <div className="border-r border-ink-100 p-6"><div className="flex items-center gap-2"><Landmark size={17} className="text-ink-400" /><h3 className="text-base font-bold text-ink-900">定存到期梯度</h3></div><div className="mt-5 grid grid-cols-4 gap-3">{maturityGroups.map(([year, group]) => <div key={year} className="border-l-2 border-brand-500 pl-3"><div className="text-xs font-semibold text-ink-500">{year}{/^\d{4}$/.test(year) ? ' 年' : ''}</div><div className="mt-2 text-lg font-semibold tabular-nums text-ink-900">{formatCny(group.amount, 0)}</div><div className="mt-1 text-[11px] text-ink-400">{group.count} 笔到期</div></div>)}</div></div>
        <div className="p-6"><div className="flex items-center justify-between"><div><h3 className="text-base font-bold text-ink-900">低频复核记录</h3><p className="mt-1 text-xs text-ink-400">金额半年更新一次，到期日变化随时修正。</p></div><History size={17} className="text-ink-300" /></div><div className="mt-4 space-y-3">{history.slice(0, 3).map((item) => <div key={item.id} className="flex items-center justify-between text-xs"><span className="font-semibold text-ink-600">{item.as_of_date}</span><span className="text-ink-400">{formatCny(Number(item.term_deposits_cny) + Number(item.cash_funds_cny), 0)}</span></div>)}{history.length === 0 && <div className="text-xs text-ink-400">尚无历史快照</div>}</div>{latest && <div className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-400">下次建议更新：<strong className="ml-1 text-ink-600">{latest.next_review_date}</strong></div>}</div>
      </section>
    </div>
  );
}

interface SafetyItemFormProps {
  form: FamilySafetyItemInput;
  setForm: (value: FamilySafetyItemInput) => void;
  editing: boolean;
  saving: boolean;
  onSave: (event: React.FormEvent) => void;
  onClose: () => void;
}

function SafetyItemForm({ form, setForm, editing, saving, onSave, onClose }: SafetyItemFormProps) {
  return <form onSubmit={onSave} className="rounded-lg border border-brand-100 bg-white p-6 shadow-sm">
    <div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-ink-900">{editing ? '修改资金明细' : '新增资金明细'}</h3><p className="mt-1 text-xs text-ink-400">金额和用途必填；不确定的到期日请留空，并在预计到期中说明。</p></div><button type="button" onClick={onClose} className="rounded-md p-2 text-ink-400 hover:bg-ink-50"><X size={18} /></button></div>
    <div className="grid grid-cols-4 gap-4">
      <Field label="类别"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FamilySafetyItemInput['category'] })} className="field"><option value="term_deposit">定期存款</option><option value="cash_fund">现金基金</option><option value="cash">银行现金</option></select></Field>
      <Field label="机构"><input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} className="field" placeholder="例如：光大银行" /></Field>
      <Field label="产品/账户"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" placeholder="例如：一年期定存" /></Field>
      <Field label="当前金额"><input type="number" min="0" step="0.01" value={form.amount_cny} onChange={(e) => setForm({ ...form, amount_cny: Number(e.target.value) })} className="field" /></Field>
      <div className="col-span-2"><Field label="准备作用"><input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="field" placeholder="这笔钱留给什么场景，为什么不能纳入个人调仓" /></Field></div>
      <Field label="流动性"><select value={form.liquidity} onChange={(e) => setForm({ ...form, liquidity: e.target.value as FamilySafetyItemInput['liquidity'] })} className="field"><option value="high">随时可用</option><option value="medium">短期可取</option><option value="low">到期使用</option></select></Field>
      <Field label="状态"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FamilySafetyItemInput['status'] })} className="field"><option value="active">有效</option><option value="pending_confirmation">待确认</option><option value="matured">已到期</option></select></Field>
      <Field label="年利率（%）"><input type="number" min="0" step="0.0001" value={form.annual_rate_pct ?? ''} onChange={(e) => setForm({ ...form, annual_rate_pct: e.target.value ? Number(e.target.value) : null })} className="field" /></Field>
      <Field label="期限"><input value={form.term_label || ''} onChange={(e) => setForm({ ...form, term_label: e.target.value })} className="field" placeholder="例如：1年" /></Field>
      <Field label="准确到期日"><input type="date" value={form.maturity_date || ''} onChange={(e) => setForm({ ...form, maturity_date: e.target.value || null })} className="field" /></Field>
      <Field label="预计到期"><input value={form.expected_maturity || ''} onChange={(e) => setForm({ ...form, expected_maturity: e.target.value })} className="field" placeholder="准确日期未知时填写" /></Field>
      <Field label="账户提示"><input value={form.account_hint || ''} onChange={(e) => setForm({ ...form, account_hint: e.target.value })} className="field" placeholder="尾号或账户说明" /></Field>
      <Field label="到期处理"><input value={form.rollover_instruction || ''} onChange={(e) => setForm({ ...form, rollover_instruction: e.target.value })} className="field" placeholder="本息转存/到期复核" /></Field>
      <div className="col-span-2"><Field label="来源与备注"><input value={form.source_note || ''} onChange={(e) => setForm({ ...form, source_note: e.target.value })} className="field" placeholder="数据来源、待确认事项或调整说明" /></Field></div>
    </div>
    <div className="mt-5 flex justify-end"><button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}保存明细</button></div>
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-semibold text-ink-500"><span>{label}</span>{children}</label>;
}
