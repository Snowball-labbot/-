import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FileText,
  FlaskConical,
  Folder,
  FolderPlus,
  Inbox,
  Loader2,
  Network,
  Newspaper,
  Pencil,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import type { ResearchDocument, ResearchDocumentInput, ResearchFolder } from '@/types';
import { cn } from '@/lib/utils';
import { MarkdownView } from './MarkdownView';


const rootIcons: Record<string, typeof Newspaper> = {
  briefs: Newspaper,
  macro: Activity,
  industry: Network,
  quant: FlaskConical,
  inbox: Inbox,
};

const rootDescriptions: Record<string, string> = {
  briefs: '每日研究结论和事件影响',
  macro: '保持时间流，通过标签和搜索组织',
  industry: '产业链、行业与公司的长期研究',
  quant: '策略假设、实验和回测记录',
  inbox: '待阅读、待验证与待归档资料',
};

export type ResearchLibraryScope = 'library' | 'macro' | 'industry' | 'quant';

const scopeMeta: Record<ResearchLibraryScope, {
  eyebrow: string;
  title: string;
  description: string;
  rootKinds: string[];
}> = {
  library: {
    eyebrow: 'Research Library',
    title: '简报与资料库',
    description: '收纳每日简报和待整理资料，完成研究后再归入对应专题。',
    rootKinds: ['briefs', 'inbox'],
  },
  macro: {
    eyebrow: 'Macro Research',
    title: '宏观研究工作台',
    description: '不强行拆大类，按时间、标签和传导路径积累可复核的宏观判断。',
    rootKinds: ['macro'],
  },
  industry: {
    eyebrow: 'Industry Research',
    title: '行业与公司研究',
    description: '以产业链为目录、公司为子目录，连接商业模式、关键指标和投资论点。',
    rootKinds: ['industry'],
  },
  quant: {
    eyebrow: 'Quant Lab',
    title: '量化实验工作台',
    description: '把策略假设、信号定义、回测结果、偏差检查和失效条件放在同一条实验链上。',
    rootKinds: ['quant'],
  },
};

const templates: Record<string, string> = {
  macro: `# 宏观研究结论\n\n> 先写结论，再记录证据。不要为了归类而拆散同一条逻辑。\n\n## 发生了什么\n\n\n## 为什么重要\n\n\n## 对资产与持仓的传导路径\n\n\n## 证据与数据来源\n\n\n## 需要继续验证的问题\n`,
  industry: `# 行业研究结论\n\n## 产业链与利润分配\n\n\n## 需求驱动与周期位置\n\n\n## 竞争格局和关键壁垒\n\n\n## 重点公司对比\n\n\n## 行业关键指标\n\n\n## 风险、催化剂与跟踪清单\n`,
  company: `# 投资决策摘要\n\n> 当前观点：研究中\n\n## 核心投资逻辑\n\n\n## 市场可能忽略的因素\n\n\n## 商业模式与关键经营指标\n\n\n## 财务质量与资本配置\n\n\n## 估值情景\n\n- 乐观：\n- 基准：\n- 悲观：\n\n## 催化剂\n\n\n## 主要风险\n\n\n## 逻辑失效条件\n\n\n## 下一次检查清单\n`,
  quant: `# 策略假设\n\n## 经济逻辑\n\n\n## 信号定义与交易规则\n\n\n## 数据范围和防止未来函数\n\n\n## 评价指标\n\n\n## 实验结果\n\n\n## 失效场景与下一步实验\n`,
  inbox: `# 资料摘要\n\n## 来源\n\n\n## 核心信息\n\n\n## 可信度与待验证点\n\n\n## 应归档到哪里\n`,
  briefs: `# 今日结论\n\n## 未来七天关键事件\n\n\n## 持仓与观察名单影响\n\n\n## 需要继续研究的问题\n`,
};

interface DraftState {
  title: string;
  summary: string;
  content_markdown: string;
  tags: string;
  source_url: string;
  status: string;
}

function toDraft(document: ResearchDocument): DraftState {
  return {
    title: document.title,
    summary: document.summary || '',
    content_markdown: document.content_markdown,
    tags: document.tags.join(', '),
    source_url: document.source_url || '',
    status: document.status,
  };
}

function folderDocumentType(folder?: ResearchFolder) {
  if (!folder) return 'note';
  if (folder.kind === 'company') return 'company';
  if (folder.kind === 'industry') return 'industry';
  return folder.kind === 'briefs' ? 'brief' : folder.kind;
}

interface ResearchLibraryProps {
  scope?: ResearchLibraryScope;
  headerAction?: ReactNode;
  initialFolderId?: string;
  initialDocumentId?: string;
}

