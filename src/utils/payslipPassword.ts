/**
 * Optional password protection for payslip PDFs — a different password per employee and month.
 *
 *  pattern   : built from the employee's own data so they can work it out, e.g. "{ID4}{MM}{YYYY}"
 *  generated : HMAC of a company secret + employee + month — unguessable, always the same for the
 *              same employee/month, so HR can export a password list and send it separately.
 *
 * Note: jsPDF uses the PDF standard 40-bit RC4 encryption. It stops casual opening (wrong recipient,
 * shared computer) but is not strong against password-cracking tools.
 */
import { Company, Employee, PayslipPasswordSettings } from '../types';

export const DEFAULT_PAYSLIP_PASSWORD: PayslipPasswordSettings = {
  enabled: false,
  mode: 'pattern',
  pattern: '{ID4}{MM}{YYYY}',
  secret: '',
};

export const PASSWORD_TOKENS: { token: string; label: string }[] = [
  { token: '{ID4}', label: 'Last 4 of national ID / passport' },
  { token: '{ID}', label: 'Full national ID / passport' },
  { token: '{EMP}', label: 'Employee number' },
  { token: '{DOB}', label: 'Birth day + month (DDMM)' },
  { token: '{PHONE4}', label: 'Last 4 digits of phone' },
  { token: '{MM}', label: 'Payslip month (2 digits)' },
  { token: '{YYYY}', label: 'Payslip year (4 digits)' },
  { token: '{YY}', label: 'Payslip year (2 digits)' },
];

export function payslipPasswordSettings(company: Company): PayslipPasswordSettings {
  return { ...DEFAULT_PAYSLIP_PASSWORD, ...(company.payslipPassword || {}) };
}

export function newPasswordSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const alnum = (s?: string) => (s || '').replace(/[^0-9A-Za-z]/g, '');
const digits = (s?: string) => (s || '').replace(/\D/g, '');

/** Plain-language description of the pattern, for emails and the settings screen. */
export function describePattern(pattern: string): string {
  const parts = pattern.split(/(\{[A-Z0-9]+\})/).filter(Boolean);
  return parts
    .map((p) => PASSWORD_TOKENS.find((t) => t.token === p)?.label.toLowerCase() ?? `"${p}"`)
    .join(' + ');
}

// Letters and digits that are hard to confuse when typed (no 0/O, 1/l/I)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

async function hmacPassword(secret: string, message: string, length = 10): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[sig[i] % ALPHABET.length];
  return out;
}

export interface PayslipPasswordResult {
  password: string;
  /** Pattern parts that had no data for this employee (the employee number was used instead) */
  missing: string[];
}

/** The password for one employee's payslip of a given month, or null when protection is off. */
export async function getPayslipPassword(
  company: Company,
  emp: Employee | undefined,
  year: number,
  month: number
): Promise<PayslipPasswordResult | null> {
  const s = payslipPasswordSettings(company);
  if (!s.enabled || !emp) return null;

  if (s.mode === 'generated') {
    if (!s.secret) throw new Error('Password secret is missing — open the password settings and save them again.');
    return { password: await hmacPassword(s.secret, `${company.id}|${emp.empId}|${year}-${pad2(month)}`), missing: [] };
  }

  const missing: string[] = [];
  const value = (token: string, v: string) => {
    if (v) return v;
    missing.push(token);
    return alnum(emp.empId);
  };
  const [, bm, bd] = (emp.birthDate || '').split('-');
  const password = s.pattern.replace(/\{([A-Z0-9]+)\}/g, (whole, name) => {
    switch (name) {
      case 'ID4':
        return value(whole, alnum(emp.nationalId).slice(-4));
      case 'ID':
        return value(whole, alnum(emp.nationalId));
      case 'EMP':
        return alnum(emp.empId);
      case 'DOB':
        return value(whole, bd && bm ? `${bd}${bm}` : '');
      case 'PHONE4':
        return value(whole, digits(emp.phone).slice(-4));
      case 'MM':
        return pad2(month);
      case 'YYYY':
        return String(year);
      case 'YY':
        return String(year).slice(-2);
      default:
        return whole;
    }
  });
  return { password, missing };
}

/** Sentence to put in a payslip email telling the employee how to open the PDF. */
export function passwordHintForEmail(company: Company): string | null {
  const s = payslipPasswordSettings(company);
  if (!s.enabled) return null;
  return s.mode === 'pattern'
    ? `The attached payslip PDF is password protected. Password: ${describePattern(s.pattern)}.`
    : 'The attached payslip PDF is password protected. Your password is sent to you separately.';
}
