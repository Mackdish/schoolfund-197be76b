import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { kes } from "@/lib/money";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, GraduationCap, HandCoins, Wallet } from "lucide-react";

export const Route = createFileRoute("/promotion")({
  head: () => ({ meta: [{ title: "Promotion — EduTech" }] }),
  component: () => (
    <AppShell>
      <PromotionPage />
    </AppShell>
  ),
});

function PromotionPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();

  const [fromTermId, setFromTermId] = useState("");
  const [toTermId, setToTermId] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [result, setResult] = useState<any>(null);

  const termsQ = useQuery({
    queryKey: ["terms", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, year, term, is_active, is_closed")
        .eq("school_id", schoolId)
        .order("year", { ascending: false })
        .order("term", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const activeTerm = (termsQ.data ?? []).find((t) => t.is_active);
  const effectiveFrom = fromTermId || activeTerm?.id || "";

  // Preview: per-form counts, total carry-forward, pending bursary credits
  const previewQ = useQuery({
    queryKey: ["promotion-preview", schoolId, effectiveFrom, toTermId],
    enabled: !!effectiveFrom,
    queryFn: async () => {
      const { data: studs } = await supabase
        .from("students")
        .select("id, class_id, is_boarder, classes(form, stream)")
        .eq("school_id", schoolId)
        .eq("status", "active");
      const { data: invs } = await supabase
        .from("invoices")
        .select("student_id, balance")
        .eq("school_id", schoolId)
        .eq("term_id", effectiveFrom);
      const balByStudent = new Map<string, number>();
      for (const i of invs ?? []) {
        balByStudent.set(i.student_id, (balByStudent.get(i.student_id) ?? 0) + Number(i.balance));
      }
      const byForm = new Map<number, { count: number; carry: number; graduating: boolean }>();
      let totalCarry = 0;
      let graduating = 0;
      let promoting = 0;
      for (const s of studs ?? []) {
        const form = (s as any).classes?.form ?? 0;
        const bal = balByStudent.get(s.id) ?? 0;
        const cur = byForm.get(form) ?? { count: 0, carry: 0, graduating: form >= 4 };
        cur.count++;
        cur.carry += bal;
        byForm.set(form, cur);
        totalCarry += bal;
        if (form >= 4) graduating++;
        else promoting++;
      }
      let bursaryPledges = 0;
      let bursaryCount = 0;
      if (toTermId) {
        const { data: pledges } = await supabase
          .from("bursary_allocations")
          .select("amount")
          .eq("term_id", toTermId)
          .is("invoice_id", null);
        bursaryCount = (pledges ?? []).length;
        bursaryPledges = (pledges ?? []).reduce((s, p) => s + Number(p.amount), 0);
      }
      // structures coverage for to_term
      let structuresMissing = 0;
      if (toTermId) {
        const { data: structs } = await supabase
          .from("fee_structures")
          .select("class_id, is_boarder")
          .eq("school_id", schoolId)
          .eq("term_id", toTermId);
        const have = new Set((structs ?? []).map((s) => `${s.class_id}|${s.is_boarder}`));
        for (const s of studs ?? []) {
          const form = (s as any).classes?.form ?? 0;
          if (form >= 4) continue;
          // we won't know the next class id; just count by current form distinct combos
        }
        // rough heuristic: count classes covered vs needed
        const { data: classes } = await supabase
          .from("classes")
          .select("id, form")
          .eq("school_id", schoolId);
        const needed = (classes ?? []).filter((c) => c.form >= 2).length * 2; // boarder + day
        structuresMissing = Math.max(0, needed - have.size);
      }
      return {
        total: studs?.length ?? 0,
        promoting,
        graduating,
        totalCarry,
        bursaryPledges,
        bursaryCount,
        structuresMissing,
        byForm: [...byForm.entries()].sort(([a], [b]) => a - b),
      };
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("run_promotion", {
        _school_id: schoolId,
        _from_term_id: effectiveFrom,
        _to_term_id: toTermId,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (r) => {
      setResult(r);
      setStep(3);
      qc.invalidateQueries();
      toast.success("Promotion completed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runsQ = useQuery({
    queryKey: ["promotion-runs", schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from("promotion_runs")
        .select(
          "id, students_promoted, balances_carried, status, notes, created_at, from_term:from_term_id(year, term), to_term:to_term_id(year, term)",
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  return (
    <>
      <PageHead
        eyebrow="End-of-term wizard"
        title="Promotion engine"
        sub="Bump forms, carry per-fund balances, generate new-term invoices and auto-apply standing bursary credits."
      />

      <Panel>
        <div className="flex items-center gap-3 text-[12px]">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${step >= (n as 1 | 2 | 3) ? "bg-forest text-white" : "bg-paper text-ink-soft border border-line"}`}
              >
                {n}
              </div>
              <span
                className={step === n ? "font-medium" : "text-ink-soft"}
              >
                {n === 1 ? "Select terms" : n === 2 ? "Review impact" : "Complete"}
              </span>
              {n < 3 && <ArrowRight className="h-3 w-3 text-ink-soft" />}
            </div>
          ))}
        </div>
      </Panel>

      {step === 1 && (
        <Panel title="Select source and target term">
          <div className="grid grid-cols-2 gap-4 max-w-[640px]">
            <F label="Promote from (closing term)">
              <select
                value={effectiveFrom}
                onChange={(e) => setFromTermId(e.target.value)}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]"
              >
                <option value="">Choose…</option>
                {(termsQ.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    Term {t.term}, {t.year} {t.is_active ? "· active" : t.is_closed ? "· closed" : ""}
                  </option>
                ))}
              </select>
            </F>
            <F label="Promote to (new term)">
              <select
                value={toTermId}
                onChange={(e) => setToTermId(e.target.value)}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]"
              >
                <option value="">Choose…</option>
                {(termsQ.data ?? [])
                  .filter((t) => t.id !== effectiveFrom)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      Term {t.term}, {t.year}
                    </option>
                  ))}
              </select>
            </F>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              disabled={!effectiveFrom || !toTermId}
              onClick={() => setStep(2)}
              className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-50"
            >
              Continue
            </button>
          </div>
          <p className="mt-4 text-[11.5px] text-ink-soft max-w-[640px]">
            If the target term doesn't exist yet, create it in <a className="underline" href="/settings">Settings</a> first.
            Fee structures for the new term should be drafted in <a className="underline" href="/fees">Fee collection</a> before running,
            otherwise students will receive carry-forward-only invoices.
          </p>
        </Panel>
      )}

      {step === 2 && previewQ.data && (
        <>
          <Panel title="Impact preview">
            <div className="grid grid-cols-4 gap-3">
              <Kpi
                icon={<ArrowRight className="h-4 w-4" />}
                label="To be promoted"
                value={String(previewQ.data.promoting)}
              />
              <Kpi
                icon={<GraduationCap className="h-4 w-4" />}
                label="Graduating (Form 4)"
                value={String(previewQ.data.graduating)}
              />
              <Kpi
                icon={<Wallet className="h-4 w-4" />}
                label="Balances carried fwd"
                value={kes(previewQ.data.totalCarry)}
              />
              <Kpi
                icon={<HandCoins className="h-4 w-4" />}
                label="Bursary credits queued"
                value={`${previewQ.data.bursaryCount} · ${kes(previewQ.data.bursaryPledges)}`}
              />
            </div>

            <div className="mt-5">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brass">
                By form
              </div>
              <table className="w-full text-[12.5px]">
                <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="py-2 px-2 text-left">Current form</th>
                    <th className="px-2 text-right">Students</th>
                    <th className="px-2 text-right font-mono">Carry forward</th>
                    <th className="px-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previewQ.data.byForm.map(([form, info]: any) => (
                    <tr key={form} className="border-b border-line">
                      <td className="py-1.5 px-2">Form {form}</td>
                      <td className="px-2 text-right">{info.count}</td>
                      <td className="px-2 text-right font-mono">{kes(info.carry)}</td>
                      <td className="px-2">
                        {info.graduating ? (
                          <Pill kind="credit">Graduate → alumni</Pill>
                        ) : (
                          <Pill kind="ok">Promote to Form {form + 1}</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewQ.data.structuresMissing > 0 && (
              <div className="mt-4 rounded-md border border-amber-light bg-amber-light/40 px-3 py-2 text-[12px]">
                ⚠ {previewQ.data.structuresMissing} fee structure combinations not yet defined for the new term.
                Those students will get carry-forward-only invoices.
              </div>
            )}
          </Panel>

          <Panel>
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] text-ink-soft max-w-[520px]">
                Running will close the source term, activate the target term, bump every student's class,
                snapshot balances per fund into opening invoices and apply any standing bursary pledges.
                The action is logged in the audit trail.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-md border border-line-strong px-3 py-2 text-[13px]"
                >
                  Back
                </button>
                <button
                  onClick={() => run.mutate()}
                  disabled={run.isPending}
                  className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-50"
                >
                  {run.isPending ? "Running…" : "Run promotion"}
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}

      {step === 3 && result && (
        <Panel title="Promotion completed">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-forest mt-0.5" />
            <div className="text-[13px]">
              <div>
                Promoted <strong>{result.promoted}</strong> students,
                graduated <strong>{result.graduated}</strong>,
                generated <strong>{result.invoices_created}</strong> new-term invoices.
              </div>
              <div className="mt-1 text-ink-soft">
                Bursary credits applied: {kes(Number(result.bursary_applied ?? 0))}.
              </div>
            </div>
          </div>
          <div className="mt-5">
            <button
              onClick={() => {
                setStep(1);
                setFromTermId("");
                setToTermId("");
                setResult(null);
              }}
              className="rounded-md border border-line-strong px-3 py-2 text-[13px]"
            >
              Done
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Previous promotion runs">
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-2 px-2 text-left">When</th>
              <th className="px-2 text-left">From</th>
              <th className="px-2 text-left">To</th>
              <th className="px-2 text-right">Promoted</th>
              <th className="px-2 text-right font-mono">Carried</th>
              <th className="px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(runsQ.data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-line">
                <td className="py-2 px-2">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-2">
                  T{r.from_term?.term}/{r.from_term?.year}
                </td>
                <td className="px-2">
                  T{r.to_term?.term}/{r.to_term?.year}
                </td>
                <td className="px-2 text-right">{r.students_promoted}</td>
                <td className="px-2 text-right font-mono">{kes(Number(r.balances_carried))}</td>
                <td className="px-2">
                  <Pill kind={r.status === "completed" ? "ok" : "pending"}>{r.status}</Pill>
                </td>
              </tr>
            ))}
            {!runsQ.data?.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-soft">
                  No promotion runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-3">
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wide text-ink-soft">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[16px]">{value}</div>
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
