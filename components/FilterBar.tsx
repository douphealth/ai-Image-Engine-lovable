// components/FilterBar.tsx - Advanced filtering controls

import React, { memo } from 'react';
import { FilterPreset } from '../types';
import { 
  SearchIcon, 
  FilterIcon, 
  CheckSquare, 
  Square, 
  SparklesIcon, 
  Loader,
  GridIcon,
  ListIcon,
  LayoutGridIcon,
  SortAscIcon,
  SortDescIcon,
  SlidersIcon
} from './icons/Icons';

interface Props {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  filterPreset: FilterPreset;
  onFilterChange: (preset: FilterPreset) => void;
  sortBy: string;
  onSortChange: (sort: any) => void;
  sortDirection: 'asc' | 'desc';
  onSortDirectionChange: (dir: 'asc' | 'desc') => void;
  viewMode: 'grid' | 'list' | 'compact';
  onViewModeChange: (mode: 'grid' | 'list' | 'compact') => void;
  selectedCount: number;
  filteredCount: number;
  onSelectAll: () => void;
  onBulkActions: () => void;
  isProcessing: boolean;
  onStartGeneration: () => void;
  isPending: boolean;
}

const filterPresets: Array<{ id: FilterPreset; label: string; shortcut?: string }> = [
  { id: 'all', label: 'All Posts', shortcut: '1' },
  { id: 'no-featured', label: 'No Featured', shortcut: '2' },
  { id: 'zero-images', label: 'Zero Images', shortcut: '3' },
  { id: 'low-images', label: 'Low Images', shortcut: '4' },
  { id: 'needs-work', label: 'Needs Work', shortcut: '5' },
  { id: 'processed', label: 'Processed' },
  { id: 'errors', label: 'Errors' },
];

const FilterBar: React.FC<Props> = memo(({
  searchQuery,
  onSearchChange,
  filterPreset,
  onFilterChange,
  sortBy,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  viewMode,
  onViewModeChange,
  selectedCount,
  filteredCount,
  onSelectAll,
  onBulkActions,
  isProcessing,
  onStartGeneration,
  isPending,
}) => {
  return (
    <div className="px-6 py-4 bg-surface-muted/30 border-b border-border space-y-4">
      {/* Top Row: Search + View Controls */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4">
        {/* Search Input */}
        <div className="relative flex-grow max-w-xl">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input 
            id="search-input"
            type="text" 
            placeholder="Search posts... (Press / to focus)" 
            value={searchQuery} 
            onChange={onSearchChange}
            className="w-full bg-surface border border-border rounded-xl pl-12 pr-6 py-3 text-sm font-medium focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all"
          />
          {isPending && (
            <Loader className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-brand-primary" />
          )}
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-surface rounded-xl border border-border">
          {[
            { mode: 'grid' as const, icon: <GridIcon className="w-4 h-4" />, label: 'Grid' },
            { mode: 'compact' as const, icon: <LayoutGridIcon className="w-4 h-4" />, label: 'Compact' },
            { mode: 'list' as const, icon: <ListIcon className="w-4 h-4" />, label: 'List' },
          ].map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`
                p-2 rounded-lg transition-all
                ${viewMode === mode 
                  ? 'bg-brand-primary text-white' 
                  : 'text-muted hover:text-text-primary hover:bg-surface-muted'
                }
              `}
              title={label}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-brand-primary outline-none"
          >
            <option value="date">Date</option>
            <option value="title">Title</option>
            <option value="images">Image Count</option>
            <option value="status">Status</option>
          </select>
          <button
            onClick={() => onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')}
            className="p-2.5 bg-surface border border-border rounded-xl hover:border-brand-primary transition-all"
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? <SortAscIcon className="w-4 h-4" /> : <SortDescIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bottom Row: Filters + Actions */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        {/* Filter Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {filterPresets.map(({ id, label, shortcut }) => (
            <button
              key={id}
              onClick={() => onFilterChange(id)}
              className={`
                px-3 py-2 text-[11px] font-bold uppercase tracking-wide rounded-xl transition-all
                flex items-center gap-2
                ${filterPreset === id 
                  ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' 
                  : 'bg-surface text-muted hover:bg-surface-muted hover:text-text-secondary border border-border'
                }
              `}
            >
              {label}
              {shortcut && (
                <kbd className={`
                  px-1 py-0.5 text-[9px] rounded
                  ${filterPreset === id ? 'bg-white/20' : 'bg-surface-muted'}
                `}>
                  {shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>

        {/* Selection & Actions */}
        <div className="flex items-center gap-3">
          {/* Select All */}
          <button 
            onClick={onSelectAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-xl hover:border-brand-primary transition-all"
          >
            {selectedCount === filteredCount && filteredCount > 0 
              ? <CheckSquare className="w-4 h-4 text-brand-primary" /> 
              : <Square className="w-4 h-4 text-muted" />
            }
            <span className="text-xs font-bold uppercase tracking-wide">
              {selectedCount > 0 ? `${selectedCount} Selected` : 'Select All'}
            </span>
          </button>

          {/* Bulk Actions */}
          {selectedCount > 0 && (
            <button
              onClick={onBulkActions}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-xl hover:border-brand-primary hover:text-brand-primary transition-all"
            >
              <SlidersIcon className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Actions</span>
            </button>
          )}

          {/* Generate Button */}
          <button 
            disabled={selectedCount === 0 || isProcessing} 
            onClick={onStartGeneration} 
            className="inline-flex items-center gap-2 px-6 py-2.5 font-bold uppercase text-sm tracking-wide rounded-xl text-white bg-gradient-to-r from-brand-primary to-brand-secondary shadow-lg shadow-brand-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isProcessing ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <SparklesIcon className="w-4 h-4" />
            )}
            {isProcessing ? 'Processing...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default FilterBar;
