/**
 * Utility for generating RFC 822 .eml draft files with attached PDF salary slips
 * Compatible with Microsoft Outlook, Apple Mail, Mozilla Thunderbird, Windows Mail.
 * The 'X-Unsent: 1' header instructs email clients to open this directly in compose/draft mode.
 */

import { Company, Employee, SalaryRecord } from '../types';
import { passwordHintForEmail } from './payslipPassword';
import { formatCurrency, getMonthName } from './calculator';
import { generatePdfBlob } from './pdf';

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function buildPayslipEmailBody(
  company: Company,
  employee: Employee,
  record: SalaryRecord
): { subject: string; textBody: string; htmlBody: string } {
  const monthName = getMonthName(record.month, 'en');
  const monthNameAr = getMonthName(record.month, 'ar');
  const currency = company.currency || 'JOD';

  const subject = `Salary Slip - ${monthName} ${record.year} - ${employee.name} (${employee.empId})`;

  const textBody = `Dear ${employee.name},

Please find attached your official salary slip for ${monthName} ${record.year} from ${company.name}.

Summary for ${monthName} ${record.year}:
--------------------------------------------
Employee ID: ${employee.empId}
Job Title: ${employee.title || 'N/A'}
Department: ${employee.department || 'N/A'}
Basic Salary: ${formatCurrency(record.amounts.basic || 0, currency)}
Gross Salary: ${formatCurrency(record.gross, currency)}
Social Security (7.5%): ${formatCurrency(record.amounts.social_sec || 0, currency)}
Income Tax: ${formatCurrency(record.amounts.income_tax || 0, currency)}
Total Deductions: ${formatCurrency(record.totalDed, currency)}
Net Payable: ${formatCurrency(record.net, currency)}
Payment Method: ${record.payMethod}
--------------------------------------------

If you have any questions or require clarification regarding your pay calculation, please reach out to the Finance / HR department.

Best regards,
${company.name}
Payroll & Finance Department
${company.address || 'Amman, Jordan'}
`;

  const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { background: #0f172a; color: #ffffff; padding: 24px; text-align: left; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 24px; }
    .salutation { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .summary-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .summary-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .summary-table tr:last-child td { border-bottom: none; }
    .summary-table .label { color: #64748b; font-weight: 500; }
    .summary-table .value { text-align: right; font-weight: 600; font-family: monospace; }
    .net-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px; margin: 20px 0; display: flex; justify-content: space-between; align-items: center; }
    .net-title { font-size: 13px; font-weight: 600; color: #166534; }
    .net-amount { font-size: 22px; font-weight: 700; color: #15803d; font-family: monospace; }
    .attachment-notice { background: #eff6ff; border: 1px dashed #93c5fd; border-radius: 6px; padding: 12px; margin: 20px 0; font-size: 12px; color: #1e40af; }
    .footer { font-size: 12px; color: #94a3b8; padding-top: 20px; border-top: 1px solid #e2e8f0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${company.name}</h1>
      <p>Official Salary Slip Notification · ${monthName} (${monthNameAr}) ${record.year}</p>
    </div>
    <div class="content">
      <div class="salutation">Dear ${employee.name},</div>
      <p style="font-size: 13px; color: #475569; line-height: 1.5;">
        Your salary slip for <strong>${monthName} ${record.year}</strong> has been processed. The official document is attached to this email as a PDF.
      </p>

      <table class="summary-table">
        <tr>
          <td class="label">Employee ID / رقم الموظف</td>
          <td class="value">${employee.empId}</td>
        </tr>
        <tr>
          <td class="label">Job Title / المسمى الوظيفي</td>
          <td class="value">${employee.title || 'Staff'}</td>
        </tr>
        <tr>
          <td class="label">Gross Salary / إجمالي الراتب</td>
          <td class="value">${formatCurrency(record.gross, currency)}</td>
        </tr>
        <tr>
          <td class="label">Social Security (7.5%) / اقتطاع الضمان</td>
          <td class="value">${formatCurrency(record.amounts.social_sec || 0, currency)}</td>
        </tr>
        <tr>
          <td class="label">Income Tax / ضريبة الدخل</td>
          <td class="value">${formatCurrency(record.amounts.income_tax || 0, currency)}</td>
        </tr>
        <tr>
          <td class="label">Total Deductions / إجمالي الاقتطاعات</td>
          <td class="value">${formatCurrency(record.totalDed, currency)}</td>
        </tr>
        <tr>
          <td class="label" style="font-weight: 700; color: #0f172a;">Net Salary / صافي الراتب المستحق</td>
          <td class="value" style="font-size: 15px; color: #059669;">${formatCurrency(record.net, currency)}</td>
        </tr>
        <tr>
          <td class="label">Payment Method / طريقة الدفع</td>
          <td class="value">${record.payMethod}</td>
        </tr>
      </table>

      <div class="attachment-notice">
        📎 <strong>Attachment:</strong> Your detailed bilingual payslip PDF (<code>SalarySlip_${employee.name.replace(/\s+/g, '_')}_${record.year}_${record.month}.pdf</code>) is attached to this message.
      </div>

      <div class="footer">
        <p>This is an official payroll communication generated by ${company.name}. Please keep this slip for your records. If you have any inquiries, contact HR or the payroll accountant.</p>
        <p>${company.address ? company.address + ' · ' : ''}${company.taxNumber ? 'Tax Reg: ' + company.taxNumber : ''}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  // Tell the employee how to open a password-protected payslip (never the password itself)
  const hint = passwordHintForEmail(company);
  if (hint) {
    const text = textBody.replace(
      `${monthName} ${record.year} from ${company.name}.`,
      `${monthName} ${record.year} from ${company.name}.

${hint}`
    );
    const html = htmlBody.replace(
      '</body>',
      `<p style="margin:16px 0;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;color:#9a3412">🔒 ${hint}</p>
</body>`
    );
    return { subject, textBody: text, htmlBody: html };
  }

  return { subject, textBody, htmlBody };
}

/**
 * Creates an RFC 822 / RFC 2045 .eml file containing:
 * - Proper headers
 * - X-Unsent: 1 (indicates draft state for Outlook/Thunderbird/Mail)
 * - MIME multipart/mixed with HTML/Plain text body
 * - Base64 encoded PDF attachment
 */
export function createEmlFile({
  fromName,
  fromEmail,
  toName,
  toEmail,
  subject,
  htmlBody,
  textBody,
  attachmentFilename,
  attachmentBase64,
}: {
  fromName: string;
  fromEmail: string;
  toName: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  attachmentFilename: string;
  attachmentBase64: string;
}): Blob {
  const boundaryMixed = '----=_Part_Mixed_' + Math.random().toString(36).substring(2) + '_' + Date.now();
  const boundaryAlt = '----=_Part_Alt_' + Math.random().toString(36).substring(2) + '_' + Date.now();
  const dateStr = new Date().toUTCString();

  // Fold base64 to 76 chars per line per RFC 2045
  const base64Lines = attachmentBase64.match(/.{1,76}/g)?.join('\r\n') || attachmentBase64;

  const emlContent = [
    `From: "${fromName.replace(/"/g, '')}" <${fromEmail}>`,
    `To: "${toName.replace(/"/g, '')}" <${toEmail}>`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `Date: ${dateStr}`,
    `MIME-Version: 1.0`,
    `X-Unsent: 1`, // Key header that causes Outlook/Apple Mail to open as an editable draft
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
    ``,
    `This is a multi-part message in MIME format.`,
    ``,
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    ``,
    `--${boundaryAlt}`,
    `Content-Type: text/plain; charset=UTF-8; format=flowed`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(textBody))),
    ``,
    `--${boundaryAlt}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(htmlBody))),
    ``,
    `--${boundaryAlt}--`,
    ``,
    `--${boundaryMixed}`,
    `Content-Type: application/pdf; name="${attachmentFilename}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${attachmentFilename}"`,
    ``,
    base64Lines,
    ``,
    `--${boundaryMixed}--`,
    ``,
  ].join('\r\n');

  return new Blob([emlContent], { type: 'message/rfc822' });
}

/**
 * Downloads a draft .eml file directly to the user's computer.
 * Double-clicking it opens Outlook / Apple Mail / Thunderbird with the payslip PDF attached!
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}
