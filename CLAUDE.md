# Jordan Payroll System — project guide

React 19 + TypeScript + Vite + Tailwind v4 single-page app for Jordanian payroll (Social Security, income tax,
payslips, ISTD certificates). Deployed on Vercel. UI text is English with Arabic labels.

## Commands
- `npm run dev` — dev server on port 3000 (also serves `api/db.ts`, cloud copy kept in memory)
- `npm run lint` — typecheck (`tsc --noEmit`); run after every change
- `npm run build` — production build
- No test runner. Verify in the browser: Company Settings → Backup & Excel Data Transfer → **Load test company**
  (Full System Test Co., see `src/db/seedFullTest.ts`).

## Architecture
- **Data lives in the browser** (IndexedDB, `src/db/indexedDB.ts`, DB_VERSION 2). Stores: companies, employees,
  salary_records, loans, monthly_inputs, clearances, users, rule_sets, comments, activity_logs, app_state.
  New store → bump DB_VERSION, add it to `deleteCompanyCascade`, the sync snapshot, and `applySnapshotToDB`.
- **`src/App.tsx`** holds all state, every save/delete handler, screen routing, and the per-screen Excel map
  (`SCREEN_EXCEL`). Screens receive data + callbacks as props.
- **Cloud sync**: `src/hooks/useCloudSync.ts` mirrors the whole DB to `/api/db` (`api/db.ts`, Upstash Redis,
  chunked + gzip, `SYNC_KEY` header). Concurrent edits are merged record by record (`src/utils/syncMerge.ts`);
  anything added to the snapshot must also get a key in `syncMerge.ts` KEYS.
- **Comments**: `CommentsContext` in `src/components/common/Comments.tsx`, provided by App; drop
  `<CommentsButton entity={...} />` into any screen.

## Where things are
| Area | File |
|---|---|
| Types (Employee, SalaryRecord, PayrollRuleSet, TeamComment…) | `src/types/index.ts` |
| Payroll calculation (gross, SSC, tax, clearance) | `src/utils/calculator.ts` → `calculatePayroll`, `calculateClearanceAmounts` |
| Rules by period 2000–2100 (SSC rates/ceilings, tax brackets) | `src/utils/jordanRules.ts` (`DEFAULT_RULE_SETS`, `mergeRuleSets`) |
| SSC engine (coverage, youth reduction, ceilings, maternity days) | `src/utils/ssc.ts` (`computeSsc`, `recordSsc`) |
| Income tax engine (exemptions, brackets, one-off pay, national contribution) | `src/utils/incomeTax.ts` (`computeIncomeTax`) + `screens/IncomeTaxCalculatorScreen.tsx` |
| Maternity leave rules | `src/utils/maternity.ts` + `screens/MaternityLeaveScreen.tsx` |
| SSC Calculator (port of Jordan_SSC_Calculator.xlsx; import/export with formulas) | `src/utils/sscCalculator.ts` + `screens/SscCalculatorScreen.tsx` |
| Excel import/export (reading: SheetJS) | `src/utils/excel.ts` + `common/ExcelImportExportModal.tsx` |
| Employee & salary sheets with one column per item + dropdowns (writing: ExcelJS, lazy-loaded) | `src/utils/excelTemplates.ts` |
| Smart Import (any sheet/email → monthly inputs) | `src/utils/smartImport.ts` + `common/SmartImportModal.tsx` |
| PDF export (html2canvas-pro + jsPDF; `password` option = 40-bit RC4) | `src/utils/pdf.ts` |
| Payslip PDF passwords (pattern or generated, per employee & month) | `src/utils/payslipPassword.ts` + `common/PayslipPasswordPanel.tsx` |
| Documents (payslip, QP 177-F3 certificate, clearance, statutory) | `src/components/documents/` |
| Company allowance/deduction type picker | `src/components/common/ItemTypePicker.tsx` |
| Sample data | `seedSampleCompanies` in `indexedDB.ts`; `src/db/seedFullTest.ts`; `src/utils/testSamples.ts` |

## Finding code with Graphify
A code graph is kept in `graphify-out/` (git-ignored). Refresh it after changes with
`~/.local/bin/graphify.exe update .` (code only, no AI/tokens), then query it instead of searching files:
`graphify explain "computeSsc"`, `graphify query "where is maternity handled"`, `graphify affected "calcRow"`.

## Rules to keep
- Use `getRuleSetForPeriod(year, month)` for rates — never hard-code 7.5% / 14.25% or ceilings.
- Tax brackets may come back from JSON with `limit: null` (was Infinity): treat null as no upper limit.
- Bonus / other earnings are one-off pay: taxed in their month (tax with − tax without), never ×12.
- Monthly inputs of kind `salary` must use `SalaryAmounts` keys (`overtime`, `bonus`, `advance`, `unpaid_leave`…).
- Year pickers use `YEAR_OPTIONS` (2000–2100) from `calculator.ts`.
- Keep hooks in `App.tsx` above the early returns (loading / sign-in screens).
- Shell heredocs with backticks or `${}` break in this environment: write patch scripts to a file instead.

## Git
- Work on a feature branch; the user merges to `main` (Vercel deploys `main`). The untracked `salary/` folder is
  an accidental empty repo — never commit it.
