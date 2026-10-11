/** 基础 UI 组件：面板、表单行、开关、标签、键值行、折叠区 */

import { useState, type ChangeEvent, type ReactNode } from "react";
import { Icon } from "./Icons";

export function Panel({
  title,
  actions,
  chip,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  chip?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title ? (
        <header className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {chip}
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      {label ? <span className="label">{label}</span> : null}
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Row({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`row ${className}`}>{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.checked)
        }
      />
      <span>{children}</span>
    </label>
  );
}

export function Chip({
  tone = "default",
  children,
}: {
  tone?: "default" | "ok" | "warn" | "muted";
  children: ReactNode;
}) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function KV({
  label,
  value,
  mono,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className={`v ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

export function Accordion({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion ${open ? "open" : ""}`}>
      <button
        type="button"
        className="accordion-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="accordion-title">{title}</span>
        {summary ? <span className="accordion-summary">{summary}</span> : null}
        <Icon name="chevron" size={18} className="accordion-icon" />
      </button>
      {open ? <div className="accordion-body">{children}</div> : null}
    </div>
  );
}
