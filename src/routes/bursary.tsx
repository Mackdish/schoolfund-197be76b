import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { kes } from "@/lib/money";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/bursary")({
  head: () => ({ meta: [
    { title: "Bursaries · capitation — EduTech" },
    { name: "description", content: "Track school bursaries and capitation allocations in EduTech." },
    { property: "og:title", content: "Bursaries · capitation — EduTech" },
    { property: "og:description", content: "Track school bursaries and capitation allocations in EduTech." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  component: () => (
    <AppShell>
      <BursaryPage />
    </AppShell>
  ),
});

const SOURCES = [
  { v: "capitation", l: "Government capitation" },
  { v: "ng_cdf", l: "NG-CDF" },
  { v: "county", l: "County bursary" },
  { v: "sponsor", l: "Sponsor" },
  { v: "other", l: "Other" },
] as const;

function BursaryPage() {
  const { school } = useAuth();
  const schoolId = school!.id;

  return (
    <>
      <PageHead
        eyebrow="Funding register"
        title="Bursaries · capitation"
        sub="Record disbursements from Government, NG-CDF, County and sponsors; pledge per-student credits that auto-apply at promotion."
      />
      <Tabs defaultValue="disb">
        <TabsList className="bg-paper border border-line">
          <TabsTrigger value="disb">Disbursements</TabsTrigger>
          <TabsTrigger value="alloc">Standing allocations</TabsTrigger>
        </TabsList>
        <TabsContent value="disb" className="mt-4">
          <DisbursementsTab schoolId={schoolId} />
        </TabsContent>
        <TabsContent value="alloc" className="mt-4">
          <AllocationsTab schoolId={schoolId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function DisbursementsTab({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    source: "capitation" as (typeof SOURCES)[number]["v"],
    sponsor_name: "",
    reference: "",
    received_on: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
  });

  const listQ = useQuery({
    queryKey: ["bursaries", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bursaries")
        .select("*")
        .eq("school_id", schoolId)
        .order("received_on", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!Number(form.amount)) throw new Error("Enter amount");
      const { error } = await supabase.from("bursaries").insert({
        school_id: schoolId,
        source: form.source,
        sponsor_name: form.sponsor_name || null,
        reference: form.reference || null,
        received_on: form.received_on,
        amount: Number(form.amount),
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Disbursement recorded");
      setForm({ ...form, sponsor_name: "", reference: "", amount: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["bursaries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const total = (listQ.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const allocated = (listQ.data ?? []).reduce((s, r) => s + Number(r.amount_allocated ?? 0), 0);

  return (
    <>
      <Panel title="Record disbursement">
        <div className="grid grid-cols-[200px_1fr_180px_140px_140px_auto] gap-3 items-end">
          <F label="Source">
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value as any })}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
            >
              {SOURCES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </F>
          <F label="Sponsor / payer">
            <input
              value={form.sponsor_name}
              onChange={(e) => setForm({ ...form, sponsor_name: e.target.value })}
              placeholder="e.g. Ministry of Education"
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
            />
          </F>
          <F label="Reference">
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px] font-mono"
            />
          </F>
          <F label="Date">
            <input
              type="date"
              value={form.received_on}
              onChange={(e) => setForm({ ...form, received_on: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
            />
          </F>
          <F label="Amount (KES)">
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-right font-mono text-[12.5px]"
            />
          </F>
          <button
            onClick={() => add.mutate()}
            disabled={add.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Record
          </button>
        </div>
      </Panel>

      <Panel
        title="Disbursement register"
        right={
          <span className="text-[11.5px] text-ink-soft">
            Total {kes(total)} · Allocated {kes(allocated)} · Unallocated {kes(total - allocated)}
          </span>
        }
      >
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-2 px-2 text-left">Date</th>
              <th className="px-2 text-left">Source</th>
              <th className="px-2 text-left">Sponsor</th>
              <th className="px-2 text-left">Reference</th>
              <th className="px-2 text-right font-mono">Amount</th>
              <th className="px-2 text-right font-mono">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {(listQ.data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-line">
                <td className="py-2 px-2">{r.received_on}</td>
                <td className="px-2">
                  <Pill kind="credit">{r.source.replace("_", " ")}</Pill>
                </td>
                <td className="px-2">{r.sponsor_name ?? "—"}</td>
                <td className="px-2 font-mono text-[11.5px] text-ink-soft">
                  {r.reference ?? "—"}
                </td>
                <td className="px-2 text-right font-mono">{kes(Number(r.amount))}</td>
                <td className="px-2 text-right font-mono">
                  {kes(Number(r.amount_allocated ?? 0))}
                </td>
              </tr>
            ))}
            {!listQ.data?.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-soft">
                  No disbursements recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function AllocationsTab({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const [bursaryId, setBursaryId] = useState("");
  const [studentQ, setStudentQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [amount, setAmount] = useState("");

  const bursariesQ = useQuery({
    queryKey: ["bursaries-open", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bursaries")
        .select("id, source, sponsor_name, amount, amount_allocated, received_on")
        .eq("school_id", schoolId)
        .order("received_on", { ascending: false });
      return (data ?? []).filter((b) => Number(b.amount) > Number(b.amount_allocated ?? 0));
    },
  });

  const termsQ = useQuery({
    queryKey: ["terms", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, year, term, is_active")
        .eq("school_id", schoolId)
        .order("year", { ascending: false })
        .order("term", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const studentsQ = useQuery({
    queryKey: ["students-lookup", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, admission_no, full_name")
        .eq("school_id", schoolId)
        .eq("status", "active")
        .order("admission_no");
      return (data ?? []) as any[];
    },
  });

  const allocsQ = useQuery({
    queryKey: ["allocs", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bursary_allocations")
        .select(
          "id, amount, invoice_id, created_at, students(full_name, admission_no), terms(year, term), bursaries(source, sponsor_name)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      return (data ?? []) as any[];
    },
  });

  const matches = useMemo(() => {
    const q = studentQ.trim().toLowerCase();
    if (!q) return [];
    return (studentsQ.data ?? [])
      .filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [studentQ, studentsQ.data]);
  const selStudent = (studentsQ.data ?? []).find((s) => s.id === studentId);

  const pledge = useMutation({
    mutationFn: async () => {
      if (!bursaryId || !studentId || !termId || !Number(amount))
        throw new Error("Fill all fields");
      const { error } = await supabase.from("bursary_allocations").insert({
        bursary_id: bursaryId,
        student_id: studentId,
        term_id: termId,
        amount: Number(amount),
      });
      if (error) throw error;
      // bump bursary.amount_allocated
      const b = (bursariesQ.data ?? []).find((x) => x.id === bursaryId);
      if (b) {
        await supabase
          .from("bursaries")
          .update({ amount_allocated: Number(b.amount_allocated ?? 0) + Number(amount) })
          .eq("id", bursaryId);
      }
    },
    onSuccess: () => {
      toast.success("Standing credit pledged — will apply on next promotion");
      setAmount("");
      setStudentId("");
      setStudentQ("");
      qc.invalidateQueries({ queryKey: ["allocs"] });
      qc.invalidateQueries({ queryKey: ["bursaries-open"] });
      qc.invalidateQueries({ queryKey: ["bursaries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Panel title="Pledge credit to a student">
        <div className="grid grid-cols-[1fr_1.2fr_180px_140px_auto] gap-3 items-end">
          <F label="Disbursement to draw from">
            <select
              value={bursaryId}
              onChange={(e) => setBursaryId(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
            >
              <option value="">Choose…</option>
              {(bursariesQ.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.source} · {b.sponsor_name ?? "—"} ·{" "}
                  {kes(Number(b.amount) - Number(b.amount_allocated ?? 0))} free
                </option>
              ))}
            </select>
          </F>
          <F label="Student">
            <div className="relative">
              <input
                value={selStudent ? `${selStudent.full_name} · ${selStudent.admission_no}` : studentQ}
                onChange={(e) => {
                  setStudentId("");
                  setStudentQ(e.target.value);
                }}
                placeholder="Name or admission no"
                className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
              />
              {matches.length > 0 && !studentId && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-md">
                  {matches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStudentId(s.id);
                        setStudentQ("");
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-paper"
                    >
                      {s.full_name}{" "}
                      <span className="font-mono text-[11px] text-ink-soft">{s.admission_no}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </F>
          <F label="Apply to term">
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-[12.5px]"
            >
              <option value="">Choose…</option>
              {(termsQ.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  Term {t.term}, {t.year}
                </option>
              ))}
            </select>
          </F>
          <F label="Amount (KES)">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-2 py-2 text-right font-mono text-[12.5px]"
            />
          </F>
          <button
            onClick={() => pledge.mutate()}
            disabled={pledge.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Pledge
          </button>
        </div>
        <p className="mt-3 text-[11.5px] text-ink-soft">
          Pledged credits are deducted from the student's new invoice when the next promotion run executes,
          or attach immediately if their invoice for the chosen term already exists.
        </p>
      </Panel>

      <Panel title="Recent allocations">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-2 px-2 text-left">Pledged</th>
              <th className="px-2 text-left">Student</th>
              <th className="px-2 text-left">Term</th>
              <th className="px-2 text-left">Source</th>
              <th className="px-2 text-right font-mono">Amount</th>
              <th className="px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(allocsQ.data ?? []).map((a) => (
              <tr key={a.id} className="border-b border-line">
                <td className="py-2 px-2">{new Date(a.created_at).toLocaleDateString()}</td>
                <td className="px-2">
                  {a.students?.full_name}{" "}
                  <span className="font-mono text-[11.5px] text-ink-soft">
                    {a.students?.admission_no}
                  </span>
                </td>
                <td className="px-2">
                  T{a.terms?.term}/{a.terms?.year}
                </td>
                <td className="px-2 text-[11.5px] text-ink-soft">
                  {a.bursaries?.source} · {a.bursaries?.sponsor_name ?? "—"}
                </td>
                <td className="px-2 text-right font-mono">{kes(Number(a.amount))}</td>
                <td className="px-2">
                  {a.invoice_id ? (
                    <Pill kind="ok">Applied</Pill>
                  ) : (
                    <Pill kind="pending">Pending</Pill>
                  )}
                </td>
              </tr>
            ))}
            {!allocsQ.data?.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-soft">
                  No allocations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
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
