/**
 * Smart import: reads payroll changes from a spreadsheet or an email in whatever layout it arrives,
 * and turns them into monthly inputs (overtime, bonus, advances, absences, allowances, deductions...).
 *
 * Everything runs in the browser — no data is sent anywhere. Results are a proposal the user reviews.
 */
import * as XLSX from 'xlsx';
import { Company, Employee, MonthlyInput } from '../types';
import { packageAmounts } from './maternity';

export type SalaryKey =
  | 'basic'
  | 'housing'
  | 'transport'
  | 'other_allow'
  | 'overtime'
  | 'bonus'
  | 'other_earn'
  | 'advance'
  | 'unpaid_leave'
  | 'other_ded';

export interface ImportRow {
  id: string;
  include: boolean;
  empId: string; // '' = not matched
  kind: MonthlyInput['kind'];
  item: string; // salary key for kind 'salary', otherwise the allowance/deduction name
  amount: number;
  quantity?: number;
  unit?: 'hours' | 'days';
  calcNote?: string;
  source: string;
  confidence: 'high' | 'review';
  problem?: string;
}

export const SALARY_ITEM_LABELS: Record<SalaryKey, string> = {
  basic: 'Basic salary (this month)',
  housing: 'Housing allowance (this month)',
  transport: 'Transport allowance (this month)',
  other_allow: 'Other allowances (this month)',
  overtime: 'Overtime',
  bonus: 'Bonus',
  other_earn: 'Other earnings',
  advance: 'Advance salary',
  unpaid_leave: 'Unpaid leave / absence',
  other_ded: 'Other deduction',
};

/** Overtime under the Labour Law: 125% of the normal hourly wage, 150% on weekly rest days and holidays. */
export const OVERTIME_RATE = 1.25;
export const OVERTIME_HOLIDAY_RATE = 1.5;
export const HOURS_PER_MONTH = 240; // 30 days × 8 hours

