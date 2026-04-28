require('dotenv').config();
const nodemailer = require('nodemailer');
const {
  buildClientRequestEmailTemplate: buildAdminClientRequestEmailTemplate,
  buildClientStatusEmailTemplate,
  getSupportEmail,
} = require('../lib/admin-crm-email');
const {
  applySecurityHeaders,
  rejectIfUntrustedOrigin,
  setCors,
} = require('../lib/http-security');
const {
  STATUS_OPTIONS,
  resolveUserFromRequest,
  assertAuthenticated,
  assertAdmin,
  getDashboardSnapshot,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listParticipants,
  createParticipant,
  updateParticipant,
  deleteParticipant,
  getSystemAdminPublic,
  listAccounts,
  createSubAccount,
  updateSubAccount,
  deleteSubAccount,
  changeOwnPassword,
  createPasswordResetRequest,
  resetPasswordWithToken,
  listClientRequests,
  createClientRequest,
  updateClientRequestStatus,
  finalizeClientRequest,
  revokeHiredProfile,
  markClientRequestEventNotification,
  authenticateUser,
  createTokenForUser,
} = require('../lib/admin-crm');

function getMailTransport() {
  const user = (process.env.GMAIL_USER || '').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

function parseBody(body) {
  if (!body) {
    return {};
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') {
    return body;
  }
  return {};
}

function parseQuery(req) {
  if (req.query && typeof req.query === 'object') {
    return req.query;
  }
  const sourceUrl = req.url || '/';
  try {
    const parsed = new URL(sourceUrl, 'http://localhost');
    const entries = {};
    parsed.searchParams.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  } catch {
    return {};
  }
}

function getEntityId(req, payload) {
  const query = parseQuery(req);
  return String(payload?.id || query.id || '').trim();
}

function parsePaginationValue(value, fallback, min = 1, max = 100) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function toPublicUser(user) {
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    role: user.role,
  };
}

function getSafeErrorMessage(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (typeof error?.publicMessage === 'string' && error.publicMessage.trim()) {
    return error.publicMessage;
  }
  if (status >= 500) {
    return 'Admin service is temporarily unavailable. Please try again later.';
  }
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return 'Unexpected admin endpoint error.';
}

function sendError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) {
    console.error('Admin API error:', error?.stack || error?.message || error);
  }
  res.status(status).json({
    success: false,
    error: getSafeErrorMessage(error),
  });
}

function normalizePath(req) {
  const query = parseQuery(req);
  const rawQueryPath = Array.isArray(query.path) ? query.path[0] : query.path;
  let normalized = String(rawQueryPath || '').trim();

  if (!normalized) {
    const requestPath = String(req.url || '')
      .split('?')[0]
      .replace(/^\/+|\/+$/g, '');
    if (requestPath.toLowerCase().startsWith('api/admin')) {
      normalized = requestPath.slice('api/admin'.length).replace(/^\/+/, '');
    }
  }

  return normalized.replace(/^\/+|\/+$/g, '').toLowerCase();
}

function clientRequestPathParts(pathname) {
  const revokeMatch = pathname.match(/^client-requests\/([^/]+)\/hired\/([^/]+)\/revoke$/);
  if (revokeMatch) {
    return {
      requestId: decodeURIComponent(revokeMatch[1]),
      hireId: decodeURIComponent(revokeMatch[2]),
      action: 'revoke-hire',
    };
  }

  const match = pathname.match(/^client-requests\/([^/]+)\/(status|finalize)$/);
  if (!match) {
    return null;
  }

  return {
    requestId: decodeURIComponent(match[1]),
    action: match[2],
  };
}

