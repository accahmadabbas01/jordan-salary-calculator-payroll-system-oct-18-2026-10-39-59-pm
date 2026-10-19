import jsPDF from 'jspdf';
// html2canvas-pro understands Tailwind v4's oklch() colors, so slips keep their styling.
import html2canvas from 'html2canvas-pro';

export function downloadBlob(blob: Blob, filename: string): void {
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

function prepareClonedDocument(clonedDoc: Document) {
  // Render documents in light mode with no on-screen shadows regardless of app theme.
  clonedDoc.documentElement.classList.remove('dark');
  const style = clonedDoc.createElement('style');
  style.innerHTML = `
    * { color-scheme: light !important; }
    [id^="hidden-payslip-render"], [id$="-render"] { box-shadow: none !important; }
  `;
  clonedDoc.head.appendChild(style);
}

// Documents are designed for an A4-like 800px width; narrower on-screen previews get squeezed.
const DOC_WIDTH = 800;

async function renderCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  let target = element;
  let holder: HTMLDivElement | null = null;
  if (element.offsetWidth < DOC_WIDTH) {
    holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${DOC_WIDTH}px;background:#fff;`;
    target = element.cloneNode(true) as HTMLElement;
    target.removeAttribute('id');
    holder.appendChild(target);
    document.body.appendChild(holder);
  }
  try {
    return await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(target.scrollWidth, DOC_WIDTH),
      onclone: prepareClonedDocument,
    });
  } finally {
    holder?.remove();
  }
}

export interface PdfOptions {
  orientation?: 'p' | 'l';
  format?: 'a4';
  /** Password needed to open the PDF (standard 40-bit RC4 PDF encryption) */
  password?: string;
}

/** jsPDF options, adding encryption when a password is given. */
function pdfInit(options?: PdfOptions) {
  const init: any = { orientation: options?.orientation || 'p', unit: 'mm', format: options?.format || 'a4' };
  if (options?.password) {
    // A random owner password stops readers from lifting the restrictions; printing stays allowed.
    const owner = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    init.encryption = { userPassword: options.password, ownerPassword: owner, userPermissions: ['print'] };
  }
  return init;
}

export async function generatePdfBlob(element: HTMLElement, options?: PdfOptions): Promise<Blob> {
  const canvas = await renderCanvas(element);

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new jsPDF(pdfInit(options));

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const printableWidth = pdfWidth - margin * 2;
  const printableHeight = (canvas.height * printableWidth) / canvas.width;

  if (printableHeight <= pdfHeight - margin * 2) {
    pdf.addImage(imgData, 'JPEG', margin, margin, printableWidth, printableHeight);
  } else {
    let heightLeft = printableHeight;
    let position = margin;

    pdf.addImage(imgData, 'JPEG', margin, position, printableWidth, printableHeight);
    heightLeft -= (pdfHeight - margin * 2);

    while (heightLeft > 0) {
      position -= (pdfHeight - margin * 2);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, position, printableWidth, printableHeight);
      heightLeft -= (pdfHeight - margin * 2);
    }
  }

  return pdf.output('blob');
}

export async function exportHtmlToPdf(element: HTMLElement, filename: string, options?: PdfOptions): Promise<Blob> {
  const blob = await generatePdfBlob(element, options);
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  return blob;
}

export async function exportMultipleHtmlToPdf(
  elements: HTMLElement[],
  filename: string,
  options?: PdfOptions
): Promise<Blob> {
  const pdf = new jsPDF(pdfInit(options));

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const printableWidth = pdfWidth - margin * 2;

  for (let i = 0; i < elements.length; i++) {
    if (i > 0) pdf.addPage();
    const el = elements[i];
    const canvas = await renderCanvas(el);
    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    // Fit each document on its own page, keeping the aspect ratio.
    const maxHeight = pdfHeight - margin * 2;
    let w = printableWidth;
    let h = (canvas.height * w) / canvas.width;
    if (h > maxHeight) {
      w = (w * maxHeight) / h;
      h = maxHeight;
    }
    pdf.addImage(imgData, 'JPEG', (pdfWidth - w) / 2, margin, w, h);
  }

  const blob = pdf.output('blob');
  downloadBlob(blob, filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  return blob;
}

/**
 * Robust popup-free printing using a hidden iframe
 */
export function printHtmlElement(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) {
    console.warn(`Element with id ${elementId} not found for printing.`);
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>Print Document</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4; margin: 8mm; }
          body {
            font-family: 'IBM Plex Sans Arabic', 'Plus Jakarta Sans', system-ui, sans-serif;
            background: #ffffff;
            color: #0f172a;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        </style>
      </head>
      <body>
        ${el.outerHTML}
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      document.body.removeChild(iframe);
    } catch (e) {
      // ignore
    }
  }, 5000);
}
