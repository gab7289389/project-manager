import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    console.log('Webhook received:', JSON.stringify(event, null, 2));

    if (event.type === 'email.received') {
      const emailId = event.data.email_id;
      const from = event.data.from || '';
      const subject = event.data.subject || '(No subject)';
      
      // Extract email address from "Name <email>" format
      const fromEmail = from.includes('<') 
        ? from.match(/<(.+)>/)?.[1] || from 
        : from;

      // Get email content
      const { data: email, error: emailError } = await resend.emails.receiving.get(emailId);
      
      if (emailError) {
        console.error('Error fetching email:', emailError);
      }

      // Get attachments
      const { data: attachmentData, error: attachmentError } = await resend.attachments.receiving.list({ 
        emailId: emailId 
      });

      if (attachmentError) {
        console.error('Error fetching attachments:', attachmentError);
      }

      // Download attachments and encode in base64
      let attachments = [];
      if (attachmentData && attachmentData.data && attachmentData.data.length > 0) {
        for (const attachment of attachmentData.data) {
          try {
            const response = await fetch(attachment.download_url);
            const buffer = Buffer.from(await response.arrayBuffer());
            attachments.push({
              filename: attachment.filename,
              content: buffer.toString('base64')
            });
            console.log(`Downloaded attachment: ${attachment.filename}`);
          } catch (dlErr) {
            console.error(`Failed to download ${attachment.filename}:`, dlErr);
          }
        }
      }

      // Forward the email
      const { data: sendData, error: sendError } = await resend.emails.send({
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
            <strong>Original Subject:</strong> ${subject}
            ${attachments.length > 0 ? `<br/><strong>📎 Attachments:</strong> ${attachments.length} file(s) attached` : ''}
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            ${email?.html || email?.text || '<p>No content</p>'}
          </div>
        `,
        text: `CLIENT REPLY FROM: ${fromEmail}\n\nSubject: ${subject}\n\nMessage:\n${email?.text || 'No content'}`,
        attachments: attachments.length > 0 ? attachments : undefined
      });

      if (sendError) {
        console.error('Error sending email:', sendError);
        return res.status(500).json({ error: sendError });
      }

      console.log(`Email forwarded from: ${fromEmail} with ${attachments.length} attachments`);
      return res.status(200).json({ success: true, emailId: sendData?.id });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
