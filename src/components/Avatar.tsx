'use client';

import { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  className?: string;
  textClassName?: string;
  fallback?: React.ReactNode;
}

export default function Avatar({ src, name, className = '', textClassName = '', fallback }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = (name || '?')[0].toUpperCase();

  return (
    <div className={`rounded-full flex items-center justify-center overflow-hidden ${className}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name || ''}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : fallback ? (
        fallback
      ) : (
        <span className={textClassName}>{initial}</span>
      )}
    </div>
  );
}
