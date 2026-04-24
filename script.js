document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Mobile Menu Toggle
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
        
        // Animate hamburger lines into X
        const bars = hamburger.querySelectorAll('.bar');
        if (hamburger.classList.contains('active')) {
            bars[0].style.transform = 'translateY(8px) rotate(45deg)';
            bars[1].style.opacity = '0';
            bars[2].style.transform = 'translateY(-8px) rotate(-45deg)';
        } else {
            bars[0].style.transform = 'translateY(0) rotate(0)';
            bars[1].style.opacity = '1';
            bars[2].style.transform = 'translateY(0) rotate(0)';
        }
    });

    // Close mobile menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
            
            const bars = hamburger.querySelectorAll('.bar');
            bars[0].style.transform = 'translateY(0) rotate(0)';
            bars[1].style.opacity = '1';
            bars[2].style.transform = 'translateY(0) rotate(0)';
        });
    });

    // 2. Enhanced Theme Toggle (Dark/Light Mode) with localStorage persistence
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');
    const body = document.body;

    // Retrieve saved theme preference with fallback to dark-mode
    const savedTheme = localStorage.getItem('mf_theme_preference');
    if (savedTheme === 'light') {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        themeIcon.className = 'fas fa-moon';
    } else {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        themeIcon.className = 'fas fa-sun';
        localStorage.setItem('mf_theme_preference', 'dark');
    }

    themeToggleBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            body.classList.remove('dark-mode');
            body.classList.add('light-mode');
            themeIcon.className = 'fas fa-moon';
            localStorage.setItem('mf_theme_preference', 'light');
        } else {
            body.classList.remove('light-mode');
            body.classList.add('dark-mode');
            themeIcon.className = 'fas fa-sun';
            localStorage.setItem('mf_theme_preference', 'dark');
        }
    });

    // 3. Scroll Reveal Animations using IntersectionObserver
    const revealElements = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right');

    const revealOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target); // Stop observing once revealed
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealOnScroll.observe(el);
    });

    // 4. Update Header on Scroll with enhanced sticky effect and blur
    const header = document.getElementById('header');
    const sections = document.querySelectorAll('section');
    const heroContent = document.querySelector('.hero-content');
    const progressCircle = document.querySelector('.progress-ring__circle');
    
    // Setup Progress Ring
    let circumference = 0;
    if (progressCircle) {
        const radius = progressCircle.r.baseVal.value;
        circumference = radius * 2 * Math.PI;
        progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressCircle.style.strokeDashoffset = circumference;
    }

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        
        // Parallax for Hero Content
        if (heroContent && scrollY < window.innerHeight && scrollY > 0) {
            heroContent.style.transform = `translateY(${scrollY * 0.3}px)`;
            heroContent.style.opacity = Math.max(0, 1 - (scrollY / 500));
        } else if (heroContent && scrollY === 0) {
            heroContent.style.transform = `translateY(0)`;
            heroContent.style.opacity = 1;
        }

        // Scroll Progress Ring Update
        if (progressCircle) {
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = scrollHeight > 0 ? scrollY / scrollHeight : 0;
            const dashoffset = circumference - (scrollPercent * circumference);
            progressCircle.style.strokeDashoffset = dashoffset;
        }

        // Enhanced header shadow on scroll with blur effect
        if (scrollY > 50) {
            header.style.boxShadow = 'var(--shadow-md)';
            header.style.backdropFilter = 'blur(15px)';
        } else {
            header.style.boxShadow = 'none';
            header.style.backdropFilter = 'blur(12px)';
        }

        // Active link highlighting
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (scrollY >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });

    // 5. Floating WhatsApp Button Functionality
    const whatsappBtn = document.getElementById('whatsapp-btn');
    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const phoneNumber = '+21648331142'; // Your WhatsApp number
            const message = encodeURIComponent('Bonjour MotiveFlow, je recherche une pièce spécifique pour mon véhicule...');
            const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
            window.open(whatsappUrl, '_blank');
        });
    }

    // 6. VIN Search Functionality
    const vinInput = document.getElementById('vin-input');
    const vinSearchBtn = document.querySelector('.vin-search-btn');
    const vinSkeleton = document.getElementById('vin-skeleton');
    const compatibilityBadge = document.getElementById('compatibility-badge');
    const compatVinText = document.getElementById('compat-vin');

    if (vinSearchBtn && vinInput) {
        const handleVinSearch = () => {
            const vinValue = vinInput.value.trim().toUpperCase();
            if (vinValue.length === 17) {
                // Validate VIN format (basic check)
                if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vinValue)) {
                    // Show Skeleton Loader
                    if (vinSkeleton) vinSkeleton.classList.remove('hidden');
                    if (compatibilityBadge) compatibilityBadge.classList.add('hidden');
                    
                    // Simulate API Call delay
                    setTimeout(() => {
                        if (vinSkeleton) vinSkeleton.classList.add('hidden');
                        
                        localStorage.setItem('mf_last_searched_vin', vinValue);
                        if (compatibilityBadge && compatVinText) {
                            compatVinText.textContent = vinValue;
                            compatibilityBadge.classList.remove('hidden');
                        }
                        
                        // Show success feedback
                        showNotification(`VIN ${vinValue} vérifié avec succès!`, 'success');
                        
                        // Navigate to products section
                        setTimeout(() => {
                            document.querySelector('#skills').scrollIntoView({ behavior: 'smooth' });
                        }, 500);
                    }, 1500);
                } else {
                    showNotification('Format VIN invalide. Veuillez vérifier votre numéro.', 'error');
                }
            } else {
                showNotification('Le VIN doit contenir 17 caractères.', 'warning');
            }
        };

        vinSearchBtn.addEventListener('click', handleVinSearch);
        vinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleVinSearch();
        });
    }

    // 7. Notification System
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(notification);

        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 10);

        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // 8. Lazy Loading for Images
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        img.classList.add('loaded');
                    }
                    observer.unobserve(img);
                }
            });
        });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }

    // 9. Set Current Year in Footer
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }

    // 10. Carousel Auto-play Enhancement
    const carouselTrack = document.querySelector('.carousel-track');
    if (carouselTrack) {
        // Pause on hover is already handled by CSS
        // Add touch swipe support for mobile
        let touchStartX = 0;
        carouselTrack.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        });
    }

    // 11. Save Last Visited Section
    window.addEventListener('beforeunload', () => {
        const currentSection = document.querySelector('section.revealed');
        if (currentSection) {
            localStorage.setItem('mf_last_section', currentSection.id);
        }
    });

    // 12. Scroll to Last Visited Section on Return
    const lastSection = localStorage.getItem('mf_last_section');
    if (lastSection && document.getElementById(lastSection)) {
        // Optional: auto-scroll to last section
        // document.getElementById(lastSection).scrollIntoView();
    }

    // 13. Category Chip Filter Logic
    const filterChips = document.querySelectorAll('.chip');
    if (filterChips.length > 0) {
        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                filterChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const filter = chip.getAttribute('data-filter');
                // Simulate filtering (Visual only for now)
                showNotification(`Filtre appliqué: ${filter.toUpperCase()}`, 'info');
            });
        });
    }

    // 14. Testimonial Slider Auto-scroll
    const testimonialTrack = document.getElementById('testimonial-track');
    if (testimonialTrack) {
        let scrollAmount = 0;
        const autoScroll = () => {
            if (testimonialTrack.scrollLeft >= (testimonialTrack.scrollWidth - testimonialTrack.clientWidth)) {
                scrollAmount = 0;
            } else {
                scrollAmount += 350; // Approximated card width
            }
            testimonialTrack.scrollTo({
                top: 0,
                left: scrollAmount,
                behavior: 'smooth'
            });
        };
        // Auto scroll every 5 seconds
        setInterval(autoScroll, 5000);
    }

    // 15. Leaflet Map Initialization
    if (document.getElementById('map') && typeof L !== 'undefined') {
        // Coordinates for La Marsa / Tunis
        const map = L.map('map', {
            zoomControl: false // Disable default zoom control for cleaner look
        }).setView([36.878, 10.325], 13);
        
        // Add zoomed controls to right
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Add Dark Matter Tile Layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);

        // Add Marker
        const marker = L.marker([36.878, 10.325]).addTo(map);
        marker.bindPopup("<b style='color:#0f172a;'>MotiveFlow</b><br><span style='color:#0f172a;'>La Marsa, Tunis</span>").openPopup();
    }
});

