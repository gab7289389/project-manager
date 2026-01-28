
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Your notification email addresses
const NOTIFY_EMAILS = ['contact@dxtr.au']; // Add co-owner email here too

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;

    let subject = '';
    let html = '';

    switch (type) {
      case 'files_sent':
        subject = data.success 
          ? `✅ Files sent to ${data.clientName}` 
          : `⚠️ FAILED: Files to ${data.clientName}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: ${data.success ? '#10b981' : '#ef4444'};">
              ${data.success ? '✅ Files Sent Successfully' : '⚠️ File Send Failed'}
            </h2>
            <p><strong>Project:</strong> ${data.projectName}</p>
            <p><strong>Client:</strong> ${data.clientName} (${data.clientEmail})</p>
            <p><strong>Files:</strong></p>
            <ul>
              ${data.files.map(f => `<li>${f}</li>`).join('')}
            </ul>
            ${!data.success ? `<p style="color: #ef4444;"><strong>Error:</strong> ${data.error || 'Unknown error'}</p>` : ''}
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Sent at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;

      case 'project_complete':
        subject = `🎉 Status Updated: Complete (${data.projectName})`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #10b981;">🎉 Status Updated: Complete</h2>
            <p><strong>Project:</strong> ${data.projectName}</p>
            <p><strong>Client:</strong> ${data.clientName}</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Completed at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;

      case 'project_revision':
        subject = `🔄 Status Updated: Revision (${data.projectName})`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #f59e0b;">🔄 Status Updated: Revision</h2>
            <p><strong>Project:</strong> ${data.projectName}</p>
            <p><strong>Client:</strong> ${data.clientName}</p>
            ${data.revisionNote ? `<p><strong>Note:</strong> ${data.revisionNote}</p>` : ''}
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Updated at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;

      case 'email_bounced':
        subject = `🚨 EMAIL BOUNCED: ${data.clientEmail}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #ef4444;">🚨 Email Delivery Failed</h2>
            <p><strong>Project:</strong> ${data.projectName}</p>
            <p><strong>Client:</strong> ${data.clientName}</p>
            <p><strong>Email:</strong> ${data.clientEmail}</p>
            <p><strong>Reason:</strong> ${data.reason || 'Bounced or rejected'}</p>
            <p style="color: #ef4444; font-weight: bold;">Please contact the client directly.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Failed at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;

      default:
        return res.status(400).json({ error: 'Unknown notification type' });
    }

    const { error } = await resend.emails.send({
      from: 'DXTR Internal <internal@send.dxtr.au>',
      to: NOTIFY_EMAILS,
      subject,
      html
    });

    if (error) {
      console.error('Notification email error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Notification error:', error);
    return res.status(500).json({ error: 'Failed to send notification' });
  }
}
