'use client';

import { Suspense } from 'react';
import HeadToHeadContent from './HeadToHeadContent';

export default function HeadToHeadPage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-4"><div className="h-6 bg-[var(--bg-skeleton)] rounded animate-pulse w-40" /><div className="h-40 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" /></div>}>
      <HeadToHeadContent />
    </Suspense>
  );
}

