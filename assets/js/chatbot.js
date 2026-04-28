(function aoasChatbot() {
    const CHAT_POSITION_KEY = 'aoas_chat_widget_position_v1';
    const CHAT_LEAD_DRAFT_KEY = 'aoas_chat_lead_draft_v1';
    const CHAT_DRAG_HOLD_MS = 380;
    const CHAT_DRAG_MOVE_PX = 8;
    const CHAT_EDGE_PADDING = 16;
    const CHAT_MOBILE_WIDTH = 900;

    const SERVICES = {
        payroll: {
            label: 'Payroll Support',
            summary: 'We can support payroll admin, timesheet checks, and recurring cycle prep.',
            common: 'To start smoothly, we usually align on payroll workflow, software access, and deadlines.'
        },
        bookkeeping: {
            label: 'Bookkeeping',
            summary: 'We can support reconciliations, bookkeeping operations, and reporting workflows.',
            common: 'A quick review of your current bookkeeping process helps us align the right support plan.'
        },
        'tax-compliance': {
            label: 'Tax & Compliance Support',
            summary: 'We can support your compliance workflows and tax-related admin processes.',
            common: 'We usually map document requirements and compliance process checkpoints first.'
        },
        'data-entry': {
            label: 'Data Entry',
            summary: 'We can handle structured data entry, cleanup, and transfer workflows.',
            common: 'We start by confirming source format, validation rules, and target output.'
        },
        'ndis-admin': {
            label: 'NDIS Administration',
            summary: 'We can support NDIS admin workflows, scheduling, and operational documentation.',
            common: 'We can align your process quickly once we review your current workflow and priorities.'
        },
        'customer-service': {
            label: 'Customer Service Support',
            summary: 'We can support customer service workflows, inbox handling, and escalation coordination.',
            common: 'We typically align scripts, service standards, and escalation rules at onboarding.'
        },
        'general-admin': {
            label: 'General VA Support',
            summary: 'We can support day-to-day admin tasks including inbox, calendar, and coordination work.',
            common: 'We can tailor the role around your daily priorities and team workflows.'
        },
    };

    const QUICK_ACTIONS = [
        { label: 'Payroll', intent: 'payroll' },
        { label: 'Bookkeeping', intent: 'bookkeeping' },
        { label: 'Tax & Compliance', intent: 'tax-compliance' },
        { label: 'NDIS Admin', intent: 'ndis-admin' },
        { label: 'Customer Service', intent: 'customer-service' },
        { label: 'Apply for job', intent: 'applicant' },
        { label: 'Talk to team', intent: 'talk-human' },
    ];

    const CONVERSATION_SCRIPTS = [
        {
            id: 'timezone',
            match: /\b(australia|au|timezone|time zone|sydney|melbourne|brisbane)\b/i,
            replies: [
                'Yes, we support Australian business operations and coordinate based on your preferred AU schedule.',
                'If you share your preferred working window, we can align the team setup around it.',
            ],
        },
        {
            id: 'turnaround',
            match: /\b(turnaround|how long|response time|when can you|start date|availability)\b/i,
            replies: [
                'Thanks for asking. Our team normally replies quickly and confirms next steps after reviewing your request.',
                'If you have a target start date, share it and I will include it in your enquiry.',
            ],
        },
        {
            id: 'pricing',
            match: /\b(price|pricing|cost|rate|fee|how much|quotation|quote)\b/i,
            replies: [
                'Thanks for asking. I cannot provide figures in chat, but our team can prepare a tailored quote based on your scope.',
                'Share your workflow details and preferred service, and we will send the proper quotation process.',
            ],
        },
        {
            id: 'documents',
            match: /\b(document|requirements|what do you need|checklist|files)\b/i,
            replies: [
                'Great question. Requirements depend on the service, but we usually begin with your current process and key workflow details.',
                'Once we review your message, we can send a focused checklist for your service.',
            ],
        },
        {
            id: 'onboarding',
            match: /\b(onboard|setup|implementation|process|how do we start)\b/i,
            replies: [
                'We can start with a short discovery step, then align scope, workflow, and responsibilities.',
                'After that, we move to access setup and a practical handover sequence.',
            ],
        },
        {
            id: 'services',
            match: /\b(service|services|what do you offer|offerings|support areas)\b/i,
            replies: [
                'We currently support Payroll, Bookkeeping, Tax and Compliance, Data Entry, NDIS Administration, and Customer Service workflows.',
                'Tell me which area you need and I will keep the enquiry focused on that service.',
            ],
        },
        {
            id: 'contact',
            match: /\b(contact|email|phone|call)\b/i,
            replies: [
                'You can reach us directly at support@attainmentofficeadserv.org or +63 (032) 238-6354.',
                'You can also leave your details here and our team will follow up.',
            ],
            intent: 'talk-human',
        },
        {
            id: 'privacy',
            match: /\b(private|privacy|confidential|nda|secure|security)\b/i,
            replies: [
                'We handle enquiry details with care and only use them for service follow-up and coordination.',
                'If you have specific confidentiality requirements, add them in your message and our team will accommodate them.',
            ],
        },
        {
            id: 'hiring-status',
            match: /\b(still hiring|currently hiring|are you hiring|hiring now|open positions?|vacancies?|job openings?|may opening pa)\b/i,
            replies: [
                'Thank you for your interest in AOAS. Hiring needs vary by role and current team requirements.',
                'Please send your resume to support@attainmentofficeadserv.org so our recruitment team can review your profile.',
                'We will inform you once there are open positions that align with your skills and experience.',
            ],
            intent: 'applicant',
        },
        {
            id: 'application-status',
            match: /\b(application status|status of my application|follow up my application|recruitment status)\b/i,
            replies: [
                'For application status updates, please send your full name, email, and latest resume to support@attainmentofficeadserv.org.',
                'Our recruitment team will review your details and update you when a matching opening is available.',
            ],
            intent: 'applicant',
        },
        {
            id: 'applicant',
            match: /\b(apply|application|job|career|resume|cv|hiring|vacancy)\b/i,
            replies: [
                'Thank you for your interest in joining AOAS.',
                'For applications, please visit our Careers page and send your resume to support@attainmentofficeadserv.org.',
                'We will inform you once there are open positions that align with your skills and experience.',
            ],
            intent: 'applicant',
        },
        {
            id: 'talk-human',
            match: /\b(human|agent|call me|speak to someone|team member|representative)\b/i,
            replies: [
                'Absolutely. You can reach us at support@attainmentofficeadserv.org or +63 (032) 238-6354.',
                'If you prefer, submit your details here and our team will contact you directly.',
            ],
            intent: 'talk-human',
        },
    ];

    function resolveApiUrl(pathname) {
        if (window.AOASTracker && typeof window.AOASTracker.resolveApiUrl === 'function') {
            return window.AOASTracker.resolveApiUrl(pathname);
        }
        return pathname.startsWith('/') ? pathname : `/${pathname}`;
    }

    function track(eventName, properties = {}) {
        if (window.AOASTracker && typeof window.AOASTracker.track === 'function') {
            window.AOASTracker.track(eventName, properties);
        }
    }

    function getUtmPayload() {
        const params = new URLSearchParams(window.location.search);
        return {
            source: params.get('utm_source') || '',
            medium: params.get('utm_medium') || '',
            campaign: params.get('utm_campaign') || '',
            term: params.get('utm_term') || '',
            content: params.get('utm_content') || '',
        };
    }

    function detectIntent(text) {
        const normalized = String(text || '').toLowerCase();
        if (SERVICES[normalized]) return normalized;
        if (normalized.includes('payroll')) return 'payroll';
        if (normalized.includes('bookkeeping') || normalized.includes('reconcile')) return 'bookkeeping';
        if (normalized.includes('tax') || normalized.includes('bas') || normalized.includes('compliance')) return 'tax-compliance';
        if (normalized.includes('data entry') || normalized.includes('data')) return 'data-entry';
        if (normalized.includes('ndis')) return 'ndis-admin';
        if (normalized.includes('customer service')) return 'customer-service';
        if (
            normalized.includes('apply')
            || normalized.includes('job')
            || normalized.includes('career')
            || normalized.includes('hiring')
            || normalized.includes('vacancy')
            || normalized.includes('resume')
            || normalized.includes('cv')
            || normalized.includes('position')
        ) return 'applicant';
        if (normalized.includes('talk') || normalized.includes('human') || normalized.includes('agent')) return 'talk-human';
        return '';
    }

    function isGreeting(text) {
        return /^(hi|hello|hey|good morning|good afternoon|good evening|yo)\b/i.test(String(text || '').trim());
    }

    function isThanks(text) {
        return /\b(thanks|thank you|salamat)\b/i.test(String(text || '').trim());
    }

    function extractLikelyName(text) {
        const cleaned = String(text || '')
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^a-zA-Z\s'-]/g, '');

        if (!cleaned) return '';
        const parts = cleaned.split(' ').filter(Boolean);
        if (parts.length > 3) return '';
        if (parts.some((part) => part.length < 2)) return '';
        if (!parts.every((part) => /^[a-zA-Z][a-zA-Z'-]*$/.test(part))) return '';

        // Avoid treating obvious query words as names.
        const blocked = /^(help|service|pricing|price|quote|support|question|inquiry|inquire|payroll|bookkeeping|tax|compliance|data|ndis|customer)$/i;
        if (blocked.test(parts[0])) return '';

        return parts
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
    }

    function buildWidgetShell() {
        const root = document.createElement('div');
        root.className = 'aoas-chat-widget';
        root.id = 'aoasChatWidget';
        root.innerHTML = `
            <button class="aoas-chat-toggle cta-track" id="aoasChatToggle" type="button" data-track-event="chat_opened" data-track-label="Chat Toggle">
                Need help?
            </button>
            <section class="aoas-chat-panel" id="aoasChatPanel" hidden aria-label="AOAS customer support chat">
                <header class="aoas-chat-header">
                    <div class="title-wrap">
                        <strong>AOAS Support</strong>
                        <p>How can I help you today?</p>
                    </div>
                    <button id="aoasChatClose" type="button" aria-label="Close chat">x</button>
                </header>
                <div class="aoas-chat-body" id="aoasChatBody"></div>
                <div class="aoas-chat-actions" id="aoasChatActions"></div>
                <form class="aoas-chat-lead-form" id="aoasChatLeadForm" hidden autocomplete="on">
                    <div class="aoas-chat-lead-head">
                        <h4>How should we contact you?</h4>
                        <button type="button" class="aoas-chat-mini-btn" id="chatLeadCancel">Back</button>
                    </div>
                    <label for="chatLeadService">Service</label>
                    <select id="chatLeadService" required>
                        <option value="">Select service</option>
                        <option value="payroll">Payroll Support</option>
                        <option value="bookkeeping">Bookkeeping</option>
                        <option value="tax-compliance">Tax & Compliance Support</option>
                        <option value="data-entry">Data Entry</option>
                        <option value="ndis-admin">NDIS Administration</option>
                        <option value="customer-service">Customer Service Support</option>
                        <option value="general-admin">General VA Support</option>
                        <option value="other">Other</option>
                    </select>
                    <label for="chatLeadInquiryType">Reason for Contact</label>
                    <select id="chatLeadInquiryType" required>
                        <option value="" selected>Select reason</option>
                        <option value="new-project">New Project</option>
                        <option value="job-application">Job Application</option>
                        <option value="general-inquiry">General Inquiry</option>
                    </select>
                    <label for="chatLeadName">Name</label>
                    <input id="chatLeadName" type="text" required maxlength="120" autocomplete="name">
                    <label for="chatLeadEmail">Email</label>
                    <input id="chatLeadEmail" type="email" required maxlength="320" autocomplete="email">
                    <label for="chatLeadPhone">Phone (optional)</label>
                    <input id="chatLeadPhone" type="text" maxlength="50" autocomplete="tel">
                    <label for="chatLeadLocation">Location (optional)</label>
                    <select id="chatLeadLocation">
                        <option value="" selected>Select location (optional)</option>
                        <option value="Australia">Australia</option>
                        <option value="Philippines">Philippines</option>
                        <option value="Other">Other</option>
                    </select>
                    <div class="chat-other-location-wrap" id="chatOtherLocationWrap" hidden>
                        <label for="chatLeadLocationOther">Enter location</label>
                        <input id="chatLeadLocationOther" type="text" maxlength="120" placeholder="City / Country" autocomplete="off">
                    </div>
                    <label for="chatLeadMessage">Message</label>
                    <textarea id="chatLeadMessage" rows="3" required maxlength="1200" autocomplete="off"></textarea>
                    <label class="aoas-chat-consent">
                        <input id="chatLeadConsent" type="checkbox" required>
                        I agree to AOAS storing my details for follow-up.
                    </label>
                    <button type="submit" id="chatLeadSubmit">Submit inquiry</button>
                </form>
                <form class="aoas-chat-input-form" id="aoasChatInputForm">
                    <input type="text" id="aoasChatInput" maxlength="280" placeholder="Type your message..." autocomplete="off">
                    <button type="submit">Send</button>
                </form>
            </section>
        `;

        document.body.appendChild(root);
        return root;
    }

    document.addEventListener('DOMContentLoaded', () => {
        const widgetRoot = buildWidgetShell();
        const toggleButton = widgetRoot.querySelector('#aoasChatToggle');
        const closeButton = widgetRoot.querySelector('#aoasChatClose');
        const panel = widgetRoot.querySelector('#aoasChatPanel');
        const body = widgetRoot.querySelector('#aoasChatBody');
        const actions = widgetRoot.querySelector('#aoasChatActions');
        const inputForm = widgetRoot.querySelector('#aoasChatInputForm');
        const input = widgetRoot.querySelector('#aoasChatInput');
        const leadForm = widgetRoot.querySelector('#aoasChatLeadForm');
        const leadSubmitButton = widgetRoot.querySelector('#chatLeadSubmit');
        const leadService = widgetRoot.querySelector('#chatLeadService');
        const leadInquiryType = widgetRoot.querySelector('#chatLeadInquiryType');
        const leadName = widgetRoot.querySelector('#chatLeadName');
        const leadEmail = widgetRoot.querySelector('#chatLeadEmail');
        const leadPhone = widgetRoot.querySelector('#chatLeadPhone');
        const leadLocation = widgetRoot.querySelector('#chatLeadLocation');
        const leadLocationOtherWrap = widgetRoot.querySelector('#chatOtherLocationWrap');
        const leadLocationOther = widgetRoot.querySelector('#chatLeadLocationOther');
        const leadMessage = widgetRoot.querySelector('#chatLeadMessage');
        const leadConsent = widgetRoot.querySelector('#chatLeadConsent');
        const leadCancelButton = widgetRoot.querySelector('#chatLeadCancel');

        let apiHintShown = false;
        let currentService = '';
        let applicantMode = false;
        const transcript = [];
        let dragPointer = null;
        let dragTimer = null;
        let dragPrimed = false;
        let isDragging = false;
        let suppressToggleClick = false;

        function getLeadDraftStorageKey() {
            return `${CHAT_LEAD_DRAFT_KEY}:${window.location.hostname}`;
        }

        function saveLeadDraft() {
            try {
                const payload = {
                    v: 1,
                    ts: Date.now(),
                    values: {
                        service: leadService.value || '',
                        inquiryType: leadInquiryType.value || '',
                        name: leadName.value || '',
                        email: leadEmail.value || '',
                        phone: leadPhone.value || '',
                        location: leadLocation.value || '',
                        locationOther: leadLocationOther.value || '',
                        message: leadMessage.value || '',
                        consent: Boolean(leadConsent.checked),
                    },
                };
                window.localStorage.setItem(getLeadDraftStorageKey(), JSON.stringify(payload));
            } catch {
                // Ignore storage quota/privacy failures.
            }
        }

        function restoreLeadDraft() {
            try {
                const raw = window.localStorage.getItem(getLeadDraftStorageKey());
                if (!raw) return false;
                const parsed = JSON.parse(raw);
                const values = parsed && typeof parsed === 'object' ? parsed.values : null;
                if (!values || typeof values !== 'object') return false;

                if (typeof values.service === 'string') leadService.value = values.service;
                if (typeof values.inquiryType === 'string') leadInquiryType.value = values.inquiryType;
                if (typeof values.name === 'string') leadName.value = values.name;
                if (typeof values.email === 'string') leadEmail.value = values.email;
                if (typeof values.phone === 'string') leadPhone.value = values.phone;
                if (typeof values.location === 'string') leadLocation.value = values.location;
                if (typeof values.locationOther === 'string') leadLocationOther.value = values.locationOther;
                if (typeof values.message === 'string') leadMessage.value = values.message;
                leadConsent.checked = Boolean(values.consent);
                return true;
            } catch {
                return false;
            }
        }

        function clearLeadDraft() {
            try {
                window.localStorage.removeItem(getLeadDraftStorageKey());
            } catch {
                // Ignore storage failures.
            }
        }

        function clamp(value, min, max) {
            return Math.min(max, Math.max(min, value));
        }

        function saveWidgetPosition(left, top) {
            try {
                window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify({ left, top }));
            } catch {
                // Ignore storage failures.
            }
        }

        function clearSavedWidgetPosition() {
            try {
                window.localStorage.removeItem(CHAT_POSITION_KEY);
            } catch {
                // Ignore storage failures.
            }
        }

        function shouldLockWidgetToViewport() {
            return window.innerWidth <= CHAT_MOBILE_WIDTH || window.matchMedia('(pointer: coarse)').matches;
        }

        function getSavedWidgetPosition() {
            try {
                const raw = window.localStorage.getItem(CHAT_POSITION_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!Number.isFinite(parsed?.left) || !Number.isFinite(parsed?.top)) return null;
                return parsed;
            } catch {
                return null;
            }
        }

        function applyDefaultWidgetPosition() {
            widgetRoot.style.removeProperty('left');
            widgetRoot.style.removeProperty('top');
            widgetRoot.style.removeProperty('right');
            widgetRoot.style.removeProperty('bottom');
        }

        function applyCustomWidgetPosition(left, top) {
            const rect = widgetRoot.getBoundingClientRect();
            const width = rect.width || 120;
            const height = rect.height || 52;
            const maxLeft = Math.max(CHAT_EDGE_PADDING, window.innerWidth - width - CHAT_EDGE_PADDING);
            const maxTop = Math.max(CHAT_EDGE_PADDING, window.innerHeight - height - CHAT_EDGE_PADDING);
            const clampedLeft = clamp(left, CHAT_EDGE_PADDING, maxLeft);
            const clampedTop = clamp(top, CHAT_EDGE_PADDING, maxTop);

            widgetRoot.style.left = `${clampedLeft}px`;
            widgetRoot.style.top = `${clampedTop}px`;
            widgetRoot.style.right = 'auto';
            widgetRoot.style.bottom = 'auto';
            return { left: clampedLeft, top: clampedTop };
        }

        function applySavedPosition() {
            if (shouldLockWidgetToViewport()) {
                applyDefaultWidgetPosition();
                return;
            }

            const saved = getSavedWidgetPosition();
            if (!saved) {
                applyDefaultWidgetPosition();
                return;
            }

            const applied = applyCustomWidgetPosition(saved.left, saved.top);
            saveWidgetPosition(applied.left, applied.top);
        }

        function clearDragTimer() {
            if (dragTimer) {
                window.clearTimeout(dragTimer);
                dragTimer = null;
            }
        }

        function finalizeDrag(pointerId) {
            if (!dragPrimed || !dragPointer || (pointerId !== undefined && pointerId !== dragPointer.pointerId)) {
                return;
            }

            clearDragTimer();
            if (isDragging) {
                const rect = widgetRoot.getBoundingClientRect();
                const applied = applyCustomWidgetPosition(rect.left, rect.top);
                saveWidgetPosition(applied.left, applied.top);
                widgetRoot.classList.remove('dragging');
                suppressToggleClick = true;
                window.setTimeout(() => {
                    suppressToggleClick = false;
                }, 220);
            }

            dragPrimed = false;
            isDragging = false;
            dragPointer = null;
        }

        function bindDragBehavior() {
            if (!toggleButton || !widgetRoot) return;

            toggleButton.addEventListener('pointerdown', (event) => {
                if (widgetRoot.classList.contains('open')) return;
                if (shouldLockWidgetToViewport()) return;
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                if (event.pointerType !== 'mouse') return;

                const rect = widgetRoot.getBoundingClientRect();
                dragPointer = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startLeft: rect.left,
                    startTop: rect.top,
                    width: rect.width,
                    height: rect.height,
                };

                dragPrimed = true;
                isDragging = false;
                clearDragTimer();
                dragTimer = window.setTimeout(() => {
                    if (!dragPrimed || !dragPointer) return;
                    isDragging = true;
                    widgetRoot.classList.add('dragging');
                    applyCustomWidgetPosition(dragPointer.startLeft, dragPointer.startTop);
                }, CHAT_DRAG_HOLD_MS);

                if (typeof toggleButton.setPointerCapture === 'function') {
                    try {
                        toggleButton.setPointerCapture(event.pointerId);
                    } catch {
                        // Ignore pointer capture issues.
                    }
                }
            });

            toggleButton.addEventListener('pointermove', (event) => {
                if (!dragPrimed || !dragPointer || event.pointerId !== dragPointer.pointerId) return;

                const deltaX = event.clientX - dragPointer.startX;
                const deltaY = event.clientY - dragPointer.startY;
                const moved = Math.hypot(deltaX, deltaY);
                if (!isDragging && moved > CHAT_DRAG_MOVE_PX) {
                    clearDragTimer();
                }

                if (!isDragging) return;
                event.preventDefault();
                applyCustomWidgetPosition(dragPointer.startLeft + deltaX, dragPointer.startTop + deltaY);
            }, { passive: false });

            toggleButton.addEventListener('pointerup', (event) => {
                finalizeDrag(event.pointerId);
            });

            toggleButton.addEventListener('pointercancel', (event) => {
                finalizeDrag(event.pointerId);
            });

            toggleButton.addEventListener('lostpointercapture', () => {
                finalizeDrag();
            });

            window.addEventListener('resize', () => {
                if (shouldLockWidgetToViewport()) {
                    applyDefaultWidgetPosition();
                    return;
                }
                const hasCustom = widgetRoot.style.left && widgetRoot.style.top;
                if (!hasCustom) return;
                const rect = widgetRoot.getBoundingClientRect();
                const applied = applyCustomWidgetPosition(rect.left, rect.top);
                saveWidgetPosition(applied.left, applied.top);
            });
        }

        function addMessage(role, text) {
            const bubble = document.createElement('div');
            bubble.className = role === 'user' ? 'aoas-chat-message user' : 'aoas-chat-message bot';
            bubble.textContent = text;
            body.appendChild(bubble);
            body.scrollTop = body.scrollHeight;
            transcript.push(`${role === 'user' ? 'User' : 'Bot'}: ${text}`);
        }

        function setActionButtons(buttons) {
            actions.innerHTML = '';
            buttons.forEach((button) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'aoas-chat-chip';
                chip.textContent = button.label;
                chip.addEventListener('click', () => {
                    if (button.emitUserMessage !== false) {
                        addMessage('user', button.userMessage || button.label);
                    }
                    button.onClick();
                });
                actions.appendChild(chip);
            });
        }

        function toggleOtherLocationField() {
            const isOther = leadLocation.value === 'Other';
            leadLocationOtherWrap.hidden = !isOther;
            if (!isOther) {
                leadLocationOther.value = '';
            }
            saveLeadDraft();
        }

        function setLeadMode(enabled) {
            leadForm.hidden = !enabled;
            actions.hidden = enabled;
            inputForm.hidden = enabled;
            panel.classList.toggle('lead-mode', enabled);
        }

        function showLeadForm(serviceKey = '', forcedInquiryType = '') {
            setLeadMode(true);
            if (serviceKey) {
                currentService = serviceKey;
                leadService.value = serviceKey;
            }

            if (forcedInquiryType) {
                leadInquiryType.value = forcedInquiryType;
            } else if (applicantMode && !leadInquiryType.value) {
                leadInquiryType.value = 'job-application';
            }

            toggleOtherLocationField();
            saveLeadDraft();
            track('chat_lead_form_opened', {
                service: serviceKey || 'unknown',
                inquiryType: leadInquiryType.value || '',
            });
        }

        function hideLeadForm() {
            setLeadMode(false);
        }

        function respondToService(serviceKey) {
            const service = SERVICES[serviceKey];
            if (!service) return;
            setApplicantMode(false);
            currentService = serviceKey;
            addMessage('bot', service.summary);
            addMessage('bot', service.common);
            setActionButtons([
                { label: 'Contact me', onClick: () => showLeadForm(serviceKey) },
                { label: 'Talk to team', onClick: () => handleIntent('talk-human') },
            ]);
            track('chat_service_selected', { service: serviceKey });
        }

        function setRoutingButtons() {
            setActionButtons([
                { label: 'Payroll', onClick: () => handleIntent('payroll') },
                { label: 'Bookkeeping', onClick: () => handleIntent('bookkeeping') },
                { label: 'Tax & Compliance', onClick: () => handleIntent('tax-compliance') },
                { label: 'Data Entry', onClick: () => handleIntent('data-entry') },
                { label: 'NDIS Admin', onClick: () => handleIntent('ndis-admin') },
                { label: 'Customer Service', onClick: () => handleIntent('customer-service') },
                { label: 'Talk to team', onClick: () => handleIntent('talk-human') },
            ]);
        }

        function setApplicantMode(enabled) {
            applicantMode = Boolean(enabled);
        }

        function respondToApplicantIntent() {
            setApplicantMode(true);
            addMessage('bot', 'Thank you for your interest in joining AOAS.');
            addMessage('bot', 'Hiring needs vary depending on current openings and team requirements.');
            addMessage('bot', 'For applications, please visit our Careers page and send your resume to support@attainmentofficeadserv.org.');
            addMessage('bot', 'We will inform you once there are open positions that align with your skills and experience.');
            setActionButtons([
                {
                    label: 'Open Careers Page',
                    onClick: () => {
                        window.location.href = '/careers';
                    },
                },
                {
                    label: 'Contact recruitment',
                    onClick: () => {
                        showLeadForm(currentService || 'other', 'job-application');
                    },
                },
            ]);
            track('chat_applicant_routed', { page: window.location.pathname });
        }

        function respondToSmallTalk(userText) {
            if (isGreeting(userText)) {
                addMessage('bot', 'Hi there. Which service do you need help with today?');
                setRoutingButtons();
                return true;
            }

            if (isThanks(userText)) {
                addMessage('bot', 'You are welcome. If you tell me the service you need, I can route this properly.');
                setRoutingButtons();
                return true;
            }

            const likelyName = extractLikelyName(userText);
            if (likelyName) {
                addMessage('bot', `Thanks, ${likelyName}. Which service would you like help with?`);
                setRoutingButtons();
                return true;
            }

            return false;
        }

        function respondFromScripts(userText) {
            for (const script of CONVERSATION_SCRIPTS) {
                if (script.match.test(userText)) {
                    if (script.intent === 'applicant') {
                        handleIntent('applicant', { prefaceReplies: script.replies || [] });
                        return true;
                    }

                    if (script.intent === 'talk-human' && applicantMode) {
                        handleIntent('talk-human');
                        return true;
                    }

                    script.replies.forEach((line) => addMessage('bot', line));
                    if (script.intent) {
                        handleIntent(script.intent);
                        return true;
                    }
                    if (applicantMode) {
                        setActionButtons([
                            {
                                label: 'Open Careers Page',
                                onClick: () => {
                                    window.location.href = '/careers';
                                },
                            },
                        ]);
                    } else {
                        setActionButtons([
                            { label: 'Contact me', onClick: () => showLeadForm(currentService || 'general-admin') },
                            { label: 'Talk to team', onClick: () => handleIntent('talk-human') },
                        ]);
                    }
                    return true;
                }
            }
            return false;
        }

        function handleIntent(intent, options = {}) {
            if (SERVICES[intent]) {
                respondToService(intent);
                return;
            }

            if (intent === 'applicant') {
                const prefaceReplies = Array.isArray(options.prefaceReplies) ? options.prefaceReplies : [];
                if (prefaceReplies.length) {
                    prefaceReplies.forEach((line) => addMessage('bot', line));
                    setApplicantMode(true);
                    setActionButtons([
                        {
                            label: 'Open Careers Page',
                            onClick: () => {
                                window.location.href = '/careers';
                            },
                        },
                        {
                            label: 'Contact recruitment',
                            onClick: () => {
                                showLeadForm(currentService || 'other', 'job-application');
                            },
                        },
                    ]);
                    track('chat_applicant_routed', { page: window.location.pathname });
                } else {
                    respondToApplicantIntent();
                }
                return;
            }

            if (intent === 'talk-human') {
                if (applicantMode) {
                    addMessage('bot', 'For applications, you can use Careers or submit your details here for recruitment follow-up.');
                    showLeadForm(currentService || 'other', 'job-application');
                    return;
                }

                addMessage('bot', 'You can reach our team at support@attainmentofficeadserv.org or +63 (032) 238-6354.');
                addMessage('bot', 'If you prefer, share your details here and we will contact you directly.');
                setActionButtons([
                    { label: 'Contact me', onClick: () => showLeadForm(currentService || 'general-admin') },
                ]);
                return;
            }
        }

        function openChat() {
            panel.hidden = false;
            widgetRoot.classList.add('open');
            toggleButton.style.display = 'none';
            input.focus();
            if (widgetRoot.style.left && widgetRoot.style.top) {
                const rect = widgetRoot.getBoundingClientRect();
                const applied = applyCustomWidgetPosition(rect.left, rect.top);
                saveWidgetPosition(applied.left, applied.top);
            }
            track('chat_opened', { page: window.location.pathname });
        }

        function closeChat() {
            panel.hidden = true;
            widgetRoot.classList.remove('open');
            toggleButton.style.display = '';
            hideLeadForm();
            if (widgetRoot.style.left && widgetRoot.style.top) {
                const rect = widgetRoot.getBoundingClientRect();
                const applied = applyCustomWidgetPosition(rect.left, rect.top);
                saveWidgetPosition(applied.left, applied.top);
            }
        }

        toggleButton.addEventListener('click', (event) => {
            if (suppressToggleClick) {
                event.preventDefault();
                return;
            }
            openChat();
        });
        closeButton.addEventListener('click', closeChat);
        leadCancelButton?.addEventListener('click', () => {
            saveLeadDraft();
            hideLeadForm();
        });
        leadLocation.addEventListener('change', toggleOtherLocationField);
        leadForm.addEventListener('input', saveLeadDraft);
        leadForm.addEventListener('change', saveLeadDraft);

        restoreLeadDraft();
        toggleOtherLocationField();
        if (shouldLockWidgetToViewport()) {
            clearSavedWidgetPosition();
        }
        applySavedPosition();
        bindDragBehavior();

        inputForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const value = input.value.trim();
            if (!value) return;

            addMessage('user', value);
            input.value = '';

            const intent = detectIntent(value);
            if (intent) {
                handleIntent(intent);
                return;
            }

            const matched = respondFromScripts(value);
            if (!matched) {
                const handled = respondToSmallTalk(value);
                if (!handled) {
                    addMessage('bot', 'I can route this correctly once I know the service you need. Please pick one below.');
                    setRoutingButtons();
                }
            }
        });

        leadForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const service = leadService.value.trim();
            const inquiryType = leadInquiryType.value.trim() || '';
            const name = leadName.value.trim();
            const email = leadEmail.value.trim();
            const message = leadMessage.value.trim();
            const phone = leadPhone.value.trim();
            const location = leadLocation.value === 'Other'
                ? leadLocationOther.value.trim()
                : leadLocation.value;

            if (!service || !inquiryType || !name || !email || !message || !leadConsent.checked) {
                addMessage('bot', 'Please complete all required fields before submitting.');
                return;
            }

            leadSubmitButton.disabled = true;
            const originalLabel = leadSubmitButton.textContent;
            leadSubmitButton.textContent = 'Submitting...';

            try {
                const response = await fetch(resolveApiUrl('/api/contact'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: 'chat-widget',
                        service,
                        inquiryType,
                        name,
                        email,
                        phone,
                        message,
                        location,
                        sourcePage: window.location.pathname,
                        pageUrl: window.location.href,
                        consent: true,
                        utm: getUtmPayload(),
                        conversationSummary: transcript.slice(-14).join('\n'),
                    }),
                });

                let result = {};
                try {
                    result = await response.json();
                } catch {
                    result = {};
                }

                if (!response.ok || !result.success) {
                    throw new Error(result.error || `Request failed (${response.status})`);
                }

                addMessage('bot', 'Thank you. We received your details and our team will reach out soon.');
                track('chat_lead_submitted', { service, inquiryType });
                clearLeadDraft();
                leadForm.reset();
                hideLeadForm();
                toggleOtherLocationField();
            } catch (error) {
                const isCorsOrOriginError = /origin not allowed|cors|403/i.test(error.message);
                const isApiUnavailable = isCorsOrOriginError || /404|405|failed to fetch|networkerror|err_connection_refused|not found/i.test(error.message);
                if (isCorsOrOriginError && !apiHintShown) {
                    apiHintShown = true;
                    addMessage('bot', 'Your submission was blocked by a security rule. Please use the contact form on the page or email us directly at support@aoa-services.com.');
                } else if (isApiUnavailable && !apiHintShown) {
                    apiHintShown = true;
                    addMessage('bot', 'I could not submit that right now. Please use the website inquiry form or contact us at support@aoa-services.com.');
                } else {
                    addMessage('bot', `I could not submit your inquiry right now: ${error.message}`);
                }
            } finally {
                leadSubmitButton.disabled = false;
                leadSubmitButton.textContent = originalLabel;
            }
        });

        addMessage('bot', 'Hi! I am here to help with your enquiry.');
        setActionButtons(QUICK_ACTIONS.map((action) => ({
            label: action.label,
            onClick: () => handleIntent(action.intent),
        })));
    });
})();
