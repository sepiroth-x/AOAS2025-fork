// =====================================================
// PERFORMANCE DETECTION FOR LOW-END DEVICES
// =====================================================
const isLowEndDevice = (() => {
    // Check for low memory (navigator.deviceMemory is in GB, undefined on unsupported)
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;
    // Check for low CPU cores
    const lowCPU = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
    // Check for mobile/touch device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // Check for slow connection
    const slowConnection = navigator.connection &&
        (navigator.connection.saveData ||
            navigator.connection.effectiveType === 'slow-2g' ||
            navigator.connection.effectiveType === '2g');
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Consider device low-end if any 2+ conditions are true, or reduced motion is preferred
    const lowEndScore = [lowMemory, lowCPU, isMobile, slowConnection].filter(Boolean).length;
    const isLowEnd = prefersReducedMotion || lowEndScore >= 2;

    if (isLowEnd) {
        console.log('Low-end device detected - disabling heavy animations');
        document.documentElement.classList.add('low-end-device');
    }

    return isLowEnd;
})();

function rafThrottle(callback) {
    let ticking = false;
    return (...args) => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            callback(...args);
        });
    };
}

function shouldKeepImageEager(image) {
    if (!image || typeof image.closest !== 'function') {
        return false;
    }

    const criticalContainer = image.closest(
        '.hero, .hero-minimal, .header, .navbar, .brand, .logo, .landing-hero, .contact-banner'
    );
    if (criticalContainer) {
        return true;
    }

    const explicitPriority = image.getAttribute('fetchpriority');
    if (explicitPriority && explicitPriority.toLowerCase() === 'high') {
        return true;
    }

    return false;
}

function setupLocalFormDraft(form, options = {}) {
    if (!form || typeof window === 'undefined') {
        return null;
    }

    const storagePrefix = options.storagePrefix || 'aoas_form_draft_v1';
    const defaultId = form.id || form.getAttribute('name') || form.getAttribute('data-service') || 'form';
    const scope = options.scope || window.location.pathname || 'page';
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
            const payload = {
                v: 1,
                ts: Date.now(),
                values: collect(),
            };
            window.localStorage.setItem(storageKey, JSON.stringify(payload));
        } catch {
            // Ignore storage quota and privacy mode failures.
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
        if (saveTimer) {
            window.clearTimeout(saveTimer);
        }
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

function getApiUrl(path) {
    if (window.AOASTracker && typeof window.AOASTracker.resolveApiUrl === 'function') {
        return window.AOASTracker.resolveApiUrl(path);
    }
    return path;
}

document.addEventListener('DOMContentLoaded', function () {
    const images = document.querySelectorAll('img');
    images.forEach((image) => {
        if (!image.hasAttribute('decoding')) {
            image.setAttribute('decoding', 'async');
        }

        if (image.hasAttribute('loading')) {
            return;
        }

        image.setAttribute('loading', shouldKeepImageEager(image) ? 'eager' : 'lazy');
    });

    const iframes = document.querySelectorAll('iframe:not([loading])');
    iframes.forEach((iframe) => {
        iframe.setAttribute('loading', 'lazy');
    });
});

// Hero Slideshow Functionality
document.addEventListener('DOMContentLoaded', function () {
    const slides = document.querySelectorAll('.hero-slide');
    let currentSlide = 0;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.remove('active', 'prev');
            if (i === index) {
                slide.classList.add('active');
            } else if (i < index) {
                slide.classList.add('prev');
            }
        });
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    }

    // Auto-advance slideshow every 5 seconds
    if (slides.length > 0) {
        showSlide(0); // Initialize first slide
        setInterval(nextSlide, 5000);
    }

    // Typing Animation for Hero Description Only
    const heroTitle = document.querySelector('.hero-title');
    const heroDescription = document.querySelector('.hero-description');

    if (heroTitle) {
        // Title fades in smoothly
        heroTitle.style.opacity = '0';
        setTimeout(() => {
            heroTitle.style.transition = 'opacity 0.8s ease-in';
            heroTitle.style.opacity = '1';
        }, 200);
    }

    if (heroDescription) {
        // Skip typing animation on low-end devices - just show the content
        if (isLowEndDevice) {
            heroDescription.style.opacity = '1';
        } else {
            // Description has typing animation
            // Store the original HTML structure
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = heroDescription.innerHTML;
            const textNodes = [];

            // Extract text content while preserving HTML structure
            function extractText(node, parentTag = '') {
                if (node.nodeType === Node.TEXT_NODE) {
                    textNodes.push({
                        type: 'text',
                        content: node.textContent,
                        parentTag: parentTag
                    });
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    const openTag = `<${tagName}${node.className ? ` class="${node.className}"` : ''}>`;
                    const closeTag = `</${tagName}>`;

                    textNodes.push({
                        type: 'openTag',
                        content: openTag
                    });

                    Array.from(node.childNodes).forEach(child => {
                        extractText(child, tagName);
                    });

                    textNodes.push({
                        type: 'closeTag',
                        content: closeTag
                    });
                }
            }

            Array.from(tempDiv.childNodes).forEach(node => {
                extractText(node);
            });

            // Clear the description
            heroDescription.innerHTML = '';
            heroDescription.style.opacity = '1';

            let nodeIndex = 0;
            let charIndex = 0;
            const typingSpeed = 5; // milliseconds per character (fast typing - ~3 seconds total)
            let lastTime = 0;

            function typeNext(timestamp) {
                // Use requestAnimationFrame for smoother, consistent timing
                if (!lastTime) lastTime = timestamp;

                const elapsed = timestamp - lastTime;

                // Only type when enough time has passed
                if (elapsed < typingSpeed) {
                    requestAnimationFrame(typeNext);
                    return;
                }

                lastTime = timestamp;

                if (nodeIndex >= textNodes.length) {
                    return;
                }

                const currentNode = textNodes[nodeIndex];

                if (currentNode.type === 'openTag' || currentNode.type === 'closeTag') {
                    heroDescription.innerHTML += currentNode.content;
                    nodeIndex++;
                    // Continue immediately for tags (no delay)
                    requestAnimationFrame(typeNext);
                    return;
                }

                if (currentNode.type === 'text') {
                    if (charIndex < currentNode.content.length) {
                        heroDescription.innerHTML += currentNode.content[charIndex];
                        charIndex++;
                        requestAnimationFrame(typeNext);
                    } else {
                        charIndex = 0;
                        nodeIndex++;
                        // Continue immediately when moving to next node
                        requestAnimationFrame(typeNext);
                    }
                } else {
                    nodeIndex++;
                    requestAnimationFrame(typeNext);
                }
            }

            // Start typing after title appears
            setTimeout(() => {
                requestAnimationFrame(typeNext);
            }, 1000);
        }
    }

    // Why Choose Us Image Carousel
    const whyImageSlides = document.querySelectorAll('.why-image-slide');
    let currentWhySlide = 0;

    function showWhySlide(index) {
        whyImageSlides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });
    }

    function nextWhySlide() {
        currentWhySlide = (currentWhySlide + 1) % whyImageSlides.length;
        showWhySlide(currentWhySlide);
    }

    // Auto-advance Why Choose Us carousel every 4 seconds
    if (whyImageSlides.length > 0) {
        setInterval(nextWhySlide, 4000);
    }

    // Writing animation for Mission and Vision descriptions
    const missionVisionDescriptions = document.querySelectorAll('.mission-vision-description');
    const missionVisionLists = document.querySelectorAll('.mission-vision-list');

    function animateTextWriting(element, delay = 0) {
        if (!element) return;

        const originalText = element.innerHTML;
        element.innerHTML = '';
        element.style.opacity = '1';

        // Extract text content while preserving HTML structure
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = originalText;
        const textNodes = [];

        function extractText(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                textNodes.push({
                    type: 'text',
                    content: node.textContent
                });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                const openTag = `<${tagName}${node.className ? ` class="${node.className}"` : ''}>`;
                const closeTag = `</${tagName}>`;

                textNodes.push({
                    type: 'openTag',
                    content: openTag
                });

                Array.from(node.childNodes).forEach(child => {
                    extractText(child);
                });

                textNodes.push({
                    type: 'closeTag',
                    content: closeTag
                });
            }
        }

        Array.from(tempDiv.childNodes).forEach(node => {
            extractText(node);
        });

        let nodeIndex = 0;
        let charIndex = 0;
        const typingSpeed = 15; // milliseconds per character

        function typeNext() {
            if (nodeIndex >= textNodes.length) {
                return;
            }

            const currentNode = textNodes[nodeIndex];

            if (currentNode.type === 'openTag' || currentNode.type === 'closeTag') {
                element.innerHTML += currentNode.content;
                nodeIndex++;
                return typeNext();
            }

            if (currentNode.type === 'text') {
                if (charIndex < currentNode.content.length) {
                    element.innerHTML += currentNode.content[charIndex];
                    charIndex++;
                    setTimeout(typeNext, typingSpeed);
                } else {
                    charIndex = 0;
                    nodeIndex++;
                    return typeNext();
                }
            } else {
                nodeIndex++;
                return typeNext();
            }
        }

        setTimeout(() => {
            typeNext();
        }, delay);
    }

    // Animate mission/vision descriptions when they come into view
    const missionVisionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                const card = entry.target.closest('.mission-vision-card');
                if (card) {
                    const description = card.querySelector('.mission-vision-description');
                    const list = card.querySelector('.mission-vision-list');

                    if (description && !description.dataset.animated) {
                        description.dataset.animated = 'true';
                        animateTextWriting(description, index * 300);
                    }

                    if (list && !list.dataset.animated) {
                        list.dataset.animated = 'true';
                        const listItems = list.querySelectorAll('li');
                        listItems.forEach((item, itemIndex) => {
                            item.style.opacity = '0';
                            setTimeout(() => {
                                item.style.transition = 'opacity 0.5s ease';
                                item.style.opacity = '1';
                            }, (index * 300) + 1500 + (itemIndex * 100));
                        });
                    }
                }
            }
        });
    }, { threshold: 0.3 });

    missionVisionDescriptions.forEach(desc => {
        missionVisionObserver.observe(desc);
    });
});

