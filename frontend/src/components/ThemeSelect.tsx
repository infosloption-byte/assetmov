import { useEffect, useRef, useState } from "react";
type Option = { value: string; label: string; disabled?: boolean };
type Props = { options: Option[]; value?: string; defaultValue?: string; name?: string; required?: boolean; onChange?: (value: string) => void; label: string; disabled?: boolean; placeholder?: string; className?: string };
export default function ThemeSelect({ options, value, defaultValue, name, required, onChange, label, disabled, placeholder = "Select an option", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const currentValue = value ?? uncontrolledValue;
  const choose = (next: string) => { if (value === undefined) setUncontrolledValue(next); onChange?.(next); };
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === currentValue);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  return <div ref={root} className={"theme-select " + className}>
    {name && <input type="hidden" name={name} value={currentValue} required={required}/>}
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} className="theme-select-trigger" disabled={disabled}
      onClick={() => setOpen(v => !v)}>
      <span>{selected?.label ?? placeholder}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="theme-select-panel" role="listbox" aria-label={label} tabIndex={-1}
      onKeyDown={event => {
        const enabled = options.filter(o => !o.disabled); const position = enabled.findIndex(o => o.value === currentValue);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); const step = event.key === "ArrowDown" ? 1 : -1;
          const next = enabled[(position + step + enabled.length) % enabled.length];
          if (next) choose(next.value);
        }
        if (event.key === "Enter" || event.key === "Escape") setOpen(false);
      }}>
      {options.map(option => <button type="button" role="option" aria-selected={option.value === currentValue} key={option.value}
        className={"theme-select-option " + (option.value === currentValue ? "selected" : "")} disabled={option.disabled}
        onClick={() => { choose(option.value); setOpen(false); }}>{option.label}</button>)}
    </div>}
  </div>;
}
