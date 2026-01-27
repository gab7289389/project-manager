import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    const type = payload.type;
    const data = payload.data || payload;
    const emailId = data.email_id || data.id;

    // Handle incoming email events
    if (type === 'email.received' && emailId) {
      const from = data.from || '';
      const subject = data.subject || '(No subject)';
      
      // Extract email address from "Name <email>" format
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;

      // Fetch full email content using the Receiving API
      let emailContent = '';
      
      try {
        const { data: fullEmail, error: fetchError } = await resend.emails.receiving.get(emailId);
        
        if (!fetchError && fullEmail) {
          emailContent = fullEmail.html || fullEmail.text || '';
          console.log('Fetched email content successfully');
        }
      } catch (fetchErr) {
        console.log('Could not fetch email content:', fetchErr.message);
      }

      // Fetch and download attachments
      let attachments = [];
      try {
        const { data: attachmentList, error: attachmentError } = await resend.emails.receiving.attachments.list({ 
          emailId: emailId 
        });
        
        if (!attachmentError && attachmentList && attachmentList.length > 0) {
          console.log(`Found ${attachmentList.length} attachments`);
          
          for (const att of attachmentList) {
            try {
              const response = await fetch(att.download_url);
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                attachments.push({
                  filename: att.filename || 'attachment',
                  content: buffer.toString('base64'),
                });
                console.log(`Downloaded attachment: ${att.filename}`);
              }
            } catch (dlErr) {
              console.log(`Failed to download ${att.filename}:`, dlErr.message);
            }
          }
        }
      } catch (attErr) {
        console.log('Could not fetch attachments:', attErr.message);
      }

      // If no content from API, show helpful message
      if (!emailContent) {
        emailContent = `<p style="color:#666;font-style:italic;">Email content could not be retrieved. Please contact the client directly at ${fromEmail}</p>`;
      }
      
      // Forward the email to contact@dxtr.au with attachments
      const emailPayload = {
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
            ${attachments.length > 0 ? `<br/><strong>📎 Attachments:</strong> ${attachments.length} file(s) attached below` : ''}
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            ${emailContent}
          </div>
        `,
        text: `CLIENT REPLY FROM: ${fromEmail}\n\nSubject: ${subject}\n\nMessage:\n${emailContent.replace(/<[^>]*>/g, '')}`
      };

      // Add attachments if any
      if (attachments.length > 0) {
        emailPayload.attachments = attachments;
      }

      await resend.emails.send(emailPayload);

      console.log(`Email forwarded from: ${fromEmail} with ${attachments.length} attachments`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
