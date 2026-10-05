import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHead, Panel, Pill } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { kes } from "@/lib/money";
import { toast } from "sonner";
import { Landmark, Save } from "lucide-react";

export const Route = createFileRoute("/funds")({
  head: () => ({ meta: [{ title: "Fund accounts — EduTech" }] }),
  component: () => (
    <AppShell>
      <FundsPage />
    </AppShell>
  ),
});

type FundRow = {
  id: string;
  code: "tuition" | "operations" | "school_fund";
  name: string;
  bank_name: string | null;
  bank_account_no: string | null;
  opening_balance: number;
};

const KIND_LABEL: Record<FundRow["code"], { eyebrow: string; pill: "ok" | "credit" | "pending" }> = {
  tuition: { eyebrow: "Statutory · Tuition", pill: "ok" },
  operations: { eyebrow: "Statutory · Operations", pill: "credit" },
  school_fund: { eyebrow: "Statutory · School Fund", pill: "pending" },
};

function FundsPage() {
  const { school } = useAuth();
  const schoolId = school!.id;

  const fundsQ = useQuery({
    queryKey: ["funds", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funds")
        .select("id, code, name, bank_name, bank_account_no, opening_balance")
        .eq("school_id", schoolId)
        .order("code");
      if (error) throw error;
      return (data ?? []) as FundRow[];
    },
  });

  const cbQ = useQuery({
    queryKey: ["funds-cb-totals", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashbook_entries")
        .select("fund_id, receipts, payments, reconciled")
        .eq("school_id", schoolId)
        .limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = (fundId: string) => {
    const rows = (cbQ.data ?? []).filter((e: any) => e.fund_id === fundId);
    const receipts = rows.reduce((s, r: any) => s + Number(r.receipts), 0);
    const payments = rows.reduce((s, r: any) => s + Number(r.payments), 0);
    const recon = rows.filter((r: any) => r.reconciled).reduce((s, r: any) => s + Number(r.receipts) - Number(r.payments), 0);
    return { receipts, payments, recon };
  };

  return (
    <>
      <PageHead
        eyebrow="Statutory funds"
        title="Fund accounts"
        sub="Tuition · Operations · School Fund — strictly segregated, each posted to its own ledger."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {(fundsQ.data ?? []).map((f) => {
          const t = totals(f.id);
          const balance = Number(f.opening_balance) + t.receipts - t.payments;
          const meta = KIND_LABEL[f.code];
          return (
            <div key={f.id} className="rounded-[10px] border border-line bg-surface px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-brass">{meta.eyebrow}</span>
                <Pill kind={meta.pill}>{f.code.replace("_", " ")}</Pill>
              </div>
              <div className="font-serif text-[17px]">{f.name}</div>
              <div className="mt-3 font-mono text-[22px]">{kes(balance)}</div>
              <div className="mt-1 text-[11.5px] text-ink-soft">Running balance</div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11.5px]">
                <Mini label="Receipts" value={kes(t.receipts)} />
                <Mini label="Payments" value={kes(t.payments)} />
                <Mini label="Opening" value={kes(Number(f.opening_balance))} />
                <Mini label="Reconciled" value={kes(t.recon)} />
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-soft">
                <Landmark className="h-3.5 w-3.5" />
                {f.bank_name ? `${f.bank_name} · ${f.bank_account_no ?? "—"}` : "Bank not set"}
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Bank details & opening balances" className="mt-4">
        <div className="space-y-3">
          {(fundsQ.data ?? []).map((f) => (
            <FundEditor key={f.id} fund={f} />
          ))}
        </div>
      </Panel>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

function FundEditor({ fund }: { fund: FundRow }) {
  const qc = useQueryClient();
  const [bankName, setBankName] = useState(fund.bank_name ?? "");
  const [acct, setAcct] = useState(fund.bank_account_no ?? "");
  const [opening, setOpening] = useState(String(fund.opening_balance ?? 0));

  useEffect(() => {
    setBankName(fund.bank_name ?? "");
    setAcct(fund.bank_account_no ?? "");
    setOpening(String(fund.opening_balance ?? 0));
  }, [fund.id, fund.bank_name, fund.bank_account_no, fund.opening_balance]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("funds")
        .update({
          bank_name: bankName || null,
          bank_account_no: acct || null,
          opening_balance: Number(opening) || 0,
        })
        .eq("id", fund.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${fund.name} updated`);
      qc.invalidateQueries({ queryKey: ["funds"] });
      qc.invalidateQueries({ queryKey: ["funds-cb-totals"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-12 items-end gap-3 rounded-md border border-line bg-paper px-3 py-3">
      <div className="col-span-3">
        <div className="text-[10.5px] uppercase tracking-wide text-ink-soft">Fund</div>
        <div className="text-[13px]">{fund.name}</div>
      </div>
      <Field className="col-span-3" label="Bank">
        <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="KCB" className="sf-input" />
      </Field>
      <Field className="col-span-3" label="Account no.">
        <input value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="1122334455" className="sf-input" />
      </Field>
      <Field className="col-span-2" label="Opening (KES)">
        <input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" className="sf-input font-mono" />
      </Field>
      <div className="col-span-1">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-forest bg-forest text-[12.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60"
          title="Save"
        >
          <Save className="h-3.5 w-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
