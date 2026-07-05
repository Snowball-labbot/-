import { ChangeEvent, lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Download,
  Loader2,
  Plus,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { AppShell, WorkspaceView } from '@/components/layout/AppShell';
import { AssetsWorkspace } from '@/components/assets/AssetsWorkspace';
import { AssetDetail } from '@/components/AssetDetail/AssetDetail';
import { AssetInputForm } from '@/components/AssetInputForm';
import AuthPage from '@/components/auth/AuthPage';
import { useAssetStore } from '@/store/useAssetStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getErrorMessage } from '@/lib/api';

const PortfolioOverview = lazy(() => import('@/components/dashboard/PortfolioOverview').then(
  (module) => ({ default: module.PortfolioOverview }),
));
const StrategyWorkspace = lazy(() => import('@/components/strategy/StrategyWorkspace').then(
  (module) => ({ default: module.StrategyWorkspace }),
));

const viewCopy: Record<WorkspaceView, { title: string; subtitle: string }> = {
  networth: {
    title: '净资产',
    subtitle: '总资产、历史趋势和配置结构',
  },
  assets: {
    title: '资产',
    subtitle: '按类型、账户与分组管理全部持仓',
  },
  strategy: {
    title: '资产配置策略',
    subtitle: '比较主流模型、设置目标，并使用 AI 策略助手',
  },
  detail: {
    title: '资产详情',
    subtitle: '行情、估值、交易流水和历史趋势',
  },
};

function App() {
  const [view, setView] = useState<WorkspaceView>('networth');
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const { assets, loadAssets, exportCurrentAssets, importAssetBackup } = useAssetStore();
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      loadAssets().catch((error) => console.error('Load assets failed:', error));
    }
  }, [user, loadAssets]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || null;
  const totalValue = assets.reduce((sum, asset) => sum + Number(asset.current_value_cny || 0), 0);

  const navigate = (nextView: 'networth' | 'assets' | 'strategy') => {
    setSelectedAssetId(undefined);
    setView(nextView);
  };

  const handleExportAssets = async () => {
    setExporting(true);
    try {
      await exportCurrentAssets();
    } catch (error) {
      alert(getErrorMessage(error, '导出失败，请稍后重试。'));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const count = await importAssetBackup(file);
      alert(`已导入 ${count} 条资产。`);
    } catch (error) {
      alert(getErrorMessage(error, '导入失败，请确认文件为 portfolio_backup_v1 JSON。'));
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-canvas">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const topActions = (
    <>
      <button
        type="button"
        title="导出资产"
        onClick={handleExportAssets}
        disabled={exporting || importing}
        className="hidden h-9 w-9 items-center justify-center rounded-md border border-ink-100 bg-white text-ink-500 transition hover:border-ink-200 hover:text-ink-900 disabled:opacity-40 sm:inline-flex"
      >
        {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </button>
      <button
        type="button"
        title="导入资产"
        onClick={() => importFileRef.current?.click()}
        disabled={exporting || importing}
        className="hidden h-9 w-9 items-center justify-center rounded-md border border-ink-100 bg-white text-ink-500 transition hover:border-ink-200 hover:text-ink-900 disabled:opacity-40 sm:inline-flex"
      >
        {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
      </button>
      <input
        ref={importFileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
      {view !== 'strategy' && (
        <button
          type="button"
          onClick={() => navigate('strategy')}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition hover:border-brand-500 hover:text-brand-700 md:px-4 md:text-sm"
        >
          <Target size={16} />
          <span className="hidden sm:inline">AI 资产配置</span>
          <span className="sm:hidden">策略</span>
        </button>
      )}
      {view !== 'strategy' && (
        <button
          type="button"
          aria-label="新增资产"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-ink-950 px-3 text-xs font-semibold text-white transition hover:bg-ink-800 md:px-4 md:text-sm"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">新增资产</span>
        </button>
      )}
    </>
  );

  const mobileActions = (
    <>
      <button
        type="button"
        onClick={handleExportAssets}
        disabled={exporting || importing}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-200 text-xs font-semibold text-ink-600 disabled:opacity-40"
      >
        {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
        导出资产
      </button>
      <button
        type="button"
        onClick={() => importFileRef.current?.click()}
        disabled={exporting || importing}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink-200 text-xs font-semibold text-ink-600 disabled:opacity-40"
      >
        {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        导入资产
      </button>
    </>
  );

  let content;
  if (view === 'strategy') {
    content = <StrategyWorkspace />;
  } else if (view === 'detail' && selectedAsset) {
    content = (
      <div className="h-[calc(100vh-80px)]">
        <AssetDetail
          asset={selectedAsset}
          onBack={() => {
            setSelectedAssetId(undefined);
            setView('assets');
          }}
        />
      </div>
    );
  } else if (view === 'assets') {
    content = (
      <AssetsWorkspace
        onAddAsset={() => setIsAddModalOpen(true)}
        onSelectAsset={(asset) => {
          setSelectedAssetId(asset.id);
          setView('detail');
        }}
      />
    );
  } else {
    content = <PortfolioOverview onOpenAssets={() => navigate('assets')} />;
  }

  const currentCopy = viewCopy[view === 'detail' && !selectedAsset ? 'assets' : view];

  return (
    <>
      <AppShell
        activeView={view}
        title={selectedAsset && view === 'detail' ? selectedAsset.name : currentCopy.title}
        subtitle={currentCopy.subtitle}
        totalValue={totalValue}
        assetCount={assets.length}
        onNavigate={navigate}
        actions={topActions}
        mobileActions={mobileActions}
      >
        <Suspense
          fallback={(
            <div className="flex min-h-[420px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          )}
        >
          {content}
        </Suspense>
      </AppShell>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 p-3 backdrop-blur-sm md:p-6">
          <div className="custom-scrollbar relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl md:p-7">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-md p-2 text-ink-400 transition hover:bg-ink-50 hover:text-ink-800"
              aria-label="关闭新增资产"
            >
              <X size={19} />
            </button>
            <div className="mb-5 pr-12">
              <h2 className="text-xl font-bold text-ink-950">新增资产</h2>
              <p className="mt-1 text-sm text-ink-400">录入持仓，或通过行情代码自动绑定最新单位价格。</p>
            </div>
            <AssetInputForm
              onSuccess={() => {
                setIsAddModalOpen(false);
                setView('assets');
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default App;
