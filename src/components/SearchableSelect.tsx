"use client";
import { useState, useRef, useEffect } from "react";

export interface SearchOption {
  id: string;
  name: string;
  sub?: string | null;
  extra?: string | null;
}

interface Props {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Combobox مع بحث فوري: تكتب حروف → تظهر النتائج المطابقة فوراً.
 * يستخدم في حقول المورد/العميل/المنتج/الخزينة إلخ.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "🔍 ابحث...",
  emptyLabel = "— بدون —",
  required = false,
  autoFocus = false,
  disabled = false,
  className = "",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // الاسم المختار معروض في الـ input
  useEffect(() => {
    if (value && !open) {
      const opt = options.find(o => o.id === value);
      if (opt) setQuery(opt.name);
    } else if (!value) {
      setQuery("");
    }
  }, [value, options, open]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // أعد كتابة الاسم عند الإغلاق
        if (value) {
          const opt = options.find(o => o.id === value);
          if (opt) setQuery(opt.name);
        } else {
          setQuery("");
        }
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value, options]);

function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "")
    .trim();
}

  const filtered = query.trim() === "" && !open
    ? options
    : options.filter(o => {
        const q = normalizeArabic(query);
        if (!q) return true;
        return (
          normalizeArabic(o.name).includes(q) ||
          normalizeArabic(o.sub || "").includes(q) ||
          normalizeArabic(o.extra || "").includes(q)
        );
      });

  function choose(opt: SearchOption) {
    onChange(opt.id);
    setQuery(opt.name);
    setOpen(false);
    setHighlight(0);
  }

  function clearValue() {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          onFocus={() => { setOpen(true); setHighlight(0); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); if (e.target.value === "") onChange(""); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="input-field w-full pr-9"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={clearValue}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-lg leading-none"
            tabIndex={-1}
            title="مسح الاختيار"
          >✕</button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {!required && (
            <button
              type="button"
              onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
              className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 text-gray-500"
            >{emptyLabel}</button>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">لا توجد نتائج</div>
          )}
          {filtered.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt)}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-right px-3 py-2 text-sm border-b border-gray-50 last:border-b-0 ${
                i === highlight ? "bg-elnesr-50 text-elnesr-700" : "hover:bg-gray-50"
              } ${opt.id === value ? "font-bold text-elnesr-600" : ""}`}
            >
              <div className="font-semibold">{opt.name}</div>
              {(opt.sub || opt.extra) && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {opt.sub}{opt.sub && opt.extra ? " • " : ""}{opt.extra}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
