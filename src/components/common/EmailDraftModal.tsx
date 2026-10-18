import React, { useState } from 'react';
import { Company, Employee, SalaryRecord } from '../../types';
import { formatCurrency, getMonthName } from '../../utils/calculator';
import { exportHtmlToPdf } from '../../utils/pdf';
import {
  Mail,
  Paperclip,
  Download,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
} from 'lucide-react';

interface EmailDraftModalProps {
  company: Company;
  employee: Employee;
  record: SalaryRecord;
  onClose: () => void;
  onConfirmSent: (record: SalaryRecord) => Promise<void>;
}

export const EmailDraftModal: React.FC<EmailDraftModalProps> = ({
  company,
  employee,
  record,
  onClose,
  onConfirmSent,
}) => {
  const [recipient, setRecipient] = useState(employee.email || '');
  const [subject, setSubject] = useState(
    `Salary Slip — ${record.name} (${getMonthName(record.month)} ${record.year}) · ${company.name}`
  );
  const [body, setBody] = useState(
    `Dear ${record.name},\n\nPlease find attached your official salary slip for the month of ${getMonthName(
      record.month
    )} ${record.year}.\n\n` +
      `Summary:\n` +
      `- Gross Salary: ${formatCurrency(record.gross, company.currency)}\n` +
      `- Social Security: ${formatCurrency(record.amounts.social_sec || 0, company.currency)}\n` +
      `- Income Tax: ${formatCurrency(record.amounts.income_tax || 0, company.currency)}\n` +
      `- Total Deductions: ${formatCurrency(record.totalDed, company.currency)}\n` +
      `- Net Salary Paid: ${formatCurrency(record.net, company.currency)}\n\n` +
      `يرجى الاطلاع على قسيمة الراتب المرفقة لشهر ${getMonthName(record.month, 'ar')} ${record.year}.\n\n` +
      `Best regards,\nPayroll Department\n${company.name}`
  );

  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const attachmentFilename = `SalarySlip_${record.name.replace(/\s+/g, '_')}_${record.year}_${record.month}.pdf`;

  const handleDownloadAttachment = async () => {
    const el = document.getElementById('email-draft-payslip-doc');
    if (el) {
      await exportHtmlToPdf(el, attachmentFilename);
    }
  };

  const handleSendDraft = async () => {
    if (!recipient.trim()) {
      alert('Please enter a recipient email address.');
      return;
    }

    setIsSending(true);
    try {
      await onConfirmSent({
        ...record,
        emailedAt: new Date().toISOString(),
      });
      setSentSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (e) {
      alert('Error sending email draft: ' + String(e));
      setIsSending(false);
    }
  };

  const handleOpenMailto = () => {
    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-xl w-full p-6 text-xs space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Email Salary Slip Draft
              </h3>
              <p className="text-slate-500 text-[11px]">
                Send or prepare an email draft with the attached payslip
              </p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sentSuccess ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Email Sent & Recorded!
            </h4>
            <p className="text-slate-500">
              Payslip has been marked as emailed to {recipient}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                To (Recipient Email) *
              </label>
              <input
                type="email"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="employee@example.com"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-medium"
              />
              {!employee.email && (
                <div className="flex items-center gap-1 text-[11px] text-amber-600 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Employee has no email address saved in their employee profile.</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Message Body
              </label>
              <textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[11px] leading-relaxed"
              />
            </div>

            {/* Attached PDF Payslip Badge */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-rose-100 text-rose-700 rounded">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {attachmentFilename}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Bilingual PDF document · A4 format
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadAttachment}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Attachment</span>
              </button>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleOpenMailto}
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Desktop Email Client</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSending || !recipient}
                  onClick={handleSendDraft}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSending ? 'Sending...' : 'Send & Mark as Emailed'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
