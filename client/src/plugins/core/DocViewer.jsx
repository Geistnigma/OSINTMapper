import React, { useMemo } from 'react';

/**
 * Simple Markdown → HTML renderer (zero deps).
 * Supports: h1-h4, bold, italic, code, code blocks, lists, links, hr, blockquote, tables.
 */
function md2html(md, t) {
  const codeBg = t?.bg || '#0d1117';
  const codeBorder = t?.border || '#2a3140';
  const thBg = t?.surfaceAlt || '#1e293b';

  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre style="background:${codeBg};border:1px solid ${codeBorder};border-radius:8px;padding:14px;overflow-x:auto;font-size:12px;line-height:1.6"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g, `<code style="background:${thBg};padding:2px 6px;border-radius:4px;font-size:12px">$1</code>`)
    .replace(/^#### (.+)$/gm, '<h4 style="font-size:14px;font-weight:700;margin:16px 0 6px">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:20px 0 8px">$1</h3>')
    .replace(/^## (.+)$/gm, `<h2 style="font-size:17px;font-weight:800;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid ${codeBorder}">$1</h2>`)
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:800;margin:0 0 12px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#58a6ff;text-decoration:none">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #3b82f6;padding:4px 12px;margin:8px 0;opacity:0.8;font-style:italic">$1</blockquote>')
    .replace(/^---$/gm, `<hr style="border:none;border-top:1px solid ${codeBorder};margin:16px 0"/>`)
    .replace(/^[\-\*] (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>')
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map(c => c.trim());
      return '<tr>' + cells.map(c => `<td style="padding:6px 12px;border:1px solid ${codeBorder};font-size:12px">${c}</td>`).join('') + '</tr>';
    })
    .replace(/((?:<li[^>]*>.*?<\/li>\n?)+)/g, '<ul style="padding-left:20px;margin:8px 0">$1</ul>')
    .replace(/((?:<tr>.*?<\/tr>\n?)+)/g, '<table style="border-collapse:collapse;width:100%;margin:12px 0">$1</table>')
    .replace(/<tr><td[^>]*>[\-:]+<\/td>(<td[^>]*>[\-:]+<\/td>)*<\/tr>/g, '')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7">')
    .replace(/\n(?!<)/g, '<br/>');

  html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (match) =>
    match.replace(/<tr>(.*?)<\/tr>/, (_, cells) =>
      '<tr>' + cells.replace(/<td/g, '<th').replace(/<\/td/g, '</th').replace(/th style="[^"]*"/g, `th style="padding:8px 12px;border:1px solid ${codeBorder};font-size:12px;font-weight:700;background:${thBg}"`) + '</tr>'
    )
  );

  return `<p style="margin:8px 0;line-height:1.7">${html}</p>`;
}

/**
 * DocViewer — Inline documentation renderer (not a modal).
 * Embedded inside PluginStore page.
 */
export default function DocViewer({ plugin, theme: t }) {
  const rendered = useMemo(() => md2html(plugin.docs || '_Aucune documentation disponible._', t), [plugin.docs, t]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px', color: t.text, fontSize: 13, maxWidth: 800, margin: '0 auto', width: '100%' }}
      dangerouslySetInnerHTML={{ __html: rendered }} />
  );
}
