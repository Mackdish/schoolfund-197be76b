import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchStudents from "./tools/search-students";
import studentBalance from "./tools/student-balance";
import recentPayments from "./tools/recent-payments";
import fundBalances from "./tools/fund-balances";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "remix-of-remix-of-remix-of-school-ledger",
  title: "Remix of Remix of Remix of School Ledger",
  version: "0.1.0",
  instructions:
    "EduTech school treasury tools. Act as the signed-in bursar: search students, check fee balances, review recent payments and list funds. Amounts are in KES.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchStudents, studentBalance, recentPayments, fundBalances],
});
