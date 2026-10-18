import React, { useState } from 'react';
import { Company, Employee, SalaryRecord, UserRole } from '../../types';
import { PayslipDoc } from '../documents/PayslipDoc';
import { exportHtmlToPdf, exportMultipleHtmlToPdf, printHtmlElement } from '../../utils/pdf';
import { EmailPayslipModal } from '../common/EmailPayslipModal';
import { createEmlFile, downloadFile, blobToBase64, buildPayslipEmailBody } from '../../utils/emailDraft';
import { generatePdfBlob } from '../../utils/pdf';
import { getMonthName, formatCurrency } from '../../utils/calculator';
import {
  FileText,
  Download,
  Mail,
  Printer,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Loader2,
} from 'lucide-react';

interface PayslipsScreenProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  year: number;
  month: number;
  userRole?: UserRole;
  onSendEmailPayslip?: (record: SalaryRecord) => Promise<boolean>;
}

export const PayslipsScreen: React.FC<PayslipsScreenProps> = ({
  company,
  employees,
  records,
  year,
  month,
  userRole = 'viewer',
  onSendEmailPayslip,
}) => {
  const monthRecords = records.filter(
    (r) => r.companyId === company.id && r.year === year && r.month === month
  );

  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(
    new Set(monthRecords.map((r) => r.empId))
  );
  const [activePreviewEmpId, setActivePreviewEmpId] = useState<string>(
    monthRecords[0]?.empId || ''
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchDrafting, setIsBatchDrafting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  // Modal state for sending email draft
  const [emailModalRecord, setEmailModalRecord] = useState<SalaryRecord | null>(null);

  const activeRecord = monthRecords.find((r) => r.empId === activePreviewEmpId) || monthRecords[0];
  const activeEmp = employees.find((e) => e.empId === activeRecord?.empId);

  const handleToggleSelect = (empId: string) => {
    const next = new Set(selectedEmpIds);
    if (next.has(empId)) next.delete(empId);
    else next.add(empId);
    setSelectedEmpIds(next);
  };

  const handleSelectAll = () => {
    if (selectedEmpIds.size === monthRecords.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(monthRecords.map((r) => r.empId)));
    }
  };

  // Single PDF Download
  const handleDownloadActivePdf = async () => {
    // Prefer the fixed-width hidden render so the PDF looks the same at any window size.
    const el =
      (activeRecord && document.getElementById(`hidden-payslip-render-${activeRecord.empId}`)) ||
      document.getElementById('payslip-preview-render');
    if (!el || !activeRecord) return;
    setIsExporting(true);
    try {
      await exportHtmlToPdf(
        el,
        `SalarySlip_${activeRecord.name.replace(/\s+/g, '_')}_${year}_${month}.pdf`
      );
    } catch (e) {
      alert('Error generating PDF: ' + String(e));
    } finally {
      setIsExporting(false);
    }
  };

  // Download one employee's slip straight from the list
  const handleDownloadPdfFor = async (r: SalaryRecord) => {
    const el = document.getElementById(`hidden-payslip-render-${r.empId}`);
    if (!el) return;
    setIsExporting(true);
    try {
      await exportHtmlToPdf(el, `SalarySlip_${r.name.replace(/\s+/g, '_')}_${r.year}_${r.month}.pdf`);
    } catch (e) {
      alert('Error generating PDF: ' + String(e));
    } finally {
      setIsExporting(false);
    }
  };

  // Download All Selected as a Combined Multi-Page PDF
  const handleDownloadSelectedCombinedPdf = async () => {
    if (selectedEmpIds.size === 0) return;
    setIsExporting(true);

    try {
      // Find all rendered hidden elements
      const targetEls: HTMLElement[] = [];
      const selectedRecs = monthRecords.filter((r) => selectedEmpIds.has(r.empId));

      for (const r of selectedRecs) {
        const el = document.getElementById(`hidden-payslip-render-${r.empId}`);
        if (el) targetEls.push(el);
      }

      if (targetEls.length === 0) {
        // Fallback to active preview
        const activeEl = document.getElementById('payslip-preview-render');
        if (activeEl) targetEls.push(activeEl);
      }

      await exportMultipleHtmlToPdf(
        targetEls,
        `All_Payslips_${company.name.replace(/\s+/g, '_')}_${year}_${month}.pdf`
      );
    } catch (e) {
      alert('Error creating combined PDF: ' + String(e));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintActive = () => {
    printHtmlElement('payslip-preview-render');
  };

  // Batch Download .eml Drafts for All Selected Employees
  const handleBatchDownloadDrafts = async () => {
    const selectedRecs = monthRecords.filter((r) => selectedEmpIds.has(r.empId));
    if (selectedRecs.length === 0) return;

    setIsBatchDrafting(true);
    let drafted = 0;

    try {
      for (const r of selectedRecs) {
        const emp = employees.find((e) => e.empId === r.empId);
        const renderEl =
          document.getElementById(`hidden-payslip-render-${r.empId}`) ||
          document.getElementById('payslip-preview-render');

        if (!renderEl || !emp) continue;

        const pdfBlob = await generatePdfBlob(renderEl);
        const pdfBase64 = await blobToBase64(pdfBlob);
        const initialContent = buildPayslipEmailBody(company, emp, r);
        const attachmentFilename = `SalarySlip_${emp.name.replace(/\s+/g, '_')}_${r.year}_${r.month}.pdf`;

        const emlBlob = createEmlFile({
          fromName: company.name,
          fromEmail: 'payroll@' + company.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
          toName: emp.name,
          toEmail: emp.email || 'employee@company.com',
          subject: initialContent.subject,
          htmlBody: initialContent.htmlBody,
          textBody: initialContent.textBody,
          attachmentFilename,
          attachmentBase64: pdfBase64,
        });

        const emlFilename = `Draft_SalarySlip_${emp.name.replace(/\s+/g, '_')}_${r.year}_${r.month}.eml`;
        downloadFile(emlBlob, emlFilename);
        drafted++;

        if (onSendEmailPayslip) {
          await onSendEmailPayslip(r);
        }
      }

      setEmailStatus(
        `Successfully generated and downloaded ${drafted} ready-to-send .eml draft file(s) with attached payslip PDFs!`
      );
    } catch (e) {
      alert('Error generating batch email drafts: ' + String(e));
    } finally {
      setIsBatchDrafting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span>Employee Payslips — {getMonthName(month)} {year}</span>
          </h2>
          <p className="text-slate-500">
            {monthRecords.length} payslips ready for bilingual PDF download and email draft distribution
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Email Selected Drafts Button */}
          {userRole !== 'viewer' && (
            <button
              type="button"
              disabled={selectedEmpIds.size === 0 || isBatchDrafting}
              onClick={handleBatchDownloadDrafts}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md font-medium hover:bg-blue-100 disabled:opacity-50"
              title="Download .eml drafts with embedded PDF slips for all selected employees"
            >
              {isBatchDrafting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Drafting...</span>
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Email Selected ({selectedEmpIds.size})</span>
                </>
              )}
            </button>
          )}

          {/* Download All Selected Combined PDF */}
          <button
            type="button"
            disabled={selectedEmpIds.size === 0 || isExporting}
            onClick={handleDownloadSelectedCombinedPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-50"
            title="Download all selected payslips in one single multi-page PDF"
          >
            <FileDown className="w-3.5 h-3.5 text-indigo-500" />
            <span>{isExporting ? 'Generating PDF...' : `Download Selected as PDF (${selectedEmpIds.size})`}</span>
          </button>

          <button
            type="button"
            disabled={!activeRecord}
            onClick={handlePrintActive}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Current</span>
          </button>

          <button
            type="button"
            disabled={!activeRecord || isExporting}
            onClick={handleDownloadActivePdf}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Generating PDF...' : 'Download Current PDF'}</span>
          </button>
        </div>
      </div>

      {emailStatus && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 rounded text-xs text-blue-900 dark:text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{emailStatus}</span>
          </div>
          <button type="button" onClick={() => setEmailStatus(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* Main Split View: Left List & Right Live A4 Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Employee Selection List */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs flex flex-col max-h-[750px]">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900"
            >
              {selectedEmpIds.size === monthRecords.length && monthRecords.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-slate-900 dark:text-slate-100" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Select All ({monthRecords.length})</span>
            </button>
            <span className="text-slate-500 font-mono">{selectedEmpIds.size} checked</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {monthRecords.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No salary records in {getMonthName(month)} {year}. Please run payroll or enter salary records first.
              </div>
            ) : (
              monthRecords.map((r) => {
                const emp = employees.find((e) => e.empId === r.empId);
                const isChecked = selectedEmpIds.has(r.empId);
                const isActive = activeRecord?.empId === r.empId;

                return (
                  <div
                    key={r.empId}
                    onClick={() => setActivePreviewEmpId(r.empId)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(r.empId);
                        }}
                        className="text-slate-400 hover:text-slate-700 p-0.5"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-slate-900 dark:text-slate-100" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <div className="truncate flex-1 min-w-0">
                        <div className="text-slate-900 dark:text-slate-100 truncate">
                          <span className="font-mono text-slate-500 mr-1.5">{r.empId}</span>
                          {r.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {emp?.email ? emp.email : 'No email'} · Net:{' '}
                          <span className="font-mono tabular-nums">{formatCurrency(r.net, company.currency)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadPdfFor(r);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
                        title="Download this payslip as PDF"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Individual Email button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEmailModalRecord(r);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Send / Create Email Draft"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </button>

                      {r.emailedAt && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                          ✓ {r.emailedAt.substring(5, 10)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: A4 Document Live Preview */}
        <div className="lg:col-span-2 bg-slate-100 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col items-center max-h-[750px] overflow-y-auto">
          {activeRecord && activeEmp ? (
            <div className="w-full space-y-3">
              {/* Quick Actions Bar for Active Document */}
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Preview: {activeRecord.name} ({activeRecord.empId})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEmailModalRecord(activeRecord)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 rounded font-medium hover:bg-blue-100"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send / Email Draft</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadActivePdf}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded font-medium hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-center">
                <PayslipDoc
                  id="payslip-preview-render"
                  company={company}
                  employee={activeEmp}
                  record={activeRecord}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-xs">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <span>Select an employee record to preview payslip</span>
            </div>
          )}
        </div>
      </div>

      {/* Hidden container rendering all selected payslips for batch PDF generation */}
      <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '800px' }}>
        {monthRecords.map((r) => {
          const emp = employees.find((e) => e.empId === r.empId);
          if (!emp) return null;
          return (
            <div key={r.empId} style={{ marginBottom: '20px' }}>
              <PayslipDoc
                id={`hidden-payslip-render-${r.empId}`}
                company={company}
                employee={emp}
                record={r}
              />
            </div>
          );
        })}
      </div>

      {/* Email Payslip Modal */}
      {emailModalRecord && (
        <EmailPayslipModal
          company={company}
          employee={employees.find((e) => e.empId === emailModalRecord.empId) || activeEmp!}
          record={emailModalRecord}
          onClose={() => setEmailModalRecord(null)}
          onMarkSent={async (rec) => {
            if (onSendEmailPayslip) {
              await onSendEmailPayslip(rec);
            }
            return true;
          }}
        />
      )}
    </div>
  );
};