// Homepage services preview: reveal + paged carousel.
document.addEventListener('DOMContentLoaded', function () {
    const section = document.getElementById('services-preview');
    if (!section) return;

    const carousel = section.querySelector('[data-home-services-carousel]');
    const viewport = section.querySelector('.services-home-viewport');
    const track = section.querySelector('[data-home-services-track]');
    const pagination = section.querySelector('[data-home-services-pagination]');
    if (!carousel || !track) return;

    const cards = Array.from(track.querySelectorAll('.service-card-home'));
    if (!cards.length) return;

    const hasIntersectionObserver = typeof window.IntersectionObserver === 'function';
    const compactViewport = window.matchMedia('(max-width: 1024px)').matches;
    const shouldAnimateReveal = hasIntersectionObserver && !compactViewport;

    if (shouldAnimateReveal) {
        section.classList.add('showcase-animate');
    }

    cards.forEach((card, index) => {
        card.style.setProperty('--stagger-delay', `${index * 120}ms`);
    });

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lowEndMode = document.documentElement.classList.contains('low-end-device');

    let perPage = 1;
    let totalPages = 1;
    let currentPage = 0;
    let cycleTimer = null;
    let resizeTimer = null;
    const swipeState = {
        active: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
    };

    function clearCycle() {
        if (cycleTimer) {
            window.clearInterval(cycleTimer);
            cycleTimer = null;
        }
    }

    function setActiveCards() {
        const start = currentPage * perPage;
        cards.forEach((card, index) => {
            card.classList.toggle('showcase-active', index === start);
        });
    }

    function updatePagination() {
        if (!pagination) return;
        pagination.querySelectorAll('[data-home-services-page]').forEach((dot, index) => {
            const active = index === currentPage;
            dot.classList.toggle('is-active', active);
            dot.setAttribute('aria-current', active ? 'true' : 'false');
        });
    }

    function getSlideWidth() {
        return viewport?.clientWidth || carousel.clientWidth || window.innerWidth;
    }

    function updatePosition() {
        const slides = track.querySelectorAll('.services-home-slide');
        const activeSlide = slides[currentPage];
        const offset = activeSlide ? activeSlide.offsetLeft : getSlideWidth() * currentPage;
        track.style.transform = `translate3d(-${offset}px, 0, 0)`;
        setActiveCards();
        updatePagination();
    }

    function getPerPage() {
        const width = carousel.clientWidth || window.innerWidth;
        if (width >= 1180) return 4;
        if (width >= 900) return 2;
        return 1;
    }

    function goToPage(targetPage) {
        if (totalPages <= 1) {
            currentPage = 0;
            updatePosition();
            return;
        }

        const nextPage = Math.max(0, Math.min(totalPages - 1, targetPage));
        if (nextPage === currentPage) {
            updatePagination();
            return;
        }

        currentPage = nextPage;
        updatePosition();
    }

    function renderPagination() {
        if (!pagination) return;
        pagination.replaceChildren();

        for (let index = 0; index < totalPages; index += 1) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'services-home-dot';
            dot.dataset.homeServicesPage = String(index);
            dot.setAttribute('aria-label', `Go to homepage services page ${index + 1}`);
            pagination.appendChild(dot);
        }
    }

    function startCycle() {
        clearCycle();
        if (reducedMotionQuery.matches || lowEndMode || totalPages <= 1 || document.hidden) return;
        cycleTimer = window.setInterval(() => {
            goToPage((currentPage + 1) % totalPages);
        }, 3200);
    }

    function stopCycle() {
        clearCycle();
    }

    function rebuildSlides() {
        const firstVisibleIndex = currentPage * perPage;
        perPage = Math.min(getPerPage(), cards.length);
        totalPages = Math.max(1, Math.ceil(cards.length / perPage));
        currentPage = Math.min(Math.floor(firstVisibleIndex / perPage), totalPages - 1);

        carousel.style.setProperty('--home-services-per-page', String(perPage));
        carousel.dataset.homeCarouselReady = 'true';
        carousel.dataset.homeCarouselMultiple = totalPages > 1 ? 'true' : 'false';

        const fragment = document.createDocumentFragment();
        const viewportWidth = Math.round(getSlideWidth());
        for (let index = 0; index < cards.length; index += perPage) {
            const slide = document.createElement('div');
            slide.className = 'services-home-slide';
            slide.setAttribute('role', 'group');
            slide.setAttribute('aria-label', `Homepage services page ${Math.floor(index / perPage) + 1} of ${totalPages}`);
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
        startCycle();
    }

    function scheduleRebuild() {
        if (resizeTimer) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(rebuildSlides, 120);
    }

    function resetSwipe() {
        swipeState.active = false;
        swipeState.startX = 0;
        swipeState.startY = 0;
        swipeState.lastX = 0;
        swipeState.lastY = 0;
    }

    function isSwipeTargetAllowed(target) {
        return !target.closest('a, button, input, textarea, select, label');
    }

    function handleTouchStart(event) {
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
        stopCycle();
    }

    function handleTouchMove(event) {
        if (!swipeState.active || event.touches.length !== 1) return;

        const touch = event.touches[0];
        swipeState.lastX = touch.clientX;
        swipeState.lastY = touch.clientY;

        const deltaX = swipeState.lastX - swipeState.startX;
        const deltaY = swipeState.lastY - swipeState.startY;
        if (Math.abs(deltaX) > Math.abs(deltaY) + 8) {
            event.preventDefault();
        }
    }

    function handleTouchEnd() {
        if (!swipeState.active) return;

        const deltaX = swipeState.lastX - swipeState.startX;
        const deltaY = swipeState.lastY - swipeState.startY;
        const isHorizontalSwipe = Math.abs(deltaX) > 42 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;

        if (isHorizontalSwipe) {
            goToPage(currentPage + (deltaX < 0 ? 1 : -1));
        }

        resetSwipe();
        startCycle();
    }

    pagination?.addEventListener('click', function (event) {
        const dot = event.target.closest('[data-home-services-page]');
        if (!dot) return;
        const nextPage = Number(dot.dataset.homeServicesPage);
        if (!Number.isFinite(nextPage)) return;
        goToPage(nextPage);
        startCycle();
    });

    viewport?.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport?.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport?.addEventListener('touchend', handleTouchEnd, { passive: true });
    viewport?.addEventListener('touchcancel', function () {
        resetSwipe();
        startCycle();
    }, { passive: true });

    carousel.addEventListener('mouseenter', stopCycle);
    carousel.addEventListener('mouseleave', startCycle);
    carousel.addEventListener('focusin', stopCycle);
    carousel.addEventListener('focusout', function (event) {
        if (event.relatedTarget && carousel.contains(event.relatedTarget)) {
            return;
        }
        startCycle();
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            clearCycle();
            return;
        }
        startCycle();
    });

    if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', startCycle);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
        reducedMotionQuery.addListener(startCycle);
    }

    window.addEventListener('resize', scheduleRebuild, { passive: true });

    rebuildSlides();

    if (!shouldAnimateReveal) {
        section.classList.add('showcase-visible');
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                section.classList.add('showcase-visible');
                startCycle();
            } else {
                clearCycle();
            }
        });
    }, {
        threshold: 0.08,
        rootMargin: '0px 0px -12% 0px'
    });

    observer.observe(section);
});

