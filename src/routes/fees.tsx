import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { FileText, Wand2 } from "lucide-react";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fee collection — SomaFin" }] }),
  component: () => <AppShell><FeesPage /></AppShell>,
});

function FeesPage() {
  const { school } = useAuth();
  const schoolId = school!.id;

  return (
    <>
      <PageHead eyebrow="Term billing" title="Fee collection" sub="Per-term structures, invoice generation and outstanding balances" />
      <Tabs defaultValue="invoices" className="w-full">
        <TabsList className="bg-paper border border-line">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="structure">Fee structure</TabsTrigger>
          <TabsTrigger value="generate">Generate invoices</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab schoolId={schoolId} /></TabsContent>
        <TabsContent value="structure" className="mt-4"><StructureTab schoolId={schoolId} /></TabsContent>
        <TabsContent value="generate" className="mt-4"><GenerateTab schoolId={schoolId} /></TabsContent>
      </Tabs>
    </>
  );
}

function useTerms(schoolId: string) {
  return useQuery({
    queryKey: ["terms", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id, year, term, is_active").eq("school_id", schoolId).order("year", { ascending: false }).order("term", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
function useClasses(schoolId: string) {
  return useQuery({
    queryKey: ["classes", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, form, stream").eq("school_id", schoolId).order("form").order("stream");
      if (error) throw error;
      return data;
    },
  });
}
function useVoteHeads(schoolId: string) {
  return useQuery({
    queryKey: ["vote-heads", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vote_heads").select("id, code, name, fund_id, funds(code, name)").eq("school_id", schoolId).order("code");
      if (error) throw error;
      return data as any[];
    },
  });
}

function InvoicesTab({ schoolId }: { schoolId: string }) {
  const terms = useTerms(schoolId);
  const [termId, setTermId] = useState<string>("");
  const activeTerm = terms.data?.find((t) => t.is_active);
  const tid = termId || activeTerm?.id || "";

  const invoicesQ = useQuery({
    queryKey: ["invoices", schoolId, tid],
    enabled: !!tid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, total_charges, total_paid, balance, status, student_id, students(full_name, admission_no, classes(form, stream))")
        .eq("school_id", schoolId).eq("term_id", tid).order("invoice_no");
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <select value={tid} onChange={(e) => setTermId(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
          {(terms.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>Term {t.term}, {t.year}{t.is_active ? " · active" : ""}</option>
          ))}
        </select>
        <div className="text-[12.5px] text-ink-soft">{invoicesQ.data?.length ?? 0} invoices</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-2.5 px-2 text-left">Invoice</th>
              <th className="px-2 text-left">Student</th>
              <th className="px-2 text-left">Class</th>
              <th className="px-2 text-right font-mono">Charges</th>
              <th className="px-2 text-right font-mono">Paid</th>
              <th className="px-2 text-right font-mono">Balance</th>
              <th className="px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(invoicesQ.data ?? []).map((i) => (
              <tr key={i.id} className="border-b border-line">
                <td className="py-2.5 px-2 font-mono text-[12px]">{i.invoice_no}</td>
                <td className="px-2 font-medium">{i.students?.full_name} <span className="text-ink-soft font-mono text-[11.5px]">{i.students?.admission_no}</span></td>
                <td className="px-2">{i.students?.classes ? `Form ${i.students.classes.form}${i.students.classes.stream}` : "—"}</td>
                <td className="px-2 text-right font-mono">{kes(i.total_charges)}</td>
                <td className="px-2 text-right font-mono">{kes(i.total_paid)}</td>
                <td className="px-2 text-right font-mono">{kes(i.balance)}</td>
                <td className="px-2">
                  {i.status === "paid" ? <Pill kind="ok">Paid</Pill> : i.status === "partial" ? <Pill kind="partial">Partial</Pill> : <Pill kind="arrears">Open</Pill>}
                </td>
              </tr>
            ))}
            {!invoicesQ.data?.length && (
              <tr><td colSpan={7} className="py-10 text-center text-ink-soft">
                No invoices for this term. Build a fee structure and run "Generate invoices".
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StructureTab({ schoolId }: { schoolId: string }) {
  const terms = useTerms(schoolId);
  const classes = useClasses(schoolId);
  const voteHeads = useVoteHeads(schoolId);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [isBoarder, setIsBoarder] = useState(false);
  const qc = useQueryClient();
  const activeTermId = terms.data?.find((t) => t.is_active)?.id ?? "";
  const tid = termId || activeTermId;
  const cid = classId || classes.data?.[0]?.id || "";

  const structureQ = useQuery({
    queryKey: ["fee-structure", schoolId, tid, cid, isBoarder],
    enabled: !!tid && !!cid,
    queryFn: async () => {
      const { data: fs } = await supabase
        .from("fee_structures")
        .select("id, fee_structure_items(id, vote_head_id, amount)")
        .eq("term_id", tid).eq("class_id", cid).eq("is_boarder", isBoarder).maybeSingle();
      return fs as any;
    },
  });

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  useMemo(() => {
    const m: Record<string, string> = {};
    (structureQ.data?.fee_structure_items ?? []).forEach((it: any) => { m[it.vote_head_id] = String(it.amount); });
    setAmounts(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureQ.data?.id]);

  const save = useMutation({
    mutationFn: async () => {
      let fsId = structureQ.data?.id as string | undefined;
      if (!fsId) {
        const { data, error } = await supabase.from("fee_structures").insert({
          school_id: schoolId, term_id: tid, class_id: cid, is_boarder: isBoarder,
        }).select("id").single();
        if (error) throw error;
        fsId = data.id;
      } else {
        await supabase.from("fee_structure_items").delete().eq("fee_structure_id", fsId);
      }
      const rows = Object.entries(amounts)
        .filter(([, v]) => Number(v) > 0)
        .map(([vote_head_id, v]) => ({ fee_structure_id: fsId!, vote_head_id, amount: Number(v) }));
      if (rows.length) {
        const { error } = await supabase.from("fee_structure_items").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Fee structure saved"); qc.invalidateQueries({ queryKey: ["fee-structure"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    (voteHeads.data ?? []).forEach((v) => {
      const k = v.funds?.name ?? "Fund";
      (g[k] = g[k] || []).push(v);
    });
    return g;
  }, [voteHeads.data]);

  const total = Object.values(amounts).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={tid} onChange={(e) => setTermId(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
          {(terms.data ?? []).map((t) => <option key={t.id} value={t.id}>Term {t.term}, {t.year}</option>)}
        </select>
        <select value={cid} onChange={(e) => setClassId(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
          {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>Form {c.form}{c.stream}</option>)}
        </select>
        <select value={isBoarder ? "b" : "d"} onChange={(e) => setIsBoarder(e.target.value === "b")} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
          <option value="d">Day scholar</option><option value="b">Boarder</option>
        </select>
        <div className="ml-auto text-[13px]">
          Total: <span className="font-mono font-medium">{kes(total)}</span>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
          {save.isPending ? "Saving…" : "Save structure"}
        </button>
      </div>

      {Object.entries(groups).map(([fundName, heads]) => (
        <div key={fundName} className="mb-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">{fundName}</div>
          <div className="grid grid-cols-2 gap-2">
            {heads.map((h) => (
              <label key={h.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2">
                <span className="text-[12.5px]"><span className="font-mono text-[11.5px] text-ink-soft mr-2">{h.code}</span>{h.name}</span>
                <input
                  type="number" min="0" step="1"
                  value={amounts[h.id] ?? ""}
                  onChange={(e) => setAmounts({ ...amounts, [h.id]: e.target.value })}
                  className="w-32 rounded border border-line-strong bg-surface px-2 py-1 text-right font-mono text-[12.5px] outline-none focus:border-forest"
                  placeholder="0"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}

function GenerateTab({ schoolId }: { schoolId: string }) {
  const terms = useTerms(schoolId);
  const classes = useClasses(schoolId);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("all");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const qc = useQueryClient();
  const activeTermId = terms.data?.find((t) => t.is_active)?.id ?? "";
  const tid = termId || activeTermId;

  const generate = useMutation({
    mutationFn: async () => {
      // Load students filter
      let sq = supabase.from("students").select("id, class_id, is_boarder, status").eq("school_id", schoolId).eq("status", "active");
      if (classId !== "all") sq = sq.eq("class_id", classId);
      const { data: students, error: se } = await sq;
      if (se) throw se;

      // Existing invoices for this term
      const { data: existing } = await supabase.from("invoices").select("student_id").eq("school_id", schoolId).eq("term_id", tid);
      const existingSet = new Set((existing ?? []).map((e) => e.student_id));

      // Structures keyed by class_id + boarder
      const { data: structures } = await supabase
        .from("fee_structures")
        .select("id, class_id, is_boarder, fee_structure_items(vote_head_id, amount)")
        .eq("term_id", tid).eq("school_id", schoolId);
      const sMap = new Map<string, any>();
      (structures ?? []).forEach((s) => sMap.set(`${s.class_id}|${s.is_boarder}`, s));

      let created = 0, skipped = 0;
      // Get max existing invoice number to continue
      const { data: maxRow } = await supabase.from("invoices").select("invoice_no").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1);
      let nextSeq = (maxRow?.[0]?.invoice_no?.match(/(\d+)$/)?.[1] ?? 0) ? Number(maxRow![0].invoice_no.match(/(\d+)$/)![1]) + 1 : 1001;

      for (const st of students ?? []) {
        if (existingSet.has(st.id) || !st.class_id) { skipped++; continue; }
        const fs = sMap.get(`${st.class_id}|${st.is_boarder}`);
        if (!fs) { skipped++; continue; }
        const items = (fs.fee_structure_items ?? []) as any[];
        const total = items.reduce((a, b) => a + Number(b.amount || 0), 0);
        const invoice_no = `INV-${String(nextSeq++).padStart(5, "0")}`;
        const { data: inv, error } = await supabase.from("invoices").insert({
          school_id: schoolId, student_id: st.id, term_id: tid, invoice_no,
          total_charges: total, balance: total,
        }).select("id").single();
        if (error) { skipped++; continue; }
        if (items.length) {
          await supabase.from("invoice_items").insert(items.map((it) => ({
            invoice_id: inv.id, vote_head_id: it.vote_head_id, amount: Number(it.amount),
          })));
        }
        created++;
      }
      return { created, skipped };
    },
    onSuccess: (r) => {
      setResult(r);
      setConfirm(false);
      toast.success(`${r.created} invoices created`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["student-balances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Panel>
      <div className="flex items-center gap-3 flex-wrap">
        <select value={tid} onChange={(e) => setTermId(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
          {(terms.data ?? []).map((t) => <option key={t.id} value={t.id}>Term {t.term}, {t.year}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]">
          <option value="all">All classes</option>
          {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>Form {c.form}{c.stream}</option>)}
        </select>
        <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
          <Wand2 className="h-3.5 w-3.5" /> Generate invoices
        </button>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-soft max-w-[640px]">
        For each active student in the selection, SomaFin will create one term invoice using the saved fee structure (matched by class and boarder status).
        Students already invoiced for this term are skipped.
      </p>

      {result && (
        <div className="mt-4 rounded-md border border-forest-light bg-forest-light/40 px-4 py-3 text-[13px]">
          <FileText className="inline h-4 w-4 mr-2 text-forest" />
          Created <strong>{result.created}</strong> invoices, skipped <strong>{result.skipped}</strong>.
        </div>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm invoice generation</DialogTitle>
            <DialogDescription>
              This action will create term invoices for every active student matching the selection. The action is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setConfirm(false)} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
            <button onClick={() => generate.mutate()} disabled={generate.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
              {generate.isPending ? "Generating…" : "Generate"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
