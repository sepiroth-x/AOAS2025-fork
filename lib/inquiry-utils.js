const fs = require('fs/promises');
const path = require('path');

const DEFAULT_SUPPORT_EMAIL = 'support@aoa-services.com';
const DEFAULT_SUPPORT_PHONE = '+63 (032) 238-6354';
const DEFAULT_SUPPORT_HOURS = 'Monday to Friday, 6:00 AM to 2:00 PM PH';
const DEFAULT_SUPPORT_LOCATION = 'Purok Mais, Brgy Paculob, Dumanjug, Cebu, Philippines';

const SERVICE_OPTIONS = [
  {
    value: 'payroll',
    label: 'Payroll Support',
    description: 'Payroll preparation, timesheet validation, and pay run support for AU teams.',
  },
  {
    value: 'bookkeeping',
    label: 'Bookkeeping',
    description: 'Day-to-day bookkeeping, reconciliations, and reporting support.',
  },
  {
    value: 'tax-compliance',
    label: 'Tax & Compliance Support',
    description: 'Support for BAS prep packs, compliance reminders, and documentation workflows.',
  },
  {
    value: 'data-entry',
    label: 'Data Entry',
    description: 'Structured data entry, cleanup, and document processing.',
  },
  {
    value: 'ndis-admin',
    label: 'NDIS Administration',
    description: 'NDIS-focused administration, rostering, and client support workflows.',
  },
  {
    value: 'customer-service',
    label: 'Customer Service Support',
    description: 'Inbound and outbound customer service coverage aligned to AU operations.',
  },
  {
    value: 'general-admin',
    label: 'General VA Support',
    description: 'General virtual admin support for calendars, email, and back-office operations.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other service needs not listed above.',
  },
];

const SERVICE_LOOKUP = new Map(SERVICE_OPTIONS.map((service) => [service.value, service]));
const UTM_FIELDS = ['source', 'medium', 'campaign', 'term', 'content'];

const INQUIRY_TYPE_OPTIONS = [
  {
    value: 'new-project',
    label: 'New Project',
  },
  {
    value: 'job-application',
    label: 'Job Application',
  },
  {
    value: 'general-inquiry',
    label: 'General Inquiry',
  },
];

const INQUIRY_TYPE_LOOKUP = new Map(INQUIRY_TYPE_OPTIONS.map((type) => [type.value, type]));

function sanitizeText(input, maxLength = 4000) {
  if (typeof input !== 'string') {
    return '';
  }

  const collapsed = input.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, maxLength);
}

function sanitizeMultilineText(input, maxLength = 4000) {
  if (typeof input !== 'string') {
    return '';
  }

  const normalized = input.replace(/\r\n/g, '\n').trim();
  return normalized.slice(0, maxLength);
}

function sanitizeEmail(input) {
  return sanitizeText(input, 320).toLowerCase();
}

function sanitizePhone(input) {
  const raw = sanitizeText(input, 50);
  return raw.replace(/[^0-9+()\-\s]/g, '').trim();
}

function sanitizeUrl(input) {
  const value = sanitizeText(input, 2048);

  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    return parsed.toString();
  } catch {
    return '';
  }
}

function sanitizeUtm(utm) {
  if (!utm || typeof utm !== 'object') {
    return {};
  }

  const result = {};
  UTM_FIELDS.forEach((field) => {
    const value = sanitizeText(String(utm[field] || ''), 200);
    if (value) {
      result[field] = value;
    }
  });

  return result;
}

function normalizeService(input) {
  const value = sanitizeText(input, 64).toLowerCase();

  if (!value) {
    return '';
  }

  if (SERVICE_LOOKUP.has(value)) {
    return value;
  }

  return '';
}

function getServiceDetails(serviceKey) {
  return SERVICE_LOOKUP.get(serviceKey) || SERVICE_LOOKUP.get('other');
}

function getServiceLabel(serviceKey) {
  return getServiceDetails(serviceKey).label;
}

function normalizeInquiryType(input, fallback = 'general-inquiry') {
  const value = sanitizeText(String(input || ''), 60).toLowerCase().replace(/[_\s]+/g, '-');

  if (INQUIRY_TYPE_LOOKUP.has(value)) {
    return value;
  }

  if (['new-project', 'newproject', 'new-client', 'newclient', 'client', 'customer'].includes(value)) {
    return 'new-project';
  }

  if (['job-application', 'jobapplication', 'applicant', 'candidate', 'job-applicant', 'job'].includes(value)) {
    return 'job-application';
  }

  if (['general-inquiry', 'general', 'inquiry', 'lead', 'prospect'].includes(value)) {
    return 'general-inquiry';
  }

  return INQUIRY_TYPE_LOOKUP.has(fallback) ? fallback : 'general-inquiry';
}

