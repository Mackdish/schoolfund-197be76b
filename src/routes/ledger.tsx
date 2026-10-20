import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { kes } from "@/lib/money";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BookOpen, Scale } from "lucide-react";

export const Route = createFileRoute("/ledger")({
  head: () => ({ meta: [
    { title: "General ledger — EduTech" },
    { name: "description", content: "Review school journal entries and account balances in the EduTech general ledger." },
    { property: "og:title", content: "General ledger — EduTech" },
    { property: "og:description", content: "Review school journal entries and account balances in the EduTech general ledger." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  component: () => (
    <AppShell>
      <LedgerPage />
    </AppShell>
  ),
});

function firstOfYear() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

type Tab = "entries" | "trial";

function LedgerPage() {
  const { school } = useAuth();
  const schoolId = school!.id;

  const [tab, setTab] = useState<Tab>("entries");
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(today());
  const [fundId, setFundId] = useState<string>("");
  const [openEntry, setOpenEntry] = useState<string | null>(null);

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

  const entriesQ = useQuery({
    queryKey: ["journal-entries", schoolId, from, to, fundId],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select(
          "id, entry_no, entry_date, memo, status, source_table, journal_lines(debit, credit, fund_id, account_id, memo, line_no, accounts(code, name, type))",
        )
        .eq("school_id", schoolId)
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("entry_date", { ascending: false })
        .order("entry_no", { ascending: false })
        .limit(300);
      let rows = (data ?? []) as any[];
      if (fundId) {
        rows = rows.filter((e) =>
          (e.journal_lines ?? []).some((l: any) => l.fund_id === fundId),
        );
      }
      return rows;
    },
  });

  const trialQ = useQuery({
    queryKey: ["trial-balance", schoolId, from, to, fundId],
    queryFn: async () => {
      let q = supabase
        .from("journal_lines")
        .select(
          "debit, credit, fund_id, accounts!inner(id, code, name, type, school_id), journal_entries!inner(school_id, entry_date, status)",
        )
        .eq("journal_entries.school_id", schoolId)
        .eq("journal_entries.status", "posted")
        .lte("journal_entries.entry_date", to)
        .gte("journal_entries.entry_date", from);
      if (fundId) q = q.eq("fund_id", fundId);
      const { data } = await q.limit(5000);
      const m = new Map<
        string,
        { code: string; name: string; type: string; debit: number; credit: number }
      >();
      for (const l of (data ?? []) as any[]) {
        const a = l.accounts;
        const key = a.id;
        const cur = m.get(key) ?? {
          code: a.code,
          name: a.name,
          type: a.type,
          debit: 0,
          credit: 0,
        };
        cur.debit += Number(l.debit);
        cur.credit += Number(l.credit);
        m.set(key, cur);
      }
      return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
    },
  });

  const totals = useMemo(() => {
    const rows = trialQ.data ?? [];
    return {
      debit: rows.reduce((s, r) => s + r.debit, 0),
      credit: rows.reduce((s, r) => s + r.credit, 0),
    };
  }, [trialQ.data]);

  const openEntryData = (entriesQ.data ?? []).find((e) => e.id === openEntry);

  return (
    <>
      <PageHead
        eyebrow="Double-entry"
        title="General ledger"
        sub="Posted journal entries from receipts, invoices and adjustments. Trial balance proves the books."
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-md border border-line bg-paper p-0.5">
            {(
              [
                ["entries", "Journal entries", BookOpen],
                ["trial", "Trial balance", Scale],
              ] as const
            ).map(([k, l, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k as Tab)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-medium ${
                  tab === k
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <F label="From">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
              />
            </F>
            <F label="To">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
              />
            </F>
            <F label="Fund">
              <select
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-[12.5px]"
              >
                <option value="">All funds</option>
                {(fundsQ.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </F>
          </div>
        </div>
      </Panel>

      {tab === "entries" && (
        <Panel title="Journal entries">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
                <tr className="border-b border-line">
                  <th className="py-2 px-2 text-left">Entry</th>
                  <th className="px-2 text-left">Date</th>
                  <th className="px-2 text-left">Memo</th>
                  <th className="px-2 text-left">Source</th>
                  <th className="px-2 text-right font-mono">Debit</th>
                  <th className="px-2 text-right font-mono">Credit</th>
                  <th className="px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(entriesQ.data ?? []).map((e) => {
                  const dr = (e.journal_lines ?? []).reduce(
                    (s: number, l: any) => s + Number(l.debit),
                    0,
                  );
                  const cr = (e.journal_lines ?? []).reduce(
                    (s: number, l: any) => s + Number(l.credit),
                    0,
                  );
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setOpenEntry(e.id)}
                      className="cursor-pointer border-b border-line hover:bg-paper"
                    >
                      <td className="py-2 px-2 font-mono text-[12px]">
                        {e.entry_no}
                      </td>
                      <td className="px-2">{e.entry_date}</td>
                      <td className="px-2">{e.memo}</td>
                      <td className="px-2 text-[11.5px] text-ink-soft">
                        {e.source_table ?? "manual"}
                      </td>
                      <td className="px-2 text-right font-mono">{kes(dr)}</td>
                      <td className="px-2 text-right font-mono">{kes(cr)}</td>
                      <td className="px-2">
                        <Pill
                          kind={
                            e.status === "posted"
                              ? "ok"
                              : e.status === "reversed"
                                ? "arrears"
                                : "pending"
                          }
                        >
                          {e.status}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
                {!entriesQ.data?.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-soft">
                      No journal entries in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "trial" && (
        <Panel
          title={`Trial balance · ${from} → ${to}${fundId ? "" : " · all funds"}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
                <tr className="border-b border-line">
                  <th className="py-2 px-2 text-left">Code</th>
                  <th className="px-2 text-left">Account</th>
                  <th className="px-2 text-left">Type</th>
                  <th className="px-2 text-right font-mono">Debit</th>
                  <th className="px-2 text-right font-mono">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(trialQ.data ?? []).map((r) => (
                  <tr key={r.code} className="border-b border-line">
                    <td className="py-2 px-2 font-mono text-[12px]">{r.code}</td>
                    <td className="px-2">{r.name}</td>
                    <td className="px-2 text-[11.5px] capitalize text-ink-soft">
                      {r.type}
                    </td>
                    <td className="px-2 text-right font-mono">
                      {r.debit ? kes(r.debit) : "—"}
                    </td>
                    <td className="px-2 text-right font-mono">
                      {r.credit ? kes(r.credit) : "—"}
                    </td>
                  </tr>
                ))}
                {!trialQ.data?.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-soft">
                      Nothing posted in this period.
                    </td>
                  </tr>
                )}
              </tbody>
              {(trialQ.data ?? []).length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-line-strong font-medium">
                    <td className="py-2 px-2" colSpan={3}>
                      Totals
                    </td>
                    <td className="px-2 text-right font-mono">
                      {kes(totals.debit)}
                    </td>
                    <td className="px-2 text-right font-mono">
                      {kes(totals.credit)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="px-2 py-2 text-right text-[11.5px]">
                      {Math.abs(totals.debit - totals.credit) < 0.005 ? (
                        <Pill kind="ok">In balance</Pill>
                      ) : (
                        <Pill kind="arrears">
                          Out by {kes(Math.abs(totals.debit - totals.credit))}
                        </Pill>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Panel>
      )}

      <Dialog open={!!openEntry} onOpenChange={(o) => !o && setOpenEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-[14px]">
              {openEntryData?.entry_no}
            </DialogTitle>
            <DialogDescription>
              {openEntryData?.entry_date} · {openEntryData?.memo}
            </DialogDescription>
          </DialogHeader>
          {openEntryData && (
            <table className="w-full text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
                <tr className="border-b border-line">
                  <th className="py-2 px-2 text-left">Account</th>
                  <th className="px-2 text-left">Memo</th>
                  <th className="px-2 text-right font-mono">Debit</th>
                  <th className="px-2 text-right font-mono">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(openEntryData.journal_lines ?? [])
                  .slice()
                  .sort((a: any, b: any) => a.line_no - b.line_no)
                  .map((l: any, i: number) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 px-2">
                        <span className="font-mono text-[11.5px] text-ink-soft">
                          {l.accounts?.code}
                        </span>{" "}
                        {l.accounts?.name}
                      </td>
                      <td className="px-2 text-[11.5px] text-ink-soft">
                        {l.memo}
                      </td>
                      <td className="px-2 text-right font-mono">
                        {Number(l.debit) ? kes(Number(l.debit)) : "—"}
                      </td>
                      <td className="px-2 text-right font-mono">
                        {Number(l.credit) ? kes(Number(l.credit)) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </>
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
