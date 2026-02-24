// components/PostCardSkeleton.tsx - Loading placeholder

import React from 'react';

const PostCardSkeleton: React.FC = () => (
  <div className="bg-surface rounded-2xl overflow-hidden border border-border animate-pulse">
    {/* Image placeholder */}
    <div className="aspect-[4/3] bg-surface-muted" />
    
    {/* Content placeholder */}
    <div className="p-4 space-y-3">
      {/* Title */}
      <div className="space-y-2">
        <div className="h-4 bg-surface-muted rounded w-3/4" />
        <div className="h-4 bg-surface-muted rounded w-1/2" />
      </div>
      
      {/* Badge */}
      <div className="h-5 bg-surface-muted rounded-md w-24" />
    </div>
    
    {/* Button placeholder */}
    <div className="p-3 bg-surface-muted/30 border-t border-border/50">
      <div className="h-10 bg-surface-muted rounded-xl" />
    </div>
  </div>
);

export const PostCardSkeletonGrid: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <PostCardSkeleton key={i} />
    ))}
  </>
);

export default PostCardSkeleton;
