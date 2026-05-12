// pages/api/send-email.js
// Updated to use permanent client dashboard links instead of magic links

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, projectName, clientName, dashboardToken, files, pendingFiles, previouslySentFiles } = req.body;

    if (!to || !Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: 'Missing recipients', errorType: 'VALIDATION' });
    }

    if (!dashboardToken) {
      return res.status(400).json({ error: 'Missing dashboard token', errorType: 'VALIDATION' });
    }

    // Build the permanent dashboard URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://admin.dxtr.au';
    const dashboardUrl = `${baseUrl}/client/${dashboardToken}`;

    // Build file list HTML
    const fileListHtml = files.map(f => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <span style="font-weight: 500;">${f.type}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">
          ${f.name}
        </td>
      </tr>
    `).join('');

    // Pending files section
    const pendingHtml = pendingFiles?.length > 0 ? `
      <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>Coming soon:</strong> ${pendingFiles.map(f => f.type).join(', ')}
        </p>
      </div>
    ` : '';

    // Previously sent section
    const previousHtml = previouslySentFiles?.length > 0 ? `
      <div style="margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
          <strong>Previously delivered:</strong>
        </p>
        <p style="margin: 0; color: #9ca3af; font-size: 13px;">
          ${previouslySentFiles.map(f => f.type).join(', ')}
        </p>
      </div>
    ` : '';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; width: 48px; height: 48px; background: #000; border-radius: 12px; line-height: 48px; color: #fff; font-weight: bold; font-size: 24px;">D</div>
    </div>
    
    <!-- Main Card -->
    <div style="background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Content -->
      <div style="padding: 32px;">
        <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #111827;">
          Your files are ready
        </h1>
        <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 16px;">
          Hi ${clientName}, new files have been added to <strong>${projectName}</strong>.
        </p>
        
        <!-- Files Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Type</th>
              <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">File</th>
            </tr>
          </thead>
          <tbody>
            ${fileListHtml}
          </tbody>
        </table>
        
        <!-- CTA Button -->
        <a href="${dashboardUrl}" style="display: block; text-align: center; background: #000; color: #fff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
          View & Download Files
        </a>
        
        ${pendingHtml}
        ${previousHtml}
      </div>
      
      <!-- Footer -->
      <div style="padding: 24px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 13px; text-align: center;">
          You can access all your projects anytime at your personal dashboard.
        </p>
      </div>
    </div>
    
    <!-- Bottom Footer -->
    <div style="text-align: center; margin-top: 32px;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px;">
        Powered by DXTR
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'DXTR <noreply@dxtr.au>',
      to: to,
      subject: `Your ${projectName} files are ready`,
      html: emailHtml,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message, errorType: 'RESEND' });
    }

    return res.status(200).json({ success: true, messageId: data?.id });
    
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: error.message, errorType: 'SERVER' });
  }
}
