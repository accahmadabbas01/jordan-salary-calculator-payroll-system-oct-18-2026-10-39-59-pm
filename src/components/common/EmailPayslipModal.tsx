import React, { useState } from 'react';
import { Company, Employee, SalaryRecord } from '../../types';
import { PayslipDoc } from '../documents/PayslipDoc';
import { generatePdfBlob } from '../../utils/pdf';
import {
  blobToBase64,
  buildPayslipEmailBody,
  createEmlFile,
  downloadFile,
} from '../../utils/emailDraft';
import { formatCurrency, getMonthName } from '../../utils/calculator';
import {
  Mail,
  Download,
  ExternalLink,
  CheckCircle2,
  FileText,
  X,
  Paperclip,
  Send,
  Loader2,
} from 'lucide-react';

interface EmailPayslipModalProps {
  company: Company;
  employee: Employee;
  record: SalaryRecord;
  onClose: () => void;
  onMarkSent?: (record: SalaryRecord) => Promise<boolean>;
}

export const EmailPayslipModal: React.FC<EmailPayslipModalProps> = ({
  company,
  employee,
  record,
  onClose,
  onMarkSent,
}) => {
  const defaultEmail = employee.email || '';
  const initialContent = buildPayslipEmailBody(company, employee, record);

  const [toEmail, setToEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState(initialContent.subject);
  const [textMessage, setTextMessage] = useState(initialContent.textBody);
  const [isGenerating, setIsGenerating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const attachmentFilename = `SalarySlip_${employee.name.replace(/\s+/g, '_')}_${record.year}_${record.month}.pdf`;

  // 1. Download .eml Draft File with attached PDF
  const handleDownloadEmlDraft = async () => {
    setIsGenerating(true);
    setSuccessMessage(null);

    try {
      const renderEl = document.getElementById('email-hidden-payslip-render');
      if (!renderEl) {
        throw new Error('Payslip render element not found');
      }

      // Generate PDF blob
      const pdfBlob = await generatePdfBlob(renderEl);
      const pdfBase64 = await blobToBase64(pdfBlob);

      // Create .eml draft
      const emlBlob = createEmlFile({
        fromName: company.name,
        fromEmail: 'payroll@' + company.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
        toName: employee.name,
        toEmail: toEmail.trim() || 'employee@company.com',
        subject: subject,
        htmlBody: initialContent.htmlBody,
        textBody: textMessage,
        attachmentFilename,
        attachmentBase64: pdfBase64,
      });

      const emlFilename = `Draft_SalarySlip_${employee.name.replace(/\s+/g, '_')}_${record.year}_${record.month}.eml`;
      downloadFile(emlBlob, emlFilename);

      if (onMarkSent) {
        await onMarkSent(record);
      }

      setSuccessMessage(
        `Email draft downloaded successfully (${emlFilename})! Open this file to view your ready-to-send draft in Outlook, Apple Mail, or Thunderbird with the PDF already attached.`
      );
    } catch (err) {
      alert('Error creating email draft: ' + String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Open via mailto: and download attached PDF
  const handleOpenMailto = async () => {
    setIsGenerating(true);
    try {
      const renderEl = document.getElementById('email-hidden-payslip-render');
      if (renderEl) {
        const pdfBlob = await generatePdfBlob(renderEl);
        downloadFile(pdfBlob, attachmentFilename);
      }

      const mailtoUrl = `mailto:${encodeURIComponent(toEmail.trim())}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(textMessage)}`;

      window.location.href = mailtoUrl;

      if (onMarkSent) {
        await onMarkSent(record);
      }

      setSuccessMessage(
        'Email client opened! The payslip PDF was downloaded to your downloads folder so you can attach it.'
      );
    } catch (e) {
      alert('Error: ' + String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Mark as sent directly
  const handleMarkDirectSent = async () => {
    if (onMarkSent) {
      await onMarkSent(record);
      setSuccessMessage(`Marked as sent on ${new Date().toLocaleDateString()}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 text-xs">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Send Salary Slip Draft — {employee.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Success</span>
                <p>{successMessage}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Recipient Email *
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="employee@example.com"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium"
              />
              {!employee.email && (
                <span className="text-[10px] text-amber-600">
                  (No email saved on employee profile. You can enter one here)
                </span>
              )}
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Employee & Period
              </label>
              <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 rounded text-slate-700 dark:text-slate-300 font-medium">
                {employee.name} · {getMonthName(record.month)} {record.year}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
              Email Message Content
            </label>
            <textarea
              rows={6}
              value={textMessage}
              onChange={(e) => setTextMessage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[11px]"
            />
          </div>

          {/* Attachment Preview Card */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center font-bold text-xs">
                PDF
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {attachmentFilename}
                </div>
                <div className="text-[11px] text-slate-500">
                  Official bilingual payslip · Net: {formatCurrency(record.net, company.currency)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attached</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkDirectSent}
              className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 rounded font-medium"
            >
              Mark Sent Only
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleOpenMailto}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              title="Open your default web or desktop mail app"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              <span>Open in Mail App</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadEmlDraft}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold hover:bg-slate-800 shadow-sm disabled:opacity-50"
              title="Download standard RFC-822 .eml draft file with embedded PDF attachment"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Draft...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Email Draft (.eml + PDF)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden container to render Payslip for PDF extraction */}
      <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '800px' }}>
        <PayslipDoc
          id="email-hidden-payslip-render"
          company={company}
          employee={employee}
          record={record}
        />
      </div>
    </div>
  );
};
