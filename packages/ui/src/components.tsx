"use client";
import { clsx, type ClassValue } from "clsx";
import { AlertTriangle, Check, Copy, Info, Loader2, OctagonAlert, X } from "lucide-react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export const cn = (...v: ClassValue[]) => clsx(v);

// ── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-[0_8px_24px_-10px_var(--wx-accent)]",
  secondary: "bg-surface-3 text-fg hover:bg-border",
  ghost: "text-fg hover:bg-surface-2",
  outline: "border border-border-strong text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-md",
  md: "h-11 px-4 text-[15px] gap-2 rounded-md",
  lg: "h-13 px-6 text-base gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-[filter,background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ── Surfaces ─────────────────────────────────────────────────────────────────
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...p} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  accent: "bg-accent/15 text-accent-strong",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current animate-pulse-dot" aria-hidden />}
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === "danger" ? OctagonAlert : tone === "warning" ? AlertTriangle : tone === "success" ? Check : Info;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3.5 text-sm", tones[tone], "border-current/20", className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-fg/90">
        {title && <p className="font-semibold text-fg">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-fg/80")}>{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-fg">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// ── Form controls ────────────────────────────────────────────────────────────
const control =
  "w-full rounded-md border border-border-strong bg-surface-2 px-3.5 text-[15px] text-fg placeholder:text-subtle transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(control, "h-11 appearance-none bg-[length:16px] bg-no-repeat pe-9", className)} {...p}>
      {children}
    </select>
  );
});

/** Label + control + hint/error. Links the label to a single child control automatically (accessible name). */
export function Field({ label, hint, error, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string; className?: string }) {
  const autoId = useId();
  const only = Children.count(children) === 1 && isValidElement<{ id?: string }>(children) && typeof children.type !== "symbol" ? children : null;
  const id = htmlFor ?? only?.props.id ?? (only ? autoId : undefined);
  const control = only && !only.props.id && !htmlFor ? cloneElement(only, { id }) : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {control}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={p.id ?? id} className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-fg", className)}>
      <input id={p.id ?? id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--wx-accent)]" {...p} />
      <span>{label}</span>
    </label>
  );
}

// ── Navigation ───────────────────────────────────────────────────────────────
export function Tabs<T extends string>({ value, onChange, items, className, size = "md" }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-lg border border-border bg-surface-2 p-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md font-semibold transition-colors",
            size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
            value === it.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── States ───────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("wx-skeleton rounded-md", className)} aria-hidden />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-accent", className)} aria-label="Loading" />;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon && <div className="grid size-12 place-items-center rounded-full bg-surface-3 text-muted">{icon}</div>}
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry, retryLabel, className }: { title: ReactNode; body?: ReactNode; onRetry?: () => void; retryLabel?: ReactNode; className?: string }) {
  return (
    <EmptyState
      className={className}
      icon={<OctagonAlert className="size-5 text-danger" />}
      title={title}
      body={body}
      action={onRetry && <Button variant="outline" size="sm" onClick={onRetry}>{retryLabel ?? "Retry"}</Button>}
    />
  );
}

// ── Overlays ─────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-[var(--wx-bg)]/70 backdrop:backdrop-blur-sm open:animate-rise",
        size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
    </dialog>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────
type ToastItem = { id: number; tone: "success" | "danger" | "info"; text: ReactNode };
const ToastCtx = createContext<(tone: ToastItem["tone"], text: ReactNode) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastItem["tone"], text: ReactNode) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium shadow-2xl animate-rise",
              t.tone === "success" && "text-success",
              t.tone === "danger" && "text-danger",
            )}
          >
            {t.tone === "success" ? <Check className="size-4" /> : t.tone === "danger" ? <OctagonAlert className="size-4" /> : <Info className="size-4" />}
            <span className="text-fg">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Misc ─────────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 36, verified }: { name: string; size?: number; verified?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 32%))` }} aria-hidden>
      {initials}
      {verified && <span className="absolute -bottom-0.5 -end-0.5 grid size-3.5 place-items-center rounded-full border-2 border-surface bg-accent"><Check className="size-2 text-accent-fg" strokeWidth={4} /></span>}
    </span>
  );
}

export function CopyButton({ value, label, copiedLabel, className }: { value: string; label?: string; copiedLabel?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-accent-strong hover:bg-accent/10", className)}
      aria-label={label ?? "Copy"}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? (copiedLabel ?? "Copied") : (label ?? "Copy")}
    </button>
  );
}

export function Logo({ brand, className, compact }: { brand: string; className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-bold tracking-tight text-fg", className)} dir="ltr">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <defs>
          <linearGradient id="wxg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--wx-accent)" />
            <stop offset="1" stopColor="var(--wx-accent-2)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#wxg)" />
        <path d="M8 10.5 12 22l4-8 4 8 4-11.5" fill="none" stroke="#04130D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="text-[17px]">{brand}</span>}
    </span>
  );
}

export function KeyValue({ items, className }: { items: { k: ReactNode; v: ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{it.k}</dt>
          <dd className={cn("text-end text-fg", it.strong && "font-semibold")}>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
