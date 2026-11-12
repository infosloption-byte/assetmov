import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../features/auth/types";

interface Props {
  user: AuthUser;
  roleLabel: string;
  initials: string;
  onVerifyEmail: () => void;
  onPassword: () => void;
  onSessions: () => void;
  onSignOut: () => void;
}

export default function AccountMenu({user, roleLabel, initials, onVerifyEmail, onPassword, onSessions, onSignOut}: Props) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        if (wrapper.current?.contains(document.activeElement)) trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function action(callback: () => void) {
    setOpen(false);
    callback();
  }

  return <div className="account-menu" ref={wrapper}>
    <button ref={trigger} type="button" className="account-menu-trigger" aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? "assetmov-account-menu" : undefined}
      aria-label={"Account menu for " + user.fullName}
      onClick={() => setOpen(value => !value)}>
      <span className="signed-in-copy"><strong>{user.fullName}</strong><small>{roleLabel}</small></span>
      <span className="avatar" aria-hidden="true">{initials}</span>
      <span className="account-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div ref={panel} id="assetmov-account-menu" className="account-menu-panel" role="menu"
      aria-label="Account actions" onKeyDown={event => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const position = items.findIndex(item => item === document.activeElement);
        if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
            (position + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
        if (event.key === "Tab") setOpen(false);
      }}>
      <div className="account-menu-identity" role="presentation">
        <strong>{user.fullName}</strong>
        <small>{user.email}</small>
        <small>{roleLabel}</small>
        {!user.emailVerified && <span className="account-unverified">Email not verified</span>}
      </div>
      {!user.emailVerified && <button type="button" role="menuitem" className="account-menu-item"
        onClick={() => action(onVerifyEmail)}>Verify email <span aria-hidden="true">↗</span></button>}
      <button type="button" role="menuitem" className="account-menu-item" onClick={() => action(onPassword)}>
        Change password <span aria-hidden="true">›</span>
      </button>
      <button type="button" role="menuitem" className="account-menu-item" onClick={() => action(onSessions)}>
        Manage sessions <span aria-hidden="true">›</span>
      </button>
      <div className="account-menu-divider" role="separator"/>
      <button type="button" role="menuitem" className="account-menu-item danger"
        onClick={() => action(onSignOut)}>Sign out <span aria-hidden="true">↗</span></button>
    </div>}
  </div>;
}
