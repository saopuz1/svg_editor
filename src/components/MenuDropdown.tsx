import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MenuItem } from './MenuItem';

export function MenuDropdown({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <MenuItem
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((v) => !v);
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {label}
      </MenuItem>

      {open ? (
        <div className="viewPopover" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
