import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    
    // Log the full payload to debug
    console.log('Full webhook payload:', JSON.stringify(payload, null, 2));

    // Resend webhook structure: { type, created_at, data: { ... } }
    const type = payload.type;
    const data = payload.data || payload;

    // Handle incoming email events
    if (type === 'email.received' || type === 'email.delivered' || data.from) {
      const from = data.from || '';
      const subject = data.subject || '(No subject)';
      
      // For Resend inbound emails, the body might be in these fields
      const text = data.text || data.body || data.plain_body || data.text_plain || '';
      const html = data.html || data.html_body || data.body_html || '';
      
      // If still no content, show the raw data for debugging
      let content = html || text;
      if (!content || content.trim() === '') {
        content = `<pre style="background:#f5f5f5;padding:15px;border-radius:8px;overflow:auto;font-size:12px;">${JSON.stringify(data, null, 2)}</pre>`;
      }
      
      // Extract email address from "Name <email>" format if needed
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;
      
      // Forward the email to contact@dxtr.au
      await resend.emails.send({
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        to: ['contact@dxtr.au'],
        subject: `📧 Reply from ${fromEmail}`,
        html: `
          <div style="padding: 20px; background: #7c3aed; color: white; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0;">📧 Client Reply</h2>
            <p style="margin: 0; font-size: 20px;"><strong>${fromEmail}</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">↑ Copy this email to reply to the client</p>
          </div>
          <div style="padding: 15px; background: #f5f5f5; margin-bottom: 20px;">
            <strong>Original Subject:</strong> ${subject}
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            ${content}
          </div>
        `,
        text: `CLIENT REPLY FROM: ${fromEmail}\n\nSubject: ${subject}\n\nMessage:\n${text || 'See HTML version'}`
      });

      console.log('Email forwarded from:', fromEmail);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
