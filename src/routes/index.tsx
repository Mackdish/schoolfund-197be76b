import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { KpiCard, PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { kes } from "@/lib/money";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SomaFin — Treasury Dashboard" },
      {
        name: "description",
        content:
          "Treasury dashboard for Kenyan secondary schools — three statutory funds at a glance.",
      },
      { property: "og:title", content: "SomaFin — Treasury Dashboard" },
      {
        property: "og:description",
        content:
          "Treasury dashboard for Kenyan secondary schools — three statutory funds at a glance.",
      },
    ],
  }),
  component: Index,
});

const fundColors = ["#1E5B45", "#B8924F", "#2D7A72", "#6B3F73"];

function Index() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { school } = useAuth();
  const schoolId = school?.id ?? "";

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const startOfYear = `${today.getFullYear()}-01-01`;
  const eightWeeksAgo = new Date(today);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 7 * 8);
  const isoEightWeeks = eightWeeksAgo.toISOString().slice(0, 10);

  const fundsQ = useQuery({
    enabled: !!schoolId,
    queryKey: ["dash-funds", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("funds")
        .select("id, code, name, opening_balance")
        .eq("school_id", schoolId)
        .order("code");
      return (data ?? []) as any[];
    },
  });

  const invoicesQ = useQuery({
    enabled: !!schoolId,
    queryKey: ["dash-invoices", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, status, total_charges, total_paid, total_bursary, balance, student_id, term_id")
        .eq("school_id", schoolId)
        .limit(5000);
      return (data ?? []) as any[];
    },
  });

  const cashbookQ = useQuery({
    enabled: !!schoolId,
    queryKey: ["dash-cashbook", schoolId, isoEightWeeks],
    queryFn: async () => {
      const { data } = await supabase
        .from("cashbook_entries")
        .select("fund_id, entry_date, receipts, payments")
        .eq("school_id", schoolId)
        .gte("entry_date", isoEightWeeks)
        .order("entry_date", { ascending: true })
        .limit(10000);
      return (data ?? []) as any[];
    },
  });

  const ytdLinesQ = useQuery({
    enabled: !!schoolId,
    queryKey: ["dash-ytd-lines", schoolId, startOfYear, isoToday],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select(
          "debit, credit, accounts!inner(type, school_id), journal_entries!inner(school_id, status, entry_date)",
        )
        .eq("journal_entries.school_id", schoolId)
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", startOfYear)
        .lte("journal_entries.entry_date", isoToday)
        .limit(10000);
      return (data ?? []) as any[];
    },
  });

  const recentPaymentsQ = useQuery({
    enabled: !!schoolId,
    queryKey: ["dash-payments", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, paid_on, amount, method, reference, status, students(full_name)")
        .eq("school_id", schoolId)
        .order("paid_on", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  const topOutstandingQ = useQuery({
    enabled: !!schoolId,
    queryKey: ["dash-outstanding", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, balance, status, issue_date, students(full_name, classes(name)), terms(name)")
        .eq("school_id", schoolId)
        .gt("balance", 0)
        .order("balance", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  // ===== Aggregations =====
  const totals = useMemo(() => {
    const invs = invoicesQ.data ?? [];
    let charges = 0,
      paid = 0,
      bursary = 0,
      outstanding = 0;
    const studentsOwing = new Set<string>();
    for (const i of invs) {
      charges += Number(i.total_charges ?? 0);
      paid += Number(i.total_paid ?? 0);
      bursary += Number(i.total_bursary ?? 0);
      const bal = Number(i.balance ?? 0);
      outstanding += Math.max(0, bal);
      if (bal > 0) studentsOwing.add(i.student_id);
    }
    const collectionRate = charges > 0 ? (paid + bursary) / charges : 0;
    return { charges, paid, bursary, outstanding, studentsOwing: studentsOwing.size, collectionRate };
  }, [invoicesQ.data]);

  const ytdExpense = useMemo(() => {
    let exp = 0;
    for (const l of ytdLinesQ.data ?? []) {
      if (l.accounts?.type === "expense") exp += Number(l.debit) - Number(l.credit);
    }
    return exp;
  }, [ytdLinesQ.data]);

  const trendData = useMemo(() => {
    const cb = cashbookQ.data ?? [];
    const buckets = new Map<string, { week: string; collected: number; out: number }>();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i * 7);
      const wk = isoWeek(d);
      buckets.set(wk, { week: `W${wk.slice(-2)}`, collected: 0, out: 0 });
    }
    for (const e of cb) {
      const wk = isoWeek(new Date(e.entry_date));
      const b = buckets.get(wk);
      if (!b) continue;
      b.collected += Number(e.receipts ?? 0) / 1_000_000;
      b.out += Number(e.payments ?? 0) / 1_000_000;
    }
    return [...buckets.values()];
  }, [cashbookQ.data]);

  const statusBreakdown = useMemo(() => {
    const invs = invoicesQ.data ?? [];
    const c = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
    for (const i of invs) {
      const s = String(i.status ?? "unpaid");
      if (s === "paid") c.paid += 1;
      else if (s === "partial") c.partial += 1;
      else if (s === "overdue") c.overdue += 1;
      else c.unpaid += 1;
    }
    return [
      { name: "Paid", value: c.paid, color: "#1E5B45" },
      { name: "Partial", value: c.partial, color: "#6B3F73" },
      { name: "Unpaid", value: c.unpaid, color: "#B07A2C" },
      { name: "Overdue", value: c.overdue, color: "#9C3B3B" },
    ].filter((x) => x.value > 0);
  }, [invoicesQ.data]);

  const fundBalances = useMemo(() => {
    const funds = fundsQ.data ?? [];
    const cb = cashbookQ.data ?? []; // last 8w only, but we need closing — derive from receipts-payments net + opening
    return funds.map((f, idx) => {
      let net = 0,
        recMtd = 0,
        payMtd = 0;
      const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
      for (const e of cb) {
        if (e.fund_id !== f.id) continue;
        net += Number(e.receipts ?? 0) - Number(e.payments ?? 0);
        if (e.entry_date >= monthStart) {
          recMtd += Number(e.receipts ?? 0);
          payMtd += Number(e.payments ?? 0);
        }
      }
      return {
        id: f.id,
        code: f.code,
        name: f.name,
        balance: Number(f.opening_balance ?? 0) + net,
        recMtd,
        payMtd,
        color: fundColors[idx % fundColors.length],
      };
    });
  }, [fundsQ.data, cashbookQ.data]);

  const fundBarData = fundBalances.map((f) => ({
    name: f.code,
    Balance: Math.round(f.balance),
  }));

  if (!schoolId) {
    return <p className="text-[13px] text-ink-soft">No active school selected.</p>;
  }

  return (
    <>
      <PageHead
        eyebrow="Overview"
        title="Treasury dashboard"
        sub={`${school?.name ?? ""} · live from the ledger`}
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <KpiCard
          label="Billed (term)"
          value={kes(totals.charges)}
          sub="All open invoices"
          trend={`${(totals.collectionRate * 100).toFixed(1)}% collected`}
          trendKind={totals.collectionRate >= 0.8 ? "up" : "flat"}
        />
        <KpiCard
          label="Collected"
          value={kes(totals.paid)}
          sub={`+ ${kes(totals.bursary)} bursary`}
          trend="Receipts to date"
          trendKind="up"
        />
        <KpiCard
          label="Outstanding"
          value={kes(totals.outstanding)}
          sub={`${totals.studentsOwing} students owing`}
          trend={totals.outstanding > 0 ? "Follow up" : "Cleared"}
          trendKind={totals.outstanding > 0 ? "warn" : "up"}
        />
        <KpiCard
          label="Expenditure YTD"
          value={kes(ytdExpense)}
          sub="Posted journals"
          trend={`Since ${startOfYear}`}
          trendKind="flat"
        />
      </div>

      <div className="mb-[18px] grid grid-cols-3 gap-[18px]">
        {fundBalances.map((f) => (
          <div
            key={f.id}
            className="rounded-[10px] border border-line bg-surface px-5 py-4"
            style={{ borderTop: `3px solid ${f.color}` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {f.code}
              </span>
              <span className="text-[11px] text-ink-soft">{f.name}</span>
            </div>
            <div className="mt-2 font-mono text-[20px] font-medium">{kes(f.balance)}</div>
            <div className="mt-2 flex justify-between text-[11.5px] text-ink-soft">
              <span>
                <span className="text-forest">↑</span> {kes(f.recMtd)} mtd
              </span>
              <span>
                <span className="text-garnet">↓</span> {kes(f.payMtd)} mtd
              </span>
            </div>
          </div>
        ))}
        {!fundBalances.length && (
          <p className="text-[12.5px] text-ink-soft col-span-3">No funds configured.</p>
        )}
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-[18px]">
        <Panel title="Collections — last 8 weeks (KES millions)">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E2DECF" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" stroke="#3A4A41" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#3A4A41"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}M`}
                />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #CFC8AE", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="collected"
                  stroke="#1E5B45"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#1E5B45" }}
                  name="Receipts"
                />
                <Line
                  type="monotone"
                  dataKey="out"
                  stroke="#9C3B3B"
                  strokeWidth={2}
                  dot={false}
                  name="Payments"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Invoice status">
          <div className="h-[220px]">
            {statusBreakdown.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusBreakdown.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #CFC8AE", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-[12.5px] text-ink-soft">
                No invoices yet.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Fund balances">
        <div className="h-[200px]">
          {fundBarData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fundBarData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E2DECF" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#3A4A41" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#3A4A41"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => kes(v)}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #CFC8AE", fontSize: 12 }}
                  formatter={(v: number) => kes(v)}
                />
                <Bar dataKey="Balance" radius={[4, 4, 0, 0]}>
                  {fundBarData.map((_, i) => (
                    <Cell key={i} fill={fundColors[i % fundColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-[12.5px] text-ink-soft">
              No funds yet.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="Top outstanding balances"
        right={
          <Link
            to="/receipting"
            className="text-[11.5px] font-medium text-forest hover:underline"
          >
            Open receipting →
          </Link>
        }
      >
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Student", "Class", "Term", "Outstanding", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-ink-soft"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(topOutstandingQ.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <td className="px-2 py-2.5"><strong>{r.students?.full_name ?? "—"}</strong></td>
                <td className="px-2 py-2.5">{r.students?.classes?.name ?? "—"}</td>
                <td className="px-2 py-2.5">{r.terms?.name ?? "—"}</td>
                <td className="px-2 py-2.5 font-mono">{kes(Number(r.balance ?? 0))}</td>
                <td className="px-2 py-2.5">
                  <Pill kind={r.status === "overdue" ? "arrears" : "pending"}>
                    {String(r.status)}
                  </Pill>
                </td>
              </tr>
            ))}
            {!(topOutstandingQ.data ?? []).length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-soft">
                  No outstanding balances.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <Panel title="Recent payments">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Student", "Date", "Amount", "Method", "Reference", "Status"].map((h) => (
                <th
                  key={h}
                  className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-ink-soft"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(recentPaymentsQ.data ?? []).map((r: any) => (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <td className="px-2 py-2.5"><strong>{r.students?.full_name ?? "—"}</strong></td>
                <td className="px-2 py-2.5">{r.paid_on}</td>
                <td className="px-2 py-2.5 font-mono">{kes(Number(r.amount ?? 0))}</td>
                <td className="px-2 py-2.5 capitalize">{String(r.method ?? "").replace(/_/g, " ")}</td>
                <td className="px-2 py-2.5 font-mono text-[11.5px]">{r.reference ?? "—"}</td>
                <td className="px-2 py-2.5">
                  <Pill kind={r.status === "confirmed" ? "ok" : r.status === "pending" ? "pending" : "partial"}>
                    {String(r.status)}
                  </Pill>
                </td>
              </tr>
            ))}
            {!(recentPaymentsQ.data ?? []).length && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-soft">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

// ISO week number (year + 2-digit week)
function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}${String(weekNo).padStart(2, "0")}`;
}