async function handleLogin(req, res) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const payload = parseBody(req.body);
    const username = String(payload.username || '').trim().toLowerCase();
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: 'Username and password are required.',
      });
      return;
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid username or password.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      token: createTokenForUser(user),
      user: toPublicUser(user),
      expiresInSeconds: 12 * 60 * 60,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleSignup(req, res) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    res.status(403).json({
      success: false,
      error: 'Public account creation is disabled. Ask an administrator to provision access.',
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handlePasswordResetRequest(req, res) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const payload = parseBody(req.body);
    const resetPayload = await createPasswordResetRequest(payload, {
      requestedIp: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(),
      requestedUserAgent: req.headers['user-agent'] || '',
    });
    res.status(200).json({
      success: true,
      resetToken: resetPayload.resetToken || '',
      expiresAt: resetPayload.expiresAt || '',
      message: 'Secret answers verified. You can now set a new password.',
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handlePasswordResetConfirm(req, res) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const payload = parseBody(req.body);
    await resetPasswordWithToken(payload);
    res.status(200).json({
      success: true,
      message: 'Password updated successfully. You can now sign in.',
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleChangePassword(req, res) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    const payload = parseBody(req.body);
    await changeOwnPassword(user, payload);
    res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleMe(req, res) {
  setCors(req, res, 'GET,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    res.status(200).json({
      success: true,
      user: toPublicUser(user),
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleDashboard(req, res) {
  setCors(req, res, 'GET,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    const snapshot = await getDashboardSnapshot();

    res.status(200).json({
      success: true,
      user: toPublicUser(user),
      statusOptions: STATUS_OPTIONS,
      ...snapshot,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleSections(req, res) {
  setCors(req, res, 'GET,POST,PUT,DELETE,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = parseBody(req.body);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);

    if (req.method === 'GET') {
      const sections = await listSections();
      res.status(200).json({ success: true, sections });
      return;
    }

    assertAdmin(user);

    if (req.method === 'POST') {
      const section = await createSection(payload, user);
      res.status(201).json({ success: true, section });
      return;
    }

    if (req.method === 'PUT') {
      const sectionId = getEntityId(req, payload);
      if (!sectionId) {
        res.status(400).json({ success: false, error: 'section id is required.' });
        return;
      }
      const section = await updateSection(sectionId, payload);
      res.status(200).json({ success: true, section });
      return;
    }

    if (req.method === 'DELETE') {
      const sectionId = getEntityId(req, payload);
      if (!sectionId) {
        res.status(400).json({ success: false, error: 'section id is required.' });
        return;
      }
      await deleteSection(sectionId);
      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleParticipants(req, res) {
  setCors(req, res, 'GET,POST,PUT,DELETE,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = parseBody(req.body);
  const query = parseQuery(req);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);

    if (req.method === 'GET') {
      const search = String(query.search || '').trim();
      const sectionFilter = String(query.section || '').trim();
      const statusFilter = String(query.status || '').trim();
      const statusSet = String(query.statusSet || '').trim();
      const page = parsePaginationValue(query.page, 1, 1, 1000000);
      const pageSize = parsePaginationValue(query.pageSize, 20, 5, 100);

      const payload = await listParticipants({
        search,
        section: sectionFilter,
        status: statusFilter,
        statusSet,
        page,
        pageSize,
      });

      res.status(200).json({
        success: true,
        participants: payload.participants || [],
        pagination: payload.pagination || {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
          hasPrev: false,
          hasNext: false,
        },
      });
      return;
    }

    assertAdmin(user);

    if (req.method === 'POST') {
      const participant = await createParticipant(payload, user);
      res.status(201).json({ success: true, participant });
      return;
    }

    if (req.method === 'PUT') {
      const participantId = getEntityId(req, payload);
      if (!participantId) {
        res.status(400).json({ success: false, error: 'participant id is required.' });
        return;
      }
      const participant = await updateParticipant(participantId, payload, user);
      res.status(200).json({ success: true, participant });
      return;
    }

    if (req.method === 'DELETE') {
      const participantId = getEntityId(req, payload);
      if (!participantId) {
        res.status(400).json({ success: false, error: 'participant id is required.' });
        return;
      }
      await deleteParticipant(participantId);
      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleAccounts(req, res) {
  setCors(req, res, 'GET,POST,PUT,DELETE,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = parseBody(req.body);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    assertAdmin(user);

    if (req.method === 'GET') {
      const accounts = await listAccounts();
      res.status(200).json({
        success: true,
        systemAdmin: getSystemAdminPublic(),
        accounts,
      });
      return;
    }

    if (req.method === 'POST') {
      const account = await createSubAccount(payload, user);
      res.status(201).json({ success: true, account });
      return;
    }

    if (req.method === 'PUT') {
      const accountId = getEntityId(req, payload);
      if (!accountId) {
        res.status(400).json({ success: false, error: 'account id is required.' });
        return;
      }
      const account = await updateSubAccount(accountId, payload);
      res.status(200).json({ success: true, account });
      return;
    }

    if (req.method === 'DELETE') {
      const accountId = getEntityId(req, payload);
      if (!accountId) {
        res.status(400).json({ success: false, error: 'account id is required.' });
        return;
      }
      await deleteSubAccount(accountId);
      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleClientRequests(req, res) {
  setCors(req, res, 'GET,POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const payload = parseBody(req.body);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);

    if (req.method === 'GET') {
      const data = await listClientRequests(user);
      res.status(200).json({ success: true, ...data });
      return;
    }

    if (req.method === 'POST') {
      const requestRecord = await createClientRequest(payload, user);
      let notificationSent = false;

      const transporter = getMailTransport();
      if (transporter) {
        try {
          const template = buildAdminClientRequestEmailTemplate(requestRecord);
          await transporter.sendMail({
            from: `AOAS CRM <${process.env.GMAIL_USER}>`,
            to: [getSupportEmail()],
            replyTo: requestRecord.clientEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
          });
          notificationSent = true;
        } catch (emailError) {
          console.error('Client request notification error:', emailError.message || emailError);
        }
      }

      res.status(201).json({
        success: true,
        request: requestRecord,
        notificationSent,
      });
      return;
    }

    res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    if (/crm tables are missing/i.test(String(error?.message || ''))) {
      res.status(200).json({
        success: true,
        requests: [],
        hiredProfiles: [],
        warning: error.message,
      });
      return;
    }
    sendError(res, error);
  }
}

async function handleClientRequestStatus(req, res, requestId) {
  setCors(req, res, 'PUT,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'PUT') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const payload = parseBody(req.body);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    assertAdmin(user);

    if (!requestId) {
      res.status(400).json({ success: false, error: 'request id is required.' });
      return;
    }

    const result = await updateClientRequestStatus(requestId, payload, user);
    let notificationSent = false;
    let notificationError = '';

    const transporter = getMailTransport();
    if (transporter && result.request?.clientEmail) {
      try {
        const template = buildClientStatusEmailTemplate(result.request, {
          event: result.event,
        });
        await transporter.sendMail({
          from: `AOAS CRM <${process.env.GMAIL_USER}>`,
          to: [result.request.clientEmail],
          replyTo: getSupportEmail(),
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        notificationSent = true;
      } catch (emailError) {
        notificationError = emailError.message || 'Email send failed.';
      }
    }

    if (result.event?.id) {
      await markClientRequestEventNotification(result.event.id, {
        notificationSent,
        notificationError,
      });
    }

    res.status(200).json({
      success: true,
      request: result.request,
      notificationSent,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleClientRequestFinalize(req, res, requestId) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const payload = parseBody(req.body);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    assertAdmin(user);

    if (!requestId) {
      res.status(400).json({ success: false, error: 'request id is required.' });
      return;
    }

    const result = await finalizeClientRequest(requestId, payload, user);
    let notificationSent = false;
    let notificationError = '';

    const transporter = getMailTransport();
    if (transporter && result.request?.clientEmail) {
      try {
        const template = buildClientStatusEmailTemplate(result.request, {
          event: result.event,
          hiredProfiles: result.hiredProfiles || [],
        });
        await transporter.sendMail({
          from: `AOAS CRM <${process.env.GMAIL_USER}>`,
          to: [result.request.clientEmail],
          replyTo: getSupportEmail(),
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        notificationSent = true;
      } catch (emailError) {
        notificationError = emailError.message || 'Email send failed.';
      }
    }

    if (result.event?.id) {
      await markClientRequestEventNotification(result.event.id, {
        notificationSent,
        notificationError,
      });
    }

    res.status(200).json({
      success: true,
      request: result.request,
      hiredProfiles: result.hiredProfiles || [],
      notificationSent,
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleClientRequestRevoke(req, res, requestId, hireId) {
  setCors(req, res, 'POST,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const payload = parseBody(req.body);

  try {
    const user = await resolveUserFromRequest(req);
    assertAuthenticated(user);
    assertAdmin(user);

    if (!requestId || !hireId) {
      res.status(400).json({ success: false, error: 'request id and hire id are required.' });
      return;
    }

    const result = await revokeHiredProfile(requestId, hireId, payload, user);
    res.status(200).json({
      success: true,
      request: result.request,
      hiredProfiles: result.hiredProfiles || [],
    });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = async (req, res) => {
  applySecurityHeaders(req, res);
  const pathname = normalizePath(req);

  if (!pathname || pathname === '/') {
    setCors(req, res, 'GET,OPTIONS');
    if (rejectIfUntrustedOrigin(req, res)) {
      return;
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    res.status(200).json({
      success: true,
      message: 'Admin API router online.',
    });
    return;
  }

  if (pathname === 'login') {
    await handleLogin(req, res);
    return;
  }
  if (pathname === 'signup') {
    await handleSignup(req, res);
    return;
  }
  if (pathname === 'password-reset/request') {
    await handlePasswordResetRequest(req, res);
    return;
  }
  if (pathname === 'password-reset/confirm') {
    await handlePasswordResetConfirm(req, res);
    return;
  }
  if (pathname === 'change-password') {
    await handleChangePassword(req, res);
    return;
  }
  if (pathname === 'me') {
    await handleMe(req, res);
    return;
  }
  if (pathname === 'dashboard') {
    await handleDashboard(req, res);
    return;
  }
  if (pathname === 'sections') {
    await handleSections(req, res);
    return;
  }
  if (pathname === 'participants') {
    await handleParticipants(req, res);
    return;
  }
  if (pathname === 'accounts') {
    await handleAccounts(req, res);
    return;
  }
  if (pathname === 'client-requests') {
    await handleClientRequests(req, res);
    return;
  }

  const clientPath = clientRequestPathParts(pathname);
  if (clientPath?.action === 'status') {
    await handleClientRequestStatus(req, res, clientPath.requestId);
    return;
  }
  if (clientPath?.action === 'finalize') {
    await handleClientRequestFinalize(req, res, clientPath.requestId);
    return;
  }
  if (clientPath?.action === 'revoke-hire') {
    await handleClientRequestRevoke(req, res, clientPath.requestId, clientPath.hireId);
    return;
  }

  setCors(req, res, 'GET,POST,PUT,DELETE,OPTIONS');
  if (rejectIfUntrustedOrigin(req, res)) {
    return;
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  res.status(404).json({
    success: false,
    error: 'Admin route not found.',
  });
};
