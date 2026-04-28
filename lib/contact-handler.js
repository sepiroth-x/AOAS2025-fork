const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dotenv = require('dotenv');
const {
  sanitizeText,
  sanitizeMultilineText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUtm,
  normalizeService,
  getServiceLabel,
  normalizeInquiryType,
  getInquiryTypeLabel,
  isValidEmail,
  parseNotificationRecipients,
  getSupportDetails,
  getResponseWindow,
  getCalendarLink,
  appendJsonLine,
} = require('./inquiry-utils');

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getMailTransport() {
  let user = (process.env.GMAIL_USER || '').trim();
  let pass = (process.env.GMAIL_APP_PASSWORD || '').trim();

  // Recover from env load-order/runtime edits without requiring immediate restart.
  if (!user || !pass) {
    dotenv.config({ override: true });
    user = (process.env.GMAIL_USER || '').trim();
    pass = (process.env.GMAIL_APP_PASSWORD || '').trim();
  }

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

function formatTimestamp(dateIso) {
  const date = new Date(dateIso);

  const auTime = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  }).format(date);

  const phTime = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(date);

  return { auTime, phTime };
}

function extractMessageFocus(message) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw) {
    return '';
  }

  const firstSentence = raw.split(/[.!?]/)[0].trim();
  if (firstSentence.length < 14) {
    return '';
  }

  return firstSentence.slice(0, 180);
}

function pickMessageTheme(message, service) {
  const text = String(message || '').toLowerCase();
  const focus = extractMessageFocus(message);

  if (/\b(apply|application|applicant|resume|cv|career|job|hiring)\b/.test(text)) {
    return {
      title: 'Application Enquiry Received',
      summary: focus
        ? `Thanks for reaching out about joining our team. We noted your message about "${focus}".`
        : 'Thanks for reaching out about joining our team. We have noted your message and contact details.',
      nextSteps: [
        'Our recruitment team will review your enquiry and send the correct next step.',
        'If needed, we will request additional documents before scheduling a follow-up.',
      ],
    };
  }

  if (/\b(urgent|asap|today|immediately|priority|rush)\b/.test(text)) {
    return {
      title: 'Priority Enquiry Received',
      summary: focus
        ? `Thanks for your message about "${focus}". We noted the urgency and flagged this enquiry for priority follow-up.`
        : 'Thanks for your message. We noted the urgency and have flagged this enquiry for priority follow-up.',
      nextSteps: [
        'Our team will review your requirements and respond as soon as possible.',
        'Please keep your phone and email available for rapid coordination.',
      ],
    };
  }

  if (/\b(onboard|implementation|setup|start|process)\b/.test(text)) {
    return {
      title: 'Onboarding Enquiry Received',
      summary: focus
        ? `Thanks for sharing your onboarding request regarding "${focus}". We recorded your preferred service and context.`
        : 'Thanks for sharing your onboarding request. We recorded your preferred service and onboarding context.',
      nextSteps: [
        'We will align on scope, timelines, and access requirements.',
        'You will receive a clear onboarding sequence in our follow-up.',
      ],
    };
  }

  if (/\b(document|compliance|audit|policy|ndis|tax|bas)\b/.test(text) || service === 'tax-compliance' || service === 'ndis-admin') {
    return {
      title: 'Compliance-Oriented Enquiry Received',
      summary: focus
        ? `Thanks for your enquiry. We captured your requirements around "${focus}" for review.`
        : 'Thanks for your enquiry. We captured your compliance-related requirements for review.',
      nextSteps: [
        'Our team will confirm what documents and process details are needed.',
        'We will provide a structured follow-up so your workflow is clear from the start.',
      ],
    };
  }

  return {
    title: 'Enquiry Received',
    summary: focus
      ? `Thanks for reaching out. We received your enquiry about "${focus}" and the details you submitted.`
      : 'Thanks for reaching out. We received your enquiry and the details you submitted.',
    nextSteps: [
      'Our team will review your message and service request.',
      'We will follow up with the most relevant next steps for your business.',
    ],
  };
}

