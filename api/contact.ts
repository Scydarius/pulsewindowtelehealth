type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = { status: (code: number) => { json: (body: unknown) => void } };
type ContactBody = { name?: string; email?: string; organisation?: string; message?: string; website?: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));

export default async function contact(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body ?? {}) as ContactBody;
    if (body.website?.trim()) return response.status(200).json({ message: 'Thanks — we will be in touch.' });
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const message = body.message?.trim();
    if (!name || !email || !message) return response.status(400).json({ error: 'Please add your name, email and message.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(400).json({ error: 'Please enter a valid email address.' });
    if (name.length > 120 || email.length > 320 || (body.organisation?.length ?? 0) > 160 || message.length > 4000) return response.status(400).json({ error: 'One or more fields is too long.' });
    const apiKey = process.env.RESEND_API_KEY;
    const recipient = process.env.CONTACT_RECIPIENT_EMAIL;
    if (!apiKey || !recipient) throw new Error('Contact delivery has not been configured yet.');
    const configuredSender = process.env.VENTRICURA_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
    const from = configuredSender && /@ventricura\.com>?$/i.test(configuredSender) ? configuredSender : 'Ventricura <admin@ventricura.com>';
    const organisation = body.organisation?.trim() || 'Not provided';
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient], reply_to: email,
        subject: `New Ventricura enquiry from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nOrganisation: ${organisation}\n\nMessage:\n${message}`,
        html: `<h2>New Ventricura enquiry</h2><p><strong>Name:</strong> ${escapeHtml(name)}<br /><strong>Email:</strong> ${escapeHtml(email)}<br /><strong>Organisation:</strong> ${escapeHtml(organisation)}</p><p><strong>Message</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`,
      }),
    });
    if (!result.ok) throw new Error('We could not send your message. Please try again shortly.');
    return response.status(200).json({ message: 'Thanks — your enquiry has been sent. We will be in touch soon.' });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'We could not send your message. Please try again shortly.' });
  }
}
