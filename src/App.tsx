import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AssetTree } from '@/components/AssetDirectory/AssetTree';
import { AssetDetail } from '@/components/AssetDetail/AssetDetail';
import { useAssetStore } from '@/store/useAssetStore';
import { useAuthStore } from '@/store/useAuthStore';
import { AssetInputForm } from '@/components/AssetInputForm';
import { TotalAssets } from '@/components/TotalAssets';
import { Search, Plus, Loader2, Target, X, Download, Upload } from 'lucide-react';
import { AssetChart } from '@/components/AssetChart';
import { AllocationStrategyPage } from '@/components/AllocationStrategyPage';
import AuthPage from '@/components/auth/AuthPage';
import UserProfile from '@/components/auth/UserProfile';
import { getErrorMessage } from '@/lib/api';

type MainView = 'dashboard' | 'strategy';

function App() {
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mainView, setMainView] = useState<MainView>('dashboard');
  const { assets, loadAssets, exportCurrentAssets, importAssetBackup } = useAssetStore();
  const { user, loading, initialize } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user) {
      loadAssets().catch((error) => console.error('Load assets failed:', error));
    }
  }, [user, loadAssets]);

  const handleExportAssets = async () => {
    setExporting(true);
    try {
      await exportCurrentAssets();
    } catch (error: unknown) {
      alert(getErrorMessage(error, '导出失败'));
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
    } catch (error: unknown) {
      alert(getErrorMessage(error, '导入失败，请确认文件是 portfolio_backup_v1 JSON。'));
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || null;

  const handleSelectAsset = (id: string | undefined) => {
    setSelectedAssetId(id);
  };

  if (mainView === 'strategy' && !selectedAsset) {
    return <AllocationStrategyPage onBack={() => setMainView('dashboard')} />;
  }

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-100 bg-white p-4">
        <h1 className="mb-1 text-xl font-bold text-gray-900">资产管理</h1>
        <TotalAssets />
      </div>

      <div className="shrink-0 space-y-3 border-b border-gray-100 bg-gray-50 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="搜索资产..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          新增资产
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExportAssets}
            disabled={exporting || importing}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download size={14} />}
            导出资产
          </button>
          <button
            type="button"
            onClick={() => importFileRef.current?.click()}
            disabled={exporting || importing}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload size={14} />}
            导入资产
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
        <AssetTree
          searchQuery={searchQuery}
          selectedAssetId={selectedAssetId}
          onSelectAsset={handleSelectAsset}
        />
      </div>

      <UserProfile />
    </div>
  );

  const Dashboard = (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">总览仪表盘</h2>
            <p className="mt-2 text-gray-500">
              选择左侧资产查看详情，或查看下方整体分析。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedAssetId(undefined);
              setMainView('strategy');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <Target size={16} />
            资产配置策略
          </button>
        </header>
        <TotalAssets />
        <AssetChart />
      </div>
    </div>
  );

  const Content = (
    <div className="h-full bg-white">
      {selectedAsset ? (
        <AssetDetail asset={selectedAsset} onBack={() => setSelectedAssetId(undefined)} />
      ) : mainView === 'strategy' ? (
        <AllocationStrategyPage onBack={() => setMainView('dashboard')} />
      ) : (
        Dashboard
      )}
    </div>
  );

  return (
    <>
      <MainLayout sidebar={Sidebar} content={Content} />

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md animate-in rounded-xl bg-white p-6 shadow-2xl duration-200 fade-in zoom-in">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
              aria-label="关闭"
            >
              <X size={22} />
            </button>
            <h2 className="mb-4 text-xl font-bold">新增资产</h2>
            <AssetInputForm onSuccess={() => setIsAddModalOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

export default App;
