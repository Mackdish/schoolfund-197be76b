import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { kes } from "@/lib/money";
import { toast } from "sonner";

export const Route = createFileRoute("/cashbook")({
  head: () => ({ meta: [{ title: "Cashbook — EduTech" }] }),
  component: () => (
    <AppShell>
      <CashbookPage />
    </AppShell>
  ),
});

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(start), to: fmt(end) };
}

function CashbookPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();

  const now = new Date();
  const [ym, setYm] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [fundId, setFundId] = useState<string>("");

  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funds")
        .select("id, code, name, opening_balance")
        .eq("school_id", schoolId)
        .order("code");
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (!fundId && fundsQ.data?.length) setFundId(fundsQ.data[0].id);
  }, [fundsQ.data, fundId]);

  const { from, to } = monthBounds(ym);

  // opening balance: sum receipts - payments before `from` + fund opening
  const openingQ = useQuery({
    queryKey: ["cashbook-opening", schoolId, fundId, from],
    enabled: !!fundId,
    queryFn: async () => {
      const { data: f } = await supabase
        .from("funds")
        .select("opening_balance")
        .eq("id", fundId)
        .maybeSingle();
      const { data } = await supabase
        .from("cashbook_entries")
        .select("receipts, payments")
        .eq("school_id", schoolId)
        .eq("fund_id", fundId)
        .lt("entry_date", from);
      const moves = (data ?? []).reduce(
        (s: number, r: any) => s + Number(r.receipts) - Number(r.payments),
        0,
      );
      return Number(f?.opening_balance ?? 0) + moves;
    },
  });

  const monthQ = useQuery({
    queryKey: ["cashbook-month", schoolId, fundId, from, to],
    enabled: !!fundId,
    queryFn: async () => {
      const { data } = await supabase
        .from("cashbook_entries")
        .select(
          "id, entry_date, description, reference, receipts, payments, reconciled, reconciled_on, journal_entry_id",
        )
        .eq("school_id", schoolId)
        .eq("fund_id", fundId)
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  // rolling running balance for the displayed month, starting at opening
  const rows = useMemo(() => {
    const opening = openingQ.data ?? 0;
    let bal = opening;
    return (monthQ.data ?? []).map((r) => {
      bal = bal + Number(r.receipts) - Number(r.payments);
      return { ...r, running: bal };
    });
  }, [monthQ.data, openingQ.data]);

  const totals = useMemo(() => {
    const receipts = (monthQ.data ?? []).reduce(
      (s, r) => s + Number(r.receipts),
      0,
    );
    const payments = (monthQ.data ?? []).reduce(
      (s, r) => s + Number(r.payments),
      0,
    );
    const opening = openingQ.data ?? 0;
    return { receipts, payments, opening, closing: opening + receipts - payments };
  }, [monthQ.data, openingQ.data]);

  const toggleReconcile = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      const { error } = await supabase
        .from("cashbook_entries")
        .update({
          reconciled: on,
          reconciled_on: on ? new Date().toISOString().slice(0, 10) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashbook-month"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const reconciledTotal = (monthQ.data ?? [])
    .filter((r) => r.reconciled)
    .reduce((s, r) => s + Number(r.receipts) - Number(r.payments), 0);

  const fund = (fundsQ.data ?? []).find((f) => f.id === fundId);

  return (
    <>
      <PageHead
        eyebrow="Statutory record"
        title="Cashbook"
        sub="Monthly cashbook per fund — auto-fed from confirmed receipts, with bank-reconciliation ticks."
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <F label="Fund">
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
            >
              {(fundsQ.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </F>
          <F label="Month">
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
            />
          </F>
          <div className="ml-auto flex gap-2 text-[12px]">
            <Stat label="Opening b/f" value={kes(totals.opening)} />
            <Stat label="Receipts" value={kes(totals.receipts)} kind="ok" />
            <Stat label="Payments" value={kes(totals.payments)} kind="warn" />
            <Stat label="Closing c/f" value={kes(totals.closing)} strong />
          </div>
        </div>
      </Panel>

      <Panel
        title={`${fund?.name ?? ""} · ${ym}`}
        right={
          <span className="text-[11.5px] text-ink-soft">
            Reconciled this month:{" "}
            <span className="font-mono">{kes(reconciledTotal)}</span>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2 px-2 text-left">Date</th>
                <th className="px-2 text-left">Particulars</th>
                <th className="px-2 text-left">Ref</th>
                <th className="px-2 text-right font-mono">RV (Dr)</th>
                <th className="px-2 text-right font-mono">PV (Cr)</th>
                <th className="px-2 text-right font-mono">Balance</th>
                <th className="px-2 text-center">Recon</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line bg-paper">
                <td className="py-2 px-2 text-[11.5px] text-ink-soft" colSpan={5}>
                  Balance brought forward
                </td>
                <td className="px-2 text-right font-mono">
                  {kes(totals.opening)}
                </td>
                <td />
              </tr>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="py-2 px-2">{r.entry_date}</td>
                  <td className="px-2">{r.description}</td>
                  <td className="px-2 font-mono text-[11.5px] text-ink-soft">
                    {r.reference ?? "—"}
                  </td>
                  <td className="px-2 text-right font-mono">
                    {Number(r.receipts) ? kes(Number(r.receipts)) : "—"}
                  </td>
                  <td className="px-2 text-right font-mono">
                    {Number(r.payments) ? kes(Number(r.payments)) : "—"}
                  </td>
                  <td className="px-2 text-right font-mono">{kes(r.running)}</td>
                  <td className="px-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!r.reconciled}
                      onChange={(e) =>
                        toggleReconcile.mutate({
                          id: r.id,
                          on: e.target.checked,
                        })
                      }
                      className="h-3.5 w-3.5 accent-forest"
                    />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-soft">
                    No movements in this month.
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-line-strong font-medium">
                <td className="py-2 px-2" colSpan={3}>
                  Totals
                </td>
                <td className="px-2 text-right font-mono">
                  {kes(totals.receipts)}
                </td>
                <td className="px-2 text-right font-mono">
                  {kes(totals.payments)}
                </td>
                <td className="px-2 text-right font-mono">
                  {kes(totals.closing)}
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={7} className="px-2 py-2 text-[11.5px] text-ink-soft">
                  Balance carried forward to next month:{" "}
                  <span className="font-mono">{kes(totals.closing)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-12 border-t border-line pt-5 text-[11.5px] text-ink-soft">
          <div>
            <div className="h-12 border-b border-line-strong" />
            <div className="mt-1">Bursar</div>
          </div>
          <div>
            <div className="h-12 border-b border-line-strong" />
            <div className="mt-1">BOM Chairperson</div>
          </div>
        </div>
      </Panel>
    </>
  );
}

function Stat({
  label,
  value,
  kind,
  strong,
}: {
  label: string;
  value: string;
  kind?: "ok" | "warn";
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-soft">
        {label}
      </div>
      <div
        className={`font-mono ${strong ? "text-[14px] font-medium" : "text-[12.5px]"} ${kind === "ok" ? "text-forest" : kind === "warn" ? "text-amber" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