function getSenderName(source) {
  if (source === 'chat-widget') {
    return 'CHAT INQUIRY';
  }
  if (String(source || '').startsWith('service-page:')) {
    return 'SERVICE INQUIRY';
  }
  return 'WEBSITE INQUIRY';
}

function buildInternalEmail(inquiry) {
  const { auTime, phTime } = formatTimestamp(inquiry.timestamp);
  const conversationBlock = inquiry.conversationSummary
    ? `
      <div style="margin-top: 22px;">
        <p style="margin: 0 0 8px 0; color: #0f172a; font-size: 13px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;">Conversation Summary</p>
        <div style="white-space: pre-wrap; padding: 14px 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #dbe3ee; color: #0f172a; line-height: 1.55;">${escapeHtml(inquiry.conversationSummary)}</div>
      </div>
    `
    : '';

  const html = `
    <div style="margin: 0; padding: 20px; background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a;">
      <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe3ee; border-radius: 16px; overflow: hidden;">
        <div style="padding: 20px 24px; background: linear-gradient(135deg, #0f766e, #0284c7); color: #ffffff;">
          <p style="margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.95;">AOAS Contact Desk</p>
          <h2 style="margin: 10px 0 0 0; font-size: 24px; line-height: 1.25;">New Website Inquiry</h2>
        </div>

        <div style="padding: 22px 24px;">
          <div style="margin-bottom: 18px; padding: 12px 14px; border: 1px solid #dbe3ee; border-radius: 12px; background: #f8fafc;">
            <p style="margin: 0; color: #475569; font-size: 13px;">Inquiry ID</p>
            <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 14px; font-weight: 700;">${escapeHtml(inquiry.id)}</p>
          </div>

          <table role="presentation" style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #dbe3ee; border-radius: 12px; overflow: hidden;">
            <tbody>
              <tr>
                <td style="width: 34%; padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Service</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px; font-weight: 600;">${escapeHtml(inquiry.serviceLabel)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Reason for Contact</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px; font-weight: 600;">${escapeHtml(inquiry.inquiryTypeLabel)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Name</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px;">${escapeHtml(inquiry.name)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Email</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px;">
                  <a href="mailto:${escapeHtml(inquiry.email)}" style="color: #0284c7; text-decoration: none;">${escapeHtml(inquiry.email)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Phone</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px;">${escapeHtml(inquiry.phone || 'Not provided')}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Location</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px;">${escapeHtml(inquiry.location || 'Not provided')}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; border-bottom: 1px solid #dbe3ee; color: #334155; font-size: 13px; font-weight: 600;">Source</td>
                <td style="padding: 11px 14px; border-bottom: 1px solid #dbe3ee; color: #0f172a; font-size: 14px;">${escapeHtml(inquiry.source)}</td>
              </tr>
              <tr>
                <td style="padding: 11px 14px; background: #f8fafc; color: #334155; font-size: 13px; font-weight: 600;">Timestamp</td>
                <td style="padding: 11px 14px; color: #0f172a; font-size: 14px;">${escapeHtml(auTime)} (AU) | ${escapeHtml(phTime)} (PH)</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 22px;">
            <p style="margin: 0 0 8px 0; color: #0f172a; font-size: 13px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;">Message</p>
            <div style="white-space: pre-wrap; padding: 14px 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #dbe3ee; color: #0f172a; line-height: 1.55;">${escapeHtml(inquiry.message)}</div>
          </div>

          ${conversationBlock}
        </div>
      </div>
    </div>
  `;

  const text = `
New Website Inquiry

Inquiry ID: ${inquiry.id}
Service: ${inquiry.serviceLabel}
Reason for Contact: ${inquiry.inquiryTypeLabel}
Name: ${inquiry.name}
Email: ${inquiry.email}
Phone: ${inquiry.phone || 'Not provided'}
Location: ${inquiry.location || 'Not provided'}
Source: ${inquiry.source}
Timestamp: ${auTime} (AU) | ${phTime} (PH)

Message:
${inquiry.message}

${inquiry.conversationSummary ? `Conversation Summary:\n${inquiry.conversationSummary}\n` : ''}
  `.trim();

  return { html, text };
}

