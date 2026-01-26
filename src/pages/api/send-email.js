import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, projectName, clientName, magicLinkToken, files } = req.body;

    if (!to || !projectName || !magicLinkToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const downloadUrl = `${appUrl}/download/${magicLinkToken}`;

    const fileList = files.map(f => `• ${f.type}`).join('\n');

    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // Change to your verified domain
      to: [to],
      subject: `Your files are ready: ${projectName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📁 Your Files Are Ready</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="margin-top: 0;">Hi ${clientName},</p>
            
            <p>Your files for <strong>${projectName}</strong> are ready for download:</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Files included:</strong></p>
              <p style="margin: 10px 0 0 0; white-space: pre-line;">${fileList}</p>
            </div>
            
            <a href="${downloadUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 10px 0;">
              📥 Download Files
            </a>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This link will expire in 7 days. If you have any questions, please reply to this email.
            </p>
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

Files included:
${fileList}

Download here: ${downloadUrl}

This link will expire in 7 days.
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
