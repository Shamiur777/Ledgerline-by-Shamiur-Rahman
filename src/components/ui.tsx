import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)} {...p} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const btn =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const variants = {
  primary: "bg-brand text-brand-ink hover:opacity-90",
  secondary: "border border-line bg-surface hover:bg-brand-soft",
  danger: "border border-expense/40 text-expense hover:bg-expense/10",
  ghost: "hover:bg-brand-soft",
};
type Variant = keyof typeof variants;

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btn, variants[variant], className)} {...p} />;
}
export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btn, variants[variant], className)} {...p} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const control =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cx(control, className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cx(control, className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => <textarea className={cx(control, className)} {...p} />;

const tones = {
  neutral: "bg-line/60 text-muted",
  good: "bg-income/10 text-income",
  bad: "bg-expense/10 text-expense",
  warn: "bg-warn/10 text-warn",
  brand: "bg-brand-soft text-brand",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "income" | "expense"; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("tabular mt-1 text-2xl font-semibold", tone === "income" && "text-income", tone === "expense" && "text-expense")}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </Card>
  );
}
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cx("border-b border-line px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cx("border-b border-line/70 px-4 py-2.5 align-middle last:border-b-0", className)} {...p} />
);

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="p-10 text-center">
      <div className="font-medium">{title}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </Card>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-expense/30 bg-expense/10 px-3 py-2 text-sm text-expense">{message}</div>;
}
