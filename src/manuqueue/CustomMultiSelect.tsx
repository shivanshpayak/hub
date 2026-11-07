import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string };

export interface CustomMultiSelectHandle {
  setValue: (v: string[]) => void;
}

type Props = {
  name?: string; // Optional if we just want it controlled
  value?: string[];
  onChange?: (value: string[]) => void;
  options: SelectOption[];
  disabled?: boolean;
  searchPlaceholder?: string;
  ref?: React.Ref<CustomMultiSelectHandle>;
};

const CLOSE_MS = 100;

export function CustomMultiSelect({
  name,
  value: controlledValue = [],
  onChange,
  options,
  disabled,
  searchPlaceholder = "Select...",
  ref,
}: Props) {
  const value = controlledValue;

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [highlightIndex, setHighlightIndex] = useState(-1);

  const filteredOptions = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  useImperativeHandle(ref, () => ({
    setValue: (v: string[]) => {
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

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      // We can click inside the dropdown to select/deselect items, which shouldn't close it immediately,
      // but if we click outside, close it.
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

  function handleToggleSelect(v: string) {
    if (value.includes(v)) {
      onChange?.(value.filter((val) => val !== v));
    } else {
      onChange?.([...value, v]);
    }
    // Don't close dropdown on selection, let user select multiple
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        openDropdown();
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
        handleToggleSelect(filteredOptions[idx].value);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
      triggerRef.current?.focus();
    }
  }

  function handleSearchInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val);
    const nextOptions = val
      ? options.filter((o) => o.label.toLowerCase().includes(val.toLowerCase()))
      : options;
    setHighlightIndex(nextOptions.length > 0 ? 0 : -1);
    if (!open && val) {
      openDropdown();
    }
  }

  function handleSearchInputFocus() {
    setSearch("");
    setHighlightIndex(options.length > 0 ? 0 : -1);
    openDropdown();
  }

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
          filteredOptions.map((option, idx) => {
            const isSelected = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                data-highlight={idx === highlightIndex ? "" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightIndex(idx)}
                onClick={() => handleToggleSelect(option.value)}
                ref={(el) => {
                  if (idx === highlightIndex && el) {
                    el.scrollIntoView({ block: "nearest" });
                  }
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  idx === highlightIndex
                    ? "bg-lambert-maroon/10 dark:bg-lambert-maroon/40"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-lambert-maroon bg-lambert-maroon text-white"
                      : "border-black/30 dark:border-white/30"
                  }`}
                >
                  {isSelected && (
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className={
                    isSelected
                      ? "font-semibold text-black dark:text-white"
                      : "text-black/70 dark:text-white/70"
                  }
                >
                  {option.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="relative">
      {name && value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      <input
        ref={triggerRef}
        type="text"
        disabled={disabled}
        value={open ? search : selectedLabels}
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
