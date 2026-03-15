'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  id: string;
  label: string;
  subLabel?: string;
}

interface InlineCellDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export default function InlineCellDropdown({
  options,
  value,
  onChange,
  placeholder = '선택',
  autoFocus = false,
  style,
  disabled = false,
}: InlineCellDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, flipUp: false });

  const selectedOption = options.find(o => o.id === value);

  const filtered = search
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < 200 && rect.top > 200;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 1,
      left: rect.left,
      width: Math.max(rect.width, 160),
      flipUp,
    });
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      const handle = () => updatePosition();
      window.addEventListener('scroll', handle, true);
      window.addEventListener('resize', handle);
      return () => {
        window.removeEventListener('scroll', handle, true);
        window.removeEventListener('resize', handle);
      };
    }
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setHighlightIdx(0); return; }
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx].id);
      } else {
        setOpen(true);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    } else if (e.key === 'Tab') {
      setOpen(false);
      setSearch('');
    }
  };

  const handleFocus = () => {
    if (!disabled) {
      setOpen(true);
      setSearch('');
      setHighlightIdx(0);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !dropdownRef.current) return;
    const item = dropdownRef.current.children[highlightIdx] as HTMLElement;
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={open ? search : (selectedOption?.label || '')}
        onChange={e => { setSearch(e.target.value); setHighlightIdx(0); if (!open) setOpen(true); }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
        style={{
          width: '100%',
          fontSize: 11,
          padding: '3px 6px',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          outline: 'none',
          backgroundColor: disabled ? '#f3f4f6' : '#fff',
          ...style,
        }}
      />
      {open && filtered.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? (window.innerHeight - pos.top + 1) : undefined,
            left: pos.left,
            width: pos.width,
            maxHeight: 200,
            overflowY: 'auto',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            zIndex: 9999,
            fontSize: 11,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt.id}
              onMouseDown={e => { e.preventDefault(); handleSelect(opt.id); }}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{
                padding: '5px 8px',
                cursor: 'pointer',
                backgroundColor: i === highlightIdx ? '#eff6ff' : '#fff',
                borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : undefined,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: opt.id === value ? 600 : 400 }}>{opt.label}</span>
              {opt.subLabel && (
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>{opt.subLabel}</span>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
      {open && filtered.length === 0 && search && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? (window.innerHeight - pos.top + 1) : undefined,
            left: pos.left,
            width: pos.width,
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            zIndex: 9999,
            padding: '8px 10px',
            fontSize: 11,
            color: '#9ca3af',
            textAlign: 'center',
          }}
        >
          검색 결과 없음
        </div>,
        document.body
      )}
    </>
  );
}