function buildAutoReplyEmail(inquiry) {
  const support = getSupportDetails();
  const responseWindow = getResponseWindow();
  const calendarLink = getCalendarLink();
  const { auTime } = formatTimestamp(inquiry.timestamp);
  const theme = pickMessageTheme(inquiry.message, inquiry.service);
  const nextStepsHtml = theme.nextSteps.map((step) => `<li style="margin-bottom: 6px;">${escapeHtml(step)}</li>`).join('');
  const nextStepsText = theme.nextSteps.map((step, index) => `${index + 1}. ${step}`).join('\n');

  const calendarHtml = calendarLink
    ? `<p style="margin: 0 0 12px 0;">Optional: book a call at <a href="${escapeHtml(calendarLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(calendarLink)}</a></p>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0b5d44; margin-bottom: 16px;">${escapeHtml(theme.title)}</h2>
      <p style="margin: 0 0 12px 0;">Hi ${escapeHtml(inquiry.name)}, ${escapeHtml(theme.summary)}</p>
      <p style="margin: 0 0 12px 0;">Service selected: <strong>${escapeHtml(inquiry.serviceLabel)}</strong></p>
      <p style="margin: 0 0 12px 0;">Expected response window: <strong>${escapeHtml(responseWindow)}</strong></p>
      <p style="margin: 0 0 12px 0;">Submitted on: ${escapeHtml(auTime)} (AU time)</p>
      <p style="margin: 0 0 8px 0;"><strong>Next steps</strong></p>
      <ul style="margin: 0 0 12px 18px; padding: 0;">${nextStepsHtml}</ul>
      ${calendarHtml}
      <hr style="border: none; border-top: 1px solid #dfe3e8; margin: 18px 0;" />
      <p style="margin: 0 0 8px 0;"><strong>Contact details</strong></p>
      <p style="margin: 0 0 6px 0;">Email: ${escapeHtml(support.email)}</p>
      <p style="margin: 0 0 6px 0;">Phone: ${escapeHtml(support.phone)}</p>
      <p style="margin: 0 0 6px 0;">Hours: ${escapeHtml(support.hours)}</p>
      <p style="margin: 0;">Location: ${escapeHtml(support.location)}</p>
    </div>
  `;

  const text = `
We received your inquiry

Hi ${inquiry.name},
${theme.summary}

Service selected: ${inquiry.serviceLabel}
Expected response window: ${responseWindow}
Submitted on: ${auTime} (AU time)

Next steps:
${nextStepsText}

Contact details:
Email: ${support.email}
Phone: ${support.phone}
Hours: ${support.hours}
Location: ${support.location}
${calendarLink ? `\nOptional booking link: ${calendarLink}` : ''}
  `.trim();

  return { html, text };
}

