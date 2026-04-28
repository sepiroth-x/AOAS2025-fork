(function servicePageEnhancements() {
    const SERVICE_META = {
        payroll: {
            label: 'Payroll Support',
            intro: 'Share your payroll workflow and preferred cycle so we can align support.',
        },
        bookkeeping: {
            label: 'Bookkeeping',
            intro: 'Tell us about your bookkeeping process and priorities for follow-up.',
        },
        'tax-compliance': {
            label: 'Tax & Compliance Support',
            intro: 'Describe your compliance process so we can map next steps accurately.',
        },
        'data-entry': {
            label: 'Data Entry',
            intro: 'Share data volume, source format, and expected output requirements.',
        },
        'ndis-admin': {
            label: 'NDIS Administration',
            intro: 'Tell us your current NDIS workflow and the support you need most.',
        },
        'customer-service': {
            label: 'Customer Service Support',
            intro: 'Share your support channels and workflow so we can align the right setup.',
        },
        'general-admin': {
            label: 'General VA Support',
            intro: 'Tell us the admin tasks and workflow areas where you need support.',
        },
    };

    function resolveApiUrl(path) {
        if (window.AOASTracker && typeof window.AOASTracker.resolveApiUrl === 'function') {
            return window.AOASTracker.resolveApiUrl(path);
        }
        return path.startsWith('/') ? path : `/${path}`;
    }

    function trackEvent(eventName, properties = {}) {
        if (window.AOASTracker && typeof window.AOASTracker.track === 'function') {
            window.AOASTracker.track(eventName, properties);
        }
    }

    function setStatus(target, message, tone = 'neutral') {
        if (!target) return;
        target.textContent = message;
        target.className = `service-form-status ${tone}`;
    }

    function setupLocalFormDraft(form, options = {}) {
        if (!form || typeof window === 'undefined') {
            return null;
        }

        const storagePrefix = options.storagePrefix || 'aoas_form_draft_v1';
        const defaultId = form.id || form.getAttribute('name') || form.getAttribute('data-service') || 'form';
        const scope = options.scope || window.location.pathname || 'service-page';
        const storageKey = options.storageKey || `${storagePrefix}:${scope}:${defaultId}`;
        const includeHidden = Boolean(options.includeHidden);
        const includeFields = Array.isArray(options.includeFields) ? new Set(options.includeFields) : null;
        const excludeFields = new Set(options.excludeFields || []);
        const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 240;

        const getFields = () => Array.from(form.querySelectorAll('input, select, textarea'));
        const getFieldKey = (field) => field?.name || field?.id || '';

        const shouldPersistField = (field) => {
            if (!field || field.disabled) return false;
            if (field.closest('.honeypot-field')) return false;
            const key = getFieldKey(field);
            if (!key) return false;
            if (includeFields && !includeFields.has(key)) return false;
            if (excludeFields.has(key)) return false;
            if (field.type === 'password' || field.type === 'file') return false;
            if (field.type === 'hidden' && !includeHidden) return false;
            return true;
        };

        const collect = () => {
            const values = {};
            const handledRadioKeys = new Set();

            getFields().forEach((field) => {
                if (!shouldPersistField(field)) return;
                const key = getFieldKey(field);

                if (field.type === 'radio') {
                    if (handledRadioKeys.has(key)) return;
                    handledRadioKeys.add(key);
                    const selected = getFields().find(
                        (candidate) => candidate.type === 'radio' && getFieldKey(candidate) === key && candidate.checked
                    );
                    values[key] = selected ? selected.value : '';
                    return;
                }

                if (field.type === 'checkbox') {
                    values[key] = Boolean(field.checked);
                    return;
                }

                values[key] = field.value;
            });

            return values;
        };

        const save = () => {
            try {
                window.localStorage.setItem(storageKey, JSON.stringify({
                    v: 1,
                    ts: Date.now(),
                    values: collect(),
                }));
            } catch {
                // Ignore storage failures.
            }
        };

        const restore = () => {
            try {
                const raw = window.localStorage.getItem(storageKey);
                if (!raw) return false;
                const parsed = JSON.parse(raw);
                const values = parsed && typeof parsed === 'object' ? parsed.values : null;
                if (!values || typeof values !== 'object') return false;

                const fields = getFields();
                const handledRadioKeys = new Set();
                let restoredAny = false;

                fields.forEach((field) => {
                    if (!shouldPersistField(field)) return;
                    const key = getFieldKey(field);
                    if (!(key in values)) return;

                    if (field.type === 'radio') {
                        if (handledRadioKeys.has(key)) return;
                        handledRadioKeys.add(key);
                        const storedValue = String(values[key] ?? '');
                        fields.forEach((candidate) => {
                            if (candidate.type === 'radio' && getFieldKey(candidate) === key) {
                                candidate.checked = candidate.value === storedValue;
                            }
                        });
                        restoredAny = true;
                        return;
                    }

                    if (field.type === 'checkbox') {
                        field.checked = Boolean(values[key]);
                        restoredAny = true;
                        return;
                    }

                    field.value = values[key] == null ? '' : String(values[key]);
                    restoredAny = true;
                });

                if (restoredAny && typeof options.onRestore === 'function') {
                    options.onRestore(values);
                }
                return restoredAny;
            } catch {
                return false;
            }
        };

        const clear = () => {
            try {
                window.localStorage.removeItem(storageKey);
            } catch {
                // Ignore storage failures.
            }
        };

        let saveTimer = 0;
        const scheduleSave = () => {
            if (saveTimer) window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(save, debounceMs);
        };

        form.addEventListener('input', scheduleSave);
        form.addEventListener('change', scheduleSave);
        form.addEventListener('reset', () => {
            window.setTimeout(clear, 0);
        });

        restore();

        return {
            key: storageKey,
            save,
            scheduleSave,
            clear,
            restore,
        };
    }

    function applyRevealAnimations() {
        const revealTargets = document.querySelectorAll('.service-animate');
        if (!revealTargets.length) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const supportsObserver = typeof window.IntersectionObserver === 'function';

        if (reducedMotion || !supportsObserver) {
            revealTargets.forEach((target) => target.classList.add('is-visible'));
            return;
        }

        document.body.classList.add('service-reveal-enabled');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -40px 0px',
        });

        window.requestAnimationFrame(() => {
            revealTargets.forEach((target) => observer.observe(target));
        });

        // Safety fallback: never keep content hidden if observer callbacks are delayed.
        window.setTimeout(() => {
            revealTargets.forEach((target) => target.classList.add('is-visible'));
        }, 1800);
    }

    function detectServiceKey() {
        const known = Object.keys(SERVICE_META);
        const fromPath = window.location.pathname.toLowerCase().split('/').filter(Boolean).pop() || '';
        if (known.includes(fromPath)) {
            return fromPath;
        }

        const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        if (canonicalHref) {
            try {
                const canonicalPath = new URL(canonicalHref, window.location.origin).pathname;
                const canonicalKey = canonicalPath.toLowerCase().split('/').filter(Boolean).pop() || '';
                if (known.includes(canonicalKey)) {
                    return canonicalKey;
                }
            } catch {
                // Ignore invalid canonical URLs.
            }
        }

        const pageTitle = (document.querySelector('h1')?.textContent || '').toLowerCase();
        if (pageTitle.includes('payroll')) return 'payroll';
        if (pageTitle.includes('bookkeeping')) return 'bookkeeping';
        if (pageTitle.includes('tax') || pageTitle.includes('compliance')) return 'tax-compliance';
        if (pageTitle.includes('data')) return 'data-entry';
        if (pageTitle.includes('ndis')) return 'ndis-admin';
        if (pageTitle.includes('customer')) return 'customer-service';
        return 'general-admin';
    }

    function isServicesHubPage() {
        const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
        if (path === '/services') {
            return true;
        }

        const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        if (canonicalHref) {
            try {
                const canonicalPath = new URL(canonicalHref, window.location.origin).pathname.toLowerCase().replace(/\/+$/, '');
                if (canonicalPath === '/services') {
                    return true;
                }
            } catch {
                // Ignore invalid canonical URLs.
            }
        }

        return document.querySelector('.service-inquiry-form') === null && document.querySelector('.services-page-grid') !== null;
    }

    function setupServicesHubCarousel() {
        const carousel = document.querySelector('[data-services-carousel]');
        const viewport = carousel?.querySelector('.services-carousel-viewport');
        const track = carousel?.querySelector('[data-services-track]');
        if (!carousel || !track) return;

        const cards = Array.from(track.querySelectorAll('.services-page-card'));
        if (!cards.length) return;

        const prevButton = carousel.querySelector('[data-services-prev]');
        const nextButton = carousel.querySelector('[data-services-next]');
        const pagination = carousel.querySelector('[data-services-pagination]');
        const currentPageEl = carousel.querySelector('[data-services-current]');
        const totalPagesEl = carousel.querySelector('[data-services-total]');
        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        let perPage = 1;
        let totalPages = 1;
        let currentPage = 0;
        let autoplayTimer = 0;
        let resizeTimer = 0;
        const swipeState = {
            active: false,
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
        };

        const stopAutoplay = () => {
            if (!autoplayTimer) return;
            window.clearInterval(autoplayTimer);
            autoplayTimer = 0;
        };

        const shouldAutoplay = () => totalPages > 1 && !reducedMotionQuery.matches && !document.hidden;

        const updateControls = () => {
            if (currentPageEl) currentPageEl.textContent = String(currentPage + 1);
            if (totalPagesEl) totalPagesEl.textContent = String(totalPages);
            if (prevButton) prevButton.disabled = currentPage === 0;
            if (nextButton) nextButton.disabled = currentPage === totalPages - 1;

            if (!pagination) return;
            pagination.querySelectorAll('[data-services-page]').forEach((button, index) => {
                const active = index === currentPage;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-current', active ? 'true' : 'false');
            });
        };

        const getSlideWidth = () => {
            return viewport?.clientWidth || carousel.clientWidth || window.innerWidth;
        };

        const updatePosition = () => {
            const slides = track.querySelectorAll('.services-page-slide');
            const activeSlide = slides[currentPage];
            const offset = activeSlide ? activeSlide.offsetLeft : getSlideWidth() * currentPage;
            track.style.transform = `translate3d(-${offset}px, 0, 0)`;
            updateControls();
        };

        const startAutoplay = () => {
            stopAutoplay();
            if (!shouldAutoplay()) return;
            autoplayTimer = window.setInterval(() => {
                goToPage(currentPage + 1, { wrap: true });
            }, 5600);
        };

        const restartAutoplay = () => {
            if (carousel.matches(':hover') || carousel.contains(document.activeElement)) {
                stopAutoplay();
                return;
            }
            startAutoplay();
        };

        const renderPagination = () => {
            if (!pagination) return;
            pagination.replaceChildren();

            for (let index = 0; index < totalPages; index += 1) {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'services-carousel-dot';
                dot.dataset.servicesPage = String(index);
                dot.setAttribute('aria-label', `Go to services page ${index + 1}`);
                pagination.appendChild(dot);
            }
        };

        const getPerPage = () => {
            const width = carousel.clientWidth || window.innerWidth;
            if (width >= 1180) return 4;
            if (width >= 980) return 3;
            if (width >= 760) return 2;
            return 1;
        };

        const goToPage = (targetPage, options = {}) => {
            if (totalPages <= 1) {
                currentPage = 0;
                updatePosition();
                return;
            }

            const wrap = Boolean(options.wrap);
            const nextPage = wrap
                ? (targetPage + totalPages) % totalPages
                : Math.max(0, Math.min(totalPages - 1, targetPage));

            if (nextPage === currentPage) {
                updateControls();
                return;
            }

            currentPage = nextPage;
            updatePosition();
            restartAutoplay();
        };

        const rebuildSlides = () => {
            const firstVisibleIndex = currentPage * perPage;
            perPage = Math.min(getPerPage(), cards.length);
            totalPages = Math.max(1, Math.ceil(cards.length / perPage));
            currentPage = Math.min(Math.floor(firstVisibleIndex / perPage), totalPages - 1);

            carousel.style.setProperty('--services-per-page', String(perPage));
            carousel.dataset.carouselReady = 'true';
            carousel.dataset.carouselMultiple = totalPages > 1 ? 'true' : 'false';

            const fragment = document.createDocumentFragment();
            const viewportWidth = Math.round(getSlideWidth());

            for (let index = 0; index < cards.length; index += perPage) {
                const slide = document.createElement('div');
                slide.className = 'services-page-slide';
                slide.setAttribute('role', 'group');
                slide.setAttribute('aria-label', `Services page ${Math.floor(index / perPage) + 1} of ${totalPages}`);
                slide.style.width = `${viewportWidth}px`;
                slide.style.minWidth = `${viewportWidth}px`;
                slide.style.flex = `0 0 ${viewportWidth}px`;

                cards.slice(index, index + perPage).forEach((card) => {
                    slide.appendChild(card);
                });

                fragment.appendChild(slide);
            }

            track.replaceChildren(fragment);
            renderPagination();
            updatePosition();
            restartAutoplay();
        };

        const scheduleRebuild = () => {
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(rebuildSlides, 120);
        };

        const resetSwipe = () => {
            swipeState.active = false;
            swipeState.startX = 0;
            swipeState.startY = 0;
            swipeState.lastX = 0;
            swipeState.lastY = 0;
        };

        const isSwipeTargetAllowed = (target) => !target.closest('a, button, input, textarea, select, label');

        const handleTouchStart = (event) => {
            if (event.touches.length !== 1 || !isSwipeTargetAllowed(event.target)) {
                resetSwipe();
                return;
            }

            const touch = event.touches[0];
            swipeState.active = true;
            swipeState.startX = touch.clientX;
            swipeState.startY = touch.clientY;
            swipeState.lastX = touch.clientX;
            swipeState.lastY = touch.clientY;
            stopAutoplay();
        };

        const handleTouchMove = (event) => {
            if (!swipeState.active || event.touches.length !== 1) return;

            const touch = event.touches[0];
            swipeState.lastX = touch.clientX;
            swipeState.lastY = touch.clientY;

            const deltaX = swipeState.lastX - swipeState.startX;
            const deltaY = swipeState.lastY - swipeState.startY;
            if (Math.abs(deltaX) > Math.abs(deltaY) + 8) {
                event.preventDefault();
            }
        };

        const handleTouchEnd = () => {
            if (!swipeState.active) return;

            const deltaX = swipeState.lastX - swipeState.startX;
            const deltaY = swipeState.lastY - swipeState.startY;
            const isHorizontalSwipe = Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

            if (isHorizontalSwipe) {
                goToPage(currentPage + (deltaX < 0 ? 1 : -1));
            }

            resetSwipe();
            restartAutoplay();
        };

        prevButton?.addEventListener('click', () => {
            goToPage(currentPage - 1);
        });

        nextButton?.addEventListener('click', () => {
            goToPage(currentPage + 1);
        });

        pagination?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-services-page]');
            if (!button) return;
            const pageIndex = Number(button.dataset.servicesPage);
            if (!Number.isFinite(pageIndex)) return;
            goToPage(pageIndex);
        });

        viewport?.addEventListener('touchstart', handleTouchStart, { passive: true });
        viewport?.addEventListener('touchmove', handleTouchMove, { passive: false });
        viewport?.addEventListener('touchend', handleTouchEnd, { passive: true });
        viewport?.addEventListener('touchcancel', () => {
            resetSwipe();
            restartAutoplay();
        }, { passive: true });

        carousel.addEventListener('mouseenter', stopAutoplay);
        carousel.addEventListener('mouseleave', restartAutoplay);
        carousel.addEventListener('focusin', stopAutoplay);
        carousel.addEventListener('focusout', (event) => {
            if (event.relatedTarget && carousel.contains(event.relatedTarget)) {
                return;
            }
            restartAutoplay();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopAutoplay();
                return;
            }
            restartAutoplay();
        });

        if (typeof reducedMotionQuery.addEventListener === 'function') {
            reducedMotionQuery.addEventListener('change', restartAutoplay);
        } else if (typeof reducedMotionQuery.addListener === 'function') {
            reducedMotionQuery.addListener(restartAutoplay);
        }

        window.addEventListener('resize', scheduleRebuild, { passive: true });

        rebuildSlides();
    }

    function buildFallbackInquiryForm(serviceKey) {
        const meta = SERVICE_META[serviceKey] || SERVICE_META['general-admin'];
        const idPrefix = serviceKey.replace(/[^a-z0-9-]/g, '');

        return `
            <h3>Inquire About ${meta.label}</h3>
            <p>${meta.intro}</p>
            <form class="service-inquiry-form" data-service="${serviceKey}" autocomplete="on">
                <div class="row">
                    <div>
                        <label for="${idPrefix}-name">Name</label>
                        <input id="${idPrefix}-name" name="name" type="text" required maxlength="120" autocomplete="name">
                    </div>
                    <div>
                        <label for="${idPrefix}-email">Email</label>
                        <input id="${idPrefix}-email" name="email" type="email" required maxlength="320" autocomplete="email">
                    </div>
                </div>

                <div class="row">
                    <div>
                        <label for="${idPrefix}-phone">Phone (optional)</label>
                        <input id="${idPrefix}-phone" name="phone" type="text" maxlength="50" autocomplete="tel">
                    </div>
                    <div>
                        <label for="${idPrefix}-location">Location (optional)</label>
                        <select id="${idPrefix}-location" name="location" autocomplete="off">
                            <option value="" selected>Select location (optional)</option>
                            <option value="Australia">Australia</option>
                            <option value="Philippines">Philippines</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>

                <div class="row reason-location-row">
                    <div>
                        <label for="${idPrefix}-inquiry-type">Reason for Contact</label>
                        <select id="${idPrefix}-inquiry-type" name="inquiryType" autocomplete="off" required>
                            <option value="" selected>Select reason</option>
                            <option value="new-project">New Project</option>
                            <option value="job-application">Job Application</option>
                            <option value="general-inquiry">General Inquiry</option>
                        </select>
                    </div>
                    <div class="service-location-other" hidden>
                        <label for="${idPrefix}-location-other">Enter location</label>
                        <input id="${idPrefix}-location-other" name="locationOther" type="text" maxlength="120" placeholder="City / Country" autocomplete="off">
                    </div>
                </div>

                <div>
                    <label for="${idPrefix}-message">Message</label>
                    <textarea id="${idPrefix}-message" name="message" required maxlength="5000" rows="6" autocomplete="off"></textarea>
                </div>

                <div class="honeypot-field" aria-hidden="true">
                    <label for="${idPrefix}-website">Website</label>
                    <input id="${idPrefix}-website" name="website" type="text" tabindex="-1" autocomplete="off">
                </div>

                <button type="submit" class="service-submit-btn">Submit inquiry</button>
                <p class="service-form-status neutral" aria-live="polite"></p>
            </form>
        `;
    }

    function ensureServiceInquiryForm() {
        const existingForm = document.querySelector('.service-inquiry-form');
        if (existingForm) {
            const card = existingForm.closest('.service-inquiry-card');
            if (card && !card.id) {
                card.id = 'service-inquiry';
            }
            return;
        }

        const serviceKey = detectServiceKey();
        const grid = document.querySelector('.service-content-grid');
        const main = document.querySelector('main') || document.body;

        let inquiryCard = grid ? grid.querySelector('aside') : null;
        if (!inquiryCard) {
            inquiryCard = document.createElement('aside');
            inquiryCard.className = 'service-inquiry-card service-animate is-visible';
            if (grid) {
                grid.appendChild(inquiryCard);
            } else {
                const section = document.createElement('section');
                section.className = 'service-content-grid';
                section.appendChild(inquiryCard);
                main.appendChild(section);
            }
        }

        inquiryCard.id = 'service-inquiry';
        inquiryCard.innerHTML = buildFallbackInquiryForm(serviceKey);
    }

    function normalizeLegacyInquireLinks() {
        const serviceAnchor = '#service-inquiry';
        const links = document.querySelectorAll('a[href]');

        links.forEach((link) => {
            const href = (link.getAttribute('href') || '').trim().toLowerCase();
            if (!href) return;

            const isLegacyContactHref =
                href.includes('/#contact') ||
                href.includes('#contact?') ||
                href.includes('/?service=') ||
                href.includes('&service=');

            const looksLikeInquire = /\binquire\b/i.test(link.textContent || '') || (link.dataset?.trackService || '') !== '';

            if (isLegacyContactHref && looksLikeInquire) {
                link.setAttribute('href', serviceAnchor);
                return;
            }

            // Keep service pages self-contained: header inquire should stay on page.
            if (looksLikeInquire && href === '/#contact') {
                link.setAttribute('href', serviceAnchor);
            }
        });
    }

    function bindServiceForm() {
        const form = document.querySelector('.service-inquiry-form');
        if (!form) return;

        const service = form.dataset.service || '';
        const statusEl = form.querySelector('.service-form-status');
        const locationSelect = form.querySelector('[name="location"]');
        const locationOtherWrap = form.querySelector('.service-location-other');
        const locationOtherInput = form.querySelector('[name="locationOther"]');
        const inquiryTypeSelect = form.querySelector('[name="inquiryType"]');
        let serviceDraft = null;

        const toggleOtherLocation = () => {
            if (!locationSelect || !locationOtherWrap || !locationOtherInput) return;
            const isOther = locationSelect.value === 'Other';
            locationOtherWrap.hidden = !isOther;
            if (!isOther) {
                locationOtherInput.value = '';
            }
            serviceDraft?.scheduleSave();
        };

        toggleOtherLocation();
        locationSelect?.addEventListener('change', toggleOtherLocation);

        serviceDraft = setupLocalFormDraft(form, {
            scope: `service-inquiry:${service || detectServiceKey()}`,
            excludeFields: ['website'],
            onRestore: () => {
                toggleOtherLocation();
            },
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(form);
            const name = String(formData.get('name') || '').trim();
            const email = String(formData.get('email') || '').trim();
            const phone = String(formData.get('phone') || '').trim();
            const message = String(formData.get('message') || '').trim();
            const inquiryType = String(formData.get('inquiryType') || inquiryTypeSelect?.value || '').trim();
            const locationValue = String(formData.get('location') || '').trim();
            const locationOther = String(formData.get('locationOther') || '').trim();
            const location = locationValue === 'Other' ? locationOther : locationValue;
            const website = String(formData.get('website') || '').trim();

            if (!inquiryType || !name || !email || !message) {
                setStatus(statusEl, 'Please complete reason for contact, name, email, and message.', 'error');
                return;
            }

            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(email)) {
                setStatus(statusEl, 'Please provide a valid email address.', 'error');
                return;
            }

            if (message.length < 8) {
                setStatus(statusEl, 'Please share a little more detail in your message.', 'error');
                return;
            }

            const submitButton = form.querySelector('button[type="submit"]');
            const originalLabel = submitButton?.textContent || 'Submit inquiry';
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Submitting...';
            }
            setStatus(statusEl, 'Sending your inquiry...', 'neutral');

            try {
                const response = await fetch(resolveApiUrl('/api/contact'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        source: `service-page:${service}`,
                        service,
                        inquiryType,
                        name,
                        email,
                        phone,
                        location,
                        message,
                        sourcePage: window.location.pathname,
                        pageUrl: window.location.href,
                        website,
                        utm: {
                            source: new URLSearchParams(window.location.search).get('utm_source') || '',
                            medium: new URLSearchParams(window.location.search).get('utm_medium') || '',
                            campaign: new URLSearchParams(window.location.search).get('utm_campaign') || '',
                            term: new URLSearchParams(window.location.search).get('utm_term') || '',
                            content: new URLSearchParams(window.location.search).get('utm_content') || '',
                        },
                    }),
                });

                let payload = {};
                try {
                    payload = await response.json();
                } catch {
                    payload = {};
                }

                if (!response.ok || !payload.success) {
                    throw new Error(payload.error || `Submission failed (${response.status})`);
                }

                trackEvent('service_page_inquiry_submitted', {
                    service,
                    inquiryType,
                    sourcePage: window.location.pathname,
                });
                setStatus(statusEl, payload.message || 'Thank you. We received your inquiry and will follow up shortly.', 'success');
                serviceDraft?.clear();
                form.reset();
                toggleOtherLocation();
            } catch (error) {
                const isCorsOrOriginError = /origin not allowed|cors|403/i.test(error.message);
                const isNetworkError =
                    /failed to fetch|networkerror|err_connection_refused/i.test(error.message) ||
                    error.name === 'TypeError';

                if (isCorsOrOriginError) {
                    setStatus(statusEl, 'Submission blocked by a security rule. Please contact us directly at support@aoa-services.com.', 'error');
                } else if (isNetworkError) {
                    setStatus(statusEl, 'Could not reach the server. Please check your connection and try again.', 'error');
                } else {
                    setStatus(statusEl, error.message || 'Unable to submit your inquiry right now. Please contact us at support@aoa-services.com.', 'error');
                }
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalLabel;
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const servicesHub = isServicesHubPage();

        if (servicesHub) {
            // Keep the services hub stable on mobile: never hide cards behind reveal state.
            document.body.classList.remove('service-reveal-enabled');
            document.querySelectorAll('.service-animate').forEach((target) => target.classList.add('is-visible'));
            setupServicesHubCarousel();
        } else {
            applyRevealAnimations();
            ensureServiceInquiryForm();
            normalizeLegacyInquireLinks();
        }
        bindServiceForm();
    });
})();
