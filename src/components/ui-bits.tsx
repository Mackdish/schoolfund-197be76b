import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  right,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-[18px] rounded-[10px] border border-line bg-surface px-[22px] py-5 ${className}`}
    >
      {title && (
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-[14.5px]">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHead({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-[22px] flex items-baseline justify-between">
      <div>
        <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brass">
          {eyebrow}
        </span>
        <h2 className="text-[23px]">{title}</h2>
        {sub && <div className="mt-1 text-[12.5px] text-ink-soft">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

type PillKind = "arrears" | "credit" | "ok" | "pending" | "partial";
const pillStyles: Record<PillKind, string> = {
  arrears: "bg-garnet-light text-garnet",
  credit: "bg-teal-light text-teal",
  ok: "bg-forest-light text-forest",
  pending: "bg-amber-light text-amber",
  partial: "bg-[#EFE6F1] text-[#6B3F73]",
};

export function Pill({
  kind,
  children,
}: {
  kind: PillKind;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${pillStyles[kind]}`}
    >
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  trend,
  trendKind = "up",
}: {
  label: string;
  value: string;
  sub: string;
  trend?: string;
  trendKind?: "up" | "warn" | "flat";
}) {
  const trendCls =
    trendKind === "up"
      ? "bg-forest-light text-forest"
      : trendKind === "warn"
        ? "bg-amber-light text-amber"
        : "bg-teal-light text-teal";
  return (
    <div className="rounded-[10px] border border-line bg-surface px-[18px] py-4 transition-colors hover:border-line-strong">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </div>
      <div className="my-2 font-mono text-[23px] font-medium">{value}</div>
      <div className="text-[11.5px] text-ink-soft">{sub}</div>
      {trend && (
        <div
          className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold ${trendCls}`}
        >
          {trend}
        </div>
      )}
    </div>
  );
}