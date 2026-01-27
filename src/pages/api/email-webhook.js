import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    
    // Log the full payload to see structure
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    const type = payload.type;
    const data = payload.data || payload;

    // Handle incoming email events
    if (type === 'email.received' || data.from) {
      // Try multiple possible field names
      const from = data.from || data.sender || data.from_email || '';
      const subject = data.subject || data.email_subject || '(No subject)';
      const text = data.text || data.body || data.plain || data.text_body || '';
      const html = data.html || data.html_body || data.body_html || '';
      const content = html || text || JSON.stringify(data);
      
      // Extract email address from "Name <email>" format if needed
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;
      
      // Forward the email to contact@dxtr.au
      // Put client email prominently in subject so you can copy it
      await resend.emails.send({
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        to: ['contact@dxtr.au'],
        subject: `Client Reply from: ${fromEmail} - ${subject}`,
        html: `
          <div style="padding: 20px; background: #7c3aed; color: white; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0;">📧 Client Reply</h2>
            <p style="margin: 0; font-size: 18px;"><strong>From: ${fromEmail}</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Copy the email above to reply directly to the client</p>
          </div>
          <div style="padding: 20px; background: #f5f5f5; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0;"><strong>Subject:</strong> ${subject}</p>
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 15px 0; color: #666;">Message:</h3>
            ${content}
          </div>
        `,
        text: `CLIENT REPLY\n\nFrom: ${fromEmail}\nSubject: ${subject}\n\n---MESSAGE---\n${text || content}`
      });

      console.log('Email forwarded from:', fromEmail);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
