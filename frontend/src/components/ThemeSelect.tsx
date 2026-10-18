import { useEffect, useRef, useState } from "react";
type Option = { value: string; label: string; disabled?: boolean };
type Props = { options: Option[]; value: string; onChange: (value: string) => void; label: string; disabled?: boolean; placeholder?: string; className?: string };
export default function ThemeSelect({ options, value, onChange, label, disabled, placeholder = "Select an option", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  return <div ref={root} className={"theme-select " + className}>
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} className="theme-select-trigger" disabled={disabled}
      onClick={() => setOpen(v => !v)}>
      <span>{selected?.label ?? placeholder}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="theme-select-panel" role="listbox" aria-label={label} tabIndex={-1}
      onKeyDown={event => {
        const enabled = options.filter(o => !o.disabled); const position = enabled.findIndex(o => o.value === value);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); const step = event.key === "ArrowDown" ? 1 : -1;
          const next = enabled[(position + step + enabled.length) % enabled.length];
          if (next) onChange(next.value);
        }
        if (event.key === "Enter" || event.key === "Escape") setOpen(false);
      }}>
      {options.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value}
        className={"theme-select-option " + (option.value === value ? "selected" : "")} disabled={option.disabled}
        onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}
    </div>}
  </div>;
}