async function handleContactSubmission(payload, context = {}) {
  const source = sanitizeText(payload?.source || 'contact-form', 64).toLowerCase() || 'contact-form';
  const name = sanitizeText(payload?.name, 120);
  const email = sanitizeEmail(payload?.email);
  const phone = sanitizePhone(payload?.phone);
  const message = sanitizeMultilineText(payload?.message, 6000);
  const location = sanitizeText(payload?.location || payload?.country, 100);
  const sourcePage = sanitizeText(payload?.sourcePage || '', 300);
  const pageUrl = sanitizeText(payload?.pageUrl || '', 2000);
  const service = normalizeService(payload?.service);
  const fallbackInquiryType = source === 'chat-widget' ? 'general-inquiry' : 'new-project';
  const inquiryType = normalizeInquiryType(payload?.inquiryType, fallbackInquiryType);
  const inquiryTypeLabel = getInquiryTypeLabel(inquiryType);
  const conversationSummary = sanitizeMultilineText(payload?.conversationSummary, 3000);
  const utm = sanitizeUtm(payload?.utm);
  const honeypot = sanitizeText(payload?.website || payload?.company || payload?.honeypot, 80);
  const consent = Boolean(payload?.consent);

  if (honeypot) {
    return {
      status: 200,
      body: {
        success: true,
        message: 'Thank you. Your inquiry has been received.',
      },
    };
  }

  if (!service) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please select a valid service.',
      },
    };
  }

  if (!name || !email || !message) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Name, email, and message are required fields.',
      },
    };
  }

  if (!isValidEmail(email)) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please enter a valid email address.',
      },
    };
  }

  if (message.length < 8) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Please provide a little more detail in your message.',
      },
    };
  }

  if (source === 'chat-widget' && !consent) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Privacy consent is required before submitting through chat.',
      },
    };
  }

  const serviceLabel = getServiceLabel(service);
  const timestamp = new Date().toISOString();
  const inquiryId = `inq_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const inquiryRecord = {
    id: inquiryId,
    timestamp,
    service,
    serviceLabel,
    inquiryType,
    inquiryTypeLabel,
    name,
    email,
    phone,
    message,
    location: location || '',
    source: source || 'contact-form',
    sourcePage: sourcePage || context.path || '/',
    pageUrl: pageUrl || '',
    utm,
    consent: source === 'chat-widget' ? consent : undefined,
    conversationSummary: source === 'chat-widget' ? conversationSummary : '',
    ip: sanitizeText(context.remoteIp || '', 120),
    userAgent: sanitizeText(context.userAgent || '', 300),
  };

  try {
    await appendJsonLine('inquiries.jsonl', inquiryRecord);
  } catch (error) {
    console.error('Failed to persist inquiry record:', error.message);
  }

  const eventName = source === 'chat-widget' ? 'chat_lead_submitted' : 'contact_form_submitted';
  try {
    await appendJsonLine('events.jsonl', {
      timestamp,
      eventName,
      source,
      sourcePage: inquiryRecord.sourcePage,
      service,
      serviceLabel,
      inquiryType,
      inquiryTypeLabel,
      inquiryId,
    });
  } catch (error) {
    console.error('Failed to persist inquiry event:', error.message);
  }

  const transporter = getMailTransport();
  const notificationRecipients = parseNotificationRecipients();

  if (!transporter) {
    return {
      status: 503,
      body: {
        success: false,
        inquiryId,
        error: 'Email delivery is not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD and try again.',
      },
    };
  }

  if (!notificationRecipients.length) {
    return {
      status: 500,
      body: {
        success: false,
        error: 'No notification recipients are configured for inquiries.',
      },
    };
  }

  const internalTemplate = buildInternalEmail(inquiryRecord);
  const autoReplyTemplate = buildAutoReplyEmail(inquiryRecord);
  const replyAddress = inquiryRecord.email;
  const senderName = getSenderName(source);
  const inquiryLabelForSubject = inquiryTypeLabel.toLowerCase();

  try {
    await transporter.sendMail({
      from: `${senderName} <${process.env.GMAIL_USER}>`,
      to: notificationRecipients,
      replyTo: replyAddress,
      subject: `New ${inquiryLabelForSubject} | ${serviceLabel} | ${name}`,
      html: internalTemplate.html,
      text: internalTemplate.text,
    });
  } catch (notifyError) {
    console.error('Inquiry notification email failed:', notifyError.message);
    return {
      status: 500,
      body: {
        success: false,
        error: 'We received your inquiry but failed to notify the team. Please try again shortly.',
      },
    };
  }

  let autoReplySent = true;
  try {
    await transporter.sendMail({
      from: `AOAS Support <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `We received your ${serviceLabel} inquiry`,
      html: autoReplyTemplate.html,
      text: autoReplyTemplate.text,
    });
  } catch (autoReplyError) {
    autoReplySent = false;
    console.error('Auto-reply email failed:', autoReplyError.message);
  }

  return {
    status: 200,
    body: {
      success: true,
      inquiryId,
      autoReplySent,
      message: 'Thank you for your inquiry. We have received your details and will contact you soon.',
    },
  };
}

module.exports = {
  handleContactSubmission,
};
