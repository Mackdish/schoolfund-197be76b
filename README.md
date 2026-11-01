# Remix of Remix of Remix of School Ledger

SomaFin — Build Prompt for Lovable

Paste this whole document into Lovable as your first message. It is written as a single, self-contained spec: product context, data model, design system, and page-by-page functional requirements. Build in the phase order given at the bottom rather than all at once.

1. Product context (read this first, don't skip)

Build SomaFin, a treasury/accounting web app for Kenyan secondary schools, used by a school Bursar, Principal, and Board of Management (BOM) Treasurer.

The core domain constraint that drives almost every screen: Kenyan public secondary schools are legally required to operate three separate, restricted statutory fund bank accounts, and money cannot be informally moved between them:

Tuition Account — funded by tuition fees + government tuition capitation. Spend restricted to teaching/learning materials only. No virement out permitted.

Operations Account — funded by operations capitation (GoK). Spend covers non-teaching staff salaries, utilities, repairs, co-curricular, admin. Virement between expense lines allowed with CEB (County Education Board) approval.

School Fund Account — funded by boarding/lunch/transport fees and donations/harambee. Spend covers boarding, catering, transport, activities.

Every fee "vote head" (tuition, boarding, transport, activity, exam fee, etc.) is pre-mapped to exactly one fund and always posts to that fund, never split or moved. Every financial transaction must appear as a balanced double-entry journal entry within a single fund (debit = credit, no cross-fund postings) and roll up into a statutory cash book with receipt/payment vouchers, monthly balances brought-forward/carried-forward, and three signature lines (Bursar / Principal / BOM Treasurer).

Payments arrive via KCB Buni (bank payment gateway: M-Pesa, STK push, bank transfer, agent deposit, cash, cheque). Inbound deposits carry a reference that should auto-match to a student's admission number; unmatched deposits get flagged for manual resolution. Confirming a deposit auto-generates an official numbered receipt and an SMS notification text to the guardian.

At year/term end, a promotion engine moves students between classes/terms and automatically carries forward each student's per-fund balance (debit or credit) to their new class ledger, locks the closed term, and produces a BOM sign-off audit report.

Government/county/donor funding is tracked separately as capitation (quarterly disbursement against budget, ~25% of annual allocation per quarter, split between Tuition and Operations per MoE schedule) and bursaries/pledges (per-student, per-funder, status: pledged → disbursed → reconciled).

Keep this domain logic intact even as you build — it is not cosmetic, it's the product.

2. Tech stack

React + TypeScript + Tailwind + shadcn/ui (Lovable default)

Supabase for auth, database, and row-level security (roles: Bursar, Principal, BOM Treasurer, Auditor, Parent — see §6)

Recharts for all charts (line, donut/pie, grouped bar)

Use Supabase edge functions (or simple server logic) for: journal-balancing validation, fund-routing of vote heads, instalment auto-allocation, and the promotion carry-forward job

3. Design system (match exactly — this is a distinctive "ledger/treasury" aesthetic, not generic SaaS)

Mood: an institutional, slightly old-fashioned ledger/treasury feel — warm paper tones, brass/garnet/forest accent colors, dashed "stub" perforation lines, a wax-seal-style logo mark, monospace numerals. Not a flat modern fintech look.

Color tokens (use as CSS variables / Tailwind theme extension):

ink: #122019        ink-soft: #3A4A41
paper: #F6F4EE       surface: #FFFFFF
line: #E2DECF        line-strong: #CFC8AE
forest: #1E5B45      forest-light: #E6EFE8   (primary brand / "ok" state)
brass: #B8924F       brass-light: #F4EBD8    (accent, eyebrows, school-fund tag)
garnet: #9C3B3B      garnet-light: #F5E5E2   (debit / overdue / arrears)
teal: #2D7A72        teal-light: #E3EFEC     (credit / operations tag)
amber: #B07A2C       amber-light: #F6ECD7    (pending / warnings)


Typography:

Headings/serif accents: Fraunces (opsz/wght 500–650) — used for h1–h3, balance numbers, the logo monogram, receipt titles

Body/UI: Inter (400/500/600)

All monetary amounts, reference codes, dates-in-tables, account codes: IBM Plex Mono — this is a strict rule, never render a number in Inter

Signature components to build (don't substitute generic shadcn defaults without these details):

Ledger-stub fund card: a card split into a narrow colored "tab" (single letter monogram: T / O / S) and a body showing fund name, reference code, an animated count-up balance in Fraunces, then a horizontal dashed divider with small circular cutout notches at each end (like a ticket stub perforation), then a 2-line mini receipts/payments-MTD summary.

Drawer (student profile): slides in from the right, dark ink header with avatar, name, admission no., class, status pill, a 3-column balance strip (one column per fund), then body sections: Guardian, Quick actions, Recent activity timeline (dot + dashed connector style, outbound items in garnet).

Official receipt card: bordered card with a rotated circular "OFFICIAL RECEIPT" stamp graphic (dashed inner ring) top-right, Fraunces title, dashed-underline header, label/value rows in a mono value column, followed by a forest-tinted SMS preview box labeled "SMS to parent".

Cashbook sheet: centered letterhead (school name in Fraunces, "CASH BOOK" eyebrow in brass, period + account refs), balance-brought-forward row tinted brass, balance-carried-forward row tinted forest with a double top border, three signature blocks with underlines at the bottom ("Prepared by — Bursar", "Reviewed by — Principal", "Approved by — BOM Treasurer"). Must be printable (clean print stylesheet hiding nav/toolbars).

Journal entry table: entries grouped under a bold "head" row (date / JE number / narration / fund), with indented debit/credit lines below — debit amounts in garnet, credit amounts in teal, plus a small dot-legend.

Status pills: rounded, colored per state — arrears/overdue = garnet-light bg + garnet text, pending = amber-light/amber, ok/cleared = forest-light/forest, credit = teal-light/teal, partial = a muted purple (#EFE6F1 / #6B3F73).

Sidebar: dark ink background, brass-bordered circular seal/monogram logo with a dashed inner ring, active nav item gets a brass left-edge accent bar.

Build a design-tokens doc/theme file first so every screen consistently pulls from it.

4. Data model (Supabase tables — build these before UI)

schools (id, name, registration_no, nemis_code, kcb_account_refs jsonb)
users (id, school_id, name, role enum[bursar, principal, bom_treasurer, auditor, parent], email)
terms (id, school_id, label, year, term_number, status enum[open, closed], starts_on, ends_on)
classes (id, school_id, form_level, stream_label)  -- e.g. Form 4A
students (id, school_id, admission_no, name, class_id, status enum[active, transferred, graduated])
guardians (id, student_id, name, phone, relationship)

funds (id, school_id, code enum[tuition, operations, school_fund], name, permitted_use_note, virement_rule)
accounts (id, school_id, code, name, type enum[asset, income, expense], fund_id nullable)  -- chart of accounts, e.g. 1000 Cash & bank, 4000 Tuition fee income, 6100 Staffing expense
vote_heads (id, school_id, name, fund_id, default_amount, instalment_plan jsonb)  -- maps a billable item to exactly one fund

invoices (id, student_id, term_id, generated_on, status)
invoice_lines (id, invoice_id, vote_head_id, amount)
instalments (id, invoice_id, sequence, due_date, amount, status enum[upcoming, overdue, paid])

payments (id, student_id, term_id, amount, method enum[mpesa, bank, cash, cheque], kcb_txn_ref, status enum[pending_match, posted, flagged], matched_admission_no, applied_instalment_id nullable, receipt_no, created_at)

journal_entries (id, school_id, je_no, date, narration, fund_id)
journal_lines (id, journal_entry_id, account_id, debit numeric, credit numeric, particulars)
  -- CONSTRAINT (enforce in app logic / trigger): sum(debit) = sum(credit) per journal_entry_id, and every line's account.fund_id (if set) must match the parent fund_id

cashbook_entries (id, school_id, fund_id, date, voucher_no, voucher_type enum[RV, PV], particulars, receipts numeric, payments numeric, running_balance numeric)

capitation_disbursements (id, school_id, fund_id, term_id, quarter, allocated numeric, disbursed numeric)
bursaries (id, student_id, funder_name, amount, status enum[pledged, disbursed, reconciled])

promotions (id, school_id, from_term_id, to_term_id, run_at, run_by)
promotion_lines (id, promotion_id, student_id, old_class_id, new_class_id, closing_balances jsonb, carry_forward_type enum[debit_bf, credit_bf, repeater, transferred_cleared])

audit_log (id, school_id, user_id, action, entity, entity_id, before jsonb, after jsonb, created_at)


Derive student balances per fund as a view (sum of invoice_lines − sum of applied payments, per fund), not a stored column, so the three-fund balance strip is always correct.

5. Pages & functional spec

5.1 Dashboard (/)

KPI row (4 cards): Total fees, Collected (+ % of total), Outstanding (+ student count), Expenses — each with a trend pill (up/warn/flat).

Three ledger-stub fund cards (Tuition / Operations / School Fund) with animated count-up balances and MTD receipts/payments.

Two charts side by side: (a) cumulative fee-collection line chart with a dashed "target pace" comparison series, (b) collection-status donut (Cleared / Pending / Overdue / In credit).

"Attention needed" panel: live list of actionable alerts — unmatched KCB deposits awaiting match, students with arrears over a threshold, capitation utilisation %, students in credit.

Top outstanding balances table — rows clickable, opens the student drawer; each row has an inline "Send reminder" button.

Recent payments table (last 7 days) with method + reference + status pill.

5.2 Students (/students)

Stat cards: Active / In arrears / Cleared / In credit counts.

Toolbar: search by name/admission/guardian phone, class filter, status filter.

Table: avatar-chip + name/admission no., class, masked guardian phone, three fund balance columns (parenthesized negatives = owing), status pill, an "Invoice" quick-action button. Row click opens the student drawer.

"+ Add student" opens a form (admission no., name, class, guardian name/phone/relationship).

5.3 Fee collection (/fees)

Student picker (search-select).

Bar chart: expected vs collected fees by class, for the active term.

Invoice builder: table of vote heads (name, fund tag pill, amount, instalment-plan pill, edit), invoice total footer. Vote heads come from the vote_heads table and always show which fund they route to — make this visually explicit, it's the core business rule.

Instalment progress: paid/outstanding summary, a 2-segment progress bar, table of instalments with due dates and status pills.

Payment recording panel: 4 method cards (M-Pesa/Bank/Cash/Cheque, selectable), amount input (mono font), "apply to vote head" dropdown defaulting to "Auto-allocate (oldest instalment first)", a primary submit button that on success shows a confirmation summary (amount applied, instalment updated, receipt number generated, cash book + ledger updated) and writes journal_entries + cashbook_entries.

Payment history list for the selected student.

5.4 Fund accounts (/funds)

Tab switcher for the three funds.

Opening/closing balance stat cards.

Ledger table: date, particulars, receipts, payments, running balance.

A note line per fund stating its permitted-use rule (pull from funds.permitted_use_note — don't hardcode, but seed with the rules in §1).

5.5 General ledger (/ledger)

Filter bar: fund, account, date range, "Export CSV".

Journal entries grouped by JE number (bold head row spans date/JE no./narration/fund), debit lines in garnet, credit lines in teal, indented under the head row.

Legend ("Debit"/"Credit" swatches) + a note reinforcing "no cross-fund postings permitted."

Trial balance table (account, debit, credit) for the filtered period.

Posting summary panel: entry count, total debits, total credits, and an out-of-balance check that should read 0.00 with a checkmark — wire this to a real balance validation, not a static value.

5.6 Cashbook (/cashbook)

Filter bar: fund (or consolidated), month, "Print/export PDF" (use browser print with a print stylesheet that hides nav/sidebar/toolbars).

Statutory cashbook sheet exactly as described in §3 (letterhead, b/f row, daily RV/PV rows, c/f row, signature lines).

Monthly totals by fund table (receipts, payments, net movement — colored forest/garnet for net +/−).

Bank reconciliation snapshot: KCB statement balance vs cash book balance vs unpresented cheques vs uncleared deposits vs variance (should reconcile to 0.00).

5.7 Receipting · KCB (/receipting)

Left: list of pending KCB deposits (amount, reference, channel — M-Pesa/STK/agent deposit, time-ago). Auto-matched deposits show a "Confirm & post" button; unmatched ones are visually flagged (amber/garnet) with "Resolve manually" (opens a small picker to manually attach an admission number).

Right: on confirm, render the official receipt card + SMS preview box (per §3), and post a journal entry + cashbook entry + update the student's instalment.

5.8 Promotion (/promotion)

3-step wizard indicator: Select scope → Preview carry-forward → Confirm & run.

Scope selectors: class transition (e.g. Form 2 → Form 3, or same-class term rollover) + fund scope.

Preview table: admission no., student, old class, new class, closing balance, and a carry-forward-type pill (Debit b/f garnet, Credit b/f teal, Repeater forest, Transferred·cleared forest).

"Run promotion for N students" button → writes promotions + promotion_lines, locks the closed term, queues SMS to guardians, and shows a result summary card (counts promoted/repeaters/transfers, confirmation that arrears/credit carried forward across all 3 funds, link to the generated promotion audit report).

5.9 Bursaries · capitation (/bursary)

Capitation utilisation table per fund: disbursed/allocated with a % pill, plus the MoE quarterly-schedule note.

Bursary & pledge register table: student, funder, amount, status pill (pledged/disbursed/reconciled).

5.10 Statutory reports (/reports)

Grid of report cards, each opens a generated (PDF/Excel-exportable) report:

Statement of receipts & payments (IPSAS cash basis, by fund, vs budget)

Budget vs actual (IPSAS 24 variance, per vote head)

Bank reconciliation statement

Capitation utilisation report

Bursary & pledge report

Promotion audit report

Cash book — monthly

Student ledger statement (per-student, all 3 funds)

5.11 Settings (/settings)

School setup (name, registration no., NEMIS code, KCB account refs per fund).

Fee configuration (vote heads, class fee structures, instalment plans, discounts/waivers).

Users & roles (Bursar, Principal, BOM Treasurer, Auditor, parent-portal access).

5.12 Student profile drawer (global component, opens from any student row)

Dark header (avatar, name, admission no. + class, status pill, 3-column fund balance strip) → Guardian section → Quick actions (New invoice / Record payment / Send reminder) → Recent activity timeline.

6. Roles & access (Supabase RLS)

Bursar: full read/write on their school's data.

Principal: read-all, write on reminders/approvals, cannot edit ledger entries directly.

BOM Treasurer: read-all + sign-off actions (approve promotion run, approve cashbook period close).

Auditor: read-only, full visibility including audit_log.

Parent (future/parent-portal scope): read-only, scoped to their own child(ren)'s invoices/payments/receipts only.

All financial mutations (payments, journal entries, promotions) must write to audit_log with before/after state.

7. Core business rules to enforce in logic, not just UI copy

A vote head always posts to its assigned fund — never let a UI flow split one payment across funds.

A journal entry is invalid unless sum(debit) === sum(credit) and all lines belong to the same fund as the entry.

Default payment allocation is oldest-unpaid-instalment-first; manual vote-head override is allowed.

KCB deposit auto-match looks for an admission number embedded in the transaction reference; on no match, status = flagged, never silently posted.

Promotion: locks the source term's ledgers on completion (no further postings), carries the student's net balance per fund forward as opening balance on the new term/class, and applies any standing bursary/capitation credit to the new invoice automatically.

Capitation disbursement default split: 25% of annual allocation per quarter, divided between Tuition and Operations per the MoE schedule (configurable in Settings, not hardcoded).

8. Build phases 

Phase 1 — Foundation: Supabase schema (§4), auth + roles, design tokens/theme (§3), shell layout (sidebar + topbar), Dashboard with mocked-then-real KPIs and charts.

Phase 2 — Core money flow: Students list + drawer, Fee collection (invoice builder + payment recording), Receipting/KCB confirm flow, Fund accounts tab view.

Phase 3 — Accounting depth: General ledger (journal entries + trial balance + balance validation), Cashbook (with print stylesheet + reconciliation).

Phase 4 — Period operations: Promotion engine wizard + carry-forward logic, Bursaries/capitation tracking.

Phase 5 — Reporting & polish: Statutory reports grid with real exports (PDF/Excel), Settings screens, audit log viewer, role-based access hardening.

Build and verify each phase before moving to the next.,, use the attacheced UI

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://schoolfund.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/347f152f-35f6-4130-a61f-9b378a1f4ff8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
