import { useState } from 'react';
import { AssetTree } from './AssetTree';
import { AssetTrendChart } from './AssetTrendChart';
import { AssetHistory } from './AssetHistory';
import { Search, Maximize2, Minimize2, BarChart2, List, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export function AssetDirectoryPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'directory' | 'chart' | 'history'>('directory');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');

  return (
    <motion.div
      initial={false}
      animate={{
        width: isExpanded ? 600 : 280,
        height: isExpanded ? 500 : 'auto',
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "fixed bottom-4 left-4 bg-white shadow-2xl rounded-xl border border-gray-200 overflow-hidden z-50 flex flex-col",
        !isExpanded && "max-h-[400px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-100 shrink-0">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <LayoutGrid size={18} />
          资产目录
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-600"
        >
          {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Tabs (Only in Expanded Mode) */}
      {isExpanded && (
        <div className="flex border-b border-gray-200 shrink-0">
          <button
            onClick={() => setActiveTab('directory')}
            className={cn("flex-1 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'directory' ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            <div className="flex items-center justify-center gap-1"><LayoutGrid size={14}/> 目录</div>
          </button>
          <button
            onClick={() => setActiveTab('chart')}
            className={cn("flex-1 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'chart' ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            <div className="flex items-center justify-center gap-1"><BarChart2 size={14}/> 趋势</div>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn("flex-1 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === 'history' ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            <div className="flex items-center justify-center gap-1"><List size={14}/> 历史</div>
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        {/* Search Box (Always visible in Directory tab or Compact mode) */}
        {(!isExpanded || activeTab === 'directory') && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="搜索资产名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Views */}
        {(!isExpanded || activeTab === 'directory') && (
          <AssetTree searchQuery={searchQuery} />
        )}

        {isExpanded && activeTab === 'chart' && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex justify-end gap-2 shrink-0">
                {(['week', 'month', 'year'] as const).map((r) => (
                    <button
                        key={r}
                        onClick={() => setTimeRange(r)}
                        className={cn(
                            "px-3 py-1 text-xs rounded-full border",
                            timeRange === r 
                                ? "bg-blue-500 text-white border-blue-500" 
                                : "text-gray-600 border-gray-200 hover:bg-gray-50"
                        )}
                    >
                        {r === 'week' ? '周' : r === 'month' ? '月' : '年'}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0">
                <AssetTrendChart timeRange={timeRange} />
            </div>
          </div>
        )}

        {isExpanded && activeTab === 'history' && (
          <AssetHistory />
        )}
      </div>
    </motion.div>
  );
}
