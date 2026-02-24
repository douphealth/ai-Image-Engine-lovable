// components/StatsBar.tsx - Visual statistics bar

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
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      hoverBorder: 'hover:border-amber-500',
    },
    {
      id: 'zero-images' as FilterPreset,
      label: 'Zero Images',
      value: stats.postsWithZeroImages,
      icon: <MinusCircleIcon className="w-5 h-5" />,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      hoverBorder: 'hover:border-red-500',
    },
    {
      id: 'low-images' as FilterPreset,
      label: 'Low Images (<3)',
      value: stats.postsWithLowImages,
      icon: <ImageIcon className="w-5 h-5" />,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      hoverBorder: 'hover:border-orange-500',
    },
    {
      id: 'processed' as FilterPreset,
      label: 'Processed',
      value: stats.postsProcessed,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      hoverBorder: 'hover:border-emerald-500',
    },
    {
      id: 'all' as FilterPreset,
      label: 'Avg Images/Post',
      value: stats.averageImagesPerPost.toFixed(1),
      icon: <TrendingUpIcon className="w-5 h-5" />,
      color: 'text-brand-primary',
      bgColor: 'bg-brand-primary/10',
      borderColor: 'border-brand-primary/20',
      hoverBorder: 'hover:border-brand-primary',
      isNotFilter: true,
    },
  ];

  return (
    <div className="px-6 py-4 bg-surface border-b border-border">
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {statCards.map(stat => (
          <button
            key={stat.id}
            onClick={() => !stat.isNotFilter && onFilterClick(stat.id)}
            disabled={stat.isNotFilter}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl border transition-all min-w-[160px]
              ${stat.bgColor} ${stat.borderColor} ${!stat.isNotFilter ? stat.hoverBorder : ''}
              ${activeFilter === stat.id ? `ring-2 ring-offset-2 ring-offset-surface ${stat.color.replace('text-', 'ring-')}` : ''}
              ${!stat.isNotFilter ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'}
            `}
          >
            <div className={stat.color}>{stat.icon}</div>
            <div className="text-left">
              <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">{stat.label}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});

export default StatsBar;
