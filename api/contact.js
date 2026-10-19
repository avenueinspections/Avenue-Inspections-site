// Vercel serverless function: emails quote/contact form submissions via Resend.
// Required env var: RESEND_API_KEY
// Optional env vars: CONTACT_TO (default info@avenueinspections.com),
//                    CONTACT_FROM (default "Avenue Inspections Website <onboarding@resend.dev>")

const FIELDS = [
  ['name', 'Name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['address', 'Property Address'],
  ['service', 'Service'],
  ['message', 'Message'],
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};

  // Honeypot: bots fill hidden field. Pretend success, send nothing.
  if (clean(body._gotcha, 200)) {
    return res.status(200).json({ ok: true });
  }

  const data = {};
  for (const [key] of FIELDS) {
    data[key] = clean(body[key], key === 'message' ? 5000 : 300);
  }
  const formName = clean(body.form, 50) || 'Website form';

  if (!data.name || !data.phone) {
    return res.status(400).json({ error: 'Name and phone are required.' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return res.status(500).json({ error: 'Email is not configured.' });
  }

  const rows = FIELDS.filter(([key]) => data[key])
    .map(
      ([key, label]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;">${label}</td>` +
        `<td style="padding:6px 0;white-space:pre-wrap;">${escapeHtml(data[key])}</td></tr>`
    )
    .join('');
  const text = FIELDS.filter(([key]) => data[key])
    .map(([key, label]) => `${label}: ${data[key]}`)
    .join('\n');

  const payload = {
    from: process.env.CONTACT_FROM || 'Avenue Inspections Website <onboarding@resend.dev>',
    to: [process.env.CONTACT_TO || 'info@avenueinspections.com'],
    subject: `${formName} from ${data.name}`,
    html: `<h2 style="font-family:sans-serif;">${escapeHtml(formName)}</h2>` +
      `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">${rows}</table>`,
    text: `${formName}\n\n${text}`,
  };
  if (data.email) payload.reply_to = data.email;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ error: 'Could not send email.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Resend request failed', err);
    return res.status(502).json({ error: 'Could not send email.' });
  }
};

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