function getInquiryTypeLabel(inquiryTypeKey) {
  return INQUIRY_TYPE_LOOKUP.get(inquiryTypeKey)?.label || INQUIRY_TYPE_LOOKUP.get('general-inquiry').label;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function parseNotificationRecipients() {
  const raw = process.env.CONTACT_NOTIFICATION_EMAILS
    || process.env.CONTACT_TO_EMAILS
    || process.env.SUPPORT_EMAIL
    || DEFAULT_SUPPORT_EMAIL;

  return raw
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter((address, index, list) => address && isValidEmail(address) && list.indexOf(address) === index);
}

function getSupportDetails() {
  return {
    email: sanitizeEmail(process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL) || DEFAULT_SUPPORT_EMAIL,
    phone: sanitizeText(process.env.SUPPORT_PHONE || DEFAULT_SUPPORT_PHONE, 80) || DEFAULT_SUPPORT_PHONE,
    hours: sanitizeText(process.env.SUPPORT_HOURS || DEFAULT_SUPPORT_HOURS, 160) || DEFAULT_SUPPORT_HOURS,
    location: sanitizeText(process.env.SUPPORT_LOCATION || DEFAULT_SUPPORT_LOCATION, 240) || DEFAULT_SUPPORT_LOCATION,
  };
}

function getResponseWindow() {
  return sanitizeText(process.env.INQUIRY_RESPONSE_WINDOW || 'within 1 business day', 120);
}

function getCalendarLink() {
  return sanitizeUrl(process.env.CALENDAR_LINK || '');
}

function resolveDataFile(fileName) {
  return path.join(process.cwd(), 'data', fileName);
}

async function appendJsonLine(fileName, payload) {
  const filePath = resolveDataFile(fileName);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
    return true;
  } catch (error) {
    // In serverless/read-only filesystems (e.g. Vercel), writes can fail with EROFS/EPERM.
    // Analytics/contact ingestion should fail open instead of returning 500 for users.
    if (['EROFS', 'EACCES', 'EPERM'].includes(error?.code)) {
      return false;
    }
    throw error;
  }
}

async function readJsonLines(fileName) {
  const filePath = resolveDataFile(fileName);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function formatDateKey(timestamp) {
  try {
    return new Date(timestamp).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function incrementCounter(target, key) {
  const safeKey = sanitizeText(String(key || 'unknown'), 120) || 'unknown';
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function buildMetricsFromRecords(inquiries, events) {
  const inquiryArray = Array.isArray(inquiries) ? inquiries : [];
  const eventArray = Array.isArray(events) ? events : [];
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const inquiriesByService = {};
  const inquiriesBySource = {};
  const inquiriesByType = {};
  const inquiriesByCountry = {};
  const topInquiryPages = {};
  const inquiriesLast30Days = {};
  const eventCounts = {};

  inquiryArray.forEach((inquiry) => {
    incrementCounter(inquiriesByService, inquiry.service || 'other');
    incrementCounter(inquiriesBySource, inquiry.source || 'unknown');
    incrementCounter(inquiriesByType, inquiry.inquiryTypeLabel || inquiry.inquiryType || 'general-inquiry');
    incrementCounter(inquiriesByCountry, inquiry.location || 'Unknown');
    incrementCounter(topInquiryPages, inquiry.sourcePage || '/');

    const timestamp = Date.parse(inquiry.timestamp || '');
    if (!Number.isNaN(timestamp) && now - timestamp <= thirtyDaysMs) {
      incrementCounter(inquiriesLast30Days, formatDateKey(timestamp));
    }
  });

  eventArray.forEach((event) => {
    incrementCounter(eventCounts, event.eventName || 'unknown_event');
  });

  const sortedTopPages = Object.entries(topInquiryPages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([page, count]) => ({ page, count }));

  const recentInquiries = inquiryArray
    .slice(-10)
    .reverse()
    .map((inquiry) => ({
      timestamp: inquiry.timestamp,
      service: inquiry.serviceLabel || inquiry.service || 'Other',
      source: inquiry.source || 'unknown',
      location: inquiry.location || 'Unknown',
      inquiryType: inquiry.inquiryTypeLabel || inquiry.inquiryType || 'General Inquiry',
    }));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      inquiries: inquiryArray.length,
      events: eventArray.length,
      chatOpens: eventCounts.chat_opened || 0,
      chatLeadSubmits: eventCounts.chat_lead_submitted || 0,
      contactFormSubmits: eventCounts.contact_form_submitted || 0,
    },
    breakdowns: {
      inquiriesByService,
      inquiriesBySource,
      inquiriesByType,
      inquiriesByCountry,
      eventCounts,
      inquiriesLast30Days,
      topInquiryPages: sortedTopPages,
    },
    recentInquiries,
  };
}

module.exports = {
  SERVICE_OPTIONS,
  INQUIRY_TYPE_OPTIONS,
  sanitizeText,
  sanitizeMultilineText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUtm,
  sanitizeUrl,
  normalizeService,
  getServiceDetails,
  getServiceLabel,
  normalizeInquiryType,
  getInquiryTypeLabel,
  isValidEmail,
  parseNotificationRecipients,
  getSupportDetails,
  getResponseWindow,
  getCalendarLink,
  appendJsonLine,
  readJsonLines,
  buildMetricsFromRecords,
};
