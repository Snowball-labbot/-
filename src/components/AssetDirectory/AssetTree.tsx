import { useState, useMemo } from 'react';
import { useAssetStore } from '@/store/useAssetStore';
import { AssetType } from '@/types';
import { ASSET_CONFIG } from '@/constants/assets';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Wallet, LayoutGrid, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssetTreeProps {
  searchQuery: string;
  selectedAssetId?: string;
  onSelectAsset?: (assetId: string) => void;
}

export function AssetTree({ searchQuery, selectedAssetId, onSelectAsset }: AssetTreeProps) {
  const { assets, removeAsset, removeGroup } = useAssetStore();
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteAsset = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (confirm(`确定要删除资产 "${name}" 吗？此操作不可恢复。`)) {
        removeAsset(id);
        if (selectedAssetId === id) {
            onSelectAsset?.('');
        }
    }
  };

  const handleDeleteGroup = (e: React.MouseEvent, type: any, groupName: string) => {
    e.stopPropagation();
    if (confirm(`确定要删除分组 "${groupName}" 及其下的所有资产吗？此操作不可恢复。`)) {
        removeGroup(type, groupName);
    }
  };


  const groupedAssets = useMemo(() => {
    // Structure: Record<AssetType, { root: AssetItem[], groups: Record<string, AssetItem[]> }>
    const structure: Record<string, { root: typeof assets, groups: Record<string, typeof assets> }> = {};
    
    // Initialize structure
    Object.values(AssetType).forEach(type => {
      structure[type] = { root: [], groups: {} };
    });

    // Group assets
    assets.forEach(asset => {
      // Filter by search first if needed
      const matchesSearch = !searchQuery || 
        (asset.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (asset.group?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ASSET_CONFIG[asset.type].label.includes(searchQuery));

      if (matchesSearch) {
        if (asset.group) {
            if (!structure[asset.type].groups[asset.group]) {
                structure[asset.type].groups[asset.group] = [];
            }
            structure[asset.type].groups[asset.group].push(asset);
        } else {
            structure[asset.type].root.push(asset);
        }
      }
    });

    return structure;
  }, [assets, searchQuery]);

  // Check if anything to show
  const hasAssets = Object.values(groupedAssets).some(
    s => s.root.length > 0 || Object.keys(s.groups).length > 0
  );

  if (!hasAssets && searchQuery) {
    return <div className="text-sm text-gray-500 text-center py-4">未找到相关资产</div>;
  }

  const renderAssetItem = (asset: typeof assets[0]) => (
    <div 
        key={asset.id} 
        className={cn(
            "group flex items-center gap-2 p-1.5 rounded text-sm cursor-pointer transition-colors ml-2",
            selectedAssetId === asset.id 
            ? "bg-blue-50 text-blue-600 font-medium" 
            : "hover:bg-gray-50 text-gray-600"
        )}
        onClick={(e) => {
            e.stopPropagation();
            onSelectAsset?.(asset.id);
        }}
    >
        <Wallet size={14} className={cn(selectedAssetId === asset.id ? "text-blue-500" : "text-gray-400")} />
        <span className="truncate flex-1">{asset.name || '未命名资产'}</span>
        <span className="font-mono text-xs">¥{Number(asset.current_value_cny).toLocaleString()}</span>
        <button
            onClick={(e) => handleDeleteAsset(e, asset.id, asset.name || '未命名资产')}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除资产"
        >
            <Trash2 size={12} />
        </button>
    </div>
  );

  return (
    <div className="space-y-1">
      {Object.values(AssetType).map((type) => {
        const { root, groups } = groupedAssets[type];
        const config = ASSET_CONFIG[type];
        const isTypeExpanded = expandedNodes[type] ?? true; // Default expanded for Types
        const totalCount = root.length + Object.values(groups).reduce((acc, curr) => acc + curr.length, 0);
        
        if (totalCount === 0) return null;

        return (
          <div key={type} className="select-none">
            {/* Level 1: Asset Type */}
            <div 
              className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-md cursor-pointer text-sm font-medium text-gray-700"
              onClick={() => toggleExpand(type)}
            >
              {isTypeExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
              {isTypeExpanded ? <FolderOpen size={16} className="text-blue-500" /> : <Folder size={16} className="text-gray-400" />}
              <span>{config.label}</span>
              <span className="ml-auto text-xs text-gray-400">({totalCount})</span>
            </div>
            
            {isTypeExpanded && (
              <div className="ml-4 pl-2 border-l border-gray-200 mt-1 space-y-1">
                {/* Level 2: Groups (Sub-folders) */}
                {Object.entries(groups).map(([groupName, groupAssets]) => {
                    const groupId = `${type}-${groupName}`;
                    const isGroupExpanded = expandedNodes[groupId] ?? false; // Default collapsed for Groups? Or Expanded?
                    
                    return (
                        <div key={groupId}>
                            <div 
                                className="group flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-md cursor-pointer text-sm text-gray-700"
                                onClick={() => toggleExpand(groupId)}
                            >
                                {isGroupExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                                <LayoutGrid size={14} className="text-gray-500" />
                                <span className="flex-1 truncate">{groupName}</span>
                                <span className="text-xs text-gray-400">({groupAssets.length})</span>
                                <button
                                    onClick={(e) => handleDeleteGroup(e, type, groupName)}
                                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="删除分组"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                            
                            {isGroupExpanded && (
                                <div className="ml-4 border-l border-gray-100 pl-1 mt-1">
                                    {groupAssets.map(renderAssetItem)}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Level 2: Root Assets (No group) */}
                {root.map(renderAssetItem)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
