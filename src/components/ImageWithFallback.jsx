'use client';

import { useState, useEffect, useMemo } from 'react';

const buildClassName = (baseClassName = '') => {
  if (!baseClassName?.trim()) {
    return 'opacity-100';
  }
  if (baseClassName.includes('opacity-')) {
    const withoutOpacity = baseClassName
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((chunk) =>
        chunk.startsWith('opacity-') ? 'opacity-100' : chunk
      )
      .join(' ');
    if (withoutOpacity.includes('opacity-100')) {
      return withoutOpacity;
    }
    return `${withoutOpacity} opacity-100`.trim();
  }
  return `${baseClassName} opacity-100`.trim();
};

export default function ImageWithFallback({
  src,
  alt,
  fallback = '/placeholder-recipe.jpg',
  className = '',
  onLoad,
  onError,
  ...rest
}) {
  const [currentSrc, setCurrentSrc] = useState(src || fallback);
  const normalizedClassName = useMemo(() => buildClassName(className), [className]);

  useEffect(() => {
    if (src && src !== currentSrc) {
      setCurrentSrc(src);
    }
  }, [src]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={normalizedClassName}
      onLoad={(event) => {
        if (onLoad) {
          onLoad(event);
        }
      }}
      onError={(event) => {
        if (onError) {
          onError(event);
        }
        if (currentSrc !== fallback) {
          setCurrentSrc(fallback);
        }
      }}
      {...rest}
    />
  );
}
