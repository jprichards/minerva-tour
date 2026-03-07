'use client';

import { useState, useCallback } from 'react';
import { Share2, Check } from 'lucide-react';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: 'Minerva Tour',
      text: 'Check out the Minerva Tour golf app!',
      url: window.location.origin,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        await navigator.clipboard.writeText(shareData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, []);

  return (
    <button
      onClick={handleShare}
      className="relative p-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors"
      aria-label="Share app"
    >
      {copied ? (
        <Check className="w-5 h-5 text-green-500" />
      ) : (
        <Share2 className="w-5 h-5 text-[var(--text-muted)]" />
      )}
      {copied && (
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs font-medium text-green-600 whitespace-nowrap">
          Copied!
        </span>
      )}
    </button>
  );
}
