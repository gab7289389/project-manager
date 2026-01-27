import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Return 200 immediately to prevent webhook retries
  res.status(200).json({ received: true });

  try {
    const event = req.body;
    console.log('Webhook received:', event.type);

    if (event.type === 'email.received') {
      const from = event.data.from || '';
      const subject = event.data.subject || '(No subject)';
      
      // Extract email address
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;

      // Forward notification (without fetching content to avoid rate limits)
      await resend.emails.send({
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        to: ['contact@dxtr.au'],
        subject: `📧 Reply from ${fromEmail}: ${subject}`,
        html: `
          <div style="padding: 20px; background: #7c3aed; color: white; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0;">📧 Client Reply Received</h2>
            <p style="margin: 0; font-size: 20px;"><strong>${fromEmail}</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">↑ Copy this email to reply to the client</p>
          </div>
          <div style="padding: 15px; background: #f5f5f5; margin-bottom: 20px;">
            <strong>Subject:</strong> ${subject}
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <p>A client has replied to your email. Due to rate limits, the message content is not included.</p>
            <p>Please check your <a href="https://resend.com/emails">Resend Dashboard</a> to view the full message, or reply directly to <strong>${fromEmail}</strong>.</p>
          </div>
        `,
        text: `Client Reply from ${fromEmail}\n\nSubject: ${subject}\n\nPlease check your Resend Dashboard to view the full message.`
      });

      console.log('Notification sent for email from:', fromEmail);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
  }
}
