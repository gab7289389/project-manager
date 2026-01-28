import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, projectName, clientName, magicLinkToken, files, pendingFiles, previouslySentFiles, isResend } = req.body;

    if (!to || !projectName || !magicLinkToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const downloadUrl = `${appUrl}/download/${magicLinkToken}`;

    const newFileList = files?.length ? files.map(f => `• ${f.type}`).join('\n') : '';
    const pendingFileList = pendingFiles?.length ? pendingFiles.map(f => `• ${f.type}`).join('\n') : '';
    const previousFileList = previouslySentFiles?.length ? previouslySentFiles.map(f => `• ${f.type}`).join('\n') : '';
    
    const subject = isResend 
      ? `📎 Download link renewed: ${projectName}`
      : `Your files are ready: ${projectName}`;
    
    const headerText = isResend 
      ? '📁 New Download Link'
      : '📁 Your Files Are Ready';
    
    const introText = isResend
      ? `Here's a fresh download link for your files for <strong>${projectName}</strong>:`
      : `Your files for <strong>${projectName}</strong> are ready for download:`;

    const { data, error } = await resend.emails.send({
      from: 'DXTR Notifications <notif@send.dxtr.au>',
      replyTo: ['contact@dxtr.au'],
      to: [to],
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${headerText}</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="margin-top: 0;">Hi ${clientName},</p>
            
            <p>${introText}</p>
            
            ${newFileList ? `
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #10b981; margin: 20px 0;">
              <p style="margin: 0; color: #059669; font-size: 14px;"><strong>${isResend ? '📦 Available for download:' : '🆕 New files ready:'}</strong></p>
              <p style="margin: 10px 0 0 0; white-space: pre-line;">${newFileList}</p>
            </div>
            ` : ''}
            
            ${previouslySentFiles?.length ? `
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>📦 Previously sent (also available):</strong></p>
              <p style="margin: 10px 0 0 0; white-space: pre-line; color: #6b7280;">${previousFileList}</p>
            </div>
            ` : ''}
            
            ${pendingFiles?.length ? `
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; border: 1px solid #d1d5db; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>⏳ Still in progress:</strong></p>
              <p style="margin: 10px 0 0 0; white-space: pre-line; color: #9ca3af;">${pendingFileList}</p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">We'll send another email when these are ready.</p>
            </div>
            ` : ''}
            
            <a href="${downloadUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 10px 0;">
              📥 Download Files
            </a>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This link will expire in 7 days.
            </p>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 12px 15px; border-radius: 8px; margin-top: 20px;">
              <p style="margin: 0; color: #92400e; font-size: 13px;">
                <strong>📧 Questions?</strong> Please don't reply to this email. Instead, contact us at <a href="mailto:contact@dxtr.au" style="color: #7c3aed;">contact@dxtr.au</a>
              </p>
            </div>
          </div>
          
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
            Sent via Project Manager
          </p>
        </body>
        </html>
      `,
      text: `
Hi ${clientName},

Your files for ${projectName} are ready for download:

New files ready:
${newFileList}
${previouslySentFiles?.length ? `
Previously sent (also available):
${previousFileList}
` : ''}${pendingFiles?.length ? `
Still in progress:
${pendingFileList}
We'll send another email when these are ready.
` : ''}
Download here: ${downloadUrl}

This link will expire in 7 days.

Questions? Please don't reply to this email. Instead, contact us at contact@dxtr.au
      `.trim()
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, emailId: data.id });
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
