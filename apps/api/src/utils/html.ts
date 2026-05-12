// ============================================================
// A-P1-7: HTML escape helper for safe interpolation in email templates.
// Anything that could ever contain user-controlled text MUST go through
// escapeHtml() before being dropped into an HTML string.
// ============================================================

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