/**
 * EmailJS Integration for MotiveFlow Contact Form
 * ----------------------------------------------
 */
document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contact-form');

    if (contactForm) {
        contactForm.addEventListener('submit', function (event) {
            event.preventDefault();

            // 1. تحديد العناصر للتحكم في حالة الإرسال
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;

            // 2. تغيير حالة الزر لمنع الضغط المتكرر
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';

            // 3. إرسال النموذج عبر EmailJS
            // استبدل 'YOUR_SERVICE_ID' و 'YOUR_TEMPLATE_ID' بالأكواد التي وجدتها في حسابك
            emailjs.sendForm('service_i015m4p', 'template_mgj0vas', this)
                .then(() => {
                    // حالة النجاح: إظهار رسالة نجاح واضحة
                    showFormFeedback('Success! Votre message a été envoyé.', 'success');
                    contactForm.reset(); // تفريغ الخانات بعد النجاح
                })
                .catch((error) => {
                    // حالة الفشل: تسجيل الخطأ وإبلاغ المستخدم
                    console.error('EmailJS Error:', error);
                    showFormFeedback('Erreur! Problème de connexion, réessayez.', 'error');
                })
                .finally(() => {
                    // إعادة الزر لحالته الأصلية في كل الحالات
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                });
        });
    }

    /**
     * وظيفة لإظهار تنبيهات أنيقة (Feedback)
     */
    function showFormFeedback(message, type) {
        // يمكنك استخدام alert بسيطة أو بناء div صغير يظهر ويختفي
        // هنا سنستخدم alert مؤقتاً لضمان العمل
        alert(message);
        
        // ملاحظة احترافية: يمكنك لاحقاً استبدال الـ alert بـ Toast Notification
    }
});
