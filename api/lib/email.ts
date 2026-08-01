function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function magicLinkHtml(verifyUrl: string, ttlMinutes: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>PAC Recovery Portal — Sign in</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #e2e8f0;max-width:560px;width:100%;overflow:hidden;">
        <tr>
          <td style="background:#1d4ed8;padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#bfdbfe;">Government of Uttar Pradesh</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#fff;">Department of Excise — PAC Recovery Portal</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">
              Click the button below to sign in. This link expires in <strong>${ttlMinutes} minutes</strong> and can only be used once.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#2563eb;border-radius:6px;">
                  <a href="${esc(verifyUrl)}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:6px;">
                    Verify &amp; Continue
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">Or copy this link into your browser:</p>
            <p style="margin:0 0 28px;font-size:12px;color:#64748b;word-break:break-all;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px 12px;">${esc(verifyUrl)}</p>
            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">If you did not request this link, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">PAC Recovery Portal · Department of Excise, Government of Uttar Pradesh</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
