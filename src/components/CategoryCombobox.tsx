"use client";
import { useState, useEffect, useRef } from "react";

interface CategoryComboboxProps {
  value: string;
  onChange: (val: string) => void;
  categories?: string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export default function CategoryCombobox({
  value,
  onChange,
  categories: initialCategories,
  placeholder = "اختر أو اكتب فئة جديدة...",
  className = "",
  autoFocus = false,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [categoryList, setCategoryList] = useState<string[]>(initialCategories || []);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal query with value prop
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Fetch categories if not provided
  useEffect(() => {
    if (!initialCategories || initialCategories.length === 0) {
      fetch("/api/inventory/summary")
        .then((res) => res.json())
        .then((json) => {
          if (json?.data?.categories) {
            setCategoryList(json.data.categories);
          }
        })
        .catch(() => {});
    } else {
      setCategoryList(
        Array.from(new Set(initialCategories.map((c) => c.trim()).filter(Boolean)))
      );
    }
  }, [initialCategories]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmedQuery = query.trim();

  // Filter categories matching query
  const filtered = categoryList.filter((c) =>
    c.toLowerCase().includes(trimmedQuery.toLowerCase())
  );

  const exactMatch = categoryList.some(
    (c) => c.toLowerCase() === trimmedQuery.toLowerCase()
  );

  const showAddNew = trimmedQuery.length > 0 && !exactMatch;

  function selectOption(cat: string) {
    const clean = cat.trim();
    setQuery(clean);
    onChange(clean);
    setOpen(false);
    if (!categoryList.includes(clean)) {
      setCategoryList((prev) => [...prev, clean].sort((a, b) => a.localeCompare(b, 'ar')));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
      }
      return;
    }

    const totalOptions = filtered.length + (showAddNew ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1 < totalOptions ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : totalOptions - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        e.preventDefault();
        selectOption(filtered[highlightedIndex]);
      } else if (showAddNew && (highlightedIndex === filtered.length || highlightedIndex === -1)) {
        if (trimmedQuery) {
          e.preventDefault();
          selectOption(trimmedQuery);
        }
      } else if (filtered.length > 0 && highlightedIndex === -1) {
        e.preventDefault();
        selectOption(filtered[0]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value.trim());
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`input-field pr-3 pl-8 text-sm ${className}`}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setOpen(!open);
            inputRef.current?.focus();
          }}
          className="absolute left-2.5 text-gray-400 hover:text-gray-600 focus:outline-none text-xs"
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && (
        <div className="absolute z-50 right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto py-1.5 animate-in fade-in zoom-in-95 duration-100">
          {/* Header info */}
          <div className="px-3 py-1 text-[11px] font-bold text-gray-400 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
            <span>اختر فئة موجودة أو أضف جديدة</span>
            <span>{categoryList.length} فئة</span>
          </div>

          {/* Existing filtered items */}
          {filtered.map((cat, idx) => {
            const isSelected = cat.toLowerCase() === value?.trim().toLowerCase();
            const isHighlighted = idx === highlightedIndex;
            return (
              <div
                key={cat}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(cat);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                  isHighlighted ? "bg-elnesr-50 text-elnesr-900 font-bold" : "text-gray-700 hover:bg-gray-50"
                } ${isSelected ? "bg-elnesr-100/70 text-elnesr-800 font-extrabold" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-gray-400 text-xs">📂</span>
                  <span>{cat}</span>
                </span>
                {isSelected && <span className="text-elnesr-600 text-xs font-bold">✓ مُحدد</span>}
              </div>
            );
          })}

          {/* Creatable Option if query is new */}
          {showAddNew && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(trimmedQuery);
              }}
              onMouseEnter={() => setHighlightedIndex(filtered.length)}
              className={`px-3 py-2.5 text-sm cursor-pointer border-t border-dashed border-emerald-300 bg-emerald-50/70 text-emerald-900 font-bold flex items-center justify-between transition-colors ${
                highlightedIndex === filtered.length ? "bg-emerald-100 text-emerald-950" : "hover:bg-emerald-100/80"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">➕</span>
                <span>إضافة فئة جديدة:</span>
                <span className="font-extrabold underline decoration-emerald-500 underline-offset-2">
                  "{trimmedQuery}"
                </span>
              </div>
              <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">
                جديد
              </span>
            </div>
          )}

          {filtered.length === 0 && !showAddNew && (
            <div className="px-3 py-4 text-center text-xs text-gray-400">
              لا توجد فئات مسجلة
            </div>
          )}
        </div>
      )}
    </div>
  );
}
