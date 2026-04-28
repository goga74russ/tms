// Print layout — no nav, clean white page
export default function PrintLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Печать документа</title>
                <style>{`
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Arial', sans-serif; font-size: 11pt; color: #000; background: #fff; }
                    @media print {
                        body { font-size: 10pt; }
                        .no-print { display: none !important; }
                        .page-break { page-break-before: always; }
                        @page { margin: 15mm; size: A4; }
                    }
                    @media screen {
                        body { background: #e5e5e5; }
                        .print-page { background: #fff; max-width: 210mm; margin: 20px auto; padding: 20mm; box-shadow: 0 2px 12px rgba(0,0,0,.15); min-height: 297mm; }
                    }
                    .print-actions { position: fixed; top: 10px; right: 10px; display: flex; gap: 8px; z-index: 100; }
                    .print-btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
                    .print-btn-primary { background: #2563eb; color: #fff; }
                    .print-btn-secondary { background: #6b7280; color: #fff; }
                    .doc-title { font-size: 16pt; font-weight: 700; text-align: center; margin-bottom: 4px; }
                    .doc-subtitle { font-size: 10pt; text-align: center; color: #555; margin-bottom: 12px; }
                    .doc-header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
                    .org-name { font-size: 12pt; font-weight: 700; }
                    .doc-number { text-align: right; font-size: 11pt; }
                    hr { border: none; border-top: 1px solid #ccc; margin: 8px 0; }
                    .section-title { font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #333; margin: 10px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
                    .field-row { display: flex; margin-bottom: 4px; }
                    .field-label { color: #666; font-size: 9pt; min-width: 140px; flex-shrink: 0; }
                    .field-value { font-size: 10pt; }
                    .field-value-bold { font-size: 11pt; font-weight: 700; }
                    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
                    table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 8px 0; }
                    th { background: #f0f0f0; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 8pt; }
                    td { border: 1px solid #ccc; padding: 3px 6px; }
                    tr:nth-child(even) { background: #fafafa; }
                    .totals-block { margin-left: auto; width: 260px; margin-top: 8px; }
                    .total-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 9pt; }
                    .total-row-bold { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11pt; font-weight: 700; border-top: 2px solid #000; }
                    .sig-block { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 16px; }
                    .sig-item { }
                    .sig-label { font-size: 9pt; color: #666; margin-bottom: 20px; }
                    .sig-line { border-bottom: 1px solid #000; margin: 0 4px 2px; height: 18px; }
                    .sig-name { font-size: 8pt; color: #444; }
                    .footer-note { margin-top: 16px; font-size: 8pt; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 6px; }
                    .loading { text-align: center; padding: 60px; font-size: 14pt; color: #666; }
                    .stamp-box { border: 2px solid #000; padding: 8px; display: inline-block; min-width: 120px; text-align: center; }
                    .stamp-approved { color: #006600; font-weight: 700; font-size: 12pt; }
                    .stamp-rejected { color: #cc0000; font-weight: 700; font-size: 12pt; }
                `}</style>
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
