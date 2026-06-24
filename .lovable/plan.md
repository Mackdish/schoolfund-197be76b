## Phase 6 — Scope

Building four module groups in this order. Cashbook printout, Payment Voucher PDF, and Government Funding are **deferred** until you upload their templates.

---

## 1. IPSAS Annual Report (from your `.docx` template)

The uploaded Ministry of Education template is the source of truth. I'll replicate every statement and note exactly as printed, populated from live ledger data.

**Statements generated** (one PDF + one Excel workbook per FY):
- Cover page (school name, county, sub-county, FY, principal/BoM signatures)
- Statement of Financial Performance (income & expenditure by vote head)
- Statement of Financial Position (assets, liabilities, fund balances)
- Statement of Changes in Net Assets
- Statement of Cash Flows (direct method)
- Statement of Comparison of Budget and Actual Amounts
- Notes to the Financial Statements (capitation, fees, expenses by category, payables, receivables, cash & equivalents)
- Appendices (progress on prior-year audit recommendations placeholder)

**Engine**: a single SQL function `build_ipsas_report(_school_id, _fy_start, _fy_end)` aggregates journal lines into a JSONB payload per statement. A TS PDF generator (`jspdf` + `jspdf-autotable`) renders pages 1:1 with the template. Excel uses `xlsx` with one sheet per statement matching the template's column structure.

**FY**: July 1 → June 30 (configurable per school). New `financial_years` table tracks open/closed FYs; closing an FY locks transactions.

**Route**: `/ipsas` — pick FY, preview each statement on-screen, download PDF / Excel, print.

---

## 2. Suppliers + Payroll + linked Payment Vouchers

### Suppliers
- New table `suppliers` (name, contact, phone, email, address, KRA PIN, bank name/branch/account, category, opening balance, is_active)
- Route `/suppliers` with: list, create, edit, soft-delete, statement view, ledger view, outstanding balance, payment history
- Existing payment voucher form gets a "Supplier" selector (radio: Employee / Supplier / Other payee) that auto-fills payee, account no, bank
- Supplier statement = list of supplier invoices + linked PV payments + running balance, exportable to PDF

### Staff & Payroll (simple gross→net per your choice)
- New tables: `staff` (employee_no, full_name, position, department, employment_date, national_id, phone, gross_salary, bank, account_no, is_active), `payroll_runs` (period_month, status, totals), `payroll_lines` (staff_id, gross, deductions JSONB, net, voucher_id)
- Route `/payroll` with: staff register CRUD, monthly payroll run (auto-creates one line per active staff member with their gross + editable deduction rows you key in, totals, post → creates one PV per staff or a consolidated PV per your toggle), payslip PDF per staff, payroll register printout, payroll ledger view
- Posting a payroll run auto-creates draft PVs which flow through the existing `post_voucher` → cashbook → ledger pipeline

### PV linking
- Existing `payment_vouchers` table gets nullable `supplier_id` and `staff_id` columns; existing PV form & list show supplier/staff badges
- PV PDF/print stays on the simple format already shipped until you upload the real PV template — then I'll rebuild to match

---

## 3. Fee Statements + Enhanced Receipts

### Fee statements
- New route `/students/$id/statement` and a bulk statements screen
- Per-student statement shows: student bio, current term + fee structure applied (per vote head), all invoices for the term, all payments (with method/ref/date), bursaries applied, opening balance carried forward, closing balance
- PDF export with school branding (reusing existing receipt branding system); printable; "email to parent" is a stub button for now

### Enhanced receipts
- Existing receipt PDF (`src/lib/receipt-pdf.ts`) extended to also fetch and display:
  - Total fees expected (current term)
  - Total paid to date (term)
  - Outstanding balance after this payment
  - Vote-head breakdown of the payment if it was allocated
- Receipt header continues to use the school logo & footer from Settings

---

## 4. Bulk Data Import

- New route `/import` with tabs: Students, Staff, Suppliers, Fee Structures, Opening Balances (Govt Funding deferred with its module)
- Per entity: "Download .xlsx template" button → drag-drop or pick `.xlsx`/`.csv` → parse with `xlsx` in-browser → preview table with row-level validation (required fields, FK existence, numeric ranges, duplicates by natural key) → "Import valid rows" posts in batches to a SQL function that upserts and reports counts
- Errors shown inline per row with downloadable error-report CSV
- Each import writes a row to a new `import_runs` table (entity, file_name, ok_count, error_count, ran_by)

---

## Technical Details

**New tables**: `financial_years`, `suppliers`, `staff`, `payroll_runs`, `payroll_lines`, `import_runs`. Each gets RLS scoped to school members, GRANTs to authenticated + service_role, `created_at`/`updated_at` triggers, and `is_demo` for the seed-data system.

**New SQL functions**: `build_ipsas_report`, `close_financial_year`, `next_supplier_no`, `process_payroll_run`, `bulk_import_students`, `bulk_import_staff`, `bulk_import_suppliers`, `bulk_import_fee_structures`, `bulk_import_opening_balances`.

**New libs**: `src/lib/ipsas-pdf.ts`, `src/lib/ipsas-excel.ts`, `src/lib/payslip-pdf.ts`, `src/lib/statement-pdf.ts`, `src/lib/import-parsers.ts`. Adding `xlsx` and `jspdf-autotable` packages.

**Existing files extended**: `src/components/app-shell.tsx` (nav for IPSAS, Suppliers, Payroll, Import), `src/routes/vouchers.tsx` (payee selector), `src/routes/receipting.tsx` & `src/lib/receipt-pdf.ts` (balance lines), seed function (sample suppliers + 5 staff + a payroll run).

**Demo seed**: `seed_demo_data` extended to add 8 sample suppliers, 5 staff, and one historic payroll run so the new screens aren't empty for new schools.

---

## Build order (4 turns)

1. Migration: all new tables + functions + grants + RLS. Wait for approval.
2. IPSAS engine + UI + PDF/Excel exports.
3. Suppliers + Staff + Payroll routes, PV payee selector, statement & payslip PDFs.
4. Fee statements, enhanced receipts, bulk import UI.

Reply **go** to start with the migration, or tell me what to adjust.