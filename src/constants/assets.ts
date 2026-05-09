import { AssetType, AssetTypeConfig } from '@/types';

export const ASSET_CONFIG: Record<AssetType, AssetTypeConfig> = {
  [AssetType.CASH]: { label: '\u73b0\u91d1', color: '#10b981' },
  [AssetType.STOCK]: { label: '\u80a1\u7968', color: '#ef4444' },
  [AssetType.BOND]: { label: '\u503a\u5238', color: '#f59e0b' },
  [AssetType.FUND]: { label: '\u57fa\u91d1', color: '#3b82f6' },
  [AssetType.PROPERTY]: { label: '\u623f\u4ea7', color: '#8b5cf6' },
  [AssetType.OTHER]: { label: '\u5176\u4ed6', color: '#6b7280' },
};
