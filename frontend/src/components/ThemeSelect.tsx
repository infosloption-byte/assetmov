import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

type Option = { value: string; label: string; disabled?: boolean };
type Props = {
  options: Option[];
  value?: string;
  defaultValue?: string;
  name?: string;
  required?: boolean;
  onChange?: (value: string) => void;
  label: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

/** Reusable AssetMov selector with native form submission and keyboard navigation. */
export default function ThemeSelect({
  options, value, defaultValue, name, required, onChange, label, disabled,
  placeholder = "Select an option", className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const currentValue = value ?? uncontrolledValue;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selected = options.find(option => option.value === currentValue);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && root.current?.contains(document.activeElement)) {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function choose(next: string) {
    if (value === undefined) setUncontrolledValue(next);
    onChange?.(next);
  }

  function onKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); setOpen(false); }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const enabled = options.filter(option => !option.disabled);
    if (!enabled.length) return;

    let nextIndex = -1;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabled.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const currentIndex = enabled.findIndex(option => option.value === currentValue);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      nextIndex = (currentIndex + direction + enabled.length) % enabled.length;
    }
    if (nextIndex >= 0) {
      event.preventDefault();
      const next = enabled[nextIndex];
      if (next) choose(next.value);
      setOpen(true);
    }
  }

  return <div ref={root} className={"theme-select " + className}>
    {name && <input type="hidden" name={name} value={currentValue} required={required}/>}
    <button ref={trigger} type="button" className="theme-select-trigger" disabled={disabled}
      aria-label={label} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-required={required || undefined}
      onKeyDown={onKeyboard} onClick={() => setOpen(previous => !previous)}>
      <span className="theme-select-value">{selected?.label ?? placeholder}</span>
      <span className="theme-select-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div id={listboxId} className="theme-select-panel" role="listbox"
      aria-label={label}>
      {options.map(option =>
        <button key={option.value} type="button" role="option"
          aria-selected={option.value === currentValue} disabled={option.disabled}
          className={"theme-select-option " + (option.value === currentValue ? "selected" : "")}
          onClick={() => { choose(option.value); setOpen(false); trigger.current?.focus(); }}>
          {option.label}
        </button>)}
    </div>}
  </div>;
}
