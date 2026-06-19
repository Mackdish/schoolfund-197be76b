import { useEffect, useState } from "react";

type FundKind = "tuition" | "ops" | "fund";

const tabStyles: Record<FundKind, { bg: string; fg: string; letter: string }> = {
  tuition: { bg: "bg-teal-light", fg: "text-teal", letter: "T" },
  ops: { bg: "bg-forest-light", fg: "text-forest", letter: "O" },
  fund: { bg: "bg-brass-light", fg: "text-brass", letter: "S" },
};

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

const fmt = (n: number) => n.toLocaleString("en-KE");

export function FundStub({
  kind,
  name,
  ref,
  balance,
  receiptsMtd,
  paymentsMtd,
}: {
  kind: FundKind;
  name: string;
  ref: string;
  balance: number;
  receiptsMtd: number;
  paymentsMtd: number;
}) {
  const v = useCountUp(balance);
  const t = tabStyles[kind];
  return (
    <div className="flex overflow-hidden rounded-[10px] border border-line bg-surface transition-all hover:-translate-y-px hover:border-line-strong">
      <div
        className={`flex w-[46px] flex-none items-center justify-center border-r border-dashed border-line-strong ${t.bg}`}
      >
        <span className={`font-serif text-[17px] font-semibold ${t.fg}`}>{t.letter}</span>
      </div>
      <div className="flex-1 px-[18px] py-4">
        <div className="flex justify-between text-[11px] uppercase tracking-[0.06em] text-ink-soft">
          <span>{name}</span>
          <span className="font-mono text-[10px] text-[#9C9484]">{ref}</span>
        </div>
        <div className="my-2 font-serif text-[25px]">KES {fmt(v)}</div>
        <div className="sf-stub-perf -mx-[18px]" />
        <div className="pt-2.5 text-[12px] text-ink-soft">
          <div className="flex justify-between py-0.5">
            <span>Receipts MTD</span>
            <span className="font-mono text-ink">{fmt(receiptsMtd)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Payments MTD</span>
            <span className="font-mono text-ink">({fmt(paymentsMtd)})</span>
          </div>
        </div>
      </div>
    </div>
  );
}