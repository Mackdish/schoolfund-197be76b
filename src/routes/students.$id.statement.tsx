import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kes } from "@/lib/money";
import { FileText, ArrowLeft } from "lucide-react";
import { downloadStatementPdf, type StatementData } from "@/lib/statement-pdf";

export const Route = createFileRoute("/students/$id/statement")({
  head: () => ({ meta: [
    { title: "Fee statement — EduTech" },
    { name: "description", content: "Review student charges, payments and balances in an EduTech fee statement." },
    { property: "og:title", content: "Fee statement — EduTech" },
    { property: "og:description", content: "Review student charges, payments and balances in an EduTech fee statement." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  component: () => <AppShell><StatementPage /></AppShell>,
});

function StatementPage() {
  const { id } = Route.useParams();
  const { school } = useAuth();
  const schoolId = school!.id;

  const dataQ = useQuery({
    queryKey: ["student-statement", id],
    queryFn: async () => {
      const { data: student } = await supabase.from("students")
        .select("admission_no, full_name, is_boarder, guardian_name, guardian_phone, classes(form, stream)")
        .eq("id", id).single();
      const { data: term } = await supabase.from("terms").select("id, term, year").eq("school_id", schoolId).eq("is_active", true).maybeSingle();
      const { data: invoices } = await supabase.from("invoices")
        .select("id, opening_balance, total_charges, total_paid, total_bursary, balance, invoice_items(amount, paid_amount, vote_heads(name, funds(name)))")
        .eq("school_id", schoolId).eq("student_id", id).eq("term_id", term?.id ?? "");
      const { data: payments } = await supabase.from("payments")
        .select("paid_on, receipt_no, method, reference, amount")
        .eq("school_id", schoolId).eq("student_id", id).eq("status", "confirmed").order("paid_on", { ascending: false });
      const { data: bursaries } = await supabase.from("bursary_allocations")
        .select("amount, bursaries(source, reference)")
        .eq("student_id", id);

      const inv = invoices?.[0];
      const charges = (inv?.invoice_items ?? []).map((it: any) => ({
        vote_head: it.vote_heads?.name ?? "—",
        fund: it.vote_heads?.funds?.name ?? "—",
        amount: Number(it.amount),
      }));
      const totals = {
        charges: charges.reduce((a, b) => a + b.amount, 0),
        payments: (payments ?? []).reduce((a, b: any) => a + Number(b.amount), 0),
        bursaries: (bursaries ?? []).reduce((a, b: any) => a + Number(b.amount), 0),
        balance: Number(inv?.balance ?? 0),
      };

      return {
        student, term, charges, payments: payments ?? [], bursaries: bursaries ?? [],
        invoice: inv, totals,
      } as any;
    },
  });

  if (!dataQ.data) return <p className="text-[13px] text-ink-soft">Loading…</p>;
  const d = dataQ.data;

  function exportPdf() {
    const sd: StatementData = {
      school: school as any,
      student: {
        admission_no: d.student.admission_no, full_name: d.student.full_name,
        class_label: d.student.classes ? `Form ${d.student.classes.form}${d.student.classes.stream}` : "—",
        is_boarder: d.student.is_boarder, guardian_name: d.student.guardian_name, guardian_phone: d.student.guardian_phone,
      },
      term: { label: d.term ? `Term ${d.term.term} ${d.term.year}` : "Current term", opening_balance: Number(d.invoice?.opening_balance ?? 0) },
      charges: d.charges, payments: d.payments, bursaries: d.bursaries.map((b: any) => ({ source: b.bursaries?.source ?? "Bursary", reference: b.bursaries?.reference, amount: Number(b.amount) })),
      totals: d.totals,
    };
    downloadStatementPdf(sd);
  }

  return (
    <>
      <PageHead eyebrow="Fee statement" title={d.student.full_name}
        sub={`${d.student.admission_no} · ${d.student.classes ? `Form ${d.student.classes.form}${d.student.classes.stream}` : ""} · ${d.term ? `Term ${d.term.term} ${d.term.year}` : "No active term"}`}
        right={
          <div className="flex gap-2">
            <Link to="/students" className="inline-flex items-center gap-1 rounded-md border border-line-strong px-3 py-2 text-[13px] hover:bg-paper"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white"><FileText className="h-3.5 w-3.5" /> Download PDF</button>
            <button onClick={() => window.print()} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Print</button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-4">
        <Stat label="Charges" value={kes(d.totals.charges)} />
        <Stat label="Payments" value={kes(d.totals.payments)} tone="ok" />
        <Stat label="Bursaries" value={kes(d.totals.bursaries)} />
        <Stat label="Balance" value={kes(d.totals.balance)} tone={d.totals.balance > 0 ? "bad" : "ok"} />
      </div>

      <Panel title="Term charges">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line"><th className="py-2 px-2 text-left">Vote head</th><th className="px-2 text-left">Fund</th><th className="px-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {d.charges.map((c: any, i: number) => (
              <tr key={i} className="border-b border-line"><td className="py-1.5 px-2">{c.vote_head}</td><td className="px-2">{c.fund}</td><td className="px-2 text-right font-mono">{kes(c.amount)}</td></tr>
            ))}
            {!d.charges.length && <tr><td colSpan={3} className="py-4 text-center text-ink-soft">No charges for this term.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel title="Payments received">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line"><th className="py-2 px-2 text-left">Date</th><th className="px-2 text-left">Receipt</th><th className="px-2 text-left">Method</th><th className="px-2 text-left">Reference</th><th className="px-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {d.payments.map((p: any, i: number) => (
              <tr key={i} className="border-b border-line">
                <td className="py-1.5 px-2">{p.paid_on}</td>
                <td className="px-2 font-mono">{p.receipt_no}</td>
                <td className="px-2 uppercase text-[11px]">{p.method}</td>
                <td className="px-2 font-mono text-[11px]">{p.reference ?? "—"}</td>
                <td className="px-2 text-right font-mono">{kes(p.amount)}</td>
              </tr>
            ))}
            {!d.payments.length && <tr><td colSpan={5} className="py-4 text-center text-ink-soft">No payments yet.</td></tr>}
          </tbody>
        </table>
      </Panel>

      {d.bursaries.length > 0 && (
        <Panel title="Bursaries applied">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft"><tr className="border-b border-line"><th className="py-2 px-2 text-left">Source</th><th className="px-2 text-left">Reference</th><th className="px-2 text-right">Amount</th></tr></thead>
            <tbody>
              {d.bursaries.map((b: any, i: number) => (
                <tr key={i} className="border-b border-line"><td className="py-1.5 px-2">{b.bursaries?.source ?? "—"}</td><td className="px-2 font-mono text-[11px]">{b.bursaries?.reference ?? "—"}</td><td className="px-2 text-right font-mono">{kes(b.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-forest" : tone === "bad" ? "text-garnet" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 font-serif text-[20px] ${color}`}>{value}</div>
    </div>
  );
}
