// components/StatsBar.tsx - Premium visual statistics bar

import React, { memo } from 'react';
import { AppStats, FilterPreset } from '../types';
import { ImageIcon, AlertTriangle, CheckCircle2, MinusCircleIcon, TrendingUpIcon } from './icons/Icons';

interface Props {
  stats: AppStats;
  onFilterClick: (preset: FilterPreset) => void;
  activeFilter: FilterPreset;
}

const StatsBar: React.FC<Props> = memo(({ stats, onFilterClick, activeFilter }) => {
  const statCards = [
    {
      id: 'no-featured' as FilterPreset,
      label: 'Missing Featured',
      value: stats.postsWithoutFeatured,
      icon: <AlertTriangle className="w-4 h-4" />,
      color: 'text-warning',
      bgColor: 'bg-warning/8',
      borderColor: 'border-warning/15',
      activeBorder: 'border-warning/50',
      activeRing: 'ring-warning/20',
    },
    {
      id: 'zero-images' as FilterPreset,
      label: 'Zero Images',
      value: stats.postsWithZeroImages,
      icon: <MinusCircleIcon className="w-4 h-4" />,
      color: 'text-danger',
      bgColor: 'bg-danger/8',
      borderColor: 'border-danger/15',
      activeBorder: 'border-danger/50',
      activeRing: 'ring-danger/20',
    },
    {
      id: 'low-images' as FilterPreset,
      label: 'Low Images (<3)',
      value: stats.postsWithLowImages,
      icon: <ImageIcon className="w-4 h-4" />,
      color: 'text-warning',
      bgColor: 'bg-warning/8',
      borderColor: 'border-warning/15',
      activeBorder: 'border-warning/50',
      activeRing: 'ring-warning/20',
    },
    {
      id: 'processed' as FilterPreset,
      label: 'Processed',
      value: stats.postsProcessed,
      icon: <CheckCircle2 className="w-4 h-4" />,
      color: 'text-success',
      bgColor: 'bg-success/8',
      borderColor: 'border-success/15',
      activeBorder: 'border-success/50',
      activeRing: 'ring-success/20',
    },
    {
      id: 'all' as FilterPreset,
      label: 'Avg Images/Post',
      value: stats.averageImagesPerPost.toFixed(1),
      icon: <TrendingUpIcon className="w-4 h-4" />,
      color: 'text-brand-primary',
      bgColor: 'bg-brand-primary/8',
      borderColor: 'border-brand-primary/15',
      activeBorder: 'border-brand-primary/50',
      activeRing: 'ring-brand-primary/20',
      isNotFilter: true,
    },
  ];

  return (
    <div className="px-6 py-4 bg-surface border-b border-border">
      <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-thin">
        {statCards.map(stat => (
          <button
            key={stat.id}
            onClick={() => !stat.isNotFilter && onFilterClick(stat.id)}
            disabled={stat.isNotFilter}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 min-w-[150px]
              ${stat.bgColor} ${stat.borderColor}
              ${activeFilter === stat.id ? `ring-2 ${stat.activeRing} ${stat.activeBorder}` : ''}
              ${!stat.isNotFilter ? 'cursor-pointer hover:scale-[1.02] active:scale-100' : 'cursor-default'}
            `}
          >
            <div className={stat.color}>{stat.icon}</div>
            <div className="text-left">
              <div className={`text-xl font-extrabold tabular-nums ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{stat.label}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});

export default StatsBar;
