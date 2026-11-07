import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

export interface CustomSelectHandle {
  setValue: (v: string) => void;
}

type Props = {
  name: string;
  /** Uncontrolled default */
  defaultValue?: string;
  /** Controlled value */
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  /** Enable type-to-filter — the trigger becomes a text input */
  searchable?: boolean;
  /** Placeholder shown when no value is selected */
  searchPlaceholder?: string;
  /** Auto-open dropdown when user starts typing (only with searchable) */
  autoOpenOnType?: boolean;
  /** React 19: ref is a regular prop */
  ref?: React.Ref<CustomSelectHandle>;
};

const CLOSE_MS = 100;

export function CustomSelect({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  options,
  disabled,
  searchable = false,
  searchPlaceholder = "Select…",
  autoOpenOnType = false,
  ref,
}: Props) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [highlightIndex, setHighlightIndex] = useState(-1);
  const selected = options.find((o) => o.value === value);

  const filteredOptions =
    searchable && search
      ? options.filter((o) =>
          o.label.toLowerCase().includes(search.toLowerCase()),
        )
      : options;

  useImperativeHandle(ref, () => ({
    setValue: (v: string) => {
      if (!isControlled) setInternalValue(v);
      onChange?.(v);
    },
  }));

  const closeDropdown = useCallback(() => {
    if (!open) return;
    setClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setVisible(false);
      setClosing(false);
      setSearch("");
    }, CLOSE_MS);
  }, [open]);

  function positionDropdown() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(options.length * 36 + 8, 300);
    const openAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    setDropdownStyle({
      position: "fixed",
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      maxHeight: openAbove ? rect.top - 8 : spaceBelow - 8,
      overflowX: "hidden",
    });
  }

  function openDropdown() {
    if (disabled) return;
    clearTimeout(closeTimer.current);
    setClosing(false);
    positionDropdown();
    setHighlightIndex(filteredOptions.length > 0 ? 0 : -1);
    setOpen(true);
    setVisible(true);
  }

  function handleToggle() {
    if (open) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideDropdown) {
        closeDropdown();
      }
    }
    function onScroll(e: Event) {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target) || target === dropdownRef.current?.firstChild) {
        return; // Don't close if scrolling the dropdown itself
      }
      closeDropdown();
    }
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, closeDropdown]);

  useEffect(() => {
    return () => clearTimeout(closeTimer.current);
  }, []);

  function handleSelect(v: string) {
    if (!isControlled) setInternalValue(v);
    onChange?.(v);
    closeDropdown();
    // Return focus to trigger
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        openDropdown();
        return;
      }
      // For non-searchable: auto-open on typing a printable character
      if (autoOpenOnType && searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Let the input handle it naturally — it will trigger onChange → openDropdown
        return;
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = highlightIndex >= 0 ? highlightIndex : 0;
      if (filteredOptions[idx]) {
        handleSelect(filteredOptions[idx].value);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
      triggerRef.current?.focus();
    }
  }

  // ── Searchable input change handler ─────────────────────────────────
  function handleSearchInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const nextOptions =
      searchable && val
        ? options.filter((o) =>
            o.label.toLowerCase().includes(val.toLowerCase()),
          )
        : options;
    setSearch(val);
    setHighlightIndex(nextOptions.length > 0 ? 0 : -1);
    if (!open && val) {
      openDropdown();
    }
  }

  function handleSearchInputFocus() {
    // Clear search text on focus so user can start fresh
    setSearch("");
    setHighlightIndex(options.length > 0 ? 0 : -1);
    openDropdown();
  }

  // ── Dropdown ────────────────────────────────────────────────────────
  const dropdown = visible ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className={`overflow-hidden rounded-md border border-zinc-300/80 bg-white/95 shadow-lg backdrop-blur dark:border-white/20 dark:bg-zinc-900/95 ${
        closing ? "animate-dropdown-out" : "animate-dropdown-in"
      }`}
    >
      <div className="custom-scrollbar" style={{ overflowY: "auto", overflowX: "hidden", maxHeight: "inherit" }}>
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-2 text-sm text-black/40 dark:text-white/40">
            No matches
          </div>
        ) : (
          filteredOptions.map((option, idx) => (
            <button
              key={option.value}
              type="button"
              data-highlight={idx === highlightIndex ? "" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightIndex(idx)}
              onClick={() => handleSelect(option.value)}
              ref={(el) => {
                if (idx === highlightIndex && el) {
                  el.scrollIntoView({ block: "nearest" });
                }
              }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                idx === highlightIndex
                  ? "bg-lambert-maroon/10 dark:bg-lambert-maroon/40"
                  : "hover:bg-black/5 dark:hover:bg-white/5"
              } ${
                option.value === value
                  ? "font-semibold text-black dark:text-white"
                  : "text-black/70 dark:text-white/70"
              }`}
            >
              {option.label}
            </button>
          ))
        )}
      </div>
    </div>
  ) : null;

  // ── Searchable: render as text input ────────────────────────────────
  if (searchable) {
    return (
      <div className="relative">
        <input type="hidden" name={name} value={value} />
        <input
          ref={triggerRef as React.RefObject<HTMLInputElement>}
          type="text"
          disabled={disabled}
          value={open ? search : (selected?.label ?? "")}
          onChange={handleSearchInputChange}
          onFocus={handleSearchInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300/80 bg-white px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/55 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15"
        />
        {typeof document !== "undefined" && dropdown
          ? createPortal(dropdown, document.body)
          : null}
      </div>
    );
  }

  // ── Non-searchable: render as button ────────────────────────────────
  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300/80 bg-white px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15"
      >
        <span className={selected ? "" : "text-black/40 dark:text-white/40"}>
          {selected?.label ?? searchPlaceholder}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-black/40 transition-transform duration-150 dark:text-white/40 ${
            open && !closing ? "rotate-180" : ""
          }`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}
