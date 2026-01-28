import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Notification emails
const NOTIFY_EMAILS = ['contact@dxtr.au'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    
    console.log('Resend webhook received:', JSON.stringify(event, null, 2));
    
    // Resend webhook event types:
    // email.sent, email.delivered, email.delivery_delayed
    // email.bounced, email.complained, email.failed, email.suppressed
    
    const eventType = event.type;
    const emailData = event.data;
    
    // Only notify on problems
    if (!['email.bounced', 'email.complained', 'email.delivery_delayed', 'email.failed', 'email.suppressed'].includes(eventType)) {
      // Log successful deliveries but don't notify
      console.log(`Email event: ${eventType} for ${emailData?.to?.[0] || 'unknown'}`);
      return res.status(200).json({ received: true });
    }
    
    // Build notification based on event type
    let subject = '';
    let html = '';
    const recipientEmail = emailData?.to?.[0] || 'Unknown';
    const emailSubject = emailData?.subject || 'Unknown subject';
    
    switch (eventType) {
      case 'email.bounced':
        subject = `🚨 EMAIL BOUNCED: ${recipientEmail}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #ef4444;">🚨 Email Bounced</h2>
            <p>An email failed to deliver and bounced back.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>To:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${recipientEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailSubject}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Bounce Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailData?.bounce?.type || 'Unknown'}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Reason:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailData?.bounce?.message || 'No reason provided'}</td></tr>
            </table>
            <p style="color: #ef4444; font-weight: bold;">⚠️ Action required: Contact the client directly or verify their email address.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Received at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;
        
      case 'email.complained':
        subject = `⚠️ SPAM COMPLAINT: ${recipientEmail}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #f59e0b;">⚠️ Spam Complaint Received</h2>
            <p>A recipient marked your email as spam.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>From:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${recipientEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailSubject}</td></tr>
            </table>
            <p style="color: #f59e0b; font-weight: bold;">⚠️ This recipient should be removed from future emails to protect your sender reputation.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Received at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;
        
      case 'email.delivery_delayed':
        subject = `⏳ EMAIL DELAYED: ${recipientEmail}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #f59e0b;">⏳ Email Delivery Delayed</h2>
            <p>An email is experiencing delivery delays. It may still be delivered.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>To:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${recipientEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailSubject}</td></tr>
            </table>
            <p style="color: #6b7280;">The email service will continue trying to deliver. You'll be notified if it bounces.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Received at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;
        
      case 'email.failed':
        subject = `🚨 EMAIL FAILED: ${recipientEmail}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #ef4444;">🚨 Email Failed to Send</h2>
            <p>An email completely failed to send.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>To:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${recipientEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailSubject}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Error:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailData?.error?.message || 'Unknown error'}</td></tr>
            </table>
            <p style="color: #ef4444; font-weight: bold;">⚠️ Action required: The client did NOT receive this email. Contact them directly or try resending.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Received at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;
        
      case 'email.suppressed':
        subject = `🚫 EMAIL SUPPRESSED: ${recipientEmail}`;
        html = `
          <div style="font-family: sans-serif; max-width: 600px;">
            <h2 style="color: #ef4444;">🚫 Email Suppressed - Not Delivered</h2>
            <p>This email was blocked because the recipient is on the suppression list (due to a previous bounce or complaint).</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>To:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${recipientEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailSubject}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Reason:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailData?.suppressed?.reason || 'On suppression list'}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${emailData?.suppressed?.type || 'Unknown'}</td></tr>
            </table>
            <p style="color: #ef4444; font-weight: bold;">⚠️ Action required: The client did NOT receive this email. Their email address may be invalid or they previously marked emails as spam. Contact them directly with a different email address.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
              Received at ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}
            </p>
          </div>
        `;
        break;
    }
    
    // Send notification email
    const { error } = await resend.emails.send({
      from: 'DXTR Internal <internal@send.dxtr.au>',
      to: NOTIFY_EMAILS,
      subject,
      html
    });
    
    if (error) {
      console.error('Failed to send webhook notification:', error);
    }
    
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to acknowledge receipt (prevents retries)
    return res.status(200).json({ received: true, error: error.message });
  }
}
