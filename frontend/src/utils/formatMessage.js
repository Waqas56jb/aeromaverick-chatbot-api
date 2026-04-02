/**
 * Markdown-ish → HTML (same logic as original static index.html).
 */
export function formatMessage(text) {
  const linkTokens = [];
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
    const idx = linkTokens.length;
    linkTokens.push({ label: label.trim(), url: url.trim() });
    return `%%LINK_${idx}%%`;
  });

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  html = html.replace(/(https?:\/\/(www\.)?aeromaverick\.com([^\s<>,;)"]*)?)/g, (match, full, www, path) => {
    const display = "aeromaverick.com" + (path || "");
    const idx = linkTokens.length;
    linkTokens.push({ label: display, url: full });
    return `%%LINK_${idx}%%`;
  });

  html = html.replace(/\b(aeromaverick\.com(\/[^\s<>,;)"]*)?)\b/g, (match) => {
    if (match.includes("%%")) return match;
    const idx = linkTokens.length;
    linkTokens.push({ label: match, url: "https://" + match });
    return `%%LINK_${idx}%%`;
  });

  html = html.replace(/^###\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^##\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>[^]*?<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/\n\n+/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, "");

  html = html.replace(/%%LINK_(\d+)%%/g, (_, idx) => {
    const { label, url } = linkTokens[parseInt(idx, 10)];
    return `<a href="${url}" target="_blank" rel="noopener"><strong>${label}</strong></a>`;
  });

  return html;
}
