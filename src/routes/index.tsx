import { createFileRoute } from "@tanstack/react-router";
import {
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
import { AppShell } from "@/components/app-shell";
import { FundStub } from "@/components/fund-stub";
import { KpiCard, PageHead, Panel, Pill } from "@/components/ui-bits";

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

const trendData = [
  { week: "W1", collected: 6.2, target: 7 },
  { week: "W2", collected: 12.4, target: 14 },
  { week: "W3", collected: 19.8, target: 21 },
  { week: "W4", collected: 26.3, target: 28 },
  { week: "W5", collected: 32.1, target: 35 },
  { week: "W6", collected: 38.1, target: 42 },
];

const statusData = [
  { name: "Cleared", value: 722, color: "#1E5B45" },
  { name: "Pending", value: 350, color: "#B07A2C" },
  { name: "Overdue", value: 62, color: "#9C3B3B" },
  { name: "In credit", value: 111, color: "#2D7A72" },
];

const outstanding = [
  { id: "24811", name: "John Kipchoge", cls: "Form 4A", fund: "Tuition", amt: "125,000", since: "3 months ago", status: "arrears" as const, label: "Overdue" },
  { id: "23590", name: "Grace Mutua", cls: "Form 3B", fund: "School Fund", amt: "85,500", since: "1 month ago", status: "arrears" as const, label: "Overdue" },
  { id: "25040", name: "David Omondi", cls: "Form 2A", fund: "Operations", amt: "62,000", since: "2 weeks ago", status: "pending" as const, label: "Pending" },
  { id: "24810", name: "Sarah Kipchoge", cls: "Form 4B", fund: "Tuition", amt: "45,000", since: "1 week ago", status: "pending" as const, label: "Pending" },
];

const recent = [
  { name: "Alice Wanjiru", when: "Today", amt: "150,000", method: "M-Pesa · KCB Buni", ref: "TXN123456", status: "ok" as const, label: "Paid" },
  { name: "Peter Njoroge", when: "Yesterday", amt: "100,000", method: "Bank transfer", ref: "BT789012", status: "ok" as const, label: "Paid" },
  { name: "Mary Kamau", when: "2 days ago", amt: "75,000", method: "Cash", ref: "PKT345678", status: "partial" as const, label: "Partial" },
  { name: "James Kimani", when: "3 days ago", amt: "150,000", method: "M-Pesa · KCB Buni", ref: "TXN456789", status: "ok" as const, label: "Paid" },
];

function Index() {
  return (
    <AppShell>
      <PageHead
        eyebrow="Overview"
        title="Treasury dashboard"
        sub="Three statutory funds, consolidated at a glance"
      />

      <div className="mb-6 grid grid-cols-4 gap-4">
        <KpiCard label="Total fees" value="KES 45.2M" sub="This term, all funds" trend="↑ 12% vs last term" trendKind="up" />
        <KpiCard label="Collected" value="KES 38.1M" sub="84.4% of total fees" trend="↑ 8% from last week" trendKind="up" />
        <KpiCard label="Outstanding" value="KES 7.1M" sub="1,245 students" trend="Attention needed" trendKind="warn" />
        <KpiCard label="Expenses" value="KES 12.4M" sub="This term, all funds" trend="Within budget" trendKind="flat" />
      </div>

      <div className="mb-[26px] grid grid-cols-3 gap-[18px]">
        <FundStub kind="tuition" name="Tuition account" ref="SF-001" balance={1284300} receiptsMtd={412000} paymentsMtd={96500} />
        <FundStub kind="ops" name="Operations account" ref="SF-002" balance={742150} receiptsMtd={301200} paymentsMtd={212900} />
        <FundStub kind="fund" name="School fund account" ref="SF-003" balance={2063800} receiptsMtd={588400} paymentsMtd={340100} />
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-[18px]">
        <Panel title="Fee collection trend">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E2DECF" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" stroke="#3A4A41" fontSize={11} tickLine={false} axisLine={{ stroke: "#E2DECF" }} />
                <YAxis stroke="#3A4A41" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}M`} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #CFC8AE", fontSize: 12 }} />
                <Line type="monotone" dataKey="target" stroke="#B8924F" strokeDasharray="5 5" strokeWidth={2} dot={false} name="Target pace" />
                <Line type="monotone" dataKey="collected" stroke="#1E5B45" strokeWidth={2.5} dot={{ r: 3, fill: "#1E5B45" }} name="Collected (KES M)" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Collection status breakdown">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" innerRadius={48} outerRadius={75} paddingAngle={2}>
                  {statusData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #CFC8AE", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Attention needed">
        {[
          { pill: <Pill kind="pending">4</Pill>, txt: <>Unmatched <b>KCB deposits</b> awaiting student match</> },
          { pill: <Pill kind="arrears">62</Pill>, txt: <>Students with <b>arrears</b> above KES 5,000 — Tuition a/c</> },
          { pill: <Pill kind="ok">93%</Pill>, txt: <>Q2 <b>capitation utilisation</b>, Operations a/c</> },
          { pill: <Pill kind="credit">11</Pill>, txt: <>Students <b>in credit</b> — auto-offset on next invoice</> },
        ].map((row, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
            {row.pill}
            <div className="text-[12.8px]">{row.txt}</div>
          </div>
        ))}
      </Panel>

      <Panel title="Top outstanding balances">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Student", "Class", "Fund", "Outstanding", "Since", "Status", ""].map((h) => (
                <th key={h} className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-ink-soft">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outstanding.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-b-0 hover:bg-[rgba(18,32,25,0.012)]">
                <td className="px-2 py-2.5"><strong>{r.name}</strong></td>
                <td className="px-2 py-2.5">{r.cls}</td>
                <td className="px-2 py-2.5">{r.fund}</td>
                <td className="px-2 py-2.5 font-mono">{r.amt}</td>
                <td className="px-2 py-2.5">{r.since}</td>
                <td className="px-2 py-2.5"><Pill kind={r.status}>{r.label}</Pill></td>
                <td className="px-2 py-2.5">
                  <button className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[11px] text-ink-soft hover:border-forest hover:text-forest">
                    Send reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Recent payments — last 7 days">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Student", "Date", "Amount", "Method", "Reference", "Status"].map((h) => (
                <th key={h} className="px-2 py-2 text-left text-[10.5px] font-medium uppercase tracking-wider text-ink-soft">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recent.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-b-0 hover:bg-[rgba(18,32,25,0.012)]">
                <td className="px-2 py-2.5"><strong>{r.name}</strong></td>
                <td className="px-2 py-2.5">{r.when}</td>
                <td className="px-2 py-2.5 font-mono">{r.amt}</td>
                <td className="px-2 py-2.5">{r.method}</td>
                <td className="px-2 py-2.5 font-mono">{r.ref}</td>
                <td className="px-2 py-2.5"><Pill kind={r.status}>{r.label}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </AppShell>
  );
}