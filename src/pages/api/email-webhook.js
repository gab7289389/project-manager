import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const RESEND_API_KEY = process.env.RESEND_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    console.log('Webhook received:', event.type);

    if (event.type === 'email.received') {
      const emailId = event.data.email_id;
      const from = event.data.from || '';
      const subject = event.data.subject || '(No subject)';
      
      // Extract email address
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;

      // Get email content
      let emailHtml = '';
      let emailText = '';
      try {
        const emailRes = await fetch(`https://api.resend.com/emails/${emailId}/content`, {
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` }
        });
        if (emailRes.ok) {
          const data = await emailRes.json();
          emailHtml = data.html || '';
          emailText = data.text || '';
          console.log('Fetched email content');
        } else {
          console.log('Content fetch failed:', emailRes.status);
        }
      } catch (err) {
        console.log('Error fetching content:', err.message);
      }

      // Get attachments
      let attachments = [];
      try {
        const attRes = await fetch(`https://api.resend.com/emails/${emailId}/attachments`, {
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` }
        });
        if (attRes.ok) {
          const attData = await attRes.json();
          const attList = attData.data || attData || [];
          console.log('Found attachments:', attList.length);
          
          for (const att of attList) {
            if (att.download_url) {
              try {
                const dlRes = await fetch(att.download_url);
                if (dlRes.ok) {
                  const buffer = Buffer.from(await dlRes.arrayBuffer());
                  attachments.push({
                    filename: att.filename || 'attachment',
                    content: buffer.toString('base64')
                  });
                  console.log('Downloaded:', att.filename);
                }
              } catch (dlErr) {
                console.log('Failed to download:', att.filename);
              }
            }
          }
        }
      } catch (err) {
        console.log('Error fetching attachments:', err.message);
      }

      // Send the forwarded email
      const sendPayload = {
        from: 'DXTR Notifications <notif@send.dxtr.au>',
        to: ['contact@dxtr.au'],
        subject: `📧 Reply from ${fromEmail}: ${subject}`,
        html: `
          <div style="padding: 20px; background: #7c3aed; color: white; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0;">📧 Client Reply</h2>
            <p style="margin: 0; font-size: 20px;"><strong>${fromEmail}</strong></p>
            <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">↑ Copy this email to reply to the client</p>
          </div>
          <div style="padding: 15px; background: #f5f5f5; margin-bottom: 20px;">
            <strong>Subject:</strong> ${subject}
            ${attachments.length > 0 ? `<br/><strong>📎 Attachments:</strong> ${attachments.length} file(s) attached` : ''}
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            ${emailHtml || emailText || '<p style="color:#666;">No message content</p>'}
          </div>
        `,
        text: `Client Reply from ${fromEmail}\n\nSubject: ${subject}\n\n${emailText || 'No message content'}`
      };

      if (attachments.length > 0) {
        sendPayload.attachments = attachments;
      }

      const { data, error } = await resend.emails.send(sendPayload);
      
      if (error) {
        console.error('Send error:', JSON.stringify(error));
        // Still return 200 to prevent retries
        return res.status(200).json({ received: true, error: error.message });
      }
      
      console.log('Email forwarded from:', fromEmail);
      return res.status(200).json({ success: true, emailId: data?.id });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    // Return 200 anyway to prevent retries
    return res.status(200).json({ received: true, error: error.message });
  }
}
