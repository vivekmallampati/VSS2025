// Tab Navigation Functionality
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContents = document.querySelectorAll('.tab-content');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all nav links and tab contents
            navLinks.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));
            
            // Add active class to clicked nav link
            this.classList.add('active');
            
            // Show corresponding tab content
            const targetTab = this.getAttribute('data-tab');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
});

// Login Modal Functionality
function openLogin() {
    const modal = document.getElementById('loginModal');
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeLogin() {
    const modal = document.getElementById('loginModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Restore scrolling
}

// Close modal when clicking outside of it
window.addEventListener('click', function(event) {
    const modal = document.getElementById('loginModal');
    if (event.target === modal) {
        closeLogin();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeLogin();
    }
});

// Document Download Functionality
function downloadDocument(type) {
    let fileName, filePath;
    
    switch(type) {
        case 'shibirarthi':
            fileName = 'Letter_to_Approved_shibirarthi.docx';
            filePath = './docs/Letter to Approved shibirarthi.docx';
            break;
        case 'support':
            fileName = 'Generic_SupportLetter_SREE_VISWA_NIKETAN.docx';
            filePath = './docs/Generic_SupportLetter_SREE VISWA NIKETAN.docx';
            break;
        default:
            console.error('Unknown document type:', type);
            return;
    }
    
    // Create a temporary link element to trigger download
    const link = document.createElement('a');
    link.href = filePath;
    link.download = fileName;
    link.style.display = 'none';
    
    // Add to DOM, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Show success message
    showNotification(`Downloading ${fileName}...`, 'success');
}

// Donation Functionality
function donate(type) {
    let donationType, amount;
    
    switch(type) {
        case 'gold':
            donationType = 'Gold Contribution';
            amount = '₹10,00,000';
            break;
        case 'silver':
            donationType = 'Silver Contribution';
            amount = '₹5,00,000';
            break;
        case 'full-page':
            donationType = 'Full Page Advertisement';
            amount = '₹10,00,000';
            break;
        case 'half-page':
            donationType = 'Half Page Advertisement';
            amount = '₹5,00,000';
            break;
        default:
            console.error('Unknown donation type:', type);
            return;
    }
    
    // Show donation confirmation
    const confirmed = confirm(
        `You are about to make a ${donationType} of ${amount}.\n\n` +
        `Please make cheques payable to:\n` +
        `Shri Vishwa Niketan\n` +
        `101, Viswa Residency, Chitra Layout\n` +
        `L. B. Nagar, Hyderabad - 500074\n\n` +
        `For more details, please contact:\n` +
        `Phone: +91-90000 04096\n` +
        `Email: info@vss2025.org\n\n` +
        `Would you like to proceed?`
    );
    
    if (confirmed) {
        showNotification(`Thank you for your interest in ${donationType}! Please contact us for payment details.`, 'success');
    }
}

// Contact Form Submission
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const name = this.querySelector('input[type="text"]').value;
            const email = this.querySelector('input[type="email"]').value;
            const message = this.querySelector('textarea').value;
            
            // Basic validation
            if (!name || !email || !message) {
                showNotification('Please fill in all fields.', 'error');
                return;
            }
            
            if (!isValidEmail(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }
            
            // Simulate form submission
            showNotification('Thank you for your message! We will get back to you soon.', 'success');
            this.reset();
        });
    }
});

// Login Form Submission
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = this.querySelector('input[type="email"]').value;
            const password = this.querySelector('input[type="password"]').value;
            
            if (!email || !password) {
                showNotification('Please fill in all fields.', 'error');
                return;
            }
            
            if (!isValidEmail(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }
            
            // Simulate login process
            showNotification('Login functionality will be connected to the backend system.', 'info');
            closeLogin();
        });
    }
});

// Utility Functions
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    // Set background color based on type
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#4CAF50';
            break;
        case 'error':
            notification.style.backgroundColor = '#F44336';
            break;
        case 'info':
            notification.style.backgroundColor = '#2196F3';
            break;
        default:
            notification.style.backgroundColor = '#666';
    }
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Smooth scrolling for anchor links
document.addEventListener('DOMContentLoaded', function() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Add loading animation for images
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
        img.addEventListener('load', function() {
            this.style.opacity = '1';
        });
        
        // Set initial opacity to 0 for loading effect
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.3s ease';
    });
});

// Add scroll effect to header
window.addEventListener('scroll', function() {
    const header = document.querySelector('.header');
    const nav = document.querySelector('.navigation');
    
    if (window.scrollY > 100) {
        header.style.transform = 'translateY(-100%)';
        nav.style.position = 'fixed';
        nav.style.top = '0';
        nav.style.width = '100%';
        nav.style.zIndex = '1000';
    } else {
        header.style.transform = 'translateY(0)';
        nav.style.position = 'static';
    }
});

// Add animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.document-card, .tier-card, .ad-card, .contact-info, .contact-form');
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});
