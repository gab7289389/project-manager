import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, projectName, clientName, magicLinkToken, files, pendingFiles, previouslySentFiles, isResend: isResendEmail } = req.body;

    // Validate required fields
    if (!to || !projectName || !magicLinkToken) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        errorType: 'validation',
        details: 'Email, project name, and magic link token are required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({ 
        error: 'Invalid email format',
        errorType: 'invalid_email',
        details: `The email "${to}" appears to be invalid`
      });
    }

    // Check for obviously fake/test domains
    const fakeDomains = ['test.com', 'example.com', 'fake.com', 'asdf.com', 'asd.com'];
    const emailDomain = to.split('@')[1]?.toLowerCase();
    if (fakeDomains.includes(emailDomain)) {
      return res.status(400).json({
        error: 'Suspicious email domain',
        errorType: 'suspicious_email',
        details: `The domain "${emailDomain}" looks like a test/fake domain`
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const downloadUrl = `${appUrl}/download/${magicLinkToken}`;

    const newFileList = files?.length ? files.map(f => `• ${f.type}`).join('\n') : '';
    const pendingFileList = pendingFiles?.length ? pendingFiles.map(f => `• ${f.type}`).join('\n') : '';
    const previousFileList = previouslySentFiles?.length ? previouslySentFiles.map(f => `• ${f.type}`).join('\n') : '';
    
    const subject = isResendEmail 
      ? `📎 Download link renewed: ${projectName}`
      : `Your files are ready: ${projectName}`;
    
    const headerText = isResendEmail 
      ? '📁 New Download Link'
      : '📁 Your Files Are Ready';
    
    const introText = isResendEmail
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
              <p style="margin: 0; color: #059669; font-size: 14px;"><strong>${isResendEmail ? '📦 Available for download:' : '🆕 New files ready:'}</strong></p>
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
      console.error('Resend API error:', error);
      
      // Parse specific Resend error types
      let errorType = 'api_error';
      let errorDetails = error.message || 'Unknown error';
      const errorName = error.name || '';
      const errorMsg = (error.message || '').toLowerCase();
      
      // Rate limiting
      if (errorMsg.includes('rate limit') || errorMsg.includes('too many') || error.statusCode === 429) {
        errorType = 'rate_limit';
        errorDetails = 'Email rate limit exceeded. Please wait a few minutes before sending more emails.';
      }
      // Validation errors
      else if (errorMsg.includes('validation') || errorMsg.includes('invalid email')) {
        errorType = 'invalid_email';
        errorDetails = 'The email address is invalid or does not exist.';
      }
      // Domain/sender issues
      else if (errorMsg.includes('not verified') || errorMsg.includes('domain') || errorMsg.includes('sender')) {
        errorType = 'domain_error';
        errorDetails = 'Email sender domain is not properly verified. Contact admin.';
      }
      // API key issues
      else if (errorMsg.includes('api key') || errorMsg.includes('unauthorized') || errorMsg.includes('authentication') || error.statusCode === 401) {
        errorType = 'auth_error';
        errorDetails = 'Email service authentication failed. API key may be invalid or expired.';
      }
      // Account issues (quota, suspended, etc)
      else if (errorMsg.includes('quota') || errorMsg.includes('limit exceeded') || errorMsg.includes('account')) {
        errorType = 'account_limit';
        errorDetails = 'Email account limit reached or account issue. Check your Resend dashboard.';
      }
      // Payment/billing issues
      else if (errorMsg.includes('payment') || errorMsg.includes('billing') || errorMsg.includes('subscription') || error.statusCode === 402) {
        errorType = 'billing_error';
        errorDetails = 'Email service billing issue. Check your Resend account payment status.';
      }
      // Forbidden (blocked, suspended)
      else if (error.statusCode === 403) {
        errorType = 'account_suspended';
        errorDetails = 'Email sending is blocked. Your Resend account may be suspended.';
      }
      // Service unavailable
      else if (error.statusCode === 503 || error.statusCode === 502) {
        errorType = 'service_unavailable';
        errorDetails = 'Email service is temporarily unavailable. Please try again in a few minutes.';
      }
      
      return res.status(500).json({ 
        error: errorDetails,
        errorType,
        originalError: error.message,
        statusCode: error.statusCode
      });
    }

    return res.status(200).json({ success: true, emailId: data.id });
  } catch (error) {
    console.error('Email send error:', error);
    
    // Handle network/connection errors
    let errorType = 'unknown';
    let errorDetails = 'Failed to send email';
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorType = 'network_error';
      errorDetails = 'Could not connect to email service. Check internet connection.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
      errorType = 'timeout';
      errorDetails = 'Email service timed out. Please try again.';
    } else if (error.code === 'ECONNRESET') {
      errorType = 'connection_reset';
      errorDetails = 'Connection to email service was reset. Please try again.';
    } else if (error.message) {
      errorDetails = error.message;
    }
    
    return res.status(500).json({ 
      error: errorDetails,
      errorType,
      originalError: error.message
    });
  }
}
