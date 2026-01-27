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
      
      // Forward the email to contact@dxtr.au
      await resend.emails.send({
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        to: ['contact@dxtr.au'],
        subject: `Fwd: ${subject}`,
        html: `
          <div style="padding: 20px; background: #f5f5f5; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #666;"><strong>From:</strong> ${from}</p>
            <p style="margin: 0; color: #666;"><strong>To:</strong> ${to}</p>
            <p style="margin: 0; color: #666;"><strong>Subject:</strong> ${subject}</p>
          </div>
          <div style="padding: 20px;">
            ${html || text || 'No content'}
          </div>
        `,
        text: `From: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text || 'No content'}`
      });

      console.log('Email forwarded successfully');
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