// FAQ Accordion Functionality
document.addEventListener('DOMContentLoaded', function () {
    // Handle hash navigation on page load (for cross-page links like from careers.html)
    if (window.location.hash) {
        const hash = window.location.hash;
        const target = document.querySelector(hash);

        if (target) {
            // Wait a moment for the page to fully load
            setTimeout(() => {
                const headerOffset = 100; // Offset for fixed header
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }, 100);
        }
    }

    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', () => {
            // Toggle active class
            const isActive = item.classList.contains('active');

            // Close all FAQ items
            faqItems.forEach(faq => faq.classList.remove('active'));

            // If the clicked item wasn't active, open it
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));

            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Custom Modal System
    const customModal = {
        modal: document.getElementById('customModal'),
        title: document.getElementById('modalTitle'),
        message: document.getElementById('modalMessage'),
        button: document.getElementById('modalButton'),
        close: document.getElementById('modalClose'),
        footer: document.querySelector('#customModal .modal-footer'),
        overlay: document.querySelector('#customModal .modal-overlay'),

        reset: function () {
            this.footer?.querySelectorAll('.modal-button-extra').forEach((button) => button.remove());
            this.footer?.classList.remove('modal-footer-multi');

            if (this.button) {
                this.button.className = 'modal-button';
                this.button.disabled = false;
                this.button.textContent = 'OK';
                this.button.onclick = () => {
                    this.hide();
                };
            }

            if (this.close) {
                this.close.disabled = false;
                this.close.classList.remove('is-disabled');
                this.close.removeAttribute('aria-disabled');
                this.close.tabIndex = 0;
                this.close.onclick = () => {
                    this.hide();
                };
            }

            if (this.overlay) {
                this.overlay.onclick = () => {
                    this.hide();
                };
            }
        },

        show: function (title, message, type = 'success') {
            this.reset();
            this.title.textContent = title;
            this.message.textContent = message;
            this.modal.className = `custom-modal ${type} active`;
            this.modal.style.display = 'flex';

            // Focus management
            this.button.focus();
        },

        hide: function () {
            this.modal.classList.remove('active');
            this.modal.style.display = 'none';
        },

        init: function () {
            const self = this;

            this.reset();

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                    if (self.close?.disabled || self.close?.getAttribute('aria-disabled') === 'true') {
                        return;
                    }
                    self.hide();
                }
            });
        }
    };

    // Initialize modal
    customModal.init();

    // Form validation and submission
    const contactForm = document.getElementById('contactForm');
    const trackEvent = (eventName, properties = {}) => {
        if (window.AOASTracker && typeof window.AOASTracker.track === 'function') {
            window.AOASTracker.track(eventName, properties);
        }
    };

    const getUtmPayload = () => {
        const params = new URLSearchParams(window.location.search);
        return {
            source: params.get('utm_source') || '',
            medium: params.get('utm_medium') || '',
            campaign: params.get('utm_campaign') || '',
            term: params.get('utm_term') || '',
            content: params.get('utm_content') || '',
        };
    };

    const applyUtmHiddenFields = () => {
        const utm = getUtmPayload();
        const fieldMap = {
            utmSource: utm.source,
            utmMedium: utm.medium,
            utmCampaign: utm.campaign,
            utmTerm: utm.term,
            utmContent: utm.content,
        };

        Object.entries(fieldMap).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (field) {
                field.value = value;
            }
        });
    };

    const applyServicePrefill = () => {
        const serviceField = document.getElementById('service');
        const params = new URLSearchParams(window.location.search);
        const serviceFromQuery = (params.get('service') || '').toLowerCase();

        if (serviceField && serviceFromQuery) {
            const hasValue = Array.from(serviceField.options).some((option) => option.value === serviceFromQuery);
            if (hasValue) {
                serviceField.value = serviceFromQuery;
                trackEvent('service_selected', {
                    service: serviceFromQuery,
                    source: 'url_prefill',
                });
            }
        }
    };

    if (contactForm) {
        const sourcePageField = document.getElementById('sourcePage');
        const pageUrlField = document.getElementById('pageUrl');
        const serviceField = document.getElementById('service');
        const inquiryTypeField = document.getElementById('inquiryType');
        const locationField = document.getElementById('location');
        const locationOtherWrap = document.getElementById('contactOtherLocationWrap');
        const locationOtherField = document.getElementById('locationOther');
        let contactDraft = null;

        const toggleContactLocationOther = () => {
            if (!locationField || !locationOtherWrap || !locationOtherField) {
                return;
            }

            const isOther = locationField.value === 'Other';
            locationOtherWrap.hidden = !isOther;
            if (!isOther) {
                locationOtherField.value = '';
            }
        };

        if (sourcePageField) {
            sourcePageField.value = window.location.pathname;
        }

        if (pageUrlField) {
            pageUrlField.value = window.location.href;
        }

        applyUtmHiddenFields();
        applyServicePrefill();
        toggleContactLocationOther();

        contactDraft = setupLocalFormDraft(contactForm, {
            scope: 'contact',
            excludeFields: [
                'website',
                'sourcePage',
                'pageUrl',
                'utmSource',
                'utmMedium',
                'utmCampaign',
                'utmTerm',
                'utmContent',
            ],
            onRestore: () => {
                toggleContactLocationOther();
            },
        });

        serviceField?.addEventListener('change', () => {
            if (serviceField.value) {
                trackEvent('service_selected', {
                    service: serviceField.value,
                    source: 'contact_form',
                });
            }
        });
        locationField?.addEventListener('change', toggleContactLocationOther);

        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const service = document.getElementById('service').value.trim();
            const inquiryType = inquiryTypeField?.value.trim() || '';
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone')?.value.trim() || '';
            const baseLocation = document.getElementById('location')?.value.trim() || '';
            const manualLocation = document.getElementById('locationOther')?.value.trim() || '';
            const location = baseLocation === 'Other' ? manualLocation : baseLocation;
            const message = document.getElementById('message').value.trim();
            const honeypot = document.getElementById('website')?.value.trim() || '';
            const sourcePage = document.getElementById('sourcePage')?.value || window.location.pathname;
            const pageUrl = document.getElementById('pageUrl')?.value || window.location.href;
            const utm = getUtmPayload();

            // Basic validation
            if (!service || !inquiryType || !name || !email || !message) {
                customModal.show('Required Fields', 'Please complete service, reason for contact, name, email, and message.', 'error');
                return;
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                customModal.show('Invalid Email', 'Please enter a valid email address.', 'error');
                return;
            }

            if (message.length < 8) {
                customModal.show('More Detail Needed', 'Please provide a bit more detail in your message.', 'error');
                return;
            }

            // Disable submit button and show loading state
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = 'SUBMITTING...';
            trackEvent('contact_form_submit_attempt', { service, inquiryType, source: 'contact-form' });

            try {
                const response = await fetch(getApiUrl('/api/contact'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        source: 'contact-form',
                        service,
                        inquiryType,
                        name,
                        email,
                        phone,
                        location,
                        message,
                        sourcePage,
                        pageUrl,
                        utm,
                        website: honeypot,
                    })
                });

                let data = {};
                try {
                    data = await response.json();
                } catch {
                    data = {};
                }

                if (!response.ok || !data.success) {
                    const errorMessage = data.error || `Server error: ${response.status}`;
                    throw new Error(errorMessage);
                }

                trackEvent('contact_form_submitted', {
                    service,
                    inquiryType,
                    source: 'contact-form',
                });

                customModal.show(
                    'Inquiry Sent',
                    data.message || 'Thank you for your inquiry. Our team will get back to you soon.',
                    'success'
                );
                contactDraft?.clear();
                contactForm.reset();
                if (sourcePageField) {
                    sourcePageField.value = window.location.pathname;
                }
                if (pageUrlField) {
                    pageUrlField.value = window.location.href;
                }
                applyUtmHiddenFields();
                applyServicePrefill();
            } catch (error) {
                console.error('Error submitting inquiry form:', error);
                trackEvent('contact_form_submit_failed', {
                    service,
                    inquiryType,
                    error: error.message.slice(0, 140),
                });

                const isCorsOrOriginError = /origin not allowed|cors|403/i.test(error.message);
                const isNetworkError =
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('NetworkError') ||
                    error.message.includes('ERR_CONNECTION_REFUSED') ||
                    error.name === 'TypeError';

                if (isCorsOrOriginError) {
                    customModal.show(
                        'Submission Blocked',
                        'Your request was blocked by a security rule. Please try again or contact us directly at support@aoa-services.com.',
                        'error'
                    );
                } else if (isNetworkError) {
                    customModal.show(
                        'Connection Error',
                        'Could not reach the server. Please check your connection and try again. If the issue persists, contact us at support@aoa-services.com.',
                        'error'
                    );
                } else {
                    customModal.show(
                        'Submission Error',
                        error.message || 'An error occurred while sending your inquiry. Please try again or contact us at support@aoa-services.com.',
                        'error'
                    );
                }
            } finally {
                // Re-enable submit button
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        });
    }

    // Add scroll animation to header
    const header = document.querySelector('.header');
    if (header) {
        const handleHeaderScroll = rafThrottle(() => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 100) {
                header.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.1)';
            } else {
                header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.05)';
            }
        });

        window.addEventListener('scroll', handleHeaderScroll, { passive: true });
        handleHeaderScroll();
    }

    // Enhanced Intersection Observer for WordPress-like micro animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0) scale(1)';
            }
        });
    }, observerOptions);

    // Observe elements for animation with staggered delays
    const animatedElements = document.querySelectorAll('.value-card, .faq-item, .section-title-center, .section-title-left, .why-content, .why-image-carousel-wrapper');
    animatedElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(40px) scale(0.95)';
        el.style.transition = `opacity 0.8s ease-out ${index * 0.1}s, transform 0.8s ease-out ${index * 0.1}s`;
        observer.observe(el);
    });

    // About Us Section Micro Animations
    const aboutSection = document.querySelector('#about');
    if (aboutSection) {
        const aboutLabel = aboutSection.querySelector('.section-label');
        const aboutTitle = aboutSection.querySelector('.section-title');
        const aboutDescriptions = aboutSection.querySelectorAll('.about-description');

        // Initialize About Us section elements
        if (aboutLabel) {
            aboutLabel.style.opacity = '0';
            aboutLabel.style.transform = 'translateX(-20px)';
        }
        if (aboutTitle) {
            aboutTitle.style.opacity = '0';
            aboutTitle.style.transform = 'translateY(30px) scale(0.98)';
        }
        aboutDescriptions.forEach((desc, index) => {
            desc.style.opacity = '0';
            desc.style.transform = 'translateY(30px)';
            desc.style.transition = `opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${0.4 + (index * 0.15)}s, transform 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${0.4 + (index * 0.15)}s`;
        });

        // Create observer for About Us section
        const aboutObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Animate label
                    if (aboutLabel && !aboutLabel.classList.contains('animate-in')) {
                        aboutLabel.classList.add('animate-in');
                        setTimeout(() => {
                            aboutLabel.style.opacity = '1';
                            aboutLabel.style.transform = 'translateX(0)';
                        }, 50);
                    }

                    // Animate title
                    if (aboutTitle && !aboutTitle.classList.contains('animate-in')) {
                        aboutTitle.classList.add('animate-in');
                        setTimeout(() => {
                            aboutTitle.style.opacity = '1';
                            aboutTitle.style.transform = 'translateY(0) scale(1)';
                        }, 200);
                    }

                    // Animate descriptions with stagger
                    aboutDescriptions.forEach((desc, index) => {
                        if (!desc.classList.contains('animate-in')) {
                            desc.classList.add('animate-in');
                            setTimeout(() => {
                                desc.style.opacity = '1';
                                desc.style.transform = 'translateY(0)';
                            }, 400 + (index * 150));
                        }
                    });
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -100px 0px'
        });

        aboutObserver.observe(aboutSection);
    }

    // Contact Section (Get in Touch) Micro Animations
    const contactSection = document.querySelector('#contact');
    if (contactSection) {
        const contactLabel = contactSection.querySelector('.section-label-white');
        const contactTitle = contactSection.querySelector('.contact-title');
        const contactSubtitle = contactSection.querySelector('.contact-subtitle');
        const contactForm = contactSection.querySelector('.contact-form-wrapper');
        const formGroups = contactSection.querySelectorAll('.form-group');

        // Initialize Contact section elements
        if (contactLabel) {
            contactLabel.style.opacity = '0';
            contactLabel.style.transform = 'translateY(-20px)';
            contactLabel.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        }
        if (contactTitle) {
            contactTitle.style.opacity = '0';
            contactTitle.style.transform = 'translateY(30px)';
            contactTitle.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.2s, transform 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.2s';
        }
        if (contactSubtitle) {
            contactSubtitle.style.opacity = '0';
            contactSubtitle.style.transform = 'translateY(20px)';
            contactSubtitle.style.transition = 'opacity 0.7s ease-out 0.4s, transform 0.7s ease-out 0.4s';
        }
        if (contactForm) {
            contactForm.style.opacity = '0';
            contactForm.style.transform = 'translateX(30px) scale(0.98)';
            contactForm.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.6s, transform 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.6s';
        }
        formGroups.forEach((group, index) => {
            group.style.opacity = '0';
            group.style.transform = 'translateY(20px)';
            group.style.transition = `opacity 0.6s ease-out ${0.8 + (index * 0.1)}s, transform 0.6s ease-out ${0.8 + (index * 0.1)}s`;
        });

        // Create observer for Contact section
        const contactObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (contactLabel && !contactLabel.classList.contains('animate-in')) {
                        contactLabel.classList.add('animate-in');
                        contactLabel.style.opacity = '1';
                        contactLabel.style.transform = 'translateY(0)';
                    }
                    if (contactTitle && !contactTitle.classList.contains('animate-in')) {
                        contactTitle.classList.add('animate-in');
                        contactTitle.style.opacity = '1';
                        contactTitle.style.transform = 'translateY(0)';
                    }
                    if (contactSubtitle && !contactSubtitle.classList.contains('animate-in')) {
                        contactSubtitle.classList.add('animate-in');
                        contactSubtitle.style.opacity = '1';
                        contactSubtitle.style.transform = 'translateY(0)';
                    }
                    if (contactForm && !contactForm.classList.contains('animate-in')) {
                        contactForm.classList.add('animate-in');
                        contactForm.style.opacity = '1';
                        contactForm.style.transform = 'translateX(0) scale(1)';
                    }
                    formGroups.forEach((group) => {
                        if (!group.classList.contains('animate-in')) {
                            group.classList.add('animate-in');
                            group.style.opacity = '1';
                            group.style.transform = 'translateY(0)';
                        }
                    });
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -100px 0px'
        });

        contactObserver.observe(contactSection);
    }


    // Map Section Micro Animations
    const mapSection = document.querySelector('.map-section-home');
    if (mapSection) {
        const mapHeader = mapSection.querySelector('.section-header');
        const locationForm = mapSection.querySelector('.location-form-card');
        const mapInstruction = mapSection.querySelector('.map-instruction');
        const mapContainer = mapSection.querySelector('#mapHome');

        // Initialize Map section elements
        if (mapHeader) {
            mapHeader.style.opacity = '0';
            mapHeader.style.transform = 'translateY(30px)';
            mapHeader.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1), transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        }
        if (locationForm) {
            locationForm.style.opacity = '0';
            locationForm.style.transform = 'translateY(40px)';
            locationForm.style.transition = 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.2s, transform 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.2s';
        }
        if (mapInstruction) {
            mapInstruction.style.opacity = '0';
            mapInstruction.style.transform = 'translateY(20px)';
            mapInstruction.style.transition = 'opacity 0.6s ease-out 0.4s, transform 0.6s ease-out 0.4s';
        }
        if (mapContainer) {
            mapContainer.style.opacity = '0';
            mapContainer.style.transform = 'translateY(40px) scale(0.98)';
            mapContainer.style.transition = 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s, transform 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s';
        }

        // Create observer for Map section
        const mapObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (mapHeader && !mapHeader.classList.contains('animate-in')) {
                        mapHeader.classList.add('animate-in');
                        mapHeader.style.opacity = '1';
                        mapHeader.style.transform = 'translateY(0)';
                    }
                    if (locationForm && !locationForm.classList.contains('animate-in')) {
                        locationForm.classList.add('animate-in');
                        locationForm.style.opacity = '1';
                        locationForm.style.transform = 'translateY(0)';
                    }
                    if (mapInstruction && !mapInstruction.classList.contains('animate-in')) {
                        mapInstruction.classList.add('animate-in');
                        mapInstruction.style.opacity = '1';
                        mapInstruction.style.transform = 'translateY(0)';
                    }
                    if (mapContainer && !mapContainer.classList.contains('animate-in')) {
                        mapContainer.classList.add('animate-in');
                        mapContainer.style.opacity = '1';
                        mapContainer.style.transform = 'translateY(0) scale(1)';
                    }
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -100px 0px'
        });

        mapObserver.observe(mapSection);
    }


    // Footer Section Micro Animations
    const footer = document.querySelector('.footer');
    if (footer) {
        const footerDescription = footer.querySelector('.footer-description');
        const footerColumns = footer.querySelectorAll('.footer-column');
        const footerNav = footer.querySelector('.footer-nav');

        // Initialize Footer elements - kept visible for reliability
        if (footerDescription) {
            // footerDescription.style.opacity = '0';
            // footerDescription.style.transform = 'translateY(30px)';
            footerDescription.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        }
        footerColumns.forEach((column, index) => {
            // column.style.opacity = '0';
            // column.style.transform = 'translateY(30px)';
            column.style.transition = `opacity 0.7s ease-out ${0.2 + (index * 0.1)}s, transform 0.7s ease-out ${0.2 + (index * 0.1)}s`;
        });
        if (footerNav) {
            // footerNav.style.opacity = '0';
            // footerNav.style.transform = 'translateY(20px)';
            footerNav.style.transition = 'opacity 0.6s ease-out 0.8s, transform 0.6s ease-out 0.8s';
        }

        // Create observer for Footer
        const footerObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (footerDescription && !footerDescription.classList.contains('animate-in')) {
                        footerDescription.classList.add('animate-in');
                        footerDescription.style.opacity = '1';
                        footerDescription.style.transform = 'translateY(0)';
                    }
                    footerColumns.forEach((column) => {
                        if (!column.classList.contains('animate-in')) {
                            column.classList.add('animate-in');
                            column.style.opacity = '1';
                            column.style.transform = 'translateY(0)';
                        }
                    });
                    if (footerNav && !footerNav.classList.contains('animate-in')) {
                        footerNav.classList.add('animate-in');
                        footerNav.style.opacity = '1';
                        footerNav.style.transform = 'translateY(0)';
                    }
                }
            });
        }, {
            threshold: 0.2,
            rootMargin: '0px 0px -50px 0px'
        });

        footerObserver.observe(footer);
    }

    // Animate list items in Why Choose Us section
    const whyListItems = document.querySelectorAll('.why-list li');
    const whyListObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateX(0)';
                }, index * 50);
            }
        });
    }, { threshold: 0.1 });

    whyListItems.forEach(item => {
        whyListObserver.observe(item);
    });

    // Parallax effect for hero section (disabled on mobile for performance)
    if (window.innerWidth > 768) {
        const heroSlideshow = document.querySelector('.hero-slideshow');
        if (heroSlideshow) {
            const handleParallaxScroll = rafThrottle(() => {
                const scrolled = window.pageYOffset;
                heroSlideshow.style.transform = `translateY(${scrolled * 0.5}px)`;
            });

            window.addEventListener('scroll', handleParallaxScroll, { passive: true });
            handleParallaxScroll();
        }
    }

    // Partners Carousel - continuous infinite auto-scroll
    const partnersCarousel = document.querySelector('.partners-carousel');

    if (partnersCarousel) {
        // Force load all partner images (remove lazy loading)
        const partnerImages = partnersCarousel.querySelectorAll('img');
        partnerImages.forEach(img => {
            img.loading = 'eager';
        });

        const waitForPartnerImages = () => {
            const images = partnersCarousel.querySelectorAll('img');
            if (!images.length) return Promise.resolve();

            const loaders = Array.from(images).map(img => {
                if (img.complete && img.naturalWidth > 0) {
                    return Promise.resolve();
                }
                return new Promise(resolve => {
                    const done = () => resolve();
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', done, { once: true });
                    // Timeout fallback in case image never loads
                    setTimeout(done, 3000);
                });
            });

            return Promise.all(loaders);
        };

        const initializePartnersCarousel = async () => {
            // Pause animation during setup
            partnersCarousel.style.animationPlayState = 'paused';

            await waitForPartnerImages();

            if (partnersCarousel.dataset.loopReady) return;

            const originalItems = Array.from(partnersCarousel.children);
            if (!originalItems.length) return;

            const singleSetWidth = partnersCarousel.scrollWidth;
            if (!singleSetWidth) return;

            // Clone items twice for seamless infinite loop
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 2; i++) {
                originalItems.forEach(item => {
                    const clone = item.cloneNode(true);
                    clone.setAttribute('aria-hidden', 'true');
                    fragment.appendChild(clone);
                });
            }

            partnersCarousel.appendChild(fragment);

            const speed = 50; // pixels per second (slower = smoother)
            const duration = singleSetWidth / speed;

            partnersCarousel.style.setProperty('--partners-loop-distance', `${singleSetWidth}px`);
            partnersCarousel.style.setProperty('--partners-loop-duration', `${duration}s`);
            partnersCarousel.dataset.loopReady = 'true';

            // Resume animation after a brief delay
            requestAnimationFrame(() => {
                partnersCarousel.style.animationPlayState = 'running';
            });
        };

        initializePartnersCarousel();
    }
});