export function ResearchLibrary({
  scope = 'library',
  headerAction,
  initialFolderId,
  initialDocumentId,
}: ResearchLibraryProps) {
  const [folders, setFolders] = useState<ResearchFolder[]>([]);
  const [documents, setDocuments] = useState<ResearchDocument[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId || '');
  const [selectedDocumentId, setSelectedDocumentId] = useState(initialDocumentId || '');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderKind, setFolderKind] = useState('industry');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const meta = scopeMeta[scope];
  const scopedFolders = useMemo(() => {
    const rootIds = new Set(
      folders
        .filter((folder) => !folder.parent_id && meta.rootKinds.includes(folder.kind))
        .map((folder) => folder.id),
    );
    const included = new Set(rootIds);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((folder) => {
        if (folder.parent_id && included.has(folder.parent_id) && !included.has(folder.id)) {
          included.add(folder.id);
          changed = true;
        }
      });
    }
    return folders.filter((folder) => included.has(folder.id));
  }, [folders, meta.rootKinds]);
  const selectedFolder = scopedFolders.find((folder) => folder.id === selectedFolderId);
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || null;
  const roots = useMemo(() => scopedFolders.filter((folder) => !folder.parent_id), [scopedFolders]);

  const loadFolders = useCallback(async () => {
    const nextFolders = await api.researchFolders();
    setFolders(nextFolders);
  }, []);

  const loadDocuments = useCallback(async (folderId: string, query = '') => {
    if (!folderId) return;
    const nextDocuments = await api.researchDocuments(folderId, query || undefined);
    setDocuments(nextDocuments);
    setSelectedDocumentId((current) => {
      if (current && nextDocuments.some((item) => item.id === current)) return current;
      if (initialDocumentId && nextDocuments.some((item) => item.id === initialDocumentId)) {
        return initialDocumentId;
      }
      return '';
    });
  }, [initialDocumentId]);

  useEffect(() => {
    loadFolders().catch((loadError) => setError(getErrorMessage(loadError, '研究目录加载失败'))).finally(() => setLoading(false));
  }, [loadFolders]);

  useEffect(() => {
    if (!roots.length || scopedFolders.some((folder) => folder.id === selectedFolderId)) return;
    setSelectedFolderId(roots[0].id);
    setSelectedDocumentId('');
    setExpanded(new Set(roots.map((folder) => folder.id)));
  }, [roots, scopedFolders, selectedFolderId]);

  useEffect(() => {
    if (!initialFolderId || !scopedFolders.some((folder) => folder.id === initialFolderId)) return;
    setSelectedFolderId(initialFolderId);
    setSelectedDocumentId(initialDocumentId || '');
    const ancestors = new Set<string>();
    let current = scopedFolders.find((folder) => folder.id === initialFolderId);
    while (current) {
      ancestors.add(current.id);
      current = current.parent_id
        ? scopedFolders.find((folder) => folder.id === current?.parent_id)
        : undefined;
    }
    setExpanded((existing) => new Set([...existing, ...ancestors]));
  }, [initialDocumentId, initialFolderId, scopedFolders]);

  useEffect(() => {
    if (!selectedFolderId) return;
    loadDocuments(selectedFolderId).catch((loadError) => setError(getErrorMessage(loadError, '研究文档加载失败')));
  }, [loadDocuments, selectedFolderId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selectedFolderId) loadDocuments(selectedFolderId, search).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadDocuments, search, selectedFolderId]);

  useEffect(() => {
    setDraft(selectedDocument ? toDraft(selectedDocument) : null);
  }, [selectedDocument]);

  const selectFolder = (folder: ResearchFolder) => {
    setSelectedFolderId(folder.id);
    setSelectedDocumentId('');
    setSearch('');
    setEditing(false);
    if (folders.some((child) => child.parent_id === folder.id)) {
      setExpanded((current) => new Set(current).add(folder.id));
    }
  };

  const createDocument = async () => {
    if (!selectedFolder) return;
    const type = folderDocumentType(selectedFolder);
    const today = new Date().toISOString().slice(0, 10);
    const title = type === 'company' ? `${selectedFolder.name} 投资研究` : `未命名${type === 'macro' ? '宏观研究' : '研究笔记'}`;
    try {
      const document = await api.createResearchDocument({
        folder_id: selectedFolder.id,
        document_type: type,
        title,
        content_markdown: templates[type] || templates.inbox,
        tags: type === 'company' ? [selectedFolder.name, '公司研究'] : [selectedFolder.name],
        as_of_date: today,
        status: 'draft',
      });
      await loadDocuments(selectedFolder.id, search);
      setSelectedDocumentId(document.id);
      setDraft(toDraft(document));
      setEditing(true);
    } catch (createError) {
      setError(getErrorMessage(createError, '创建研究文档失败'));
    }
  };

  const saveDocument = async () => {
    if (!selectedDocument || !draft) return;
    setSaving(true);
    try {
      const payload: Partial<ResearchDocumentInput> = {
        title: draft.title.trim() || '未命名研究',
        summary: draft.summary.trim() || null,
        content_markdown: draft.content_markdown,
        tags: draft.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        source_url: draft.source_url.trim() || null,
        status: draft.status,
      };
      const updated = await api.updateResearchDocument(selectedDocument.id, payload);
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setDraft(toDraft(updated));
      setEditing(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, '保存研究文档失败'));
    } finally {
      setSaving(false);
    }
  };

  const removeDocument = async () => {
    if (!selectedDocument || !window.confirm(`确认删除“${selectedDocument.title}”？`)) return;
    await api.deleteResearchDocument(selectedDocument.id);
    setSelectedDocumentId('');
    setDraft(null);
    await loadDocuments(selectedFolderId, search);
  };

  const openFolderModal = () => {
    const parent = selectedFolder;
    if (scope === 'quant') setFolderKind('quant');
    else setFolderKind(parent?.kind === 'industry' && parent.parent_id ? 'company' : 'industry');
    setFolderName('');
    setFolderModal(true);
  };

  const createFolder = async () => {
    if (!folderName.trim() || !selectedFolder) return;
    try {
      const folder = await api.createResearchFolder({
        name: folderName.trim(),
        parent_id: selectedFolder.id,
        kind: folderKind,
        description: folderKind === 'company'
          ? '公司投资研究与证据档案'
          : folderKind === 'quant'
            ? '量化策略实验、回测和复盘记录'
            : '行业研究与重点公司目录',
      });
      await loadFolders();
      setExpanded((current) => new Set(current).add(selectedFolder.id));
      setSelectedFolderId(folder.id);
      setFolderModal(false);
      if (folderKind === 'company') {
        const document = await api.createResearchDocument({
          folder_id: folder.id,
          document_type: 'company',
          title: `${folder.name} 投资研究`,
          content_markdown: templates.company,
          tags: [folder.name, '公司研究'],
          as_of_date: new Date().toISOString().slice(0, 10),
        });
        setDocuments([document]);
        setSelectedDocumentId(document.id);
        setEditing(true);
      }
    } catch (folderError) {
      setError(getErrorMessage(folderError, '创建研究目录失败'));
    }
  };

  if (loading) return <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>;

  const canCreateFolder = scope === 'industry' || scope === 'quant';
  const articleFirst = scope === 'macro' || scope === 'industry';

  return (
    <div className="p-4 md:p-5 lg:p-6">
      {error && <div className="mx-auto mb-4 flex max-w-[1280px] items-center gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => setError('')} className="ml-auto"><X size={15} /></button></div>}
      <div className={cn(
        'mx-auto grid min-h-[calc(100vh-141px)] max-w-[1280px] overflow-hidden rounded-lg border border-ink-100 bg-white',
        articleFirst ? 'lg:grid-cols-[236px_minmax(0,1fr)]' : 'lg:grid-cols-[156px_236px_minmax(0,1fr)]',
      )}>
        <div className={articleFirst ? 'min-h-0 border-r border-ink-100' : 'lg:contents'}>
        <aside className={cn('border-b border-ink-100 bg-ink-50/45', !articleFirst && 'lg:border-b-0 lg:border-r')}>
          <div className="border-b border-ink-100 px-4 py-4"><div className="text-xs font-semibold uppercase text-ink-400">{meta.eyebrow}</div><h2 className="mt-1 text-base font-bold text-ink-950">研究目录</h2></div>
          <nav className={cn('custom-scrollbar max-h-[360px] overflow-y-auto p-2', articleFirst ? 'lg:max-h-[190px]' : 'lg:max-h-[calc(100vh-211px)]')}>
            {roots.map((root) => <FolderNode key={root.id} folder={root} folders={scopedFolders} selectedId={selectedFolderId} expanded={expanded} onSelect={selectFolder} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />)}
          </nav>
        </aside>

        <section className={cn('border-b border-ink-100', !articleFirst && 'lg:border-b-0 lg:border-r')}>
          <div className="border-b border-ink-100 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-ink-900">{selectedFolder?.name || '选择目录'}</h3><p className="mt-0.5 truncate text-[11px] text-ink-400">{selectedFolder ? rootDescriptions[selectedFolder.kind] || selectedFolder.description || '研究资料' : ''}</p></div><div className="flex shrink-0 gap-1">{canCreateFolder && selectedFolder?.kind !== 'company' && <button type="button" title="新建子目录" onClick={openFolderModal} className="rounded-md p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-900"><FolderPlus size={16} /></button>}<button type="button" title="新建文档" disabled={!selectedFolder} onClick={createDocument} className="rounded-md p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"><FilePlus2 size={16} /></button></div></div>
            <div className="relative mt-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索当前目录" className="h-9 w-full rounded-md border border-ink-100 bg-white pl-9 pr-3 text-xs" /></div>
          </div>
          <div className={cn('custom-scrollbar max-h-[390px] divide-y divide-ink-100 overflow-y-auto', articleFirst ? 'lg:max-h-[calc(100vh-360px)]' : 'lg:max-h-[calc(100vh-211px)]')}>
            {documents.length ? documents.map((document) => (
              <button key={document.id} type="button" onClick={() => { setSelectedDocumentId(document.id); setEditing(false); }} className={cn('w-full px-4 py-4 text-left transition-colors', selectedDocumentId === document.id ? 'bg-brand-50' : 'hover:bg-ink-50')}>
                <div className="flex items-start gap-3"><FileText size={16} className={cn('mt-0.5 shrink-0', selectedDocumentId === document.id ? 'text-brand-600' : 'text-ink-300')} /><div className="min-w-0"><div className="line-clamp-2 text-sm font-semibold leading-5 text-ink-900">{document.title}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-400">{document.summary || '暂无摘要'}</p><div className="mt-2 text-[10px] text-ink-300">{document.as_of_date || new Date(document.updated_at).toLocaleDateString('zh-CN')} · {document.status === 'published' ? '已发布' : '草稿'}</div></div></div>
              </button>
            )) : <div className="px-5 py-16 text-center"><BookOpen size={24} className="mx-auto text-ink-200" /><p className="mt-3 text-sm text-ink-400">该目录还没有研究内容。</p><button type="button" onClick={createDocument} className="mt-3 text-xs font-semibold text-brand-700">创建第一篇研究</button></div>}
          </div>
        </section>
        </div>

        <main className="min-w-0">
          {selectedDocument && draft ? (
            <>
              <div className="flex min-h-[64px] items-center gap-3 border-b border-ink-100 px-5 py-3">
                <div className="min-w-0 flex-1"><div className="truncate text-base font-bold text-ink-950">{selectedDocument.title}</div><div className="mt-0.5 text-[11px] text-ink-400">更新于 {new Date(selectedDocument.updated_at).toLocaleString('zh-CN')}</div></div>
                {headerAction && <div className="shrink-0">{headerAction}</div>}
                {selectedDocument.source_url && <a href={selectedDocument.source_url} target="_blank" rel="noreferrer" title="打开来源" className="rounded-md border border-ink-100 p-2 text-ink-400 hover:text-ink-900"><ExternalLink size={15} /></a>}
                <button type="button" onClick={() => setEditing((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-200 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-50"><Pencil size={14} />{editing ? '预览' : '编辑'}</button>
                <button type="button" onClick={removeDocument} title="删除文档" className="rounded-md border border-ink-100 p-2 text-ink-400 hover:border-red-100 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
              {editing ? (
                <div className="custom-scrollbar max-h-[calc(100vh-205px)] overflow-y-auto p-5 lg:p-7">
                  <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><label className="text-xs font-semibold text-ink-500">标题<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 h-10 w-full rounded-md border border-ink-200 px-3 text-sm font-semibold text-ink-900" /></label><label className="text-xs font-semibold text-ink-500">状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3 text-sm"><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label></div>
                  <label className="mt-4 block text-xs font-semibold text-ink-500">摘要<textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} rows={2} className="mt-2 w-full resize-none rounded-md border border-ink-200 p-3 text-sm leading-6" /></label>
                  <label className="mt-4 block text-xs font-semibold text-ink-500">正文（Markdown）<textarea value={draft.content_markdown} onChange={(event) => setDraft({ ...draft, content_markdown: event.target.value })} className="custom-scrollbar mt-2 min-h-[460px] w-full resize-y rounded-md border border-ink-200 p-4 font-mono text-sm leading-7 text-ink-800" /></label>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-ink-500">标签<input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="半导体, NVDA, 财报" className="mt-2 h-10 w-full rounded-md border border-ink-200 px-3 text-sm" /></label><label className="text-xs font-semibold text-ink-500">来源链接<input value={draft.source_url} onChange={(event) => setDraft({ ...draft, source_url: event.target.value })} placeholder="https://" className="mt-2 h-10 w-full rounded-md border border-ink-200 px-3 text-sm" /></label></div>
                  <button type="button" onClick={saveDocument} disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-ink-950 px-5 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 保存研究</button>
                </div>
              ) : (
                <article className="custom-scrollbar max-h-[calc(100vh-205px)] overflow-y-auto px-6 py-8 lg:px-10 lg:py-10">
                  <div className="mx-auto max-w-[880px]">
                    {selectedDocument.summary && <p className="mb-7 border-b border-ink-100 pb-6 text-base leading-7 text-ink-500">{selectedDocument.summary}</p>}
                    <MarkdownView content={selectedDocument.content_markdown} />
                    {selectedDocument.tags.length > 0 && <div className="mt-10 flex flex-wrap gap-2 border-t border-ink-100 pt-5">{selectedDocument.tags.map((tag) => <span key={tag} className="rounded bg-ink-50 px-2 py-1 text-[11px] text-ink-500">{tag}</span>)}</div>}
                  </div>
                </article>
              )}
            </>
          ) : (
            <div className="relative flex min-h-[560px] items-center justify-center p-8">
              {headerAction && <div className="absolute right-5 top-4">{headerAction}</div>}
              <div className="max-w-lg text-center"><BookOpen size={30} className="mx-auto text-ink-200" /><h3 className="mt-4 text-lg font-bold text-ink-900">研究不是资料堆积，而是可复核的决策过程</h3><p className="mt-3 text-sm leading-7 text-ink-400">选择一篇研究，或从当前目录创建模板。公司研究会引导你记录投资逻辑、关键指标、估值情景、催化剂、风险和失效条件。</p></div>
            </div>
          )}
        </main>
      </div>

      {folderModal && selectedFolder && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold">新建研究目录</h3><p className="mt-1 text-sm text-ink-400">将在“{selectedFolder.name}”下创建。</p></div><button type="button" onClick={() => setFolderModal(false)} className="rounded p-2 text-ink-400 hover:bg-ink-50"><X size={18} /></button></div><label className="mt-5 block text-sm font-medium">目录名称<input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder={folderKind === 'company' ? '例如：NVIDIA' : folderKind === 'quant' ? '例如：龙头动量策略' : '例如：半导体'} className="mt-2 h-10 w-full rounded-md border border-ink-200 px-3" /></label><label className="mt-4 block text-sm font-medium">目录类型<select value={folderKind} onChange={(event) => setFolderKind(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-ink-200 bg-white px-3">{scope === 'quant' ? <option value="quant">量化策略</option> : <><option value="industry">行业目录</option><option value="company">公司目录</option><option value="custom">自定义专题</option></>}</select></label><button type="button" onClick={createFolder} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink-950 text-sm font-semibold text-white"><FolderPlus size={16} /> 创建目录</button></div></div>
      )}
    </div>
  );
}

interface FolderNodeProps {
  folder: ResearchFolder;
  folders: ResearchFolder[];
  selectedId: string;
  expanded: Set<string>;
  onSelect: (folder: ResearchFolder) => void;
  onToggle: (id: string) => void;
  depth?: number;
}

function FolderNode({ folder, folders, selectedId, expanded, onSelect, onToggle, depth = 0 }: FolderNodeProps) {
  const children = folders.filter((item) => item.parent_id === folder.id);
  const open = expanded.has(folder.id);
  const Icon = depth === 0 ? (rootIcons[folder.kind] || Folder) : folder.kind === 'company' ? Building2 : Folder;
  return (
    <div>
      <div className={cn('group flex items-center rounded-md transition-colors', selectedId === folder.id ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:bg-white/80')} style={{ paddingLeft: `${depth * 12}px` }}>
        {children.length ? <button type="button" aria-label={open ? '收起目录' : '展开目录'} onClick={() => onToggle(folder.id)} className="rounded p-1.5 text-ink-400">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="w-7" />}
        <button type="button" onClick={() => onSelect(folder)} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-2 text-left"><Icon size={15} className="shrink-0" /><span className="truncate text-xs font-semibold">{folder.name}</span></button>
      </div>
      {open && children.map((child) => <FolderNode key={child.id} folder={child} folders={folders} selectedId={selectedId} expanded={expanded} onSelect={onSelect} onToggle={onToggle} depth={depth + 1} />)}
    </div>
  );
}
