export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character as keyof typeof escapeEmailHtml.chars] || character);
}
escapeEmailHtml.chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

type BaseEmailOptions = {
  title: string;
  preheader: string;
  institutionName?: string;
  institutionLogoUrl?: string;
  bodyContent: string;
  footerText?: string;
};

export function BaseEmailTemplate({
  title,
  preheader,
  institutionName = "Nisaab360",
  institutionLogoUrl,
  domainLogoUrl,
  bodyContent,
  footerText = `Sent by ${institutionName}`,
}: BaseEmailOptions & { domainLogoUrl?: string }) {
  const logoUrl = institutionLogoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(institutionName)}&background=dde3ec&color=11213D`;
  const domainLogo = domainLogoUrl || `https://${process.env.NEXT_PUBLIC_APP_DOMAIN || "nisaab360.app"}/Logo.png`;
  
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<title>${escapeEmailHtml(title)}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: #EEF1F6; }

  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .fluid-padding { padding-left: 24px !important; padding-right: 24px !important; }
    .headline { font-size: 22px !important; }
    .stub-cell { display: block !important; width: 100% !important; }
    .stub-divider { display: none !important; }
    .stub-cell-2 { border-top: 1px dashed #C8AD6E !important; border-left: none !important; padding-top: 16px !important; margin-top: 16px !important; }
    .stamp-cell { display: none !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EEF1F6;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#EEF1F6;">
    ${escapeEmailHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F6;">
    <tr>
      <td align="center" style="padding: 44px 16px;">

        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">

          <!-- Letterhead -->
          <tr>
            <td class="fluid-padding" style="padding: 0 4px 18px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:12px;">
                          <img src="${escapeEmailHtml(logoUrl)}" width="36" height="36" alt="${escapeEmailHtml(institutionName)}" style="display:block; background-color:#dde3ec; border-radius:4px; object-fit:contain;">
                        </td>
                        <td valign="middle">
                          <span style="font-size:17px; color:#11213D; font-weight:700;">${escapeEmailHtml(institutionName)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" align="right" width="56">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="34" height="34" align="center" valign="middle">
                          <img src="${escapeEmailHtml(domainLogo)}" width="34" height="34" alt="Platform Logo" style="display:block; border-radius:4px; object-fit:contain;">
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hairline -->
          <tr>
            <td class="fluid-padding" style="padding: 0 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top: 1px solid #D7DCE6; font-size:1px; line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background-color:#ffffff; border:1px solid #D7DCE6;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="fluid-padding" align="center" style="padding: 26px 40px 0 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <p style="margin:0; font-size:12px; color:#A6ACB8;">
                ${escapeEmailHtml(footerText)}
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function EmailHeadline({ eyebrow, headline, stamp }: { eyebrow?: string; headline: string; stamp?: string }) {
  return `
<!-- Headline + stamp -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="fluid-padding" style="padding: 36px 40px 6px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="top" style="font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif;">
            ${eyebrow ? `<p style="margin:0 0 10px 0; font-size:13px; color:#5B6472; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${escapeEmailHtml(eyebrow)}</p>` : ''}
            <h1 class="headline" style="margin:0; font-size:25px; line-height:1.4; font-weight:700; color:#11213D;">
              ${escapeEmailHtml(headline)}
            </h1>
          </td>
          ${stamp ? `
          <td class="stamp-cell" valign="top" width="118" align="right">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border:1.5px solid #A6802E; padding:7px 12px; -webkit-transform:rotate(-6deg); -moz-transform:rotate(-6deg); transform:rotate(-6deg); font-family: Georgia, serif; font-style:italic; font-size:12px; color:#A6802E; white-space:nowrap;">
                  ${escapeEmailHtml(stamp)}
                </td>
              </tr>
            </table>
          </td>
          ` : ''}
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}

export function EmailBodyText(content: string) {
  return `
<!-- Body copy -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="fluid-padding" style="padding: 6px 40px 24px 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="margin:0; font-size:15px; line-height:1.65; color:#475267;">
        ${content}
      </div>
    </td>
  </tr>
</table>
`;
}

export function EmailCredentialStub({ loginId, temporaryPassword, footerNote = "Valid for a single sign-in" }: { loginId: string; temporaryPassword: string; footerNote?: string }) {
  return `
<!-- Credential stub -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="fluid-padding" style="padding: 6px 40px 24px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DEC98B;">
        <tr>
          <td style="padding: 22px 24px 16px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="stub-cell" width="50%" valign="top" style="padding-right:20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                  <p style="margin:0 0 6px 0; font-size:12px; color:#8E8460;">Login ID</p>
                  <p style="margin:0; font-size:17px; font-weight:700; color:#11213D; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; word-break:break-all;">${escapeEmailHtml(loginId)}</p>
                </td>
                <td class="stub-divider" width="1" style="border-left: 1px dashed #C8AD6E; font-size:1px; line-height:1px;">&nbsp;</td>
                <td class="stub-cell stub-cell-2" width="50%" valign="top" style="padding-left:20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                  <p style="margin:0 0 6px 0; font-size:12px; color:#8E8460;">Temporary password</p>
                  <p style="margin:0; font-size:17px; font-weight:700; color:#11213D; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; word-break:break-all;">${escapeEmailHtml(temporaryPassword)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px dashed #E4D6A9; padding: 10px 24px; background-color:#FBF8F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <p style="margin:0; font-size:12px; color:#9C8A4E;">${escapeEmailHtml(footerNote)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}

export function EmailCTAButton({ href, label }: { href: string; label: string }) {
  return `
<!-- CTA -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="fluid-padding" style="padding: 6px 40px 24px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background-color:#11213D;">
            <a href="${escapeEmailHtml(href)}" target="_blank" style="display:inline-block; padding:13px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">
              ${escapeEmailHtml(label)}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}

export function EmailSecurityNote(note: string) {
  return `
<!-- Security note -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td class="fluid-padding" style="padding: 24px 40px 36px 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-top:1px solid #EEF1F6; font-size:1px; line-height:1px;">&nbsp;</td></tr>
      </table>
      <p style="margin:14px 0 0 0; font-size:13px; line-height:1.6; color:#9AA2B1;">
        ${escapeEmailHtml(note)}
      </p>
    </td>
  </tr>
</table>
`;
}
