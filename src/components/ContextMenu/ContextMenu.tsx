/**
 * ContextMenu — right-click context menu for file tree items.
 */

import { useEffect, useRef, type ReactNode } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}

export function ContextMenu({ x, y, onClose, children }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        minWidth: 160,
        padding: '4px 0',
      }}
    >
      {children}
    </div>
  );
}

interface ContextMenuItemProps {
  icon?: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

export function ContextMenuItem({ icon, label, danger, onClick }: ContextMenuItemProps) {
  return (
    <div
      className="context-menu-item"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: danger ? '#f44747' : 'var(--fg-primary)',
      }}
    >
      {icon && <span className={`codicon ${icon}`} style={{ fontSize: 14 }} />}
      {label}
    </div>
  );
}

export function ContextMenuSeparator() {
  return <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />;
}
