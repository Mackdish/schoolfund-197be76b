import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_funds",
  title: "List funds",
  description: "List the school's funds with bank details and opening balances.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.from("funds").select("code, name, bank_name, bank_account_no, opening_balance");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const funds = (data ?? []).map((f) => ({
      code: f.code, name: f.name, bank_name: f.bank_name, bank_account_no: f.bank_account_no,
      opening_balance: Number(f.opening_balance),
    }));
    return { content: [{ type: "text", text: JSON.stringify(funds) }], structuredContent: { funds } };
  },
});
