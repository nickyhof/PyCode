/**
 * useResize — drag-to-resize hook for sidebar and panel handles.
 */

import { useEffect, useRef, useCallback } from 'react';

interface ResizeOptions {
  /** CSS selector for the resize handle element */
  handleSelector: string;
  /** CSS selector for the target element to resize */
  targetSelector: string;
  /** 'horizontal' resizes height, 'vertical' resizes width */
  direction: 'horizontal' | 'vertical';
  /** Minimum size in px */
  min?: number;
  /** Maximum size in px */
  max?: number;
  /** Whether resize is reversed (e.g. right-side panel grows leftward) */
  reverse?: boolean;
  /** Callback when resize completes */
  onResize?: (size: number) => void;
}

export function useResize(options: ResizeOptions) {
  const {
    handleSelector,
    targetSelector,
    direction,
    min = 120,
    max = 800,
    reverse = false,
    onResize,
  } = options;

  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const target = document.querySelector(targetSelector) as HTMLElement;
    if (!target) return;

    const delta = direction === 'vertical'
      ? (reverse ? startPos.current - e.clientX : e.clientX - startPos.current)
      : (reverse ? startPos.current - e.clientY : e.clientY - startPos.current);

    const newSize = Math.max(min, Math.min(max, startSize.current + delta));

    if (direction === 'vertical') {
      target.style.width = `${newSize}px`;
    } else {
      target.style.height = `${newSize}px`;
    }
  }, [targetSelector, direction, min, max, reverse]);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (onResize) {
      const target = document.querySelector(targetSelector) as HTMLElement;
      if (target) {
        const size = direction === 'vertical'
          ? target.getBoundingClientRect().width
          : target.getBoundingClientRect().height;
        onResize(size);
      }
    }
  }, [targetSelector, direction, onResize]);

  useEffect(() => {
    const handle = document.querySelector(handleSelector) as HTMLElement;
    if (!handle) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === 'vertical' ? e.clientX : e.clientY;

      const target = document.querySelector(targetSelector) as HTMLElement;
      if (target) {
        const rect = target.getBoundingClientRect();
        startSize.current = direction === 'vertical' ? rect.width : rect.height;
      }

      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleSelector, targetSelector, direction, onMouseMove, onMouseUp]);
}
