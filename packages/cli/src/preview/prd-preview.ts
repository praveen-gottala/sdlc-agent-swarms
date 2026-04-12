/**
 * @module @agentforge/cli/preview/prd-preview
 *
 * Renders a PRD markdown document as a styled HTML page for browser preview.
 */

/** Render markdown as a simple styled HTML page for preview. */
export function generatePRDPreviewHtml(prdContent: string, appName: string): string {
  // Simple markdown-to-HTML: headers, bold, italic, lists, paragraphs
  const htmlBody = prdContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '')
    ;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PRD Preview — ${appName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      color: #333;
      line-height: 1.6;
    }
    .header {
      background: #1e293b;
      color: #f1f5f9;
      padding: 40px 24px;
      text-align: center;
    }
    .header h1 { font-size: 28px; font-weight: 700; }
    .header p { font-size: 14px; opacity: 0.8; margin-top: 8px; }
    .content {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      background: #fff;
      min-height: 60vh;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .content h1 { font-size: 28px; margin: 32px 0 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    .content h2 { font-size: 22px; margin: 28px 0 12px; color: #334155; }
    .content h3 { font-size: 18px; margin: 24px 0 8px; color: #475569; }
    .content p { margin: 12px 0; }
    .content ul { margin: 12px 0 12px 24px; }
    .content li { margin: 4px 0; }
    .content strong { color: #1e293b; }
    .footer {
      text-align: center;
      padding: 32px 24px;
      color: #888;
      font-size: 14px;
    }
    .footer kbd {
      background: #e0e0e0;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${appName} — PRD Preview</h1>
    <p>Review the generated PRD below, then return to your terminal.</p>
  </div>
  <div class="content">
    ${htmlBody}
  </div>
  <div class="footer">
    Return to your terminal — type <kbd>y</kbd> to save or <kbd>n</kbd> to discard.
  </div>
</body>
</html>`;
}