// Careers Form Handling
document.addEventListener('DOMContentLoaded', function () {
    const careersForm = document.getElementById('careersForm');

    if (!careersForm) return; // Exit if not on careers page
    const careersDraft = setupLocalFormDraft(careersForm, {
        scope: 'careers',
        excludeFields: ['website'],
    });

    // Form submission handler
    careersForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Get form values
        const fullName = document.getElementById('fullName').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const workingHours = document.querySelector('input[name="workingHours"]:checked')?.value;
        const availability = document.querySelector('input[name="availability"]:checked')?.value;
        const experience = document.getElementById('experience').value.trim();
        const yearsExperience = document.querySelector('input[name="yearsExperience"]:checked')?.value;
        const resumeFile = document.getElementById('resume').files[0];
        const whyHireYou = document.getElementById('whyHireYou').value.trim();
        const compensation = document.getElementById('compensation').value.trim();

        // New fields
        const flexibleSchedule = document.querySelector('input[name="flexibleSchedule"]:checked')?.value;
        const workAuthorization = document.querySelector('input[name="workAuthorization"]:checked')?.value;
        const weekendAvailability = document.querySelector('input[name="weekendAvailability"]:checked')?.value;
        const reliableTransportation = document.querySelector('input[name="reliableTransportation"]:checked')?.value;
        const previousTermination = document.querySelector('input[name="previousTermination"]:checked')?.value;
        const relevantSkills = document.getElementById('relevantSkills').value.trim();
        const coverLetterFile = document.getElementById('coverLetter').files[0];

        // Get modal from main page
        const modalController = window.AOASCareersModal;
        const customModal = {
            modal: document.getElementById('customModal'),
            title: document.getElementById('modalTitle'),
            message: document.getElementById('modalMessage'),
            button: document.getElementById('modalButton'),

            show: function (title, message, type = 'success', options = {}) {
                if (modalController && typeof modalController.show === 'function') {
                    modalController.show({
                        title,
                        message,
                        type,
                        ...options,
                    });
                    return;
                }

                const modalFooter = this.modal?.querySelector('.modal-footer');
                modalFooter?.querySelectorAll('.modal-button-extra').forEach((button) => button.remove());
                modalFooter?.classList.remove('modal-footer-multi');

                this.title.textContent = title;
                this.message.textContent = message;
                this.modal.className = `custom-modal ${type} active`;
                this.modal.style.display = 'flex';
                this.button.className = 'modal-button';
                this.button.disabled = false;
                this.button.textContent = 'Close';
                this.button.onclick = () => {
                    this.hide();
                };
                this.button.focus();
            },

            showLoading: function (title, message, options = {}) {
                if (modalController && typeof modalController.showLoading === 'function') {
                    modalController.showLoading({
                        title,
                        message,
                        buttonText: options.buttonText,
                    });
                    return;
                }

                this.show(title, message, 'success');
                this.button.disabled = true;
                this.button.textContent = options.buttonText || 'Sending Application...';
            },

            hide: function () {
                if (modalController && typeof modalController.close === 'function') {
                    modalController.close(true);
                    return;
                }
                this.modal.classList.remove('active');
                this.modal.style.display = 'none';
            }
        };

        // Validation
        if (!fullName || !email || !phone) {
            customModal.show('Required Fields', 'Please fill in your full name, email, and phone number.', 'error');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            customModal.show('Invalid Email', 'Please enter a valid email address.', 'error');
            return;
        }

        // Check if working hours is selected
        if (!workingHours) {
            customModal.show('Required Selection', 'Please select your preferred working hours.', 'error');
            return;
        }

        // Check if availability is selected
        if (!availability) {
            customModal.show('Required Selection', 'Please select when you can start.', 'error');
            return;
        }

        // Check if experience is provided
        if (!experience) {
            customModal.show('Required Field', 'Please tell us about your experience as a Virtual Assistant.', 'error');
            return;
        }

        // Check if years of experience is selected
        if (!yearsExperience) {
            customModal.show('Required Selection', 'Please select your years of experience.', 'error');
            return;
        }

        // Check if resume file is provided
        if (!resumeFile) {
            customModal.show('Required Field', 'Please upload your resume/portfolio file.', 'error');
            return;
        }

        // Validate file size (3MB max - reduced for Vercel serverless function limits)
        const maxFileSize = 3 * 1024 * 1024; // 3MB in bytes
        if (resumeFile.size > maxFileSize) {
            customModal.show('File Too Large', 'Resume file must be smaller than 3MB. Please compress your file or use a PDF format.', 'error');
            return;
        }

        // Validate file type
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/png',
            'image/jpeg',
            'image/jpg'
        ];
        if (!allowedTypes.includes(resumeFile.type)) {
            customModal.show('Invalid File Type', 'Please upload a PDF, Word, Excel, PNG, or JPG file.', 'error');
            return;
        }

        // Check if "why hire you" is provided
        if (!whyHireYou) {
            customModal.show('Required Field', 'Please tell us why we should consider you for this role.', 'error');
            return;
        }

        // Check if compensation is provided
        if (!compensation) {
            customModal.show('Required Field', 'Please provide your expected compensation.', 'error');
            return;
        }

        // Compensation must contain at least 5 digits (example: 15000)
        const compensationDigits = compensation.replace(/\D/g, '');
        if (compensationDigits.length < 5) {
            customModal.show('Invalid Compensation', 'Expected compensation must be at least 5 digits (example: 15000).', 'error');
            return;
        }

        // Validate new Yes/No questions
        if (!flexibleSchedule) {
            customModal.show('Required Selection', 'Please answer if you are willing to adjust your work hours.', 'error');
            return;
        }

        if (!workAuthorization) {
            customModal.show('Required Selection', 'Please answer if you are legally authorized to work in this country.', 'error');
            return;
        }

        if (!weekendAvailability) {
            customModal.show('Required Selection', 'Please answer if you are willing to work on weekends or holidays.', 'error');
            return;
        }

        if (!reliableTransportation) {
            customModal.show('Required Selection', 'Please answer if you have reliable transportation to work.', 'error');
            return;
        }

        if (!previousTermination) {
            customModal.show('Required Selection', 'Please answer if you have ever been terminated from a job.', 'error');
            return;
        }

        // Check if relevant skills is provided
        if (!relevantSkills) {
            customModal.show('Required Field', 'Please list your relevant skills for the position.', 'error');
            return;
        }

        // Validate cover letter file if provided (optional)
        if (coverLetterFile) {
            if (coverLetterFile.size > maxFileSize) {
                customModal.show('File Too Large', 'Cover letter file must be smaller than 3MB. Please compress your file or use a PDF format.', 'error');
                return;
            }
            const coverLetterAllowedTypes = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ];
            if (!coverLetterAllowedTypes.includes(coverLetterFile.type)) {
                customModal.show('Invalid File Type', 'Cover letter must be a PDF or Word document.', 'error');
                return;
            }
        }


        // Disable submit button and show loading state
        const submitButton = careersForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'UPLOADING...';
        const notifyWizardSubmitFailed = () => {
            careersForm.dispatchEvent(new CustomEvent('aoas:careers-submit-failed'));
        };
        customModal.showLoading(
            'Submitting Application',
            'Please wait while we upload your details and send your application.',
            {
                buttonText: 'Sending Application...'
            }
        );

        try {
            // Convert resume file to base64
            const fileReader = new FileReader();
            const fileData = await new Promise((resolve, reject) => {
                fileReader.onload = () => resolve(fileReader.result);
                fileReader.onerror = () => reject(new Error('Failed to read file'));
                fileReader.readAsDataURL(resumeFile);
            });

            // Convert cover letter to base64 if provided
            let coverLetterData = null;
            if (coverLetterFile) {
                const coverLetterReader = new FileReader();
                coverLetterData = await new Promise((resolve, reject) => {
                    coverLetterReader.onload = () => resolve(coverLetterReader.result);
                    coverLetterReader.onerror = () => reject(new Error('Failed to read cover letter file'));
                    coverLetterReader.readAsDataURL(coverLetterFile);
                });
            }

            // Determine API URL
            const apiUrl = getApiUrl('/api/careers');

            // Send form data to backend
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fullName,
                    email,
                    phone,
                    workingHours,
                    availability,
                    experience,
                    yearsExperience,
                    resume: fileData,
                    resumeFileName: resumeFile.name,
                    resumeFileType: resumeFile.type,
                    whyHireYou,
                    compensation,
                    // New fields
                    flexibleSchedule,
                    workAuthorization,
                    weekendAvailability,
                    reliableTransportation,
                    previousTermination,
                    relevantSkills,
                    coverLetter: coverLetterData,
                    coverLetterFileName: coverLetterFile?.name || null,
                    coverLetterFileType: coverLetterFile?.type || null
                })
            });

            // Check if response is ok
            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch {
                    errorData = { error: `Server error: ${response.status} ${response.statusText}` };
                }

                const errorMessage = errorData.error || `Server error: ${response.status}`;
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (data.success) {
                customModal.show(
                    'Application Submitted!',
                    data.message || 'Thank you for your application! We will review your submission and get back to you soon.',
                    'success',
                    {
                        buttons: [
                            {
                                text: 'Close'
                            }
                        ]
                    }
                );

                // Reset form
                careersDraft?.clear();
                careersForm.reset();

                // Clear button selections
                document.querySelectorAll('.option-button.selected').forEach(btn => {
                    btn.classList.remove('selected');
                });
            } else {
                customModal.show(
                    'Error',
                    data.error || 'Failed to submit application. Please try again later.',
                    'error',
                    {
                        buttons: [
                            {
                                text: 'Close'
                            }
                        ]
                    }
                );
                notifyWizardSubmitFailed();
            }
        } catch (error) {
            console.error('Error submitting form:', error);

            // Check if it's a network error
            if (error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('ERR_CONNECTION_REFUSED') ||
                error.name === 'TypeError') {
                customModal.show(
                    'Server Not Running',
                    'Please make sure the server is running.\n\n1. Install Node.js from https://nodejs.org/\n2. Close and reopen your terminal\n3. Run: npm install\n4. Run: npm run dev',
                    'error',
                    {
                        buttons: [
                            {
                                text: 'Close'
                            }
                        ]
                    }
                );
            } else {
                customModal.show(
                    'Error',
                    error.message || 'An error occurred while submitting your application. Please try again later.',
                    'error',
                    {
                        buttons: [
                            {
                                text: 'Close'
                            }
                        ]
                    }
                );
            }
            notifyWizardSubmitFailed();
        } finally {
            // Re-enable submit button
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
});

