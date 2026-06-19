import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const DEFAULT_VOTE_HEADS: Record<"tuition" | "operations" | "school_fund", { code: string; name: string }[]> = {
  tuition: [
    { code: "TUI", name: "Tuition" },
    { code: "EXM", name: "Examinations" },
  ],
  operations: [
    { code: "OPS-ADMIN", name: "Administration" },
    { code: "OPS-MAINT", name: "Repairs & Maintenance" },
    { code: "OPS-UTIL", name: "Electricity & Water" },
  ],
  school_fund: [
    { code: "SF-BOARD", name: "Boarding" },
    { code: "SF-ACT", name: "Co-curricular" },
    { code: "SF-MED", name: "Medical" },
    { code: "SF-LUNCH", name: "Lunch programme" },
  ],
};

export function OnboardingWizard() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [county, setCounty] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { data: newSchoolId, error: e1 } = await supabase.rpc("create_school", {
        _name: name,
        _code: code || null,
        _county: county || null,
      });
      if (e1) throw e1;
      const school = { id: newSchoolId as unknown as string };

      // bursar role for creator (admin role is auto-granted by create_school)
      const { error: e2 } = await supabase
        .from("user_roles")
        .insert([{ user_id: user.id, school_id: school.id, role: "bursar" }]);
      if (e2) throw e2;


      // three statutory funds
      const { data: funds, error: e3 } = await supabase
        .from("funds")
        .insert([
          { school_id: school.id, code: "tuition", name: "Tuition Account" },
          { school_id: school.id, code: "operations", name: "Operations Account" },
          { school_id: school.id, code: "school_fund", name: "School Fund Account" },
        ])
        .select("id, code");
      if (e3) throw e3;

      // vote heads per fund
      const voteRows = (funds ?? []).flatMap((f) => {
        const defs = DEFAULT_VOTE_HEADS[f.code as keyof typeof DEFAULT_VOTE_HEADS];
        return defs.map((d) => ({
          school_id: school.id,
          fund_id: f.id,
          code: d.code,
          name: d.name,
        }));
      });
      if (voteRows.length) {
        const { error: e4 } = await supabase.from("vote_heads").insert(voteRows);
        if (e4) throw e4;
      }

      // seed current term
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const term: "1" | "2" | "3" = month <= 4 ? "1" : month <= 8 ? "2" : "3";
      await supabase.from("terms").insert({
        school_id: school.id,
        year,
        term,
        start_date: `${year}-01-15`,
        end_date: `${year}-04-15`,
        is_active: true,
      });

      // four classes
      await supabase.from("classes").insert(
        ([1, 2, 3, 4] as const).flatMap((form) =>
          ["A", "B"].map((stream) => ({ school_id: school.id, form, stream })),
        ),
      );

      toast.success("School ready. Welcome to SomaFin.");
      await refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper px-4 py-12 flex items-center justify-center">
      <div className="w-full max-w-[520px]">
        <div className="mb-7 text-center">
          <div className="sf-seal mx-auto flex h-12 w-12 items-center justify-center">
            <span className="font-serif text-base font-semibold text-brass">SF</span>
          </div>
          <h1 className="mt-4 font-serif text-[24px]">Set up your school</h1>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            We'll provision the three statutory funds, default vote heads, four forms and the current term.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-[10px] border border-line bg-surface px-7 py-6 space-y-4">
          <Field label="School name">
            <input required value={name} onChange={(e) => setName(e.target.value)} className="sf-input" placeholder="Tumaini Boys Secondary School" />
          </Field>
          <Field label="County">
            <input value={county} onChange={(e) => setCounty(e.target.value)} className="sf-input" placeholder="Nyeri" />
          </Field>
          <Field label="BOM / registration code">
            <input value={code} onChange={(e) => setCode(e.target.value)} className="sf-input" placeholder="KCB-44210" />
          </Field>

          <button
            disabled={busy}
            className="mt-2 w-full rounded-md bg-forest px-4 py-2.5 text-[13.5px] font-medium text-white hover:bg-[#163F31] disabled:opacity-60"
          >
            {busy ? "Provisioning…" : "Create school & continue"}
          </button>
        </form>
      </div>
      <style>{`.sf-input{width:100%;border:1px solid #D5DAD3;background:#fff;border-radius:6px;padding:9px 11px;font-size:13.5px;font-family:inherit;outline:none;}.sf-input:focus{border-color:#1E5640;box-shadow:0 0 0 3px rgba(30,86,64,0.12)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
