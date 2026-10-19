/**
 * Sample input files for testing Smart Import with "Full System Test Co.".
 */
import * as XLSX from 'xlsx';
import { downloadBlob } from './pdf';

/** An email from a site manager: an HTML table plus free-text lines in English and Arabic. */
export function sampleVariablesEmail(): string {
  const html = `<html><body dir="ltr" style="font-family:Arial">
<p>Hi Finance team,</p>
<p>Please add the following to the <b>October 2026</b> payroll:</p>
<table border="1" cellpadding="4" style="border-collapse:collapse">
  <tr><th>Emp No.</th><th>Name</th><th>Overtime (hours)</th><th>Bonus</th><th>Absence days</th></tr>
  <tr><td>T004</td><td>Mahmoud Saleh</td><td>12</td><td></td><td></td></tr>
  <tr><td>T005</td><td>Ravi Kumar</td><td>8</td><td>25</td><td>1</td></tr>
</table>
<p>Also:</p>
<ul>
  <li>Khaled Haddad - mobile allowance 45 this month</li>
  <li>Yousef Nasser: overtime 6 hours on Friday (holiday rate)</li>
  <li>T009 late penalty 10 JD</li>
  <li>لينا عودة مكافأة 100 دينار</li>
  <li>Fadi from the warehouse: bonus 40</li>
</ul>
<p>Thanks,<br>Site Manager</p>
</body></html>`;
  const b64 = btoa(unescape(encodeURIComponent(html))).replace(/(.{76})/g, '$1\r\n');
  return [
    'From: Site Manager <site.manager@test.jo>',
    'To: Finance <finance@test.jo>',
    'Subject: October 2026 payroll variables',
    'Date: Mon, 19 Oct 2026 09:15:00 +0300',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="sample-boundary"',
    '',
    '--sample-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'See the HTML version of this email.',
    '--sample-boundary',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '--sample-boundary--',
    '',
  ].join('\r\n');
}

/** A spreadsheet in a different layout: Arabic headers, title rows and a totals row. */
export function sampleVariablesSheet(): Uint8Array {
  const rows = [
    ['شركة الاختبار الشامل — متغيرات رواتب شهر تشرين الأول 2026'],
    ['أعدّه: قسم الموارد البشرية'],
    [],
    ['الرقم الوظيفي', 'اسم الموظف', 'ساعات إضافي', 'مكافأة', 'سلفة', 'أيام غياب', 'ملاحظات'],
    ['T001', 'خالد حداد', '', '', '', '', ''],
    ['T002', 'لينا عودة', '', '', '', '', 'في إجازة أمومة'],
    ['T003', 'يوسف ناصر', '10', '', '', '', ''],
    ['T005', 'رافي كومار', '', '', '75', '', ''],
    ['T009', 'عمر فايز', '', '20', '', '1', 'تأخير متكرر'],
    ['', 'المجموع', '10', '20', '75', '1', ''],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'متغيرات');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function downloadSampleEmail() {
  downloadBlob(new Blob([sampleVariablesEmail()], { type: 'message/rfc822' }), 'Sample_Payroll_Variables_Email.eml');
}

export function downloadSampleSheet() {
  downloadBlob(
    new Blob([sampleVariablesSheet() as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Sample_Payroll_Variables_Arabic.xlsx'
  );
}