function setupMobileDrawer() {
    const hamburger = document.querySelector('.hamburger-menu[aria-controls="mobileNavDrawer"]');
    const drawer = document.getElementById('mobileNavDrawer');
    const header = document.querySelector('.header');

    if (!hamburger || !drawer) {
        return;
    }

    const panel = drawer.querySelector('.mobile-nav-drawer-panel');
    const closeButton = drawer.querySelector('[data-mobile-nav-close]');
    const backdrop = drawer.querySelector('.mobile-nav-backdrop');
    const navLinks = drawer.querySelectorAll('[data-mobile-nav-link]');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let isOpen = false;
    let closeTimer = null;

    if (!panel || !closeButton || !backdrop) {
        return;
    }

    const getTransitionDuration = () => (motionPreference.matches ? 0 : 300);

    const setHeaderOffset = () => {
        const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        document.documentElement.style.setProperty('--mobile-nav-header-offset', `${headerHeight}px`);
    };

    const getFocusableElements = () => {
        return Array.from(
            panel.querySelectorAll(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter((element) => {
            return element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0;
        });
    };

    const updateTriggerState = (open) => {
        hamburger.classList.toggle('active', open);
        hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
        hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    const focusFirstElement = () => {
        const focusableElements = getFocusableElements();
        const firstFocusableElement = focusableElements[0] || closeButton;

        if (firstFocusableElement) {
            firstFocusableElement.focus({ preventScroll: true });
        }
    };

    const finishClose = (returnFocus) => {
        closeTimer = null;
        drawer.hidden = true;
        if (returnFocus) {
            hamburger.focus({ preventScroll: true });
        }
    };

    const closeDrawer = ({ returnFocus = true } = {}) => {
        if (!isOpen && drawer.hidden) {
            return;
        }

        window.clearTimeout(closeTimer);
        isOpen = false;
        drawer.dataset.open = 'false';
        drawer.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('mobile-nav-open');
        updateTriggerState(false);

        const transitionDuration = getTransitionDuration();
        if (transitionDuration === 0) {
            finishClose(returnFocus);
            return;
        }

        closeTimer = window.setTimeout(() => finishClose(returnFocus), transitionDuration);
    };

    const openDrawer = () => {
        if (isOpen || window.innerWidth > 1024) {
            return;
        }

        window.clearTimeout(closeTimer);
        setHeaderOffset();
        drawer.hidden = false;
        drawer.setAttribute('aria-hidden', 'false');
        drawer.dataset.open = 'false';
        document.body.classList.add('mobile-nav-open');
        updateTriggerState(true);
        isOpen = true;

        window.requestAnimationFrame(() => {
            drawer.dataset.open = 'true';
            focusFirstElement();
        });
    };

    const handleKeydown = (event) => {
        if (!isOpen) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            closeDrawer();
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const focusableElements = getFocusableElements();
        if (!focusableElements.length) {
            event.preventDefault();
            closeButton.focus({ preventScroll: true });
            return;
        }

        const firstFocusableElement = focusableElements[0];
        const lastFocusableElement = focusableElements[focusableElements.length - 1];

        if (!panel.contains(document.activeElement)) {
            event.preventDefault();
            firstFocusableElement.focus({ preventScroll: true });
            return;
        }

        if (event.shiftKey && document.activeElement === firstFocusableElement) {
            event.preventDefault();
            lastFocusableElement.focus({ preventScroll: true });
            return;
        }

        if (!event.shiftKey && document.activeElement === lastFocusableElement) {
            event.preventDefault();
            firstFocusableElement.focus({ preventScroll: true });
        }
    };

    hamburger.addEventListener('click', () => {
        if (isOpen) {
            closeDrawer();
            return;
        }

        openDrawer();
    });

    closeButton.addEventListener('click', () => closeDrawer());
    backdrop.addEventListener('click', () => closeDrawer({ returnFocus: false }));

    navLinks.forEach((link) => {
        link.addEventListener('click', () => closeDrawer({ returnFocus: false }));
    });

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', (event) => {
        if (!isOpen || !(event.target instanceof Node)) {
            return;
        }

        if (panel.contains(event.target) || hamburger.contains(event.target)) {
            return;
        }

        closeDrawer({ returnFocus: false });
    });

    window.addEventListener('resize', () => {
        setHeaderOffset();

        if (window.innerWidth > 1024) {
            closeDrawer({ returnFocus: false });
        }
    });

    window.addEventListener('orientationchange', setHeaderOffset);
    setHeaderOffset();
}

document.addEventListener('DOMContentLoaded', setupMobileDrawer);




// Careers Page Micro Animations (Refactored)
document.addEventListener('DOMContentLoaded', function () {
    const careersPage = document.querySelector('.hero-minimal'); // Check if we are on careers page
    if (careersPage) {
        console.log('Careers page detected, initializing animations...');

        // Helper function to setup animation
        const setupAnimation = (element, delay = 0, type = 'reveal-on-scroll') => {
            if (element) {
                element.classList.add(type);
                if (delay > 0) {
                    element.style.transitionDelay = `${delay}s`;
                }
            }
        };

        // Hero Section
        const heroTitle = document.querySelector('.hero-minimal h1');
        const heroSubtitle = document.querySelector('.hero-minimal h2');
        const heroDesc = document.querySelector('.hero-minimal p');

        setupAnimation(heroTitle, 0);
        setupAnimation(heroSubtitle, 0.2);

        // Typewriter Setup for Description
        let typeWriterFunc = null;
        if (heroDesc) {
            // Store the original HTML structure
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = heroDesc.innerHTML;
            const textNodes = [];

            // Extract text content while preserving HTML structure
            function extractText(node, parentTag = '') {
                if (node.nodeType === Node.TEXT_NODE) {
                    textNodes.push({
                        type: 'text',
                        content: node.textContent,
                        parentTag: parentTag
                    });
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    const openTag = `<${tagName}${node.className ? ` class="${node.className}"` : ''}>`;
                    const closeTag = `</${tagName}>`;

                    textNodes.push({
                        type: 'openTag',
                        content: openTag
                    });

                    Array.from(node.childNodes).forEach(child => {
                        extractText(child, tagName);
                    });

                    textNodes.push({
                        type: 'closeTag',
                        content: closeTag
                    });
                }
            }

            Array.from(tempDiv.childNodes).forEach(node => {
                extractText(node);
            });

            // Clear the description initially
            heroDesc.innerHTML = '';
            heroDesc.style.opacity = '1'; // Keep visible for typing

            let nodeIndex = 0;
            let charIndex = 0;
            const typingSpeed = 15;

            typeWriterFunc = function () {
                if (nodeIndex >= textNodes.length) return;

                const currentNode = textNodes[nodeIndex];

                if (currentNode.type === 'openTag' || currentNode.type === 'closeTag') {
                    heroDesc.innerHTML += currentNode.content;
                    nodeIndex++;
                    typeWriterFunc();
                    return;
                }

                if (currentNode.type === 'text') {
                    if (charIndex < currentNode.content.length) {
                        heroDesc.innerHTML += currentNode.content[charIndex];
                        charIndex++;
                        setTimeout(typeWriterFunc, typingSpeed);
                    } else {
                        charIndex = 0;
                        nodeIndex++;
                        typeWriterFunc();
                    }
                } else {
                    nodeIndex++;
                    typeWriterFunc();
                }
            };
        }

        // Job Overview
        const overviewSection = document.querySelector('.overview');
        const overviewItems = document.querySelectorAll('.overview-item');

        if (overviewSection) {
            const overviewTitle = overviewSection.querySelector('h3');
            setupAnimation(overviewTitle, 0);

            overviewItems.forEach((item, index) => {
                setupAnimation(item, 0.2 + (index * 0.1));
            });
        }

        // Section Blocks (Qualifications & Responsibilities)
        const sectionBlocks = document.querySelectorAll('.section-block');
        sectionBlocks.forEach(block => {
            const title = block.querySelector('h3');
            const listItems = block.querySelectorAll('li');
            const cards = block.querySelectorAll('.resp-card');

            setupAnimation(title, 0);

            listItems.forEach((item, index) => {
                setupAnimation(item, 0.2 + (index * 0.05), 'reveal-on-scroll-left');
            });

            cards.forEach((card, index) => {
                setupAnimation(card, 0.2 + (index * 0.2));
            });
        });

        // Application Form
        const formContainer = document.querySelector('.form-container'); // First one is application form
        setupAnimation(formContainer, 0.2);

        // Map Section on Careers Page
        const mapSectionCareers = document.querySelector('.map-section');
        if (mapSectionCareers) {
            const mapContainerParent = mapSectionCareers.closest('.form-container');
            if (mapContainerParent && mapContainerParent !== formContainer) {
                setupAnimation(mapContainerParent, 0.2);
            }
        }

        // Observer for Careers Page
        const careersObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Add is-visible class to trigger animation
                    if (entry.target.classList.contains('reveal-on-scroll') || entry.target.classList.contains('reveal-on-scroll-left')) {
                        entry.target.classList.add('is-visible');
                    }

                    // Typewriter Trigger
                    if (entry.target === heroDesc) {
                        if (typeWriterFunc && !heroDesc.dataset.typingStarted) {
                            heroDesc.dataset.typingStarted = 'true';
                            typeWriterFunc();
                        }
                    }
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        // Observe elements
        if (heroTitle) careersObserver.observe(heroTitle);
        if (heroSubtitle) careersObserver.observe(heroSubtitle);
        if (heroDesc) careersObserver.observe(heroDesc);

        if (overviewSection) {
            const overviewTitle = overviewSection.querySelector('h3');
            if (overviewTitle) careersObserver.observe(overviewTitle);
            overviewItems.forEach(item => careersObserver.observe(item));
        }

        sectionBlocks.forEach(block => {
            const title = block.querySelector('h3');
            if (title) careersObserver.observe(title);

            const listItems = block.querySelectorAll('li');
            listItems.forEach(item => careersObserver.observe(item));

            const cards = block.querySelectorAll('.resp-card');
            cards.forEach(card => careersObserver.observe(card));
        });

        const allFormContainers = document.querySelectorAll('.form-container');
        allFormContainers.forEach(container => careersObserver.observe(container));
    }
});

// Feedback Slider
document.addEventListener('DOMContentLoaded', function () {
    const slider = document.getElementById('feedbackSlider');
    if (!slider) return;

    const track = slider.querySelector('.feedback-track');
    const cards = Array.from(slider.querySelectorAll('.feedback-card'));
    const prevBtn = document.getElementById('feedbackPrev');
    const nextBtn = document.getElementById('feedbackNext');
    const dotsWrap = document.getElementById('feedbackDots');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!track || cards.length === 0 || !prevBtn || !nextBtn || !dotsWrap) return;

    let currentIndex = 0;
    let autoTimer = null;
    const autoDelay = isLowEndDevice ? 7000 : 5000;

    cards.forEach((card, index) => {
        card.classList.toggle('is-active', index === 0);
        card.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');

        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'feedback-dot';
        dot.setAttribute('aria-label', `Show testimonial ${index + 1}`);
        dot.addEventListener('click', () => goTo(index, true));
        dotsWrap.appendChild(dot);
    });

    const dots = Array.from(dotsWrap.querySelectorAll('.feedback-dot'));

    const updateSlider = () => {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;

        cards.forEach((card, index) => {
            const isActive = index === currentIndex;
            card.classList.toggle('is-active', isActive);
            card.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentIndex);
        });
    };

    const goTo = (index, fromUser = false) => {
        currentIndex = (index + cards.length) % cards.length;
        updateSlider();
        if (fromUser) {
            restartAuto();
        }
    };

    const goNext = (fromUser = false) => goTo(currentIndex + 1, fromUser);
    const goPrev = (fromUser = false) => goTo(currentIndex - 1, fromUser);

    const stopAuto = () => {
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
    };

    const startAuto = () => {
        if (prefersReducedMotion || cards.length < 2) return;
        stopAuto();
        autoTimer = setInterval(() => {
            goNext(false);
        }, autoDelay);
    };

    const restartAuto = () => {
        stopAuto();
        startAuto();
    };

    prevBtn.addEventListener('click', () => goPrev(true));
    nextBtn.addEventListener('click', () => goNext(true));

    slider.addEventListener('mouseenter', stopAuto);
    slider.addEventListener('mouseleave', startAuto);
    slider.addEventListener('focusin', stopAuto);
    slider.addEventListener('focusout', (event) => {
        if (!slider.contains(event.relatedTarget)) {
            startAuto();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAuto();
        } else {
            startAuto();
        }
    });

    updateSlider();
    startAuto();
});