// ---------------------------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------------------------

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Lower-case, Latin digits, unified Arabic letters, no diacritics/tatweel. */
export function normalizeText(input: string): string {
  let s = String(input ?? '');
  for (let i = 0; i < 10; i++) {
    s = s.split(ARABIC_DIGITS[i]).join(String(i)).split(PERSIAN_DIGITS[i]).join(String(i));
  }
  return s
    .replace(/[ً-ْـ]/g, '') // harakat + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAmount(raw: string): number | null {
  const s = normalizeText(raw).replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  // "1,250.50" -> 1250.50 ; "1.250,50" -> 1250.50 ; "12,5" -> 12.5
  let t = s;
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = /,\d{3}(\D|$)/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Item recognition
// ---------------------------------------------------------------------------------------------

interface ItemMatch {
  kind: MonthlyInput['kind'];
  item: string;
}

const SALARY_PATTERNS: { key: SalaryKey; re: RegExp }[] = [
  { key: 'overtime', re: /over ?time|\bo\.?t\b|اضافي|ساعات اضافيه|عمل اضافي/ },
  { key: 'advance', re: /advance|سلفه|سلف\b|سلفة/ },
  { key: 'unpaid_leave', re: /unpaid|absen|leave without pay|lwp|غياب|غائب|بدون راتب|بدون اجر|اجازه بدون/ },
  { key: 'bonus', re: /bonus|incentive|reward|مكافاه|مكافات|حافز|حوافز/ },
  { key: 'other_ded', re: /deduct|penalt|fine\b|خصم|جزاء|غرامه|عقوبه/ },
  { key: 'other_earn', re: /other earning|arrears|back ?pay|فروقات|ايرادات اخري/ },
  { key: 'basic', re: /basic|اساسي/ },
  { key: 'housing', re: /housing|سكن/ },
  { key: 'transport', re: /transport|مواصلات|تنقل/ },
];

function companyItemMatchers(company: Company): { re: RegExp; match: ItemMatch }[] {
  const esc = (t: string) => normalizeText(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out: { re: RegExp; match: ItemMatch }[] = [];
  for (const a of company.allowanceTypes || []) {
    const full = esc(a.name);
    const short = esc(a.name.replace(/allowance|بدل/gi, '').trim());
    out.push({ re: new RegExp(short && short !== full ? `${full}|${short}` : full), match: { kind: 'allowance', item: a.name } });
  }
  for (const d of company.deductionTypes || []) {
    out.push({ re: new RegExp(esc(d.name)), match: { kind: 'deduction', item: d.name } });
  }
  return out;
}

/** Finds the item named in a piece of text (a header or part of a line). */
export function recognizeItem(text: string, company: Company): ItemMatch | null {
  const t = normalizeText(text);
  if (!t) return null;
  for (const m of companyItemMatchers(company)) if (m.re.test(t)) return m.match;
  for (const p of SALARY_PATTERNS) if (p.re.test(t)) return { kind: 'salary', item: p.key };
  if (/commission|عموله/.test(t)) return { kind: 'allowance', item: 'Commission' };
  if (/allowance|بدل/.test(t)) return { kind: 'allowance', item: text.trim() };
  return null;
}

const HOURS_RE = /\b(hours?|hrs?|h)\b|ساعه|ساعات/;
const DAYS_RE = /\b(days?|d)\b|يوم|ايام/;
const HOLIDAY_RE = /holiday|weekend|friday|rest day|عطله|عيد|جمعه|راحه/;

// ---------------------------------------------------------------------------------------------
// Employee recognition
// ---------------------------------------------------------------------------------------------

interface EmpIndex {
  emp: Employee;
  id: string;
  tokens: string[]; // significant name tokens (EN + AR)
  full: string[]; // normalised full names
}

function buildEmployeeIndex(employees: Employee[]): EmpIndex[] {
  return employees.map((emp) => {
    const names = [emp.name, emp.nameAr].filter(Boolean).map(normalizeText);
    const tokens = Array.from(
      new Set(
        names
          .join(' ')
          .split(/[\s\-_.]+/)
          .map((t) => t.replace(/^(al|el|ال)(?=.{3,})/, ''))
          .filter((t) => t.length >= 3 && !['bin', 'ibn', 'abu', 'بن', 'ابو', 'عبد'].includes(t))
      )
    );
    return { emp, id: normalizeText(emp.empId), tokens, full: names };
  });
}

/** Best employee mentioned in a text, by ID first, then by name tokens. */
function findEmployee(text: string, index: EmpIndex[]): { emp: Employee; certain: boolean } | null {
  const t = normalizeText(text);
  if (!t) return null;
  // 1) employee ID as a whole token (EMP001, 1002, ...)
  for (const e of index) {
    const re = new RegExp(`(^|[^a-z0-9])${e.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    if (e.id && re.test(t)) return { emp: e.emp, certain: true };
  }
  for (const e of index) if (e.emp.nationalId && t.includes(normalizeText(e.emp.nationalId))) return { emp: e.emp, certain: true };
  // 2) full name
  for (const e of index) if (e.full.some((f) => f && t.includes(f))) return { emp: e.emp, certain: true };
  // 3) name tokens
  const words = new Set(t.split(/[\s,;:()\-–_/|]+/).map((w) => w.replace(/^(al|el|ال)(?=.{3,})/, '')));
  let best: { e: EmpIndex; score: number } | null = null;
  let tie = false;
  for (const e of index) {
    const score = e.tokens.filter((tok) => words.has(tok)).length;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { e, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  if (!best || tie) return null;
  return { emp: best.e.emp, certain: best.score >= 2 };
}

// ---------------------------------------------------------------------------------------------
// Amount conversion (hours / days -> money)
// ---------------------------------------------------------------------------------------------

function convertQuantity(
  emp: Employee,
  match: ItemMatch,
  value: number,
  unit: 'hours' | 'days' | undefined,
  holiday: boolean
): { amount: number; note?: string } {
  if (match.kind === 'salary' && match.item === 'overtime' && unit === 'hours') {
    const hourly = (emp.package?.basic || 0) / HOURS_PER_MONTH;
    const rate = holiday ? OVERTIME_HOLIDAY_RATE : OVERTIME_RATE;
    return {
      amount: round2(value * hourly * rate),
      note: `${value} h × ${hourly.toFixed(3)}/h (basic ÷ ${HOURS_PER_MONTH}) × ${rate * 100}%`,
    };
  }
  if (unit === 'days' && (match.item === 'unpaid_leave' || match.kind === 'deduction' || match.item === 'other_ded')) {
    const daily = packageAmounts(emp).monthlyWage / 30;
    return { amount: round2(value * daily), note: `${value} day(s) × ${daily.toFixed(3)}/day (monthly wage ÷ 30)` };
  }
  return { amount: round2(value) };
}

let rowSeq = 0;
const newId = () => `si_${Date.now().toString(36)}_${(rowSeq++).toString(36)}`;

function makeRow(
  emp: { emp: Employee; certain: boolean } | null,
  match: ItemMatch | null,
  value: number,
  unit: 'hours' | 'days' | undefined,
  holiday: boolean,
  source: string
): ImportRow {
  const problems: string[] = [];
  if (!emp) problems.push('Choose the employee');
  if (!match) problems.push('Choose what this amount is');
  const conv = emp && match ? convertQuantity(emp.emp, match, value, unit, holiday) : { amount: round2(value) };
  if (unit && !conv.note) problems.push(`Amount was given in ${unit} — check the value`);
  return {
    id: newId(),
    include: true,
    empId: emp?.emp.empId || '',
    kind: match?.kind || 'salary',
    item: match?.item || '',
    amount: conv.amount,
    quantity: unit ? value : undefined,
    unit,
    calcNote: conv.note,
    source: source.length > 160 ? source.slice(0, 157) + '…' : source,
    confidence: emp?.certain && match && !problems.length ? 'high' : 'review',
    problem: problems.join('; ') || undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Tables (spreadsheets, HTML tables in emails, tab-separated paste)
// ---------------------------------------------------------------------------------------------

const ID_HEADER = /emp(loyee)?\s*(id|no|number|#|code)|staff\s*(id|no)|^id$|^no\.?$|^#$|الرقم الوظيفي|رقم الموظف|الرقم$|^رقم$|كود/;
const NAME_HEADER = /name|employee|staff|اسم|الموظف|الاسم/;
const ITEM_HEADER = /^item|type|description|category|البند|النوع|الوصف|البيان/;
const AMOUNT_HEADER = /amount|value|total|المبلغ|القيمه|المجموع/;
const QTY_HEADER = /hours?|hrs|days?|qty|quantity|ساعات|ساعه|ايام|يوم|عدد/;
const SKIP_HEADER = /date|تاريخ|notes?|ملاحظ|remark|department|dept|قسم|title|position|وظيفه|month|شهر|year|سنه|^net|صافي|gross|اجمالي|ssc|ضمان|tax|ضريبه/;

function parseTable(rows: string[][], company: Company, index: EmpIndex[], label: string): ImportRow[] {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c));
  if (clean.length === 0) return [];

  // Find the header row in the first 10 rows
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, clean.length); i++) {
    const cells = clean[i].map(normalizeText);
    const hasWho = cells.some((c) => ID_HEADER.test(c) || NAME_HEADER.test(c));
    const hasWhat = cells.some((c) => recognizeItem(c, company) || AMOUNT_HEADER.test(c));
    if (hasWho && hasWhat) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    // No usable header: read each row as a line of text
    return clean.flatMap((r) => parseTextLines([r.join('  ')], company, index, label));
  }

  const header = clean[headerIdx].map(normalizeText);
  const idCol = header.findIndex((h) => ID_HEADER.test(h));
  const nameCol = header.findIndex((h, i) => i !== idCol && NAME_HEADER.test(h) && !recognizeItem(h, company));
  const itemCol = header.findIndex((h) => ITEM_HEADER.test(h));
  const amountCol = header.findIndex((h) => AMOUNT_HEADER.test(h) && !recognizeItem(h, company));
  const qtyCol = header.findIndex((h) => QTY_HEADER.test(h) && !recognizeItem(h, company));

  const out: ImportRow[] = [];
  let lastEmp: { emp: Employee; certain: boolean } | null = null;

  for (let r = headerIdx + 1; r < clean.length; r++) {
    const row = clean[r];
    const who = [idCol >= 0 ? row[idCol] : '', nameCol >= 0 ? row[nameCol] : ''].join(' ').trim();
    let emp = who ? findEmployee(who, index) : null;
    if (!who && lastEmp) emp = lastEmp; // continuation rows under the same employee
    if (emp) lastEmp = emp;
    const rowText = row.filter(Boolean).join(' | ');
    if (/^(total|المجموع|الاجمالي)/.test(normalizeText(row[0] || row[1] || ''))) continue;

    if (itemCol >= 0 && (amountCol >= 0 || qtyCol >= 0)) {
      // Long format: one row per item
      const itemText = row[itemCol];
      const match = recognizeItem(itemText, company);
      const raw = amountCol >= 0 && row[amountCol] ? row[amountCol] : row[qtyCol];
      const value = parseAmount(raw || '');
      if (value === null || value === 0) continue;
      const norm = normalizeText(`${itemText} ${raw} ${qtyCol >= 0 ? header[qtyCol] : ''}`);
      const unit = amountCol >= 0 && row[amountCol] ? undefined : HOURS_RE.test(norm) ? 'hours' : DAYS_RE.test(norm) ? 'days' : undefined;
      out.push(makeRow(emp, match || (itemText ? { kind: 'allowance', item: itemText } : null), value, unit, HOLIDAY_RE.test(norm), `${label}: ${rowText}`));
      continue;
    }

    // Wide format: each item column holds a value
    for (let c = 0; c < header.length; c++) {
      if (c === idCol || c === nameCol) continue;
      const h = header[c];
      if (!h || SKIP_HEADER.test(h)) continue;
      const match = recognizeItem(clean[headerIdx][c], company);
      if (!match) continue;
      const value = parseAmount(row[c] || '');
      if (value === null || value === 0) continue;
      const norm = normalizeText(`${clean[headerIdx][c]} ${row[c]}`);
      const unit = HOURS_RE.test(norm) ? 'hours' : DAYS_RE.test(norm) ? 'days' : undefined;
      out.push(makeRow(emp, match, value, unit, HOLIDAY_RE.test(norm), `${label}: ${clean[headerIdx][c]} = ${row[c]} (${who || 'no employee'})`));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Free text (email bodies, chat messages, notes)
// ---------------------------------------------------------------------------------------------

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

function parseTextLines(lines: string[], company: Company, index: EmpIndex[], label = 'Text'): ImportRow[] {
  const out: ImportRow[] = [];
  let current: { emp: Employee; certain: boolean } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    const norm = normalizeText(line);
    // Skip greetings, signatures and email headers
    if (/^(dear|hi|hello|regards|best|thanks|thank you|kind regards|from:|to:|cc:|sent:|subject:|date:|مرحبا|تحيه|مع الشكر|شكرا|السلام)/.test(norm)) continue;

    const emp = findEmployee(line, index);
    if (emp) current = emp; // a line with just a name sets the employee for the following lines
    else {
      // A line that starts with someone we don't know ("Sara: bonus 75") must not inherit the
      // previous employee; bullet lines ("- overtime 5h") do.
      const lead = norm.replace(/^[\s\-•*·▪◦>]+|^\d+[.)]\s+/, '').split(/[:\-–]|\d/)[0].trim();
      if (lead && /[a-z؀-ۿ]{2,}/.test(lead) && !recognizeItem(lead, company) && !/^(please|kindly|for|the|note|يرجى|الرجاء)/.test(lead)) {
        current = null;
      }
    }
    const who = emp || current;
    const empIdNorm = who ? normalizeText(who.emp.empId) : '';

    // Every number with the words around it: the item is named before the number ("bonus 50")
    // or after it ("10 ساعات اضافي"); the unit follows the number ("10h", "3 days").
    const nums = Array.from(norm.matchAll(NUMBER_RE)).filter((m) => {
      const v = m[0];
      const i = m.index || 0;
      const prev = norm[i - 1] || '';
      const tail = norm.slice(i + v.length);
      if (/[/\-:]/.test(prev) || /^[/:]/.test(tail)) return false; // a date (10/2026) or time
      if (/[a-z]/.test(prev)) return false; // part of an ID such as emp001
      if (/^[a-z]/.test(tail) && !/^(h|hrs?|hours?|d|days?|jd|jod|dinars?)\b/.test(tail)) return false;
      if (empIdNorm && empIdNorm.endsWith(v) && norm.includes(empIdNorm)) return false;
      if (/^\d{4}$/.test(v) && +v > 1990 && +v < 2101) return false; // a year
      return true;
    });

    let prevEnd = 0;
    nums.forEach((m, k) => {
      const start = m.index || 0;
      const end = start + m[0].length;
      const nextStart = k + 1 < nums.length ? nums[k + 1].index || norm.length : norm.length;
      const before = norm.slice(prevEnd, start);
      const after = norm.slice(end, nextStart);
      prevEnd = end;
      const value = parseAmount(m[0]);
      if (value === null || value === 0) return;
      const match = recognizeItem(before.split(/[,;،]/).pop() || before, company) || recognizeItem(after, company);
      if (!match && !who) return;
      const unitText = after.slice(0, 14);
      const unit: 'hours' | 'days' | undefined = /^\s*h\b/.test(unitText) || HOURS_RE.test(unitText)
        ? 'hours'
        : DAYS_RE.test(unitText)
        ? 'days'
        : undefined;
      out.push(makeRow(who, match, value, unit, HOLIDAY_RE.test(norm), `${label}: ${line}`));
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

function htmlToTablesAndText(html: string): { tables: string[][][]; text: string[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables: string[][][] = [];
  doc.querySelectorAll('table').forEach((table) => {
    // only innermost tables (layout tables in emails often wrap data tables)
    if (table.querySelector('table')) return;
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach((tr) => {
      rows.push(Array.from(tr.querySelectorAll('th,td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim()));
    });
    if (rows.length) tables.push(rows);
    table.remove();
  });
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  doc.querySelectorAll('p,div,li,h1,h2,h3,h4,tr').forEach((el) => el.append('\n'));
  const text = (doc.body?.textContent || '').split('\n');
  return { tables, text };
}

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  const src = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '=' && /^[0-9A-F]{2}$/i.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(src.charCodeAt(i) & 0xff);
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function decodeBase64Utf8(s: string): string {
  const bin = atob(s.replace(/\s+/g, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Extracts the readable body (HTML preferred) from a raw .eml message. */
function emlBody(raw: string): { html?: string; text?: string } {
  const parts: { type: string; body: string }[] = [];
  const walk = (chunk: string) => {
    const split = chunk.search(/\r?\n\r?\n/);
    const head = split >= 0 ? chunk.slice(0, split) : '';
    let body = split >= 0 ? chunk.slice(split).replace(/^\r?\n\r?\n/, '') : chunk;
    const type = (head.match(/content-type:\s*([^;\s]+)/i)?.[1] || 'text/plain').toLowerCase();
    const boundary = head.match(/boundary="?([^";\r\n]+)"?/i)?.[1];
    if (type.startsWith('multipart/') && boundary) {
      body.split(`--${boundary}`).slice(1).forEach((p) => {
        if (!p.startsWith('--')) walk(p.replace(/^\r?\n/, ''));
      });
      return;
    }
    const enc = (head.match(/content-transfer-encoding:\s*([^\s;]+)/i)?.[1] || '').toLowerCase();
    try {
      if (enc === 'base64') body = decodeBase64Utf8(body);
      else if (enc === 'quoted-printable') body = decodeQuotedPrintable(body);
    } catch {
      /* keep raw */
    }
    if (type === 'text/html' || type === 'text/plain') parts.push({ type, body });
  };
  walk(raw);
  return {
    html: parts.find((p) => p.type === 'text/html')?.body,
    text: parts.find((p) => p.type === 'text/plain')?.body,
  };
}

export interface ParseResult {
  rows: ImportRow[];
  sourceSummary: string;
}

export function parsePastedContent(text: string, html: string | null, company: Company, employees: Employee[]): ParseResult {
  const index = buildEmployeeIndex(employees);
  if (html && /<table/i.test(html)) {
    const { tables, text: lines } = htmlToTablesAndText(html);
    const rows = [
      ...tables.flatMap((t, i) => parseTable(t, company, index, `Pasted table ${i + 1}`)),
      ...parseTextLines(lines, company, index, 'Pasted text'),
    ];
    return { rows, sourceSummary: `${tables.length} table(s) and text from the pasted content` };
  }
  const lines = text.split(/\r?\n/);
  // Tab-separated (copied from Excel)
  if (lines.filter((l) => l.includes('\t')).length >= 2) {
    return {
      rows: parseTable(lines.map((l) => l.split('\t')), company, index, 'Pasted table'),
      sourceSummary: 'pasted spreadsheet cells',
    };
  }
  return { rows: parseTextLines(lines, company, index, 'Pasted text'), sourceSummary: `${lines.length} pasted line(s)` };
}

export async function parseImportFile(file: File, company: Company, employees: Employee[]): Promise<ParseResult> {
  const index = buildEmployeeIndex(employees);
  const name = file.name.toLowerCase();

  if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = wb.SheetNames.flatMap((sheet) => {
      const data = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheet], { header: 1, raw: false, defval: '' });
      return parseTable(data as string[][], company, index, sheet);
    });
    return { rows, sourceSummary: `${wb.SheetNames.length} sheet(s) in ${file.name}` };
  }

  if (/\.msg$/.test(name)) {
    throw new Error(
      'Outlook .msg files cannot be read in the browser. In Outlook use File → Save As → "HTML" or "Text Only", or copy the email text and paste it here.'
    );
  }

  const raw = await file.text();
  if (/\.eml$/.test(name) || /^(received|from|return-path|mime-version|subject):/im.test(raw.slice(0, 2000))) {
    const body = emlBody(raw);
    const res = body.html
      ? parsePastedContent(body.text || '', body.html, company, employees)
      : parsePastedContent(body.text || raw, null, company, employees);
    return { rows: res.rows, sourceSummary: `email ${file.name}` };
  }
  if (/\.html?$/.test(name) || /<html|<table/i.test(raw.slice(0, 5000))) {
    const res = parsePastedContent('', raw, company, employees);
    return { rows: res.rows, sourceSummary: file.name };
  }
  const res = parsePastedContent(raw, null, company, employees);
  return { rows: res.rows, sourceSummary: file.name };
}

/** Turns reviewed rows into monthly inputs, adding up repeated items for the same employee. */
export function rowsToMonthlyInputs(rows: ImportRow[], company: Company, year: number, month: number): MonthlyInput[] {
  const map = new Map<string, MonthlyInput>();
  for (const r of rows) {
    if (!r.include || !r.empId || !r.item || !(r.amount > 0)) continue;
    const key = `${r.empId}|${r.kind}|${r.item.toLowerCase()}`;
    const prev = map.get(key);
    const note = r.calcNote ? `Imported: ${r.calcNote}` : 'Imported';
    if (prev) {
      prev.amount = round2(prev.amount + r.amount);
      prev.notes = `${prev.notes}; ${note}`;
    } else {
      map.set(key, {
        id: `inp_${company.id}_${r.empId}_${year}_${month}_${r.item.replace(/\s+/g, '_')}`,
        companyId: company.id,
        empId: r.empId,
        year,
        month,
        kind: r.kind,
        item: r.item,
        amount: r.amount,
        notes: note,
      });
    }
  }
  return Array.from(map.values());
}
