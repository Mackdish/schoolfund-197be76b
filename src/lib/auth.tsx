import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type Role = "admin" | "bursar" | "principal" | "board";

export type School = {
  id: string;
  name: string;
  code: string | null;
  county: string | null;
  motto: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  receipt_footer?: string | null;
};

type Ctx = {
  loading: boolean;
  user: User | null;
  profile: { id: string; full_name: string | null; email: string | null; active_school_id: string | null } | null;
  school: School | null;
  roles: Role[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Ctx["profile"]>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const qc = useQueryClient();

  const loadProfile = async (u: User) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, full_name, email, active_school_id")
      .eq("id", u.id)
      .maybeSingle();
    setProfile(prof ?? null);

    if (prof?.active_school_id) {
      const [{ data: s }, { data: rs }] = await Promise.all([
        supabase.from("schools").select("id,name,code,county,motto,address,phone,email,logo_url,receipt_footer").eq("id", prof.active_school_id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id).eq("school_id", prof.active_school_id),
      ]);
      setSchool((s as School) ?? null);
      setRoles((rs ?? []).map((r) => r.role as Role));
    } else {
      // pick first school the user has a role on
      const { data: rs } = await supabase
        .from("user_roles")
        .select("school_id, role, schools(id,name,code,county,motto,address,phone,email,logo_url,receipt_footer)")
        .eq("user_id", u.id)
        .limit(1);
      const first = rs?.[0];
      if (first?.schools) {
        const s = first.schools as unknown as School;
        setSchool(s);
        setRoles([first.role as Role]);
        await supabase.from("profiles").update({ active_school_id: s.id }).eq("id", u.id);
      } else {
        setSchool(null);
        setRoles([]);
      }
    }
  };

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    setUser(u);
    if (u) await loadProfile(u);
    else {
      setProfile(null);
      setSchool(null);
      setRoles([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_IN" || evt === "SIGNED_OUT" || evt === "USER_UPDATED") {
        refresh();
        if (evt !== "SIGNED_OUT") qc.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ loading, user, profile, school, roles, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
