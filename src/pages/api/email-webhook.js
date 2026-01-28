import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    console.log('Webhook received:', event.type);

    if (event.type === 'email.received') {
      const from = event.data.from || '';
      const subject = event.data.subject || '(No subject)';
      const emailId = event.data.email_id;
      
      // Extract email address
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;

      // Send notification only (no content fetching to avoid rate limits)
      const { data, error } = await resend.emails.send({
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        to: ['contact@dxtr.au'],
        subject: `📧 Reply from ${fromEmail}: ${subject}`,
        html: `
          <div style="padding: 20px; background: #7c3aed; color: white; margin-bottom: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0 0 10px 0;">📧 Client Reply</h2>
            <p style="margin: 0; font-size: 20px;"><strong>${fromEmail}</strong></p>
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px;">
            <p><strong>Subject:</strong> ${subject}</p>
            <p style="margin-top: 20px;">A client has replied to your email.</p>
            <a href="https://resend.com/emails/${emailId}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 15px 0;">
              View Full Message & Attachments →
            </a>
            <p style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; color: #666;">
              Or reply directly to: <a href="mailto:${fromEmail}" style="color: #7c3aed;">${fromEmail}</a>
            </p>
          </div>
        `,
        text: `Client Reply from ${fromEmail}\n\nSubject: ${subject}\n\nView full message: https://resend.com/emails/${emailId}\n\nOr reply directly to: ${fromEmail}`
      });
      
      if (error) {
        console.error('Send error:', JSON.stringify(error));
        return res.status(200).json({ received: true, error: error.message });
      }
      
      console.log('Notification sent for:', fromEmail);
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return res.status(200).json({ received: true, error: error.message });
  }
}
