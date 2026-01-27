import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;

    // Handle incoming email events
    if (type === 'email.received') {
      const { from, to, subject, text, html } = data;
      
      // Extract email address from "Name <email>" format if needed
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;
      
      // Forward the email to contact@dxtr.au with original sender as Reply-To
      await resend.emails.send({
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        replyTo: [fromEmail],
        to: ['contact@dxtr.au'],
        subject: `Fwd: ${subject} (from ${fromEmail})`,
        html: `
          <div style="padding: 15px; background: #f0f0f0; border-left: 4px solid #7c3aed; margin-bottom: 20px;">
            <p style="margin: 0 0 5px 0; color: #333;"><strong>Reply directly to this email to respond to the client</strong></p>
            <p style="margin: 0; color: #666; font-size: 14px;">Original sender: ${from}</p>
          </div>
          <div style="padding: 10px 0;">
            ${html || text || 'No content'}
          </div>
        `,
        text: `[Reply directly to respond to: ${fromEmail}]\n\nFrom: ${from}\nSubject: ${subject}\n\n${text || 'No content'}`
      });

      console.log('Email forwarded successfully from:', fromEmail);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
