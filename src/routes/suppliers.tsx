import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { kes } from "@/lib/money";
import { Plus, Pencil, Trash2, FileText, Users } from "lucide-react";

export const Route = createFileRoute("/suppliers")({
  head: () => ({ meta: [
    { title: "Suppliers — EduTech" },
    { name: "description", content: "Manage school suppliers, payment history and balances in EduTech." },
    { property: "og:title", content: "Suppliers — EduTech" },
    { property: "og:description", content: "Manage school suppliers, payment history and balances in EduTech." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }
  ] }),
  component: () => <AppShell><SuppliersPage /></AppShell>,
});

function SuppliersPage() {
  const { school } = useAuth();
  const schoolId = school!.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [viewStmt, setViewStmt] = useState<any | null>(null);
  const [query, setQuery] = useState("");

  const suppliersQ = useQuery({
    queryKey: ["suppliers", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers" as any).select("*").eq("school_id", schoolId).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers" as any).update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Supplier archived"); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (suppliersQ.data ?? []).filter((s) =>
    !query || [s.name, s.supplier_no, s.kra_pin, s.phone].filter(Boolean).some((x: string) => x.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <>
      <PageHead eyebrow="Procurement" title="Suppliers" sub="Manage vendor register, KRA PINs, bank details and statements"
        right={<button onClick={() => setEdit({})} className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-[13px] font-medium text-white hover:bg-[#163F31]">
          <Plus className="h-3.5 w-3.5" /> New supplier
        </button>}
      />
      <Panel>
        <div className="mb-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name / PIN / phone"
            className="w-full max-w-md rounded-md border border-line-strong bg-surface px-3 py-2 text-[13px]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2 px-2 text-left">Code</th>
                <th className="px-2 text-left">Name</th>
                <th className="px-2 text-left">Category</th>
                <th className="px-2 text-left">KRA PIN</th>
                <th className="px-2 text-left">Phone</th>
                <th className="px-2 text-left">Bank</th>
                <th className="px-2 text-right">Opening bal.</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={`border-b border-line ${!s.is_active ? "opacity-50" : ""}`}>
                  <td className="py-2 px-2 font-mono text-[12px]">{s.supplier_no}</td>
                  <td className="px-2 font-medium">{s.name}{s.contact_person && <div className="text-[11px] text-ink-soft">{s.contact_person}</div>}</td>
                  <td className="px-2">{s.category ?? "—"}</td>
                  <td className="px-2 font-mono text-[11.5px]">{s.kra_pin ?? "—"}</td>
                  <td className="px-2 font-mono text-[11.5px]">{s.phone ?? "—"}</td>
                  <td className="px-2 text-[11.5px]">{[s.bank_name, s.bank_account].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-2 text-right font-mono">{kes(s.opening_balance)}</td>
                  <td className="px-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setViewStmt(s)} title="Statement" className="text-ink-soft hover:text-forest"><FileText className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEdit(s)} title="Edit" className="text-ink-soft hover:text-forest"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm(`Archive supplier ${s.name}?`)) del.mutate(s.id); }} title="Archive" className="text-ink-soft hover:text-garnet"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={8} className="py-10 text-center text-ink-soft">
                  <Users className="mx-auto h-5 w-5 opacity-50" />
                  <div className="mt-1">No suppliers yet. Add one to start tracking purchases.</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {edit && <SupplierDialog schoolId={schoolId} supplier={edit} onClose={() => setEdit(null)} />}
      {viewStmt && <StatementDialog schoolId={schoolId} supplier={viewStmt} onClose={() => setViewStmt(null)} />}
    </>
  );
}

function SupplierDialog({ schoolId, supplier, onClose }: { schoolId: string; supplier: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!supplier?.id;
  const [f, setF] = useState({
    name: supplier?.name ?? "",
    contact_person: supplier?.contact_person ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    kra_pin: supplier?.kra_pin ?? "",
    bank_name: supplier?.bank_name ?? "",
    bank_branch: supplier?.bank_branch ?? "",
    bank_account: supplier?.bank_account ?? "",
    category: supplier?.category ?? "",
    opening_balance: supplier?.opening_balance ?? 0,
    notes: supplier?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error("Name required");
      if (isEdit) {
        const { error } = await supabase.from("suppliers" as any).update(f).eq("id", supplier.id);
        if (error) throw error;
      } else {
        const { data: noData } = await supabase.rpc("next_supplier_no" as any, { _school_id: schoolId });
        const { error } = await supabase.from("suppliers" as any).insert({ ...f, school_id: schoolId, supplier_no: noData as string });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["suppliers"] }); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader><DialogTitle>{isEdit ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *" className="col-span-2"><input className="sf-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Contact person"><input className="sf-input" value={f.contact_person} onChange={(e) => setF({ ...f, contact_person: e.target.value })} /></Field>
          <Field label="Category"><input className="sf-input" placeholder="Goods / Services / Utilities" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label="Phone"><input className="sf-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email"><input className="sf-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Address" className="col-span-2"><input className="sf-input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="KRA PIN"><input className="sf-input font-mono" value={f.kra_pin} onChange={(e) => setF({ ...f, kra_pin: e.target.value })} /></Field>
          <Field label="Opening balance (KES)"><input className="sf-input" type="number" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: Number(e.target.value) })} /></Field>
          <Field label="Bank"><input className="sf-input" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></Field>
          <Field label="Branch"><input className="sf-input" value={f.bank_branch} onChange={(e) => setF({ ...f, bank_branch: e.target.value })} /></Field>
          <Field label="Account number" className="col-span-2"><input className="sf-input font-mono" value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} /></Field>
          <Field label="Notes" className="col-span-2"><textarea className="sf-input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-md bg-forest px-4 py-2 text-[13px] font-medium text-white">
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatementDialog({ schoolId, supplier, onClose }: { schoolId: string; supplier: any; onClose: () => void }) {
  const stmtQ = useQuery({
    queryKey: ["supplier-stmt", supplier.id],
    queryFn: async () => {
      const { data } = await supabase.from("payment_vouchers")
        .select("voucher_no, paid_on, amount, status, method, reference, memo, funds(name), vote_heads(name)")
        .eq("school_id", schoolId).eq("supplier_id", supplier.id).order("paid_on", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  const totalPaid = (stmtQ.data ?? []).filter((v) => v.status === "paid").reduce((a, b: any) => a + Number(b.amount), 0);
  const totalPending = (stmtQ.data ?? []).filter((v) => v.status !== "paid" && v.status !== "cancelled").reduce((a, b: any) => a + Number(b.amount), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{supplier.name} — Statement</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Opening balance</span><div className="mt-1 font-mono">{kes(supplier.opening_balance)}</div></div>
          <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Paid YTD</span><div className="mt-1 font-mono text-forest">{kes(totalPaid)}</div></div>
          <div className="rounded-md border border-line bg-paper px-3 py-2"><span className="text-ink-soft">Pending</span><div className="mt-1 font-mono text-brass">{kes(totalPending)}</div></div>
        </div>
        <div className="mt-3 max-h-[360px] overflow-y-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-2 px-2 text-left">Date</th>
                <th className="px-2 text-left">Voucher</th>
                <th className="px-2 text-left">Memo</th>
                <th className="px-2 text-left">Status</th>
                <th className="px-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(stmtQ.data ?? []).map((v) => (
                <tr key={v.voucher_no} className="border-b border-line">
                  <td className="py-1.5 px-2">{v.paid_on}</td>
                  <td className="px-2 font-mono">{v.voucher_no}</td>
                  <td className="px-2">{v.memo ?? v.vote_heads?.name ?? "—"}</td>
                  <td className="px-2 uppercase text-[11px]">{v.status}</td>
                  <td className="px-2 text-right font-mono">{kes(v.amount)}</td>
                </tr>
              ))}
              {!stmtQ.data?.length && <tr><td colSpan={5} className="py-6 text-center text-ink-soft">No transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-md border border-line-strong px-3 py-2 text-[13px]">Close</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className ?? ""}`}>
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
    {children}
  </label>;
}
