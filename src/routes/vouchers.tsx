import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { Plus, CheckCircle2, FileText, Printer } from "lucide-react";

export const Route = createFileRoute("/vouchers")({
  head: () => ({ meta: [{ title: "Payment vouchers — SomaFin" }] }),
  component: () => <AppShell><VouchersPage /></AppShell>,
});

const METHODS = ["cash", "cheque", "bank_transfer", "mpesa", "kcb", "equity"] as const;

function VouchersPage() {
  const { school, roles, user } = useAuth();
  const schoolId = school!.id;
  const canWrite = roles.includes("bursar") || roles.includes("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const vouchersQ = useQuery({
    queryKey: ["vouchers", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_vouchers")
        .select("id, voucher_no, payee, amount, paid_on, method, reference, memo, status, fund_id, vote_head_id, funds(name), vote_heads(code,name)")
        .eq("school_id", schoolId)
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("funds").select("id, code, name").eq("school_id", schoolId).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const voteHeadsQ = useQuery({
    queryKey: ["vote-heads", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vote_heads").select("id, code, name, fund_id").eq("school_id", schoolId).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "paid" | "cancelled" }) => {
      const patch: any = { status };
      if (status === "approved" || status === "paid") patch.approved_by = user?.id;
      const { error } = await supabase.from("payment_vouchers").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      toast.success(`Voucher ${v.status}`);
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["fund-balances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totals = (vouchersQ.data ?? []).reduce(
    (acc, v) => {
      acc.count++;
      if (v.status === "paid") acc.paid += Number(v.amount);
      else if (v.status === "draft" || v.status === "approved") acc.pending += Number(v.amount);
      return acc;
    },
    { count: 0, paid: 0, pending: 0 },
  );

  return (
    <>
      <PageHead
        eyebrow="Disbursements"
        title="Payment vouchers"
        sub="Authorize and post outgoing payments. Paid vouchers automatically hit the cashbook and ledger."
        right={canWrite ? (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
            <Plus className="h-3.5 w-3.5" /> New voucher
          </button>
        ) : <Pill kind="pending">Read-only</Pill>}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Vouchers" value={String(totals.count)} />
        <Stat label="Paid" value={kes(totals.paid)} tone="ok" />
        <Stat label="Pending approval / payment" value={kes(totals.pending)} tone="pending" />
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2.5 px-2 text-left">Voucher</th>
                <th className="px-2 text-left">Date</th>
                <th className="px-2 text-left">Payee</th>
                <th className="px-2 text-left">Fund / Vote head</th>
                <th className="px-2 text-left">Method</th>
                <th className="px-2 text-right font-mono">Amount</th>
                <th className="px-2">Status</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {(vouchersQ.data ?? []).map((v) => (
                <tr key={v.id} className="border-b border-line">
                  <td className="py-2.5 px-2 font-mono text-[12px]">{v.voucher_no}</td>
                  <td className="px-2">{v.paid_on}</td>
                  <td className="px-2 font-medium">{v.payee}{v.reference && <div className="text-[11px] text-ink-soft font-mono">{v.reference}</div>}</td>
                  <td className="px-2">
                    <div>{v.funds?.name ?? "—"}</div>
                    {v.vote_heads && <div className="text-[11px] text-ink-soft"><span className="font-mono">{v.vote_heads.code}</span> · {v.vote_heads.name}</div>}
                  </td>
                  <td className="px-2 capitalize">{v.method.replace("_", " ")}</td>
                  <td className="px-2 text-right font-mono">{kes(v.amount)}</td>
                  <td className="px-2">
                    {v.status === "paid" ? <Pill kind="ok">Paid</Pill>
                      : v.status === "approved" ? <Pill kind="partial">Approved</Pill>
                      : v.status === "cancelled" ? <Pill kind="arrears">Cancelled</Pill>
                      : <Pill kind="credit">Draft</Pill>}
                  </td>
                  <td className="px-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      {canWrite && v.status === "draft" && (
                        <button onClick={() => setStatus.mutate({ id: v.id, status: "approved" })} className="text-forest hover:underline text-[11.5px]">Approve</button>
                      )}
                      {canWrite && (v.status === "draft" || v.status === "approved") && (
                        <button onClick={() => { if (confirm(`Mark ${v.voucher_no} as paid? This posts to the cashbook and ledger.`)) setStatus.mutate({ id: v.id, status: "paid" }); }} className="inline-flex items-center gap-1 text-[11.5px] text-forest hover:underline">
                          <CheckCircle2 className="h-3 w-3" /> Pay
                        </button>
                      )}
                      <button onClick={() => printVoucher(v, school)} title="Print" className="text-ink-soft hover:text-ink">
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!vouchersQ.data?.length && (
                <tr><td colSpan={8} className="py-10 text-center text-ink-soft">
                  <FileText className="mx-auto h-5 w-5 opacity-50" />
                  <div className="mt-1">No vouchers yet. Click "New voucher" to record a disbursement.</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {open && (
        <NewVoucherDialog
          onClose={() => setOpen(false)}
          schoolId={schoolId}
          funds={fundsQ.data ?? []}
          voteHeads={voteHeadsQ.data ?? []}
          userId={user?.id}
        />
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "pending" }) {
  const colour = tone === "ok" ? "text-forest" : tone === "pending" ? "text-brass" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-soft">{label}</div>
      <div className={`mt-1 font-serif text-[20px] ${colour}`}>{value}</div>
    </div>
  );
}

function NewVoucherDialog({
  onClose, schoolId, funds, voteHeads, userId,
}: { onClose: () => void; schoolId: string; funds: any[]; voteHeads: any[]; userId?: string }) {
  const qc = useQueryClient();
  const [payeeType, setPayeeType] = useState<"supplier" | "staff" | "other">("other");
  const [supplierId, setSupplierId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [fundId, setFundId] = useState("");
  const [voteHeadId, setVoteHeadId] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [payNow, setPayNow] = useState(false);

  const suppliersQ = useQuery({
    queryKey: ["suppliers-pick", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers" as any).select("id, name, bank_account, bank_name").eq("school_id", schoolId).eq("is_active", true).order("name");
      return (data ?? []) as any[];
    },
  });
  const staffQ = useQuery({
    queryKey: ["staff-pick", schoolId],
    queryFn: async () => {
      const { data } = await supabase.from("staff" as any).select("id, full_name, employee_no, bank_account, bank_name").eq("school_id", schoolId).eq("is_active", true).order("full_name");
      return (data ?? []) as any[];
    },
  });

  const filteredVH = voteHeads.filter((v) => !fundId || v.fund_id === fundId);

  const create = useMutation({
    mutationFn: async () => {
      const { data: nextNo, error: eN } = await supabase.rpc("next_voucher_no", { _school_id: schoolId });
      if (eN) throw eN;
      const { error } = await (supabase.from("payment_vouchers") as any).insert({
        school_id: schoolId,
        fund_id: fundId,
        vote_head_id: voteHeadId || null,
        supplier_id: payeeType === "supplier" ? supplierId || null : null,
        staff_id: payeeType === "staff" ? staffId || null : null,
        voucher_no: nextNo as unknown as string,
        payee: payee.trim(),
        amount: Number(amount),
        paid_on: paidOn,
        method,
        reference: reference || null,
        memo: memo || null,
        status: payNow ? "paid" : "draft",
        prepared_by: userId,
        approved_by: payNow ? userId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(payNow ? "Voucher created & posted" : "Voucher saved as draft");
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["fund-balances"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disabled = !fundId || !payee.trim() || !Number(amount) || create.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New payment voucher</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fund">
            <select className="sf-input" value={fundId} onChange={(e) => { setFundId(e.target.value); setVoteHeadId(""); }}>
              <option value="">Select fund…</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Vote head (optional)">
            <select className="sf-input" value={voteHeadId} onChange={(e) => setVoteHeadId(e.target.value)} disabled={!fundId}>
              <option value="">—</option>
              {filteredVH.map((v) => <option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}
            </select>
          </Field>
          <Field label="Payee" className="col-span-2">
            <input className="sf-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Kenya Power & Lighting Co." />
          </Field>
          <Field label="Amount (KES)">
            <input className="sf-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Date">
            <input className="sf-input" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Method">
            <select className="sf-input" value={method} onChange={(e) => setMethod(e.target.value as any)}>
              {METHODS.map((m) => <option key={m} value={m} className="capitalize">{m.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Reference / cheque no.">
            <input className="sf-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="CHQ-00421" />
          </Field>
          <Field label="Memo" className="col-span-2">
            <textarea className="sf-input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="June electricity bill" />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
            Mark as paid immediately (posts to cashbook & ledger)
          </label>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
          <button onClick={() => create.mutate()} disabled={disabled} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60">
            {create.isPending ? "Saving…" : payNow ? "Create & post" : "Save draft"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function printVoucher(v: any, school: any) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  w.document.write(`
    <html><head><title>${v.voucher_no}</title>
    <style>
      body{font-family:Georgia,serif;padding:40px;color:#111}
      h1{font-size:18px;margin:0}
      .meta{margin-top:4px;font-size:12px;color:#555}
      table{width:100%;margin-top:24px;border-collapse:collapse;font-size:13px}
      td{padding:8px 4px;border-bottom:1px solid #ddd}
      .lab{color:#666;width:35%}
      .amt{font-size:22px;font-weight:bold;margin-top:24px;text-align:right}
      .sig{margin-top:60px;display:flex;justify-content:space-between;font-size:12px}
      .sig div{border-top:1px solid #333;padding-top:6px;width:40%}
    </style></head><body>
      <h1>${school?.name ?? "School"}</h1>
      <div class="meta">${school?.address ?? ""}${school?.code ? " · Reg " + school.code : ""}</div>
      <h2 style="margin-top:28px;font-size:15px">Payment Voucher · ${v.voucher_no}</h2>
      <table>
        <tr><td class="lab">Date</td><td>${v.paid_on}</td></tr>
        <tr><td class="lab">Payee</td><td>${v.payee}</td></tr>
        <tr><td class="lab">Fund</td><td>${v.funds?.name ?? ""}</td></tr>
        <tr><td class="lab">Vote head</td><td>${v.vote_heads ? v.vote_heads.code + " — " + v.vote_heads.name : "—"}</td></tr>
        <tr><td class="lab">Method</td><td>${v.method}</td></tr>
        <tr><td class="lab">Reference</td><td>${v.reference ?? "—"}</td></tr>
        <tr><td class="lab">Memo</td><td>${v.memo ?? "—"}</td></tr>
        <tr><td class="lab">Status</td><td>${v.status.toUpperCase()}</td></tr>
      </table>
      <div class="amt">KES ${Number(v.amount).toLocaleString()}</div>
      <div class="sig"><div>Prepared by</div><div>Approved by</div></div>
      <script>window.print()</script>
    </body></html>
  `);
  w.document.close();
}
