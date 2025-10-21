'use client';

import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const BUTTON_SIZE = 48;
const BUTTON_MARGIN = 24;

const clampPosition = (x, y) => {
  if (typeof window === 'undefined') {
    return { x, y };
  }
  const maxX = Math.max(BUTTON_MARGIN, window.innerWidth - BUTTON_SIZE - BUTTON_MARGIN);
  const maxY = Math.max(BUTTON_MARGIN, window.innerHeight - BUTTON_SIZE - BUTTON_MARGIN);
  return {
    x: Math.min(Math.max(BUTTON_MARGIN, x), maxX),
    y: Math.min(Math.max(BUTTON_MARGIN, y), maxY),
  };
};

const getInitialPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }
  return clampPosition(window.innerWidth - BUTTON_SIZE - BUTTON_MARGIN, window.innerHeight - BUTTON_SIZE - BUTTON_MARGIN);
};

const getCornerPositions = () => {
  if (typeof window === 'undefined') {
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }
  return [
    clampPosition(BUTTON_MARGIN, BUTTON_MARGIN),
    clampPosition(window.innerWidth - BUTTON_SIZE - BUTTON_MARGIN, BUTTON_MARGIN),
    clampPosition(BUTTON_MARGIN, window.innerHeight - BUTTON_SIZE - BUTTON_MARGIN),
    clampPosition(window.innerWidth - BUTTON_SIZE - BUTTON_MARGIN, window.innerHeight - BUTTON_SIZE - BUTTON_MARGIN),
  ];
};

export default function FloatingThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef(null);
  const hasDraggedRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setPosition(getInitialPosition());
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  if (!mounted) {
    return null;
  }

  const currentTheme = theme === 'system' ? systemTheme : theme;

  const toggleTheme = () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    setDragging(true);
    hasDraggedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    offsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
  };

  const handlePointerMove = (event) => {
    if (!dragging) {
      return;
    }
    const { x, y } = clampPosition(event.clientX - offsetRef.current.x, event.clientY - offsetRef.current.y);
    setPosition({ x, y });
    if (!hasDraggedRef.current) {
      const distance = Math.hypot(
        event.clientX - pointerStartRef.current.x,
        event.clientY - pointerStartRef.current.y,
      );
      if (distance > 4) {
        hasDraggedRef.current = true;
      }
    }
  };

  const handlePointerUp = (event) => {
    if (event.pointerId === pointerIdRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    setDragging(false);
    setPosition((prev) => {
      const corners = getCornerPositions();
      let nearest = prev;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const corner of corners) {
        const distance = Math.hypot(prev.x - corner.x, prev.y - corner.y);
        if (distance < nearestDistance) {
          nearest = corner;
          nearestDistance = distance;
        }
      }
      return nearest;
    });
    if (hasDraggedRef.current) {
      suppressClickRef.current = true;
      hasDraggedRef.current = false;
    }
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleTheme();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        left: position.x,
        top: position.y,
        transition: dragging ? 'none' : 'left 0.25s ease, top 0.25s ease',
      }}
      className="fixed z-[60] inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-gray-200 transition-all duration-200 hover:scale-105 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700 dark:hover:shadow-emerald-500/20"
      aria-label="Toggle theme"
    >
      {currentTheme === 'dark' ? (
        <Sun className="h-6 w-6" />
      ) : (
        <Moon className="h-6 w-6" />
      )}
    </button>
  );
}
