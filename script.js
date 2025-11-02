// Global variables
let pendingRegistration = null;
let firebaseInitialized = false;

// Helper function to wait for Firebase initialization
function waitForFirebase(callback, maxRetries = 50) {
    // Check if Firebase is initialized
    if (window.firebase && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        firebaseInitialized = true;
        callback();
        return;
    }
    
    // Also check global flag
    if (window.firebaseInitialized && window.firebase && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        firebaseInitialized = true;
        callback();
        return;
    }

    if (maxRetries <= 0) {
        return;
    }

    setTimeout(function() {
        if (window.firebase && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            firebaseInitialized = true;
            window.firebaseInitialized = true;
            callback();
        } else {
            waitForFirebase(callback, maxRetries - 1);
        }
    }, 100);
}

// Protected tabs that require authentication
const PROTECTED_TABS = ['shibirarthi', 'myprofile', 'mytransportation', 'mytours'];

// Helper function to check if a tab is protected
function isProtectedTab(tabName) {
    return PROTECTED_TABS.includes(tabName);
}

// Helper function to check if user can access a protected tab
function canAccessProtectedTab(tabName) {
    if (!isProtectedTab(tabName)) {
        return true; // Public tabs are always accessible
    }
    
    // Check if user is logged in via Firebase
    if (window.firebase && firebase.auth) {
        const user = firebase.auth().currentUser;
        if (!user) {
            return false;
        }
        
        // Check if the nav item is visible (additional check)
        const navItemId = tabName === 'shibirarthi' ? 'shibirarthiNavItem' : 
                         tabName + 'NavItem';
        const navItem = document.getElementById(navItemId);
        if (navItem && navItem.style.display === 'none') {
            return false;
        }
        
        return true;
    }
    
    return false; // If Firebase not available, protected tabs not accessible
}

// Global function to activate a tab and update URL
function activateTab(tabName, skipAuthCheck = false) {
    // Check if trying to access protected tab without authentication
    if (!skipAuthCheck && isProtectedTab(tabName) && !canAccessProtectedTab(tabName)) {
        showNotification('Please login to access this page.', 'info');
        window.history.pushState(null, null, '#home');
        activateTab('home', true); // Skip auth check for home
        openLogin();
        return;
    }
    
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Remove active class from all nav links and tab contents
    navLinks.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Find and activate the corresponding nav link and tab
    const targetLink = document.querySelector(`.nav-link[data-tab="${tabName}"]`);
    const targetContent = document.getElementById(tabName);
    
    if (targetLink && targetContent) {
        targetLink.classList.add('active');
        targetContent.classList.add('active');
        
        // Update URL hash without triggering scroll
        if (window.location.hash !== `#${tabName}`) {
            window.history.pushState(null, null, `#${tabName}`);
        }
        
        // Load data for specific tabs when they're activated (if user is logged in)
        if (window.firebase && firebase.auth) {
            const user = firebase.auth().currentUser;
            if (user) {
                switch(tabName) {
                    case 'myprofile':
                        loadUserProfile(user);
                        break;
                    case 'mytransportation':
                        loadTransportationInfo(user);
                        break;
                    case 'mytours':
                        loadToursInfo(user);
                        break;
                }
            }
        }
        
        // Scroll to top of page
        window.scrollTo(0, 0);
    }
}

// Tab Navigation Functionality with URL hash support
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContents = document.querySelectorAll('.tab-content');

    // Handle nav link clicks
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetTab = this.getAttribute('data-tab');
            if (targetTab) {
                // activateTab function will handle authentication check
                activateTab(targetTab);
            }
        });
    });

    // Handle hash changes (browser back/forward buttons, direct URL access)
    window.addEventListener('hashchange', function() {
        const hash = window.location.hash.substring(1); // Remove #
        if (hash) {
            // activateTab function will handle authentication check
            activateTab(hash);
        } else {image.png
            activateTab('home');
        }
    });

    // Handle initial page load - wait for Firebase to initialize first
    const initialHash = window.location.hash.substring(1);
    
    // Wait for Firebase to be initialized before checking auth state
    waitForFirebase(function() {
        if (window.firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
                // Small delay to ensure UI is updated
                setTimeout(() => {
                    if (initialHash) {
                        activateTab(initialHash);
                    } else {
                        activateTab('home');
                    }
                }, 100);
            });
        } else {
            // If Firebase not available, just activate based on hash
            if (initialHash) {
                activateTab(initialHash);
            } else {
                activateTab('home');
            }
        }
    });

    // Media filter default
    const mediaSelect = document.getElementById('mediaType');
    if (mediaSelect) {
        switchMediaView(mediaSelect.value);
    }
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
    // Reset to login form when closing
    showLoginForm();
}

// Reset register form (defined early so it can be called elsewhere)
function resetRegisterForm() {
    pendingRegistration = null;
    const verifyForm = document.getElementById('registerVerifyForm');
    const passwordForm = document.getElementById('registerPasswordForm');
    if (verifyForm) verifyForm.style.display = 'block';
    if (passwordForm) passwordForm.style.display = 'none';
    const registerForm = document.querySelector('.register-form');
    if (registerForm) {
        registerForm.reset();
    }
    const pwdForm = document.querySelector('.password-setup-form');
    if (pwdForm) {
        pwdForm.reset();
    }
    // Clear error message
    const registerError = document.getElementById('registerError');
    if (registerError) {
        registerError.style.display = 'none';
        registerError.textContent = '';
    }
}

// Display error in register modal
function showRegisterError(message) {
    const registerError = document.getElementById('registerError');
    if (registerError) {
        registerError.textContent = message;
        registerError.style.display = 'block';
    }
}

// Register Modal Functionality
function openRegister() {
    const modal = document.getElementById('registerModal');
    if (!modal) {
        console.error('Register modal not found!');
        return;
    }
    // Ensure login modal is closed first
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    resetRegisterForm(); // Reset form when opening
}

function closeRegister() {
    const modal = document.getElementById('registerModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    resetRegisterForm(); // Reset form when closing
}

// Close modal when clicking outside of it
window.addEventListener('click', function(event) {
    const modal = document.getElementById('loginModal');
    const regModal = document.getElementById('registerModal');
    if (event.target === modal) {
        closeLogin();
    }
    if (event.target === regModal) {
        closeRegister();
    }
});

// Mobile Menu Toggle Functionality
function toggleMobileMenu() {
    const navigation = document.getElementById('mainNavigation');
    const toggleButton = document.querySelector('.mobile-menu-toggle');
    
    if (navigation && toggleButton) {
        navigation.classList.toggle('mobile-menu-open');
        toggleButton.classList.toggle('active');
    }
}

// Close mobile menu when a nav link is clicked (on mobile)
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    const navigation = document.getElementById('mainNavigation');
    const toggleButton = document.querySelector('.mobile-menu-toggle');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            // Check if we're on mobile (menu is open)
            if (navigation && navigation.classList.contains('mobile-menu-open')) {
                // Only close menu if it's not a dropdown parent link
                const parent = this.parentElement;
                if (!parent.classList.contains('has-dropdown')) {
                    toggleMobileMenu();
                }
            }
        });
    });
    
    // Handle dropdown menu clicks on mobile
    const dropdownLinks = document.querySelectorAll('.has-dropdown > .nav-link');
    dropdownLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // On mobile, toggle dropdown instead of just navigating
            if (window.innerWidth <= 768) {
                e.preventDefault();
                const parent = this.parentElement;
                parent.classList.toggle('active');
                
                // Also activate the tab if not already active
                const targetTab = this.getAttribute('data-tab');
                if (targetTab) {
                    activateTab(targetTab);
                }
            }
        });
    });
    
    // Close mobile menu when dropdown items are clicked
    const dropdownItems = document.querySelectorAll('.dropdown-menu a');
    dropdownItems.forEach(item => {
        item.addEventListener('click', function() {
            if (navigation && navigation.classList.contains('mobile-menu-open')) {
                toggleMobileMenu();
            }
        });
    });
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeLogin();
        closeRegister();
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
        case 'fundraiser':
            fileName = 'VSS2025_Fundraiser_Flyer.jpg';
            filePath = './docs/VSS2025_FA.jfif.jpg';
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

// EmailJS Configuration
// To set up EmailJS:
// 1. Go to https://www.emailjs.com/ and create a free account
// 2. Create an email service (Gmail, Outlook, etc.)
// 3. Create an email template with variables: {{from_name}}, {{from_email}}, {{category}}, {{message}}
// 4. Get your Public Key, Service ID, and Template ID
// 5. Update the values below:
const EMAILJS_CONFIG = {
    PUBLIC_KEY: '', // Add your EmailJS Public Key here
    SERVICE_ID: '', // Add your EmailJS Service ID here
    TEMPLATE_ID: '', // Add your EmailJS Template ID here
    TO_EMAIL: 'info@vss2025.org' // Recipient email address
};

// Initialize EmailJS when available
if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.PUBLIC_KEY) {
    emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
}

// Contact Form Submission
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const category = document.getElementById('contactCategory').value;
            const message = document.getElementById('contactMessage').value.trim();
            
            // Basic validation
            if (!name || !email || !category || !message) {
                showNotification('Please fill in all fields including category.', 'error');
                return;
            }
            
            if (!isValidEmail(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }
            
            showNotification('Sending your message...', 'info');
            
            // Function to send email via EmailJS
            const sendEmail = () => {
                return new Promise((resolve, reject) => {
                    // Check if EmailJS is configured and available
                    if (typeof emailjs !== 'undefined' && 
                        EMAILJS_CONFIG.PUBLIC_KEY && 
                        EMAILJS_CONFIG.SERVICE_ID && 
                        EMAILJS_CONFIG.TEMPLATE_ID) {
                        
                        const templateParams = {
                            from_name: name,
                            from_email: email,
                            category: category,
                            message: message,
                            to_email: EMAILJS_CONFIG.TO_EMAIL,
                            reply_to: email
                        };
                        
                        emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, templateParams)
                            .then((response) => {
                                resolve(response);
                            })
                            .catch((emailError) => {
                                console.error('EmailJS error:', emailError);
                                reject(emailError);
                            });
                    } else {
                        // EmailJS not configured, resolve anyway (message will be saved to Firestore)
                        resolve(null);
                    }
                });
            };
            
            // Save to Firestore
            if (window.firebase && firebase.firestore) {
                const db = firebase.firestore();
                
                // Save to Firestore first, then try to send email
                db.collection('contactMessages').add({
                    name: name,
                    email: email,
                    category: category,
                    message: message,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    read: false
                })
                .then((docRef) => {
                    // Try to send email via EmailJS
                    return sendEmail()
                        .then(() => {
                            showNotification('Thank you for your message! We will get back to you soon.', 'success');
                            contactForm.reset();
                        })
                        .catch((emailError) => {
                            // Email failed but message saved to Firestore - still show success
                            showNotification('Your message has been received. We will get back to you soon.', 'success');
                            contactForm.reset();
                        });
                })
                .catch((error) => {
                    console.error('Error saving contact message:', error);
                    showNotification('Error sending message. Please try again or contact us directly at info@vss2025.org', 'error');
                });
            } else {
                // If Firebase is not available, try EmailJS only
                sendEmail()
                    .then(() => {
                        showNotification('Thank you for your message! We will get back to you soon.', 'success');
                        contactForm.reset();
                    })
                    .catch((error) => {
                        showNotification('Error sending message. Please try again or contact us directly at info@vss2025.org', 'error');
                    });
            }
        });
    }
});

// Forgot Password Functions
function showForgotPassword() {
    const loginContainer = document.getElementById('loginFormContainer');
    const forgotContainer = document.getElementById('forgotPasswordFormContainer');
    if (loginContainer && forgotContainer) {
        loginContainer.style.display = 'none';
        forgotContainer.style.display = 'block';
    }
}

function showLoginForm() {
    const loginContainer = document.getElementById('loginFormContainer');
    const forgotContainer = document.getElementById('forgotPasswordFormContainer');
    if (loginContainer && forgotContainer) {
        loginContainer.style.display = 'block';
        forgotContainer.style.display = 'none';
    }
}

// Forgot Password Form Submission
document.addEventListener('DOMContentLoaded', function() {
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('forgotPasswordEmail').value.trim();
            
            if (!email) {
                showNotification('Please enter your email address.', 'error');
                return;
            }
            
            if (!isValidEmail(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }
            
            // Firebase password reset
            if (window.firebase && firebase.auth) {
                showNotification('Sending password reset email...', 'info');
                
                firebase.auth().sendPasswordResetEmail(email)
                    .then(() => {
                        showNotification('Password reset email sent! Please check your inbox.', 'success');
                        setTimeout(() => {
                            closeLogin();
                            showLoginForm(); // Reset to login form
                        }, 2000);
                    })
                    .catch((error) => {
                        let errorMessage = 'Error sending password reset email. ';
                        
                        if (error.code === 'auth/user-not-found') {
                            errorMessage = 'No account found with this email address.';
                        } else if (error.code === 'auth/invalid-email') {
                            errorMessage = 'Invalid email address.';
                        } else if (error.code === 'auth/too-many-requests') {
                            errorMessage = 'Too many requests. Please try again later.';
                        } else {
                            errorMessage += error.message || 'Please try again.';
                        }
                        
                        showNotification(errorMessage, 'error');
                    });
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
        });
    }
});

// Login Form Submission - Supports Email or UniqueID
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const identifier = document.getElementById('loginIdentifier').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            if (!identifier || !password) {
                showNotification('Please fill in all fields.', 'error');
                return;
            }
            
            // Firebase login
            if (window.firebase && firebase.auth && firebase.firestore) {
                showNotification('Logging in...', 'info');
                
                // Check if identifier is email or UniqueID
                const isEmail = isValidEmail(identifier);
                
                if (isEmail) {
                    // Direct email login
                    firebase.auth().signInWithEmailAndPassword(identifier, password)
                        .then((userCredential) => {
                            handleLoginSuccess(loginForm);
                        })
                        .catch((error) => {
                            // Check if user doesn't exist
                            if (error.code === 'auth/user-not-found') {
                                showNotification('No account found. Please register first.', 'error');
                                // Close login and open register modal
                                closeLogin();
                                setTimeout(() => {
                                    openRegister();
                                }, 300);
                            } else {
                                handleLoginError(error);
                            }
                        });
                } else {
                    // Praveshika ID login - normalize and look up email
                    const db = firebase.firestore();
                    const normalizedId = normalizePraveshikaId(identifier);
                    
                    // Helper function to find email by normalized Praveshika ID
                    // Prioritizes registrations collection (publicly readable) to avoid security issues
                    function findEmailByPraveshikaId(normalizedId) {
                        // First: Try checking registrations collection with normalizedId field (most efficient)
                        return db.collection('registrations').where('normalizedId', '==', normalizedId).limit(1).get()
                            .then((regQuerySnapshot) => {
                                if (!regQuerySnapshot.empty) {
                                    const email = regQuerySnapshot.docs[0].data().email;
                                    if (email) return email;
                                }
                                return null;
                            })
                            .then((email) => {
                                if (email) return email;
                                // Second: Try direct document lookup and normalize document ID
                                return db.collection('registrations').doc(identifier).get()
                                    .then((doc) => {
                                        if (doc.exists) {
                                            const docNormalizedId = normalizePraveshikaId(doc.id);
                                            if (docNormalizedId === normalizedId && doc.data().email) {
                                                const email = doc.data().email;
                                                if (email) return email;
                                            }
                                        }
                                        return null;
                                    });
                            })
                            .then((email) => {
                                if (email) return email;
                                // Third: Search all registration documents by normalizing document IDs (fallback for old data)
                                return db.collection('registrations').get()
                                    .then((allDocs) => {
                                        for (const doc of allDocs.docs) {
                                            const docNormalizedId = normalizePraveshikaId(doc.id);
                                            if (docNormalizedId === normalizedId) {
                                                const email = doc.data().email;
                                                if (email) return email;
                                            }
                                            // Also check normalizedId field in case document ID doesn't match
                                            const regData = doc.data();
                                            if (regData.normalizedId && normalizePraveshikaId(regData.normalizedId) === normalizedId) {
                                                const email = regData.email;
                                                if (email) return email;
                                            }
                                        }
                                        return null;
                                    });
                            });
                    }
                    
                    // Find email and login
                    findEmailByPraveshikaId(normalizedId)
                        .then((email) => {
                            if (!email) {
                                showNotification('No account found for this Praveshika ID. Please register first.', 'error');
                                // Close login and open register modal
                                closeLogin();
                                setTimeout(() => {
                                    openRegister();
                                }, 300);
                                throw { code: 'auth/user-not-found', message: 'No email found for this Praveshika ID.' };
                            }
                            // Login with the found email
                            return firebase.auth().signInWithEmailAndPassword(email, password);
                        })
                        .then((userCredential) => {
                            handleLoginSuccess(loginForm);
                        })
                        .catch((error) => {
                            // Check if user doesn't exist
                            if (error.code === 'auth/user-not-found') {
                                showNotification('No account found. Please register first.', 'error');
                                // Close login and open register modal
                                closeLogin();
                                setTimeout(() => {
                                    openRegister();
                                }, 300);
                            } else {
                                handleLoginError(error);
                            }
                        });
                }
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
        });
    }
});

// Helper function to refresh associated registrations for a user
function refreshAssociatedRegistrations(user) {
    if (!window.firebase || !firebase.firestore) return Promise.resolve();
    
    const db = firebase.firestore();
    const userEmail = user.email || '';
    const normalizedEmail = userEmail.toLowerCase().trim();
    
    if (!normalizedEmail) return Promise.resolve();
    
    return db.collection('users').doc(user.uid).get()
        .then((userDoc) => {
            if (!userDoc.exists) {
                return null;
            }
            
            const userData = userDoc.data();
            const primaryUniqueId = userData.uniqueId;
            
            // Check emailToUids collection for all uniqueIds
            return db.collection('emailToUids').doc(normalizedEmail).get()
                .then((emailToUidsDoc) => {
                    let allUniqueIds = [];
                    
                    if (emailToUidsDoc.exists) {
                        const emailToUidsData = emailToUidsDoc.data();
                        const uidsFromEmailToUids = emailToUidsData.uids || [];
                        allUniqueIds = [...uidsFromEmailToUids];
                    }
                    
                    // Always include primary uniqueId
                    if (primaryUniqueId && !allUniqueIds.includes(primaryUniqueId)) {
                        allUniqueIds.push(primaryUniqueId);
                    }
                    
                    // Get current associated registrations
                    const associatedRegistrations = userData.associatedRegistrations || [];
                    const currentUniqueIds = associatedRegistrations.map(reg => reg.uniqueId).filter(Boolean);
                    
                    // Always update if emailToUids exists and has uniqueIds
                    if (emailToUidsDoc.exists && allUniqueIds.length > 0) {
                        // Fetch all registration documents
                        const updatePromises = allUniqueIds.map(uid => 
                            db.collection('registrations').doc(uid).get()
                                .then(regDoc => {
                                    if (regDoc.exists) {
                                        const regData = regDoc.data();
                                        return {
                                            uniqueId: regData.uniqueId || uid,
                                            name: regData.name || regData['Full Name'] || '',
                                            email: regData.email || regData['Email address'] || userEmail
                                        };
                                    } else {
                                        return {
                                            uniqueId: uid,
                                            name: userData.name || '',
                                            email: userEmail
                                        };
                                    }
                                })
                                .catch(error => {
                                    console.error(`Error fetching registration for ${uid}:`, error);
                                    return {
                                        uniqueId: uid,
                                        name: userData.name || '',
                                        email: userEmail
                                    };
                                })
                        );
                        
                        return Promise.all(updatePromises)
                            .then((updatedRegistrations) => {
                                const validRegistrations = updatedRegistrations
                                    .filter(reg => reg !== null && reg.uniqueId)
                                    .filter((reg, index, self) => 
                                        index === self.findIndex(r => r.uniqueId === reg.uniqueId)
                                    );
                                
                                
                                // Update user document with refreshed associated registrations
                                return db.collection('users').doc(user.uid).update({
                                    associatedRegistrations: validRegistrations,
                                    emailProcessedAt: firebase.firestore.FieldValue.serverTimestamp()
                                });
                            });
                    } else if (allUniqueIds.length === 0 && primaryUniqueId) {
                        // No emailToUids but we have a primary uniqueId, ensure it's in associatedRegistrations
                        const hasPrimary = currentUniqueIds.includes(primaryUniqueId);
                        if (!hasPrimary) {
                            return db.collection('users').doc(user.uid).update({
                                associatedRegistrations: [{
                                    uniqueId: primaryUniqueId,
                                    name: userData.name || '',
                                    email: userEmail
                                }],
                                emailProcessedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    }
                    
                    return null;
                })
                .catch((error) => {
                    console.error('Error refreshing associated registrations:', error);
                    return null;
                });
        })
        .catch((error) => {
            console.error('Error refreshing associated registrations:', error);
            return null;
        });
}

// Helper function for successful login
function handleLoginSuccess(loginForm) {
    showNotification('Logged in successfully!', 'success');
    closeLogin();
    loginForm.reset();
    updateAuthUI();
    
    // Refresh associated registrations after login
    if (window.firebase && firebase.auth) {
        const user = firebase.auth().currentUser;
        if (user) {
            refreshAssociatedRegistrations(user)
                .then(() => {
                })
                .catch((error) => {
                    console.error('Error refreshing associated registrations after login:', error);
                });
        }
    }
    
    // Redirect to Shibirarthi Info tab after login
    setTimeout(() => {
        activateTab('shibirarthi');
    }, 100);
}

// Helper function for login errors
function handleLoginError(error) {
    let errorMessage = 'Login failed. ';
    
    if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found. Please register first.';
        // This is handled in the login flow, but keeping for other cases
    } else if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
        errorMessage = 'Permission denied. Please make sure Firestore security rules are properly deployed.';
    } else if (error.code === 'auth/wrong-password') {
        errorMessage += 'Incorrect password.';
    } else if (error.code === 'auth/invalid-email') {
        errorMessage += 'Invalid email address.';
    } else if (error.code === 'auth/user-disabled') {
        errorMessage += 'This account has been disabled.';
    } else if (error.code === 'auth/invalid-credential') {
        errorMessage += 'Invalid email or password. Please check your credentials.';
    } else {
        errorMessage += error.message || 'Please try again.';
    }
    
    showNotification(errorMessage, 'error');
}

// Normalize Praveshika ID: lowercase, remove "/" and "-"
function normalizePraveshikaId(praveshikaId) {
    if (!praveshikaId) return '';
    return praveshikaId.toString().toLowerCase().replace(/[/-]/g, '');
}

// Register Form Submission - Verification Step
document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.querySelector('.register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const uniqueId = document.getElementById('regUniqueId').value.trim(); // This is Praveshika ID
            const email = document.getElementById('regEmail').value.trim();

            // Validate both fields are provided
            if (!uniqueId) {
                showNotification('Please enter your Praveshika ID.', 'error');
                return;
            }

            if (!email) {
                showNotification('Please enter your email address.', 'error');
                return;
            }

            // Basic email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }

            // Normalize the input Praveshika ID
            const normalizedId = normalizePraveshikaId(uniqueId);
            const normalizedEmail = email.toLowerCase().trim();

            // Verify with Firestore using normalized Praveshika ID
            if (window.firebase && firebase.firestore) {
                const db = firebase.firestore();
                
                showNotification('Verifying your Praveshika ID and email...', 'info');
                
                // Strategy: Get all registrations and search for matching normalized ID
                // This works even without indexes and handles both normalizedId field and document ID normalization
                db.collection('registrations').get()
                    .then(querySnapshot => {
                        let matchingDoc = null;
                        let actualPraveshikaId = null;
                        
                        // Search through all documents
                        querySnapshot.forEach(doc => {
                            const docData = doc.data();
                            const docIdStr = String(doc.id); // Ensure it's a string
                            const docIdNormalized = normalizePraveshikaId(docIdStr);
                            const docFieldNormalized = docData.normalizedId ? normalizePraveshikaId(String(docData.normalizedId)) : '';
                            const docFieldValue = docData.normalizedId ? String(docData.normalizedId) : '';
                            
                            // Match if either the normalized document ID or the normalizedId field matches
                            // Check both the normalized version and direct field value
                            if (docIdNormalized === normalizedId || 
                                docFieldNormalized === normalizedId || 
                                docFieldValue === normalizedId ||
                                docData.normalizedId === normalizedId) {
                                matchingDoc = doc;
                                actualPraveshikaId = docIdStr;
                                return; // Break out of forEach
                            }
                        });
                        
                        if (!matchingDoc) {
                            showNotification('Verification failed. Praveshika ID not found.', 'error');
                            return;
                        }
                        
                        const data = matchingDoc.data();
                        const storedEmail = data.email ? data.email.toLowerCase().trim() : '';
                        
                        // Validate that the email matches the one stored for this Praveshika ID
                        if (!storedEmail || storedEmail !== normalizedEmail) {
                            showNotification('Email does not match the one associated with this Praveshika ID.', 'error');
                            return;
                        }
                        
                        // Check if Firebase Auth account already exists for this email
                        return firebase.auth().fetchSignInMethodsForEmail(data.email || email)
                            .then((signInMethods) => {
                                if (signInMethods && signInMethods.length > 0) {
                                    // Account already exists
                                    showNotification('An account with this email already exists. Please login instead.', 'error');
                                    // Close register modal and open login modal
                                    closeRegister();
                                    setTimeout(() => {
                                        // Pre-fill the login form with the email
                                        const loginIdentifier = document.getElementById('loginIdentifier');
                                        if (loginIdentifier) {
                                            loginIdentifier.value = data.email || email;
                                        }
                                        openLogin();
                                    }, 300);
                                    return;
                                }
                                
                                // Account doesn't exist - proceed with registration
                                // Verification successful - show password setup
                                pendingRegistration = {
                                    name: data.name || '',
                                    uniqueId: actualPraveshikaId, // Use actual document ID
                                    email: data.email || email // Use stored email to preserve exact format
                                };
                                
                                // Switch to password setup form
                                document.getElementById('registerVerifyForm').style.display = 'none';
                                document.getElementById('registerPasswordForm').style.display = 'block';
                                showNotification('Verification successful! Please set a password.', 'success');
                            });
                    })
                    .catch(err => {
                        console.error('Verification error:', err);
                        let errorMsg = 'Verification error. Please try again.';
                        if (err.code === 'permission-denied') {
                            errorMsg = 'Permission denied. Please check Firestore security rules.';
                        } else if (err.code === 'auth/invalid-email') {
                            errorMsg = 'Invalid email address.';
                        } else if (err.code === 'auth/too-many-requests') {
                            errorMsg = 'Too many requests. Please try again later.';
                        } else if (err.message) {
                            errorMsg = err.message;
                        }
                        showNotification(errorMsg, 'error');
                    });
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
        });
    }

    // Password Setup Form Submission
    const passwordForm = document.querySelector('.password-setup-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const password = document.getElementById('regPassword').value;
            const passwordConfirm = document.getElementById('regPasswordConfirm').value;

            if (!password || !passwordConfirm) {
                showNotification('Please fill in all fields.', 'error');
                return;
            }

            if (password.length < 6) {
                showNotification('Password must be at least 6 characters long.', 'error');
                return;
            }

            if (password !== passwordConfirm) {
                showNotification('Passwords do not match.', 'error');
                return;
            }

            if (!pendingRegistration) {
                showNotification('Session expired. Please start registration again.', 'error');
                closeRegister();
                return;
            }

            // Create Firebase Auth account
            if (window.firebase && firebase.auth) {
                showNotification('Creating your account...', 'info');
                
                firebase.auth().createUserWithEmailAndPassword(pendingRegistration.email, password)
                    .then((userCredential) => {
                        const user = userCredential.user;
                        
                        // Save additional user data to Firestore
                        const db = firebase.firestore();
                        const normalizedEmail = pendingRegistration.email.toLowerCase().trim();
                        const primaryUniqueId = pendingRegistration.uniqueId;
                        
                        return db.collection('users').doc(user.uid).set({
                            email: pendingRegistration.email,
                            name: pendingRegistration.name,
                            uniqueId: primaryUniqueId,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        }).then(() => {
                            // Always check emailToUids collection for associated uniqueIds
                            // This ensures we pick up all uniqueIds associated with this email
                                    return db.collection('emailToUids').doc(normalizedEmail).get()
                                        .then((emailToUidsDoc) => {
                                    // Collect all uniqueIds to process
                                    let allUniqueIds = [];
                                    
                                    if (emailToUidsDoc.exists) {
                                            const emailToUidsData = emailToUidsDoc.data();
                                            const uids = emailToUidsData.uids || [];
                                        allUniqueIds = [...uids];
                                    }
                                    
                                    // Always include the primary uniqueId if not already in the list
                                    if (primaryUniqueId && !allUniqueIds.includes(primaryUniqueId)) {
                                        allUniqueIds.push(primaryUniqueId);
                                    }
                                    
                                    // If no uniqueIds found, create a minimal associatedRegistrations with just the primary one
                                    if (allUniqueIds.length === 0 && primaryUniqueId) {
                                        allUniqueIds = [primaryUniqueId];
                                    }
                                    
                                    if (allUniqueIds.length === 0) {
                                        // No uniqueIds to process, mark as processed
                                        return db.collection('users').doc(user.uid).update({
                                            emailProcessed: true,
                                            emailProcessedAt: firebase.firestore.FieldValue.serverTimestamp()
                                        });
                                            }

                                            // Fetch registration documents for all uids
                                    const registrationPromises = allUniqueIds.map(uid => 
                                                db.collection('registrations').doc(uid).get()
                                                    .then((regDoc) => {
                                                        if (regDoc.exists) {
                                                            const regData = regDoc.data();
                                                            return {
                                                                uniqueId: regData.uniqueId || uid,
                                                        name: regData.name || regData['Full Name'] || '',
                                                        email: regData.email || regData['Email address'] || pendingRegistration.email
                                                    };
                                                } else {
                                                    // If registration doesn't exist, still create a basic entry from user data
                                                    return {
                                                        uniqueId: uid,
                                                        name: pendingRegistration.name || '',
                                                        email: pendingRegistration.email
                                                    };
                                                }
                                                    })
                                                    .catch((error) => {
                                                        console.error(`Error fetching registration for uid ${uid}:`, error);
                                                // Return basic entry even if fetch fails
                                                return {
                                                    uniqueId: uid,
                                                    name: pendingRegistration.name || '',
                                                    email: pendingRegistration.email
                                                };
                                                    })
                                            );

                                            return Promise.all(registrationPromises)
                                                .then((associatedRegistrations) => {
                                            // Filter out null values and ensure we have valid data
                                            const validRegistrations = associatedRegistrations
                                                .filter(reg => reg !== null && reg.uniqueId)
                                                // Remove duplicates based on uniqueId
                                                .filter((reg, index, self) => 
                                                    index === self.findIndex(r => r.uniqueId === reg.uniqueId)
                                                );
                                                    
                                                    // Update user document with associated registrations
                                                    return db.collection('users').doc(user.uid).update({
                                                        associatedRegistrations: validRegistrations,
                                                        emailProcessed: true,
                                                        emailProcessedAt: firebase.firestore.FieldValue.serverTimestamp()
                                                    });
                                                })
                                                .catch((error) => {
                                                    console.error('Error processing associated registrations:', error);
                                                    // Don't throw - user creation should still succeed
                                                    return null;
                                                });
                                        })
                                        .catch((error) => {
                                            console.error('Error checking emailToUids collection:', error);
                                    // Even if emailToUids check fails, ensure we have at least the primary uniqueId
                                    return db.collection('users').doc(user.uid).update({
                                        associatedRegistrations: [{
                                            uniqueId: primaryUniqueId,
                                            name: pendingRegistration.name || '',
                                            email: pendingRegistration.email
                                        }],
                                        emailProcessed: true,
                                        emailProcessedAt: firebase.firestore.FieldValue.serverTimestamp()
                                        });
                                });
                        });
                    })
                    .then(() => {
                        showNotification('Account created successfully! You are now logged in.', 'success');
                        closeRegister();
                        resetRegisterForm();
                        updateAuthUI();
                        // Redirect to Shibirarthi Info tab after registration
                        setTimeout(() => {
                            activateTab('shibirarthi');
                        }, 100);
                    })
                    .catch((error) => {
                        console.error('Registration error:', error);
                        let errorMessage = 'Registration failed. ';
                        
                        if (error.code === 'auth/email-already-in-use') {
                            errorMessage += 'This email is already registered. Please login instead.';
                            // Display error in modal
                            showRegisterError(errorMessage);
                            // Close register modal and open login modal after a short delay
                            setTimeout(() => {
                                closeRegister();
                                setTimeout(() => {
                                    openLogin();
                                    showNotification(errorMessage, 'error');
                                }, 300);
                            }, 2000); // Give user time to read the error
                        } else if (error.code === 'auth/invalid-email') {
                            errorMessage += 'Invalid email address.';
                            showRegisterError(errorMessage);
                        } else if (error.code === 'auth/weak-password') {
                            errorMessage += 'Password is too weak.';
                            showRegisterError(errorMessage);
                        } else {
                            errorMessage += error.message;
                            showRegisterError(errorMessage);
                        }
                    });
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
        });
    }
});

// Update UI based on auth state
function updateAuthUI() {
    // Wait for Firebase to be initialized
    waitForFirebase(function() {
        if (window.firebase && firebase.auth) {
            firebase.auth().onAuthStateChanged((user) => {
            const loginBtn = document.querySelector('.header-actions .login-btn');
            const homeNavItem = document.getElementById('homeNavItem');
            const aboutNavItem = document.getElementById('aboutNavItem');
            const mediaNavItem = document.getElementById('mediaNavItem');
            const shibirarthiNavItem = document.getElementById('shibirarthiNavItem');
            const myProfileNavItem = document.getElementById('myProfileNavItem');
            const myTransportationNavItem = document.getElementById('myTransportationNavItem');
            const myToursNavItem = document.getElementById('myToursNavItem');
            
            if (user) {
                // User is logged in
                if (loginBtn) {
                    loginBtn.textContent = 'Logout';
                    loginBtn.onclick = () => {
                        // Check if user is on protected tab, redirect to home if so
                        const currentHash = window.location.hash.substring(1);
                        if (isProtectedTab(currentHash)) {
                            window.history.pushState(null, null, '#home');
                            activateTab('home');
                        }
                        
                        firebase.auth().signOut().then(() => {
                            showNotification('Logged out successfully.', 'success');
                            updateAuthUI();
                        });
                    };
                }
                
                // Hide public tabs (Home, About, Media) when logged in
                if (homeNavItem) {
                    homeNavItem.style.display = 'none';
                }
                if (aboutNavItem) {
                    aboutNavItem.style.display = 'none';
                }
                if (mediaNavItem) {
                    mediaNavItem.style.display = 'none';
                }
                
                // Show protected tabs
                if (shibirarthiNavItem) {
                    shibirarthiNavItem.style.display = '';
                }
                if (myProfileNavItem) {
                    myProfileNavItem.style.display = '';
                    loadUserProfile(user);
                }
                if (myTransportationNavItem) {
                    myTransportationNavItem.style.display = '';
                    loadTransportationInfo(user);
                }
                if (myToursNavItem) {
                    myToursNavItem.style.display = '';
                    loadToursInfo(user);
                }
            } else {
                // User is logged out
                if (loginBtn) {
                    loginBtn.textContent = 'Login';
                    loginBtn.onclick = openLogin;
                }
                
                // Show public tabs (Home, About, Media) when logged out
                if (homeNavItem) {
                    homeNavItem.style.display = '';
                }
                if (aboutNavItem) {
                    aboutNavItem.style.display = '';
                }
                if (mediaNavItem) {
                    mediaNavItem.style.display = '';
                }
                
                // Hide protected tabs
                if (shibirarthiNavItem) {
                    shibirarthiNavItem.style.display = 'none';
                }
                if (myProfileNavItem) {
                    myProfileNavItem.style.display = 'none';
                }
                if (myTransportationNavItem) {
                    myTransportationNavItem.style.display = 'none';
                }
                if (myToursNavItem) {
                    myToursNavItem.style.display = 'none';
                }
                
                // If user is on protected tab, redirect to home
                const currentHash = window.location.hash.substring(1);
                if (isProtectedTab(currentHash)) {
                    window.history.pushState(null, null, '#home');
                    activateTab('home');
                }
            }
            });
        } else {
            // Firebase not available - show public tabs, hide protected tabs
            const homeNavItem = document.getElementById('homeNavItem');
            const aboutNavItem = document.getElementById('aboutNavItem');
            const mediaNavItem = document.getElementById('mediaNavItem');
            const shibirarthiNavItem = document.getElementById('shibirarthiNavItem');
            const myProfileNavItem = document.getElementById('myProfileNavItem');
            const myTransportationNavItem = document.getElementById('myTransportationNavItem');
            const myToursNavItem = document.getElementById('myToursNavItem');
            if (homeNavItem) homeNavItem.style.display = '';
            if (aboutNavItem) aboutNavItem.style.display = '';
            if (mediaNavItem) mediaNavItem.style.display = '';
            if (shibirarthiNavItem) shibirarthiNavItem.style.display = 'none';
            if (myProfileNavItem) myProfileNavItem.style.display = 'none';
            if (myTransportationNavItem) myTransportationNavItem.style.display = 'none';
            if (myToursNavItem) myToursNavItem.style.display = 'none';
        }
    });
}

// Helper function to extract profile data from registration document
function extractProfileData(data, userData = null, userEmail = '') {
    return {
        name: data.name || data['Full Name'] || userData?.name || '',
        email: data.email || data['Email address'] || userData?.email || userEmail || '',
        uniqueId: data.uniqueId || data['Praveshika ID'] || userData?.uniqueId || '',
        country: data.Country || data.country || data['Country of Current Residence'] || '',
        shreni: data.Shreni || data.shreni || data['Corrected Shreni'] || data['Default Shreni'] || data['Shreni for Sorting'] || '',
        barcode: data.Barcode || data.barcode || data.BarCode || data.uniqueId || data['Praveshika ID'] || '',
        phone: data.phone || data.Phone || data['Phone number on which you can be contacted in Bharat (by call or WhatsApp)'] || '',
        whatsapp: data['Whatsapp Number'] || data.whatsapp || '',
        address: data.address || data.Address || data['Current Address'] || '',
        city: data.city || data.City || data['City of Current Residence'] || '',
        state: data.state || data.State || data['State/Province'] || '',
        postalCode: data.postalCode || data['Postal Code'] || data.zipcode || '',
        gender: data.gender || data.Gender || '',
        age: data.age || data.Age || '',
        occupation: data.occupation || data['Occupation (e.g. Engineer/Business/Homemaker/Student)'] || '',
        educationalQual: data['Educational Qualification'] || data.educationalQualification || '',
        zone: data.Zone || data['Zone/Shreni'] || '',
        ganveshSize: data['Ganvesh Kurta Shoulder Size in cm (for swayamevaks and sevikas)'] || '',
        sanghYears: data['Associated with sangh for how many years/months'] || '',
        hssResponsibility: data['Do you have any responsibility in Hindu Swayamsevak Sangh?'] || '',
        currentResponsibility: data['What is your current responsibility in HSS or other organisation?'] || '',
        otherOrgResponsibility: data['Do you have any responsibility in any other organisation (e.g. VHP, Sewa International etc)?'] || '',
        shikshaVarg: data['Which Sangh Shiksha Varg have you completed'] || '',
        emergencyContactName: data['Emergency Contact Name'] || '',
        emergencyContactNumber: data['Emergency Contact Number'] || '',
        emergencyContactRelation: data['Relationship of Emergency Contact Person'] || '',
        pickupNeeded: data['Do you need a pickup on arrival?'] || '',
        dropoffNeeded: data['Do you need a drop off for departure?'] || ''
    };
}

// Helper function to format display value
                function formatValue(value) {
                    if (!value || value === '' || value === null || value === undefined) return 'Not provided';
                    const str = String(value).trim();
                    if (str === '' || str === 'null' || str === 'undefined') return 'Not provided';
                    return escapeHtml(str);
                }
                
// Helper function to create profile card HTML for a single person (for tabs - no collapse)
function createProfileCardHTML(profileData, index, isExpanded = false) {
    const { name, email, uniqueId, country, shreni, barcode, phone, whatsapp, address, city, state, postalCode,
            gender, age, occupation, educationalQual, zone, ganveshSize, sanghYears, hssResponsibility,
            currentResponsibility, otherOrgResponsibility, shikshaVarg, emergencyContactName,
            emergencyContactNumber, emergencyContactRelation, pickupNeeded, dropoffNeeded } = profileData;
    
                const safeName = escapeHtml(name || '');
                const safeUniqueId = escapeHtml(uniqueId || '');
                const safeCountry = escapeHtml(country || '');
                const safeShreni = escapeHtml(shreni || '');
                const safeBarcode = escapeHtml(barcode || uniqueId || '');
                
    return `
        <div class="profile-tab-pane ${isExpanded ? 'active' : ''}" id="profileTab${index}" style="display: ${isExpanded ? 'block' : 'none'};">
                <div class="user-profile-card-actions">
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); showBadge('${safeName}', '${safeCountry}', '${safeShreni}', '${safeBarcode}', '${safeUniqueId}');">
                            📇 View Badge
                        </button>
                    </div>
                    <div class="profile-tiles-container">
                        <div class="profile-tile">
                            <h4 class="tile-title">Personal Information</h4>
                            <div class="tile-content">
                                <div class="info-item">
                                    <span class="info-label">Full Name</span>
                                    <span class="info-value">${formatValue(name)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Email</span>
                                    <span class="info-value">${formatValue(email)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Phone (Bharat)</span>
                                    <span class="info-value">${formatValue(phone)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">WhatsApp Number</span>
                                    <span class="info-value">${formatValue(whatsapp)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Gender</span>
                                    <span class="info-value">${formatValue(gender)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Age</span>
                                    <span class="info-value">${formatValue(age)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="profile-tile">
                            <h4 class="tile-title">Registration Details</h4>
                            <div class="tile-content">
                                <div class="info-item">
                                    <span class="info-label">Praveshika ID</span>
                                    <span class="info-value">${formatValue(uniqueId)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Country</span>
                                    <span class="info-value">${formatValue(country)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">City of Residence</span>
                                    <span class="info-value">${formatValue(city)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Zone</span>
                                    <span class="info-value">${formatValue(zone)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Shreni</span>
                                    <span class="info-value">${formatValue(shreni)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="profile-tile">
                            <h4 class="tile-title">Professional & Educational</h4>
                            <div class="tile-content">
                                <div class="info-item">
                                    <span class="info-label">Occupation</span>
                                    <span class="info-value">${formatValue(occupation)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Educational Qualification</span>
                                    <span class="info-value">${formatValue(educationalQual)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="profile-tile">
                            <h4 class="tile-title">Sangh Association</h4>
                            <div class="tile-content">
                                <div class="info-item">
                                    <span class="info-label">Years/Months with Sangh</span>
                                    <span class="info-value">${formatValue(sanghYears)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Shiksha Varg Completed</span>
                                    <span class="info-value">${formatValue(shikshaVarg)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">HSS Responsibility</span>
                                    <span class="info-value">${formatValue(hssResponsibility)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Current Responsibility</span>
                                    <span class="info-value">${formatValue(currentResponsibility)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Other Organisation Responsibility</span>
                                    <span class="info-value">${formatValue(otherOrgResponsibility)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="profile-tile">
                            <h4 class="tile-title">Emergency Contact</h4>
                            <div class="tile-content">
                                <div class="info-item">
                                    <span class="info-label">Contact Name</span>
                                    <span class="info-value">${formatValue(emergencyContactName)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Contact Number</span>
                                    <span class="info-value">${formatValue(emergencyContactNumber)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Relationship</span>
                                    <span class="info-value">${formatValue(emergencyContactRelation)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="profile-tile">
                            <h4 class="tile-title">Event Details</h4>
                            <div class="tile-content">
                                <div class="info-item">
                                    <span class="info-label">Ganvesh Kurta Size (cm)</span>
                                    <span class="info-value">${formatValue(ganveshSize)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Pickup on Arrival</span>
                                    <span class="info-value">${formatValue(pickupNeeded)}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Drop off for Departure</span>
                                    <span class="info-value">${formatValue(dropoffNeeded)}</span>
                                </div>
                            </div>
                        </div>
                        ${address || state || postalCode ? `
                        <div class="profile-tile">
                            <h4 class="tile-title">Address Information</h4>
                            <div class="tile-content">
                                ${address ? `<div class="info-item">
                                    <span class="info-label">Address</span>
                                    <span class="info-value">${formatValue(address)}</span>
                                </div>` : ''}
                                ${state ? `<div class="info-item">
                                    <span class="info-label">State/Province</span>
                                    <span class="info-value">${formatValue(state)}</span>
                                </div>` : ''}
                                ${postalCode ? `<div class="info-item">
                                    <span class="info-label">Postal Code</span>
                                    <span class="info-value">${formatValue(postalCode)}</span>
                                </div>` : ''}
                            </div>
                        </div>` : ''}
                </div>
            </div>
        </div>
    `;
}

// Helper function to create profile tab button HTML - similar to tour tabs
function createProfileTabHTML(profileData, index, isActive = false) {
    const { name, uniqueId } = profileData;
    const displayName = name && name.trim() ? name : (uniqueId || 'Unknown User');
    
    return `
        <button class="profile-tab-btn ${isActive ? 'active' : ''}" onclick="switchProfileTab(${index})" data-tab-index="${index}">
            ${escapeHtml(displayName)}
        </button>
    `;
}

// Function to switch profile tabs
function switchProfileTab(index) {
    // Remove active class from all tab buttons first
    const tabButtons = document.querySelectorAll('.profile-tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all tab panes immediately
    const tabPanes = document.querySelectorAll('.profile-tab-pane');
    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
        // Ensure no residual styling
        pane.style.height = '';
        pane.style.overflow = '';
    });
    
    // Show selected tab pane
    const selectedPane = document.getElementById(`profileTab${index}`);
    if (selectedPane) {
        selectedPane.classList.add('active');
        selectedPane.style.display = 'block';
    }
    
    // Activate selected tab button
    const selectedButton = document.querySelector(`.profile-tab-btn[data-tab-index="${index}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    // Force a reflow to ensure layout updates immediately
    if (selectedPane) {
        selectedPane.offsetHeight;
    }
}

// Load user profile information
function loadUserProfile(user) {
    const profileInfo = document.getElementById('profileInfo');
    if (!profileInfo) return;
    
    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        
        // First get user document
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    profileInfo.innerHTML = '<p>Profile information not found.</p>';
                    return;
                }
                
                const userData = userDoc.data();
                const primaryUniqueId = userData.uniqueId;
                const userEmail = userData.email || user.email || '';
                const normalizedEmail = userEmail.toLowerCase().trim();
                
                // Check emailToUids collection to see if there are any new uniqueIds
                return db.collection('emailToUids').doc(normalizedEmail).get()
                    .then((emailToUidsDoc) => {
                        let allUniqueIds = [];
                        let needsUpdate = false;
                        
                        // Get uniqueIds from emailToUids if it exists
                        if (emailToUidsDoc.exists) {
                            const emailToUidsData = emailToUidsDoc.data();
                            const uidsFromEmailToUids = emailToUidsData.uids || [];
                            allUniqueIds = [...uidsFromEmailToUids];
                        }
                        
                        // Always include primary uniqueId
                        if (primaryUniqueId && !allUniqueIds.includes(primaryUniqueId)) {
                            allUniqueIds.push(primaryUniqueId);
                        }
                        
                        // Get current associated registrations
                        const associatedRegistrations = userData.associatedRegistrations || [];
                        const currentUniqueIds = associatedRegistrations.map(reg => reg.uniqueId).filter(Boolean);
                        
                        // Check if there are new uniqueIds that aren't in associatedRegistrations
                        const newUniqueIds = allUniqueIds.filter(uid => !currentUniqueIds.includes(uid));
                        const missingUniqueIds = currentUniqueIds.filter(uid => !allUniqueIds.includes(uid));
                        
                        // Always update if emailToUids exists and has uniqueIds (to use emailToUids as source of truth)
                        // Also update if there are new uniqueIds even if emailToUids doesn't exist
                        if (emailToUidsDoc.exists && allUniqueIds.length > 0) {
                            // Always update when emailToUids exists to ensure sync
                            needsUpdate = true;
                        } else if (newUniqueIds.length > 0) {
                            // Even if emailToUids doesn't exist, update if we have new uniqueIds
                            needsUpdate = true;
                        }
                        
                        // If we need to update, fetch all new registrations and update the user document
                        if (needsUpdate && allUniqueIds.length > 0) {
                            const updatePromises = allUniqueIds.map(uid => 
                                db.collection('registrations').doc(uid).get()
                                    .then(regDoc => {
                                        if (regDoc.exists) {
                                            const regData = regDoc.data();
                                            return {
                                                uniqueId: regData.uniqueId || uid,
                                                name: regData.name || regData['Full Name'] || '',
                                                email: regData.email || regData['Email address'] || userEmail
                                            };
                                        } else {
                                            return {
                                                uniqueId: uid,
                                                name: userData.name || '',
                                                email: userEmail
                                            };
                                        }
                                    })
                                    .catch(error => {
                                        console.error(`Error fetching registration for ${uid}:`, error);
                                        return {
                                            uniqueId: uid,
                                            name: userData.name || '',
                                            email: userEmail
                                        };
                                    })
                            );
                            
                            return Promise.all(updatePromises)
                                .then((updatedRegistrations) => {
                                    const validRegistrations = updatedRegistrations
                                        .filter(reg => reg !== null && reg.uniqueId)
                                        .filter((reg, index, self) => 
                                            index === self.findIndex(r => r.uniqueId === reg.uniqueId)
                                        );
                                    
                                    // Update user document with refreshed associated registrations
                                    return db.collection('users').doc(user.uid).update({
                                        associatedRegistrations: validRegistrations,
                                        emailProcessedAt: firebase.firestore.FieldValue.serverTimestamp()
                                    }).then(() => {
                                        // Return updated user data
                                        return { userData: { ...userData, associatedRegistrations: validRegistrations }, allUniqueIds };
                                    });
                                });
                        }
                        
                        // No update needed, use existing data
                        return { userData, allUniqueIds: allUniqueIds.length > 0 ? allUniqueIds : currentUniqueIds };
                    })
                    .catch((error) => {
                        console.error('Error checking emailToUids in loadUserProfile:', error);
                        // Continue with existing associatedRegistrations if emailToUids check fails
                        const associatedRegistrations = userData.associatedRegistrations || [];
                        const currentUniqueIds = associatedRegistrations.map(reg => reg.uniqueId).filter(Boolean);
                        if (primaryUniqueId && !currentUniqueIds.includes(primaryUniqueId)) {
                            currentUniqueIds.push(primaryUniqueId);
                        }
                        return { userData, allUniqueIds: currentUniqueIds };
                    });
            })
            .then(({ userData, allUniqueIds }) => {
                if (!userData) {
                    profileInfo.innerHTML = '<p>Profile information not found.</p>';
                    return;
                }
                
                const primaryUniqueId = userData.uniqueId;
                
                // Collect all uniqueIds to fetch (use allUniqueIds from emailToUids if available)
                const uniqueIdsToFetch = allUniqueIds.length > 0 ? [...allUniqueIds] : [];
                if (primaryUniqueId && !uniqueIdsToFetch.includes(primaryUniqueId)) {
                    uniqueIdsToFetch.push(primaryUniqueId);
                }
                
                // If still no uniqueIds, fall back to associated registrations
                if (uniqueIdsToFetch.length === 0) {
                    const associatedRegistrations = userData.associatedRegistrations || [];
                    associatedRegistrations.forEach(reg => {
                        if (reg.uniqueId && !uniqueIdsToFetch.includes(reg.uniqueId)) {
                            uniqueIdsToFetch.push(reg.uniqueId);
                        }
                    });
                }
                
                
                // Get userEmail for use in profile extraction
                const userEmail = userData.email || user.email || '';
                
                // If no uniqueIds found, try to use the user document itself
                if (uniqueIdsToFetch.length === 0) {
                    const profileData = extractProfileData(userData, userData, userEmail);
                    if (profileData.name || profileData.email) {
                        profileInfo.innerHTML = `
                            <div class="user-profiles-container">
                                ${createProfileCardHTML(profileData, 0, true)}
                            </div>
                        `;
                        return;
                    } else {
                        profileInfo.innerHTML = '<p>Profile information not found.</p>';
                        return;
                    }
                }
                
                // Fetch all registration documents
                const registrationPromises = uniqueIdsToFetch.map(uid => {
                    return db.collection('registrations').doc(uid).get()
                        .then(regDoc => {
                            return {
                                uniqueId: uid,
                                data: regDoc.exists ? regDoc.data() : null,
                                docId: regDoc.id
                            };
                        })
                        .catch(error => {
                            console.error(`Error fetching registration for "${uid}":`, error);
                            return { uniqueId: uid, data: null, docId: null };
                        });
                });
                
                return Promise.all(registrationPromises)
                    .then(registrationResults => {
                        
                        // Extract profile data for each registration
                        const profiles = [];
                        
                        // Get associated registrations data to use as fallback
                        const associatedRegistrations = userData.associatedRegistrations || [];
                        const associatedRegMap = new Map();
                        associatedRegistrations.forEach(reg => {
                            if (reg.uniqueId) {
                                associatedRegMap.set(reg.uniqueId, reg);
                            }
                        });
                        
                        registrationResults.forEach((result, index) => {
                            let profileData = null;
                            
                            if (result.data) {
                                // Use registration document data
                                profileData = extractProfileData(result.data, userData, userEmail);
                            } else {
                                // Registration document doesn't exist, try to use associated registration data
                                const associatedReg = associatedRegMap.get(result.uniqueId);
                                if (associatedReg) {
                                    // Create profile data from associated registration
                                    profileData = {
                                        uniqueId: result.uniqueId,
                                        name: associatedReg.name || userData.name || '',
                                        email: associatedReg.email || userEmail,
                                        country: '',
                                        shreni: '',
                                        barcode: result.uniqueId,
                                        phone: '',
                                        whatsapp: '',
                                        address: '',
                                        city: '',
                                        state: '',
                                        postalCode: '',
                                        gender: '',
                                        age: '',
                                        occupation: '',
                                        educationalQual: '',
                                        zone: '',
                                        ganveshSize: '',
                                        sanghYears: '',
                                        hssResponsibility: '',
                                        currentResponsibility: '',
                                        otherOrgResponsibility: '',
                                        shikshaVarg: '',
                                        emergencyContactName: '',
                                        emergencyContactNumber: '',
                                        emergencyContactRelation: '',
                                        pickupNeeded: '',
                                        dropoffNeeded: ''
                                    };
                                } else {
                                    // No registration document and no associatedReg data, create minimal profile
                                    profileData = {
                                        uniqueId: result.uniqueId,
                                        name: userData.name || '',
                                        email: userEmail,
                                        country: '',
                                        shreni: '',
                                        barcode: result.uniqueId,
                                        phone: '',
                                        whatsapp: '',
                                        address: '',
                                        city: '',
                                        state: '',
                                        postalCode: '',
                                        gender: '',
                                        age: '',
                                        occupation: '',
                                        educationalQual: '',
                                        zone: '',
                                        ganveshSize: '',
                                        sanghYears: '',
                                        hssResponsibility: '',
                                        currentResponsibility: '',
                                        otherOrgResponsibility: '',
                                        shikshaVarg: '',
                                        emergencyContactName: '',
                                        emergencyContactNumber: '',
                                        emergencyContactRelation: '',
                                        pickupNeeded: '',
                                        dropoffNeeded: ''
                                    };
                                }
                            }
                            
                            // Ensure uniqueId is set
                            if (!profileData.uniqueId && result.uniqueId) {
                                profileData.uniqueId = result.uniqueId;
                            }
                            
                            if (profileData && profileData.uniqueId) {
                                profiles.push(profileData);
                            }
                        });
                        
                        // If no profiles found, try primary user data
                        if (profiles.length === 0 && primaryUniqueId) {
                            const profileData = extractProfileData(userData, userData, userEmail);
                            if (profileData.name || profileData.email) {
                                profiles.push(profileData);
                            }
                        }
                        
                        // If still no profiles, show error
                        if (profiles.length === 0) {
                            console.error('No profiles found after all attempts');
                            profileInfo.innerHTML = '<p>Profile information not found.</p>';
                            return;
                        }
                        
                        
                        // Create tabs and tab panes
                        const tabsHTML = profiles.map((profile, index) => 
                            createProfileTabHTML(profile, index, index === 0)
                        ).join('');
                        
                        const panesHTML = profiles.map((profile, index) => 
                            createProfileCardHTML(profile, index, index === 0)
                        ).join('');
                        
                        profileInfo.innerHTML = `
                            <div class="profile-tabs-container">
                                <div class="profile-tabs">
                                    ${tabsHTML}
                                </div>
                                <div class="profile-tab-content">
                                    ${panesHTML}
                                </div>
                            </div>
                        `;
                    });
            })
            .catch((error) => {
                console.error('Error loading profile:', error);
                profileInfo.innerHTML = '<p>Error loading profile information.</p>';
            });
    }
}

// Helper function to create transportation card HTML for a single person
function createTransportationCardHTML(transportationData, index, isExpanded = false) {
    const { name, uniqueId, pickupLocation, arrivalDate, arrivalTime, flightTrainNumber,
            returnDate, returnTime, returnFlightTrainNumber } = transportationData;
    
    const safeName = escapeHtml(name || '');
    const safeUniqueId = escapeHtml(uniqueId || '');
    
    const hasArrivalInfo = pickupLocation || arrivalDate || arrivalTime || flightTrainNumber;
    const hasReturnInfo = returnDate || returnTime || returnFlightTrainNumber;
    const hasAnyInfo = hasArrivalInfo || hasReturnInfo;
    
    // Display name - use uniqueId if name is missing or just "User {uniqueId}"
    const displayName = name && !name.startsWith('User ') ? name : (uniqueId || 'Unknown User');
    
    return `
        <div class="user-profile-card ${isExpanded ? 'expanded' : ''}" data-card-index="${index}">
            <div class="user-profile-card-header" onclick="toggleTransportationCard(${index})">
                <div class="user-profile-card-summary">
                    <div class="user-profile-name">
                        <strong>${formatValue(displayName)}</strong>
                        ${uniqueId ? `<span class="user-profile-id">ID: ${formatValue(uniqueId)}</span>` : ''}
                    </div>
                    <div class="user-profile-basic-info">
                        ${hasArrivalInfo ? `<span class="user-profile-badge">Arrival Info</span>` : ''}
                        ${hasReturnInfo ? `<span class="user-profile-badge">Return Info</span>` : ''}
                        ${!hasAnyInfo ? `<span class="user-profile-badge" style="background: #dc3545;">Missing Info</span>` : ''}
                    </div>
                </div>
                <div class="user-profile-card-toggle">
                    <span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>
                </div>
            </div>
            <div class="user-profile-card-content" style="display: ${isExpanded ? 'block' : 'none'};">
                <div class="user-profile-card-actions">
                    ${hasArrivalInfo ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); editTransportationArrival('${safeUniqueId}');">✏️ Edit Arrival</button>` : ''}
                    ${hasReturnInfo ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); editTransportationReturn('${safeUniqueId}');">✏️ Edit Return</button>` : ''}
                    ${!hasArrivalInfo ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); editTransportationArrival('${safeUniqueId}');">✏️ Add Arrival</button>` : ''}
                    ${!hasReturnInfo ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); editTransportationReturn('${safeUniqueId}');">✏️ Add Return</button>` : ''}
                </div>
                <div class="transportation-display">
                    <div class="transportation-section">
                        <h4 class="section-title">🛬 Arrival Information</h4>
                        ${hasArrivalInfo ? `
                        <div class="info-item">
                            <span class="info-label">Pickup Location:</span>
                            <span class="info-value">${formatValue(pickupLocation) || 'Not specified'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${formatValue(arrivalDate) || 'Not specified'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Time:</span>
                            <span class="info-value">${formatValue(arrivalTime) || 'Not specified'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Flight/Train Number:</span>
                            <span class="info-value">${formatValue(flightTrainNumber) || 'Not specified'}</span>
                        </div>
                        ` : '<p class="no-info">No arrival information provided</p>'}
                    </div>
                    <div class="transportation-section">
                        <h4 class="section-title">🛫 Return Information</h4>
                        ${hasReturnInfo ? `
                        <div class="info-item">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${formatValue(returnDate) || 'Not specified'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Time:</span>
                            <span class="info-value">${formatValue(returnTime) || 'Not specified'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Flight/Train Number:</span>
                            <span class="info-value">${formatValue(returnFlightTrainNumber) || 'Not specified'}</span>
                        </div>
                        ` : '<p class="no-info">No return information provided</p>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Global function to toggle transportation card expand/collapse
function toggleTransportationCard(index) {
    const card = document.querySelector(`.user-profile-card[data-card-index="${index}"]`);
    if (!card) return;
    
    const content = card.querySelector('.user-profile-card-content');
    const toggleIcon = card.querySelector('.toggle-icon');
    const isExpanded = card.classList.contains('expanded');
    
    if (isExpanded) {
        card.classList.remove('expanded');
        content.style.display = 'none';
        if (toggleIcon) toggleIcon.textContent = '▶';
    } else {
        card.classList.add('expanded');
        content.style.display = 'block';
        if (toggleIcon) toggleIcon.textContent = '▼';
    }
}

// Load transportation information
function loadTransportationInfo(user) {
    const transportationInfo = document.getElementById('transportationInfo');
    if (!transportationInfo) return;
    
    // Reset edit mode
    transportationInfo.dataset.editMode = 'false';
    
    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        
        // First get user document
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    transportationInfo.innerHTML = '<p>Transportation information not found.</p>';
                    return;
                }
                
                const userData = userDoc.data();
                const primaryUniqueId = userData.uniqueId;
                const userEmail = userData.email || user.email || '';
                const normalizedEmail = userEmail.toLowerCase().trim();
                
                // Check emailToUids collection to get all uniqueIds for this email
                return db.collection('emailToUids').doc(normalizedEmail).get()
                    .then((emailToUidsDoc) => {
                        let allUniqueIds = [];
                        
                        // Get uniqueIds from emailToUids if it exists
                        if (emailToUidsDoc.exists) {
                            const emailToUidsData = emailToUidsDoc.data();
                            const uidsFromEmailToUids = emailToUidsData.uids || [];
                            allUniqueIds = [...uidsFromEmailToUids];
                        }
                        
                        // Always include primary uniqueId
                        if (primaryUniqueId && !allUniqueIds.includes(primaryUniqueId)) {
                            allUniqueIds.push(primaryUniqueId);
                        }
                        
                        // If still no uniqueIds, fall back to associated registrations
                        if (allUniqueIds.length === 0) {
                            const associatedRegistrations = userData.associatedRegistrations || [];
                            associatedRegistrations.forEach(reg => {
                                if (reg.uniqueId && !allUniqueIds.includes(reg.uniqueId)) {
                                    allUniqueIds.push(reg.uniqueId);
                                }
                            });
                        }
                        
                        return { userData, allUniqueIds };
                    })
                    .catch((error) => {
                        console.error('Error checking emailToUids in loadTransportationInfo:', error);
                        // Continue with existing associatedRegistrations if emailToUids check fails
                        const associatedRegistrations = userData.associatedRegistrations || [];
                        const currentUniqueIds = associatedRegistrations.map(reg => reg.uniqueId).filter(Boolean);
                        if (primaryUniqueId && !currentUniqueIds.includes(primaryUniqueId)) {
                            currentUniqueIds.push(primaryUniqueId);
                        }
                        return { userData, allUniqueIds: currentUniqueIds };
                    });
            })
            .then(({ userData, allUniqueIds }) => {
                if (!userData) {
                    transportationInfo.innerHTML = '<p>Transportation information not found.</p>';
                    return;
                }
                
                // Collect all uniqueIds to fetch
                const uniqueIdsToFetch = allUniqueIds.length > 0 ? [...allUniqueIds] : [];
                const primaryUniqueId = userData.uniqueId;
                if (primaryUniqueId && !uniqueIdsToFetch.includes(primaryUniqueId)) {
                    uniqueIdsToFetch.push(primaryUniqueId);
                }
                
                // If still no uniqueIds, show error
                if (uniqueIdsToFetch.length === 0) {
                    transportationInfo.innerHTML = '<p>Error: User unique ID not found.</p>';
                    return;
                }
                
                // Get associated registrations for name lookup fallback
                const associatedRegistrations = userData.associatedRegistrations || [];
                const nameLookup = {};
                associatedRegistrations.forEach(reg => {
                    if (reg.uniqueId && reg.name) {
                        nameLookup[reg.uniqueId] = reg.name;
                    }
                });
                
                // Fetch all registration documents for transportation info
                const registrationPromises = uniqueIdsToFetch.map(uid => {
                    return db.collection('registrations').doc(uid).get()
                        .then(regDoc => {
                            if (regDoc.exists) {
                                const regData = regDoc.data();
                                // Try to get name from registration, then from associatedRegistrations, then use uniqueId as fallback
                                const name = regData.name || regData['Full Name'] || nameLookup[uid] || `User ${uid}`;
                                
                                // Map Excel field names to display names (handle various possible field names)
                                const pickupLocation = regData.pickupLocation || regData['Pickup Location'] || regData['PickupLocation'] || '';
                                const arrivalDate = regData.arrivalDate || regData['Arrival Date'] || regData['ArrivalDate'] || '';
                                const arrivalTime = regData.arrivalTime || regData['Arrival Time'] || regData['ArrivalTime'] || '';
                                const flightTrainNumber = regData.flightTrainNumber || regData['Flight/Train Number'] || regData['FlightTrainNumber'] || regData['Flight Number'] || '';
                                const returnDate = regData.returnDate || regData['Return Date'] || regData['ReturnDate'] || '';
                                const returnTime = regData.returnTime || regData['Return Time'] || regData['ReturnTime'] || '';
                                const returnFlightTrainNumber = regData.returnFlightTrainNumber || regData['Return Flight/Train Number'] || regData['ReturnFlightTrainNumber'] || '';
                                
                                return {
                                    uniqueId: uid,
                                    name: name,
                                    pickupLocation,
                                    arrivalDate,
                                    arrivalTime,
                                    flightTrainNumber,
                                    returnDate,
                                    returnTime,
                                    returnFlightTrainNumber
                                };
                            } else {
                                // Use name from associatedRegistrations if available, otherwise use uniqueId as identifier
                                const name = nameLookup[uid] || `User ${uid}`;
                                return {
                                    uniqueId: uid,
                                    name: name,
                                    pickupLocation: '',
                                    arrivalDate: '',
                                    arrivalTime: '',
                                    flightTrainNumber: '',
                                    returnDate: '',
                                    returnTime: '',
                                    returnFlightTrainNumber: ''
                                };
                            }
                        })
                        .catch(error => {
                            console.error(`Error fetching registration for ${uid}:`, error);
                            // Use name from associatedRegistrations if available, otherwise use uniqueId as identifier
                            const name = nameLookup[uid] || `User ${uid}`;
                            return {
                                uniqueId: uid,
                                name: name,
                                pickupLocation: '',
                                arrivalDate: '',
                                arrivalTime: '',
                                flightTrainNumber: '',
                                returnDate: '',
                                returnTime: '',
                                returnFlightTrainNumber: ''
                            };
                        });
                });
                
                return Promise.all(registrationPromises);
            })
            .then((transportationDataArray) => {
                // Filter out null results and ensure we have valid data with uniqueId
                const validData = transportationDataArray.filter(data => data && data.uniqueId);
                
                if (validData.length === 0) {
                    transportationInfo.innerHTML = '<p>No users found associated with this account.</p>';
                    return;
                }
                
                // Create cards for each person - always show all cards even if no transportation info
                const cardsHTML = validData.map((data, index) => 
                    createTransportationCardHTML(data, index, index === 0)
                ).join('');
                
                transportationInfo.innerHTML = `
                    <div class="user-profiles-container">
                        ${cardsHTML}
                    </div>
                `;
            })
            .catch((error) => {
                console.error('Error loading transportation info:', error);
                transportationInfo.innerHTML = '<p>Error loading transportation information.</p>';
            });
    }
}

// Edit only arrival information
function editTransportationArrival(uniqueId) {
    editTransportationSection(uniqueId, 'arrival');
}

// Edit only return information
function editTransportationReturn(uniqueId) {
    editTransportationSection(uniqueId, 'return');
}

// Edit transportation section (arrival or return only)
function editTransportationSection(uniqueId, section) {
    const transportationInfo = document.getElementById('transportationInfo');
    if (!transportationInfo || !uniqueId) return;

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('registrations').doc(uniqueId).get()
            .then((regDoc) => {
                const data = regDoc.exists ? regDoc.data() : {};
                
                const pickupLocation = data.pickupLocation || data['Pickup Location'] || data['PickupLocation'] || '';
                const arrivalDate = data.arrivalDate || data['Arrival Date'] || data['ArrivalDate'] || '';
                const arrivalTime = data.arrivalTime || data['Arrival Time'] || data['ArrivalTime'] || '';
                const flightTrainNumber = data.flightTrainNumber || data['Flight/Train Number'] || data['FlightTrainNumber'] || data['Flight Number'] || '';
                const returnDate = data.returnDate || data['Return Date'] || data['ReturnDate'] || '';
                const returnTime = data.returnTime || data['Return Time'] || data['ReturnTime'] || '';
                const returnFlightTrainNumber = data.returnFlightTrainNumber || data['Return Flight/Train Number'] || data['ReturnFlightTrainNumber'] || '';

                if (section === 'arrival') {
                    transportationInfo.innerHTML = `
                        <h3>Edit Arrival Information</h3>
                        <form id="transportationForm" class="transportation-form">
                            <div class="transportation-section-form">
                                <h4>Arrival Details</h4>
                                <p class="form-note">All fields are required.</p>
                                <div class="form-group">
                                    <label for="pickupLocation">Pickup Location: <span class="required">*</span></label>
                                    <select id="pickupLocation" onchange="handlePickupLocationChange(); validateTransportationSection('arrival');" required>
                                        <option value="">Select pickup location</option>
                                        <option value="Rajiv Gandhi International Airport (RGIA)" ${pickupLocation === 'Rajiv Gandhi International Airport (RGIA)' ? 'selected' : ''}>Rajiv Gandhi International Airport (RGIA)</option>
                                        <option value="Secunderabad Railway Station" ${pickupLocation === 'Secunderabad Railway Station' ? 'selected' : ''}>Secunderabad Railway Station</option>
                                        <option value="Nampally Railway Station" ${pickupLocation === 'Nampally Railway Station' ? 'selected' : ''}>Nampally Railway Station</option>
                                        <option value="Kacheguda Railway Station" ${pickupLocation === 'Kacheguda Railway Station' ? 'selected' : ''}>Kacheguda Railway Station</option>
                                        <option value="Cherlapally Railway Station" ${pickupLocation === 'Cherlapally Railway Station' ? 'selected' : ''}>Cherlapally Railway Station</option>
                                        <option value="Lingampally Railway Station" ${pickupLocation === 'Lingampally Railway Station' ? 'selected' : ''}>Lingampally Railway Station</option>
                                        <option value="Mahatma Gandhi Bus Station (MGBS)" ${pickupLocation === 'Mahatma Gandhi Bus Station (MGBS)' ? 'selected' : ''}>Mahatma Gandhi Bus Station (MGBS)</option>
                                        <option value="Jubilee Bus Station (JBS)" ${pickupLocation === 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Jubilee Bus Station (JBS)</option>
                                        <option value="Other" ${pickupLocation !== '' && pickupLocation !== 'Rajiv Gandhi International Airport (RGIA)' && pickupLocation !== 'Secunderabad Railway Station' && pickupLocation !== 'Nampally Railway Station' && pickupLocation !== 'Kacheguda Railway Station' && pickupLocation !== 'Cherlapally Railway Station' && pickupLocation !== 'Lingampally Railway Station' && pickupLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && pickupLocation !== 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Other</option>
                                    </select>
                                    <div id="pickupLocationOtherContainer" style="display: none; margin-top: 0.5rem;">
                                        <input type="text" id="pickupLocationOther" placeholder="Please specify other location" value="${pickupLocation !== '' && pickupLocation !== 'Rajiv Gandhi International Airport (RGIA)' && pickupLocation !== 'Secunderabad Railway Station' && pickupLocation !== 'Nampally Railway Station' && pickupLocation !== 'Kacheguda Railway Station' && pickupLocation !== 'Cherlapally Railway Station' && pickupLocation !== 'Lingampally Railway Station' && pickupLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && pickupLocation !== 'Jubilee Bus Station (JBS)' ? pickupLocation : ''}" onchange="validateTransportationSection('arrival')">
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="arrivalDate">Arrival Date: <span class="required">*</span></label>
                                    <input type="date" id="arrivalDate" value="${arrivalDate}" onchange="validateTransportationSection('arrival')" required>
                                </div>
                                <div class="form-group">
                                    <label for="arrivalTime">Arrival Time: <span class="required">*</span></label>
                                    <input type="time" id="arrivalTime" value="${arrivalTime}" onchange="validateTransportationSection('arrival')" required>
                                </div>
                                <div class="form-group">
                                    <label for="flightTrainNumber">Flight/Train Number: <span class="required">*</span></label>
                                    <input type="text" id="flightTrainNumber" value="${flightTrainNumber}" placeholder="e.g., AI 202, 12345" onchange="validateTransportationSection('arrival')" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Save Arrival Details</button>
                                <button type="button" class="btn btn-secondary" onclick="loadTransportationInfo(firebase.auth().currentUser)">❌ Cancel</button>
                            </div>
                        </form>
                    `;
                } else {
                    transportationInfo.innerHTML = `
                        <h3>Edit Return Information</h3>
                        <form id="transportationForm" class="transportation-form">
                            <div class="transportation-section-form">
                                <h4>Return Details</h4>
                                <p class="form-note">All fields are required.</p>
                                <div class="form-group">
                                    <label for="returnDate">Return Date: <span class="required">*</span></label>
                                    <input type="date" id="returnDate" value="${returnDate}" onchange="validateTransportationSection('return')" required>
                                </div>
                                <div class="form-group">
                                    <label for="returnTime">Return Time: <span class="required">*</span></label>
                                    <input type="time" id="returnTime" value="${returnTime}" onchange="validateTransportationSection('return')" required>
                                </div>
                                <div class="form-group">
                                    <label for="returnFlightTrainNumber">Return Flight/Train Number: <span class="required">*</span></label>
                                    <input type="text" id="returnFlightTrainNumber" value="${returnFlightTrainNumber}" placeholder="e.g., AI 203, 12346" onchange="validateTransportationSection('return')" required>
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Save Return Details</button>
                                <button type="button" class="btn btn-secondary" onclick="loadTransportationInfo(firebase.auth().currentUser)">❌ Cancel</button>
                            </div>
                        </form>
                    `;
                }

                // Add form submit handler
                const form = document.getElementById('transportationForm');
                if (form) {
                    // Initial validation on form load
                    setTimeout(() => {
                        validateTransportationSection(section);
                    }, 100);
                    
                    form.addEventListener('submit', function(e) {
                        e.preventDefault();
                        
                        // Validate all required fields before saving
                        if (section === 'arrival') {
                            const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
                            const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
                            const pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
                            const arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
                            const arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
                            const flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
                            
                            if (!pickupLocation || !arrivalDate || !arrivalTime || !flightTrainNumber) {
                                showNotification('Please fill all arrival details: Pickup Location, Date, Time, and Flight/Train Number are required.', 'error');
                                validateTransportationSection('arrival');
                                return;
                            }
                            
                            if (pickupLocationSelect === 'Other' && !pickupLocationOther) {
                                showNotification('Please specify the other pickup location.', 'error');
                                return;
                            }
                        } else if (section === 'return') {
                            const returnDate = document.getElementById('returnDate')?.value.trim() || '';
                            const returnTime = document.getElementById('returnTime')?.value.trim() || '';
                            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
                            
                            if (!returnDate || !returnTime || !returnFlightTrainNumber) {
                                showNotification('Please fill all return details: Date, Time, and Flight/Train Number are required.', 'error');
                                validateTransportationSection('return');
                                return;
                            }
                        }
                        
                        saveTransportationSection(uniqueId, section);
                    });
                }
            })
            .catch((error) => {
                console.error('Error loading transportation form:', error);
                showNotification('Error loading form. Please try again.', 'error');
            });
    }
}

// Edit transportation information
function editTransportation(uniqueId) {
    const transportationInfo = document.getElementById('transportationInfo');
    if (!transportationInfo || !uniqueId) return;

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('registrations').doc(uniqueId).get()
            .then((regDoc) => {
                const data = regDoc.exists ? regDoc.data() : {};
                
                const pickupLocation = data.pickupLocation || data['Pickup Location'] || data['PickupLocation'] || '';
                const arrivalDate = data.arrivalDate || data['Arrival Date'] || data['ArrivalDate'] || '';
                const arrivalTime = data.arrivalTime || data['Arrival Time'] || data['ArrivalTime'] || '';
                const flightTrainNumber = data.flightTrainNumber || data['Flight/Train Number'] || data['FlightTrainNumber'] || data['Flight Number'] || '';
                const returnDate = data.returnDate || data['Return Date'] || data['ReturnDate'] || '';
                const returnTime = data.returnTime || data['Return Time'] || data['ReturnTime'] || '';
                const returnFlightTrainNumber = data.returnFlightTrainNumber || data['Return Flight/Train Number'] || data['ReturnFlightTrainNumber'] || '';

                transportationInfo.innerHTML = `
                    <h3>Edit Transportation Details</h3>
                    <form id="transportationForm" class="transportation-form">
                        <div class="transportation-section-form">
                            <h4>🛬 Arrival Information</h4>
                            <p class="form-note">If you enter any arrival detail, all arrival fields are required.</p>
                            <div class="form-group">
                                <label for="pickupLocation">Pickup Location:</label>
                                <select id="pickupLocation" onchange="handlePickupLocationChange(); validateTransportationSection('arrival');">
                                    <option value="">Select pickup location</option>
                                    <option value="Rajiv Gandhi International Airport (RGIA)" ${pickupLocation === 'Rajiv Gandhi International Airport (RGIA)' ? 'selected' : ''}>Rajiv Gandhi International Airport (RGIA)</option>
                                    <option value="Secunderabad Railway Station" ${pickupLocation === 'Secunderabad Railway Station' ? 'selected' : ''}>Secunderabad Railway Station</option>
                                    <option value="Nampally Railway Station" ${pickupLocation === 'Nampally Railway Station' ? 'selected' : ''}>Nampally Railway Station</option>
                                    <option value="Kacheguda Railway Station" ${pickupLocation === 'Kacheguda Railway Station' ? 'selected' : ''}>Kacheguda Railway Station</option>
                                    <option value="Cherlapally Railway Station" ${pickupLocation === 'Cherlapally Railway Station' ? 'selected' : ''}>Cherlapally Railway Station</option>
                                    <option value="Lingampally Railway Station" ${pickupLocation === 'Lingampally Railway Station' ? 'selected' : ''}>Lingampally Railway Station</option>
                                    <option value="Mahatma Gandhi Bus Station (MGBS)" ${pickupLocation === 'Mahatma Gandhi Bus Station (MGBS)' ? 'selected' : ''}>Mahatma Gandhi Bus Station (MGBS)</option>
                                    <option value="Jubilee Bus Station (JBS)" ${pickupLocation === 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Jubilee Bus Station (JBS)</option>
                                    <option value="Other" ${pickupLocation !== '' && pickupLocation !== 'Rajiv Gandhi International Airport (RGIA)' && pickupLocation !== 'Secunderabad Railway Station' && pickupLocation !== 'Nampally Railway Station' && pickupLocation !== 'Kacheguda Railway Station' && pickupLocation !== 'Cherlapally Railway Station' && pickupLocation !== 'Lingampally Railway Station' && pickupLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && pickupLocation !== 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Other</option>
                                </select>
                                <div id="pickupLocationOtherContainer" style="display: none; margin-top: 0.5rem;">
                                    <input type="text" id="pickupLocationOther" placeholder="Please specify other location" value="${pickupLocation !== '' && pickupLocation !== 'Rajiv Gandhi International Airport (RGIA)' && pickupLocation !== 'Secunderabad Railway Station' && pickupLocation !== 'Nampally Railway Station' && pickupLocation !== 'Kacheguda Railway Station' && pickupLocation !== 'Cherlapally Railway Station' && pickupLocation !== 'Lingampally Railway Station' && pickupLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && pickupLocation !== 'Jubilee Bus Station (JBS)' ? pickupLocation : ''}" onchange="validateTransportationSection('arrival')">
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="arrivalDate">Arrival Date:</label>
                                <input type="date" id="arrivalDate" value="${arrivalDate}" onchange="validateTransportationSection('arrival')">
                            </div>
                            <div class="form-group">
                                <label for="arrivalTime">Arrival Time:</label>
                                <input type="time" id="arrivalTime" value="${arrivalTime}" onchange="validateTransportationSection('arrival')">
                            </div>
                            <div class="form-group">
                                <label for="flightTrainNumber">Flight/Train Number:</label>
                                <input type="text" id="flightTrainNumber" value="${flightTrainNumber}" placeholder="e.g., AI 202, 12345" onchange="validateTransportationSection('arrival')">
                            </div>
                        </div>
                        <div class="transportation-section-form">
                            <h4>🛫 Return Information</h4>
                            <p class="form-note">If you enter any return detail, all return fields are required.</p>
                            <div class="form-group">
                                <label for="returnDate">Return Date:</label>
                                <input type="date" id="returnDate" value="${returnDate}" onchange="validateTransportationSection('return')">
                            </div>
                            <div class="form-group">
                                <label for="returnTime">Return Time:</label>
                                <input type="time" id="returnTime" value="${returnTime}" onchange="validateTransportationSection('return')">
                            </div>
                            <div class="form-group">
                                <label for="returnFlightTrainNumber">Return Flight/Train Number:</label>
                                <input type="text" id="returnFlightTrainNumber" value="${returnFlightTrainNumber}" placeholder="e.g., AI 203, 12346" onchange="validateTransportationSection('return')">
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary" id="saveTransportationBtn">💾 Save Changes</button>
                            <button type="button" class="btn btn-secondary" onclick="loadTransportationInfo(firebase.auth().currentUser)">❌ Cancel</button>
                        </div>
                    </form>
                `;

                // Add form submit handler
                const form = document.getElementById('transportationForm');
                if (form) {
                    // Initial validation on form load
                    setTimeout(() => {
                        validateTransportationSection('arrival');
                        validateTransportationSection('return');
                    }, 100);
                    
                    form.addEventListener('submit', function(e) {
                        e.preventDefault();
                        
                        // Validate before saving
                        const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
                        const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
                        const pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
                        const arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
                        const arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
                        const flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
                        const returnDate = document.getElementById('returnDate')?.value.trim() || '';
                        const returnTime = document.getElementById('returnTime')?.value.trim() || '';
                        const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
                        
                        // Check arrival validation
                        const hasArrivalPartial = pickupLocation || arrivalDate || arrivalTime || flightTrainNumber;
                        const hasArrivalAll = pickupLocation && arrivalDate && arrivalTime && flightTrainNumber;
                        if (hasArrivalPartial && !hasArrivalAll) {
                            showNotification('Please fill all arrival details (Pickup Location, Date, Time, and Flight/Train Number) or leave all empty.', 'error');
                            validateTransportationSection('arrival');
                            return;
                        }
                        
                        // Check return validation
                        const hasReturnPartial = returnDate || returnTime || returnFlightTrainNumber;
                        const hasReturnAll = returnDate && returnTime && returnFlightTrainNumber;
                        if (hasReturnPartial && !hasReturnAll) {
                            showNotification('Please fill all return details (Date, Time, and Flight/Train Number) or leave all empty.', 'error');
                            validateTransportationSection('return');
                            return;
                        }
                        
                        // All validations passed, save
                        saveTransportationInfo(uniqueId);
                    });
                }
            })
            .catch((error) => {
                console.error('Error loading transportation form:', error);
                showNotification('Error loading form. Please try again.', 'error');
            });
    }
}

// Save transportation information
function saveTransportationInfo(uniqueId) {
    if (!uniqueId) {
        showNotification('Error: Unique ID not found.', 'error');
        return;
    }

    const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
    const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
    const pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
    const arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
    const arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
    const flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
    const returnDate = document.getElementById('returnDate')?.value.trim() || '';
    const returnTime = document.getElementById('returnTime')?.value.trim() || '';
    const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';

    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('You must be logged in to save transportation details.', 'error');
        return;
    }

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        
        showNotification('Saving transportation details...', 'info');

        // First verify the user's uniqueId matches (security check)
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    throw new Error('User document not found');
                }
                const userData = userDoc.data();
                const userUniqueId = userData.uniqueId;
                
                // Verify the uniqueId matches (normalized comparison)
                if (normalizePraveshikaId(userUniqueId) !== normalizePraveshikaId(uniqueId)) {
                    throw new Error('You can only update your own transportation information.');
                }

                // Get the existing document to preserve all fields
                return db.collection('registrations').doc(uniqueId).get()
                    .then((doc) => {
                        if (!doc.exists) {
                            throw new Error('Registration not found');
                        }
                        
                        const existingData = doc.data();
                        
                        // Prepare update data - use set with merge to handle special characters in field names
                        // Firestore update() doesn't allow '/' in field names, so we use set() with merge
                        const updateData = {
                            ...existingData, // Preserve all existing fields
                            pickupLocation: pickupLocation || '',
                            arrivalDate: arrivalDate || '',
                            arrivalTime: arrivalTime || '',
                            flightTrainNumber: flightTrainNumber || '',
                            returnDate: returnDate || '',
                            returnTime: returnTime || '',
                            returnFlightTrainNumber: returnFlightTrainNumber || '',
                            transportationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        // Update Excel column names (with special characters) only if they exist
                        // Use set() with merge instead of update() to handle special characters
                        const fieldsToUpdate = {};
                        
                        // Check which Excel fields exist and update them
                        if (existingData.hasOwnProperty('Pickup Location')) {
                            fieldsToUpdate['Pickup Location'] = pickupLocation || '';
                        }
                        if (existingData.hasOwnProperty('Arrival Date')) {
                            fieldsToUpdate['Arrival Date'] = arrivalDate || '';
                        }
                        if (existingData.hasOwnProperty('Arrival Time')) {
                            fieldsToUpdate['Arrival Time'] = arrivalTime || '';
                        }
                        if (existingData.hasOwnProperty('Flight/Train Number')) {
                            fieldsToUpdate['Flight/Train Number'] = flightTrainNumber || '';
                        }
                        if (existingData.hasOwnProperty('Return Date')) {
                            fieldsToUpdate['Return Date'] = returnDate || '';
                        }
                        if (existingData.hasOwnProperty('Return Time')) {
                            fieldsToUpdate['Return Time'] = returnTime || '';
                        }
                        if (existingData.hasOwnProperty('Return Flight/Train Number')) {
                            fieldsToUpdate['Return Flight/Train Number'] = returnFlightTrainNumber || '';
                        }
                        
                        // Use set with merge: true to handle fields with special characters
                        return db.collection('registrations').doc(uniqueId).set({
                            ...updateData,
                            ...fieldsToUpdate
                        }, { merge: true });
                    });
            })
            .then(() => {
                showNotification('Transportation details saved successfully!', 'success');
                // Reload transportation info
                if (user) {
                    loadTransportationInfo(user);
                }
            })
            .catch((error) => {
                console.error('Error saving transportation info:', error);
                let errorMsg = 'Error saving transportation details. Please try again.';
                if (error.code === 'permission-denied') {
                    errorMsg = 'Permission denied. You can only update your own transportation information.';
                } else if (error.message) {
                    errorMsg = error.message;
                }
                showNotification(errorMsg, 'error');
            });
    }
}

// Save transportation section (arrival or return only)
function saveTransportationSection(uniqueId, section) {
    if (!uniqueId) {
        showNotification('Error: Unique ID not found.', 'error');
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('You must be logged in to save transportation details.', 'error');
        return;
    }

    let arrivalDate = '';
    let arrivalTime = '';
    let flightTrainNumber = '';
    let returnDate = '';
    let returnTime = '';
    let returnFlightTrainNumber = '';
    let pickupLocation = '';

    if (section === 'arrival') {
        const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
        const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
        pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
        arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
        arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
        flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
        
        // Validate all arrival fields are filled (including pickup location)
        if (!pickupLocation || !arrivalDate || !arrivalTime || !flightTrainNumber) {
            showNotification('Please fill all arrival details: Pickup Location, Date, Time, and Flight/Train Number are required.', 'error');
            return;
        }
        
        // Validate "Other" option requires text input
        if (pickupLocationSelect === 'Other' && !pickupLocationOther) {
            showNotification('Please specify the other pickup location.', 'error');
            return;
        }
    } else if (section === 'return') {
        returnDate = document.getElementById('returnDate')?.value.trim() || '';
        returnTime = document.getElementById('returnTime')?.value.trim() || '';
        returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
        
        // Validate all return fields are filled
        if (!returnDate || !returnTime || !returnFlightTrainNumber) {
            showNotification('Please fill all return details: Date, Time, and Flight/Train Number are required.', 'error');
            return;
        }
    }

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        
        showNotification('Saving transportation details...', 'info');

        // First verify the user's uniqueId matches (security check - allow any uniqueId associated with this email)
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    throw new Error('User document not found');
                }
                const userData = userDoc.data();
                const userUniqueId = userData.uniqueId;
                const userEmail = userData.email || user.email || '';
                const normalizedEmail = userEmail.toLowerCase().trim();
                
                // Check if the uniqueId is associated with this user's email
                // First check if it's the primary uniqueId
                let isAuthorized = false;
                if (userUniqueId && normalizePraveshikaId(userUniqueId) === normalizePraveshikaId(uniqueId)) {
                    isAuthorized = true;
                }
                
                // If not primary, check emailToUids collection and associated registrations
                const checkAuthPromise = !isAuthorized 
                    ? db.collection('emailToUids').doc(normalizedEmail).get()
                        .then((emailToUidsDoc) => {
                            if (emailToUidsDoc.exists) {
                                const emailToUidsData = emailToUidsDoc.data();
                                const uidsFromEmailToUids = emailToUidsData.uids || [];
                                isAuthorized = uidsFromEmailToUids.some(uid => 
                                    normalizePraveshikaId(uid) === normalizePraveshikaId(uniqueId)
                                );
                            }
                            
                            // Also check associated registrations
                            if (!isAuthorized) {
                                const associatedRegistrations = userData.associatedRegistrations || [];
                                isAuthorized = associatedRegistrations.some(reg => 
                                    reg.uniqueId && normalizePraveshikaId(reg.uniqueId) === normalizePraveshikaId(uniqueId)
                                );
                            }
                            
                            if (!isAuthorized) {
                                throw new Error('You can only update transportation information for accounts associated with your email.');
                            }
                            return isAuthorized;
                        })
                    : Promise.resolve(true);
                
                // Get the existing document to preserve all fields
                return checkAuthPromise.then(() => db.collection('registrations').doc(uniqueId).get())
                    .then((doc) => {
                        if (!doc.exists) {
                            throw new Error('Registration not found');
                        }
                        
                        const existingData = doc.data();
                        
                        // Prepare update data - only update the section being edited
                        const updateData = {
                            ...existingData, // Preserve all existing fields
                            transportationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        if (section === 'arrival') {
                            updateData.pickupLocation = pickupLocation;
                            updateData.arrivalDate = arrivalDate;
                            updateData.arrivalTime = arrivalTime;
                            updateData.flightTrainNumber = flightTrainNumber;
                            
                            // Update Excel column names if they exist
                            if (existingData.hasOwnProperty('Pickup Location')) {
                                updateData['Pickup Location'] = pickupLocation;
                            }
                            if (existingData.hasOwnProperty('Arrival Date')) {
                                updateData['Arrival Date'] = arrivalDate;
                            }
                            if (existingData.hasOwnProperty('Arrival Time')) {
                                updateData['Arrival Time'] = arrivalTime;
                            }
                            if (existingData.hasOwnProperty('Flight/Train Number')) {
                                updateData['Flight/Train Number'] = flightTrainNumber;
                            }
                        } else if (section === 'return') {
                            updateData.returnDate = returnDate;
                            updateData.returnTime = returnTime;
                            updateData.returnFlightTrainNumber = returnFlightTrainNumber;
                            
                            // Update Excel column names if they exist
                            if (existingData.hasOwnProperty('Return Date')) {
                                updateData['Return Date'] = returnDate;
                            }
                            if (existingData.hasOwnProperty('Return Time')) {
                                updateData['Return Time'] = returnTime;
                            }
                            if (existingData.hasOwnProperty('Return Flight/Train Number')) {
                                updateData['Return Flight/Train Number'] = returnFlightTrainNumber;
                            }
                        }
                        
                        // Use set with merge: true to handle fields with special characters
                        return db.collection('registrations').doc(uniqueId).set(updateData, { merge: true });
                    });
            })
            .then(() => {
                showNotification('Transportation details saved successfully!', 'success');
                // Reload transportation info
                if (user) {
                    loadTransportationInfo(user);
                }
            })
            .catch((error) => {
                console.error('Error saving transportation info:', error);
                let errorMsg = 'Error saving transportation details. Please try again.';
                if (error.code === 'permission-denied') {
                    errorMsg = 'Permission denied. You can only update your own transportation information.';
                } else if (error.message) {
                    errorMsg = error.message;
                }
                showNotification(errorMsg, 'error');
            });
    }
}

// Handle pickup location dropdown change - show/hide "Other" textbox
function handlePickupLocationChange() {
    const pickupLocationSelect = document.getElementById('pickupLocation');
    const otherContainer = document.getElementById('pickupLocationOtherContainer');
    const otherInput = document.getElementById('pickupLocationOther');
    
    if (pickupLocationSelect && otherContainer && otherInput) {
        if (pickupLocationSelect.value === 'Other') {
            otherContainer.style.display = 'block';
            otherInput.required = true;
        } else {
            otherContainer.style.display = 'none';
            otherInput.required = false;
            otherInput.value = '';
        }
    }
}

// Validate transportation section (helper for onchange)
function validateTransportationSection(section) {
    let isValid = true;
    let saveButton = null;
    
    // Find save button
    const form = document.getElementById('transportationForm');
    if (form) {
        saveButton = form.querySelector('button[type="submit"]');
    }
    
    if (section === 'arrival') {
        const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim();
        const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim();
        const pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
        const arrivalDate = document.getElementById('arrivalDate')?.value.trim();
        const arrivalTime = document.getElementById('arrivalTime')?.value.trim();
        const flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim();
        
        const hasPartial = pickupLocation || arrivalDate || arrivalTime || flightTrainNumber;
        const hasAll = pickupLocation && arrivalDate && arrivalTime && flightTrainNumber;
        
        if (hasPartial && !hasAll) {
            isValid = false;
            // Add visual indicator but don't block
            const inputs = ['pickupLocation', 'arrivalDate', 'arrivalTime', 'flightTrainNumber'];
            inputs.forEach(id => {
                const input = document.getElementById(id);
                if (input && !input.value.trim()) {
                    input.style.borderColor = '#ff6b6b';
                } else if (input) {
                    input.style.borderColor = '';
                }
            });
        } else {
            // Remove indicators if all filled or all empty
            ['pickupLocation', 'arrivalDate', 'arrivalTime', 'flightTrainNumber'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.style.borderColor = '';
            });
        }
    } else if (section === 'return') {
        const returnDate = document.getElementById('returnDate')?.value.trim();
        const returnTime = document.getElementById('returnTime')?.value.trim();
        const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim();
        
        const hasPartial = returnDate || returnTime || returnFlightTrainNumber;
        const hasAll = returnDate && returnTime && returnFlightTrainNumber;
        
        if (hasPartial && !hasAll) {
            isValid = false;
            const inputs = ['returnDate', 'returnTime', 'returnFlightTrainNumber'];
            inputs.forEach(id => {
                const input = document.getElementById(id);
                if (input && !input.value.trim()) {
                    input.style.borderColor = '#ff6b6b';
                } else if (input) {
                    input.style.borderColor = '';
                }
            });
        } else {
            ['returnDate', 'returnTime', 'returnFlightTrainNumber'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.style.borderColor = '';
            });
        }
    }
    
    // Enable/disable save button based on validation
    if (saveButton) {
        // Also check the other section if we're in "Edit All" mode
        if (section === 'arrival') {
            const returnDate = document.getElementById('returnDate')?.value.trim();
            const returnTime = document.getElementById('returnTime')?.value.trim();
            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim();
            const hasReturnPartial = returnDate || returnTime || returnFlightTrainNumber;
            const hasReturnAll = returnDate && returnTime && returnFlightTrainNumber;
            if (hasReturnPartial && !hasReturnAll) {
                isValid = false;
            }
        } else if (section === 'return') {
            const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim();
            const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim();
            const pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
            const arrivalDate = document.getElementById('arrivalDate')?.value.trim();
            const arrivalTime = document.getElementById('arrivalTime')?.value.trim();
            const flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim();
            const hasArrivalPartial = pickupLocation || arrivalDate || arrivalTime || flightTrainNumber;
            const hasArrivalAll = pickupLocation && arrivalDate && arrivalTime && flightTrainNumber;
            if (hasArrivalPartial && !hasArrivalAll) {
                isValid = false;
            }
        }
        
        if (!isValid) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.6';
            saveButton.style.cursor = 'not-allowed';
        } else {
            saveButton.disabled = false;
            saveButton.style.opacity = '1';
            saveButton.style.cursor = 'pointer';
        }
    }
}

// Load tours information - now in separate tab
function loadToursInfo(user) {
    const toursInfo = document.getElementById('toursInfo');
    if (!toursInfo) return;
    
    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        // First get user's uniqueId
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (userDoc.exists && userDoc.data().uniqueId) {
                    const uniqueId = userDoc.data().uniqueId;
                    // Get registration details
                    return db.collection('registrations').doc(uniqueId).get()
                        .then((regDoc) => {
                            return { uniqueId, regDoc, user };
                        })
                        .catch((error) => {
                            console.error('Error reading registration for tours:', error);
                            return { uniqueId, regDoc: null, user };
                        });
                }
                return { uniqueId: null, regDoc: null, user };
            })
            .catch((error) => {
                console.error('Error loading tours info (initial fetch):', error);
                return { uniqueId: null, regDoc: null, user };
            })
            .then((result) => {
                if (!result || !result.uniqueId) {
                    profileToursSection.style.display = 'none';
                    return;
                }
                
                const { regDoc } = result;
                const data = regDoc && regDoc.exists ? regDoc.data() : {};
                
                // Get post shibir tour field
                let postShibirTour = data.postShibirTour || 
                                    data['Post Shibir Tour'] || 
                                    data['Post Shibir Tours'] ||
                                    data['Please select a post shibir tour option'] ||
                                    null;
                
                // Fallback: try to find any field containing "tour" and "post"/"shibir"
                if (!postShibirTour) {
                    const allKeys = Object.keys(data);
                    const tourKey = allKeys.find(key => {
                        const lowerKey = key.toLowerCase();
                        return (lowerKey.includes('tour') && (lowerKey.includes('post') || lowerKey.includes('shibir'))) ||
                               (lowerKey.includes('post') && lowerKey.includes('shibir'));
                    });
                    
                    if (tourKey) {
                        postShibirTour = data[tourKey];
                    }
                }
                
                const tourValue = postShibirTour ? postShibirTour.toString().trim() : '';
                
                // Display tour information
                const tourValueLower = tourValue.toLowerCase();
                let activeTab = 'none';
                if (tourValueLower.includes('srisailam')) {
                    activeTab = 'srisailam';
                } else if (tourValueLower.includes('kandakurthi')) {
                    activeTab = 'kandakurthi';
                } else if (tourValueLower.includes('yadadri') || tourValueLower.includes('bhagyanagar')) {
                    activeTab = 'yadadri';
                }
                
                // Display tours with tabs
                toursInfo.innerHTML = `
                    <div class="tours-tabs">
                        <button class="tour-tab ${activeTab === 'none' ? 'active' : ''}" onclick="switchTourTab('none')">None</button>
                        <button class="tour-tab ${activeTab === 'srisailam' ? 'active' : ''}" onclick="switchTourTab('srisailam')">Srisailam</button>
                        <button class="tour-tab ${activeTab === 'kandakurthi' ? 'active' : ''}" onclick="switchTourTab('kandakurthi')">Kandakurthi</button>
                        <button class="tour-tab ${activeTab === 'yadadri' ? 'active' : ''}" onclick="switchTourTab('yadadri')">Yadadri</button>
                    </div>
                    <div class="tour-tab-content">
                        <div id="tourTabNone" class="tour-tab-pane ${activeTab === 'none' ? 'active' : ''}" style="display: ${activeTab === 'none' ? 'block' : 'none'};">
                            <div class="tour-content">
                                <p class="tour-message">Shubh Yatra</p>
                                <p class="tour-description">No post shibir tour selected.</p>
                            </div>
                        </div>
                        <div id="tourTabSrisailam" class="tour-tab-pane ${activeTab === 'srisailam' ? 'active' : ''}" style="display: ${activeTab === 'srisailam' ? 'block' : 'none'};">
                            <div class="tour-content">
                                <img src="docs/Srisailam.jpg" alt="Srisailam" class="tour-image" onerror="this.style.display='none'">
                                <p class="tour-description">Information about the Srisailam tour will be displayed here.</p>
                                ${tourValue ? `<p class="tour-description">Selected: ${escapeHtml(tourValue)}</p>` : ''}
                            </div>
                        </div>
                        <div id="tourTabKandakurthi" class="tour-tab-pane ${activeTab === 'kandakurthi' ? 'active' : ''}" style="display: ${activeTab === 'kandakurthi' ? 'block' : 'none'};">
                            <div class="tour-content">
                                <img src="docs/Kandakurthi.jpg" alt="Kandakurthi" class="tour-image" onerror="this.style.display='none'">
                                <p class="tour-description">Information about the Kandakurthi tour will be displayed here.</p>
                                ${tourValue ? `<p class="tour-description">Selected: ${escapeHtml(tourValue)}</p>` : ''}
                            </div>
                        </div>
                        <div id="tourTabYadadri" class="tour-tab-pane ${activeTab === 'yadadri' ? 'active' : ''}" style="display: ${activeTab === 'yadadri' ? 'block' : 'none'};">
                            <div class="tour-content">
                                <p class="tour-description">Information about Yadadri Mandir and local sites in Bhagyanagar tour will be displayed here.</p>
                                ${tourValue ? `<p class="tour-description">Selected: ${escapeHtml(tourValue)}</p>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            })
            .catch((error) => {
                console.error('Error loading tours info:', error);
                toursInfo.innerHTML = '<p>Error loading tour information.</p>';
            });
    }
}

// Legacy function - kept for compatibility
function loadProfileTours(user) {
    // Tours are now in a separate tab, redirect to that functionality
    loadToursInfo(user);
}

// Switch tour tab
function switchTourTab(tabName) {
    // Hide all tab panes
    const tabPanes = document.querySelectorAll('.tour-tab-pane');
    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.tour-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab pane
    const tabNameCapitalized = tabName.charAt(0).toUpperCase() + tabName.slice(1);
    const selectedPane = document.getElementById(`tourTab${tabNameCapitalized}`);
    if (selectedPane) {
        selectedPane.classList.add('active');
        selectedPane.style.display = 'block';
    }
    
    // Activate selected tab button
    const tabButtons = document.querySelectorAll('.tour-tab');
    tabButtons.forEach((btn) => {
        const btnOnClick = btn.getAttribute('onclick');
        if (btnOnClick && btnOnClick.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        }
    });
}

// Legacy function - kept for compatibility
function loadProfileTours(user) {
    // Tours are now in a separate tab, redirect to that functionality
    loadToursInfo(user);
}

// Edit tours information
function editToursInfo(uniqueIdOrUserId) {
    const toursInfo = document.getElementById('toursInfo');
    if (!toursInfo) return;

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        const user = firebase.auth().currentUser;
        if (!user) {
            showNotification('You must be logged in to edit tour information.', 'error');
            return;
        }

        // If uniqueId is not provided or is empty, get it from user document
        let uniqueId = uniqueIdOrUserId;
        if (!uniqueId || uniqueId === '') {
            // Get uniqueId from user document
            db.collection('users').doc(user.uid).get()
                .then((userDoc) => {
                    if (userDoc.exists && userDoc.data().uniqueId) {
                        uniqueId = userDoc.data().uniqueId;
                        openToursEditForm(uniqueId);
                    } else {
                        showNotification('Error: User unique ID not found. Please complete your registration first.', 'error');
                    }
                })
                .catch((error) => {
                    console.error('Error fetching user uniqueId:', error);
                    showNotification('Error loading user information.', 'error');
                });
            return;
        }

        openToursEditForm(uniqueId);
    }
}

// Helper function to open tours edit form
function openToursEditForm(uniqueId) {
    const toursInfo = document.getElementById('toursInfo');
    if (!toursInfo || !uniqueId) return;

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('registrations').doc(uniqueId).get()
            .then((regDoc) => {
                const data = regDoc.exists ? regDoc.data() : {};
                
                // Primary field name is postShibirTour (camelCase)
                const currentTour = data.postShibirTour || 'None';

                toursInfo.innerHTML = `
                    <h3>Edit Post Shibir Tour</h3>
                    <p class="warning-text">⚠️ Are you sure you want to change your tour selection?</p>
                    <form id="toursForm" class="tours-form">
                        <div class="form-group">
                            <label for="postShibirTour">Post Shibir Tour:</label>
                            <select id="postShibirTour" class="form-control">
                                <option value="None" ${currentTour === 'None' ? 'selected' : ''}>None</option>
                                <option value="Srisailam" ${currentTour.toString().toLowerCase().includes('srisailam') ? 'selected' : ''}>Srisailam</option>
                                <option value="Kandakurthi" ${currentTour.toString().toLowerCase().includes('kandakurthi') ? 'selected' : ''}>Kandakurthi</option>
                                <option value="Yadadri Mandir and local sites in Bhagyanagar" ${currentTour.toString().toLowerCase().includes('yadadri') || currentTour.toString().toLowerCase().includes('bhagyanagar') ? 'selected' : ''}>Yadadri Mandir and local sites in Bhagyanagar</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">💾 Save Changes</button>
                            <button type="button" class="btn btn-secondary" onclick="loadToursInfo(firebase.auth().currentUser)">❌ Cancel</button>
                        </div>
                    </form>
                `;

                // Add form submit handler
                const form = document.getElementById('toursForm');
                if (form) {
                    form.addEventListener('submit', function(e) {
                        e.preventDefault();
                        saveToursInfo(uniqueId);
                    });
                }
            })
            .catch((error) => {
                console.error('Error loading tours form:', error);
                showNotification('Error loading form. Please try again.', 'error');
            });
    }
}

// Save tours information
function saveToursInfo(uniqueId) {
    if (!uniqueId) {
        showNotification('Error: Unique ID not found.', 'error');
        return;
    }

    const postShibirTour = document.getElementById('postShibirTour')?.value || 'None';

    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('You must be logged in to save tour information.', 'error');
        return;
    }

    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        
        showNotification('Saving tour information...', 'info');

        // First verify the user's uniqueId matches (security check)
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    throw new Error('User document not found');
                }
                const userData = userDoc.data();
                const userUniqueId = userData.uniqueId;
                
                // Verify the uniqueId matches (normalized comparison)
                if (normalizePraveshikaId(userUniqueId) !== normalizePraveshikaId(uniqueId)) {
                    throw new Error('You can only update your own tour information.');
                }

                // Get the existing document to preserve all fields
                return db.collection('registrations').doc(uniqueId).get()
                    .then((doc) => {
                        if (!doc.exists) {
                            throw new Error('Registration not found');
                        }
                        
                        const existingData = doc.data();
                        
                        // Prepare update data - primary field is postShibirTour (camelCase)
                        const updateData = {
                            ...existingData,
                            postShibirTour: postShibirTour,
                            toursUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        // Use set with merge: true to update postShibirTour field
                        return db.collection('registrations').doc(uniqueId).set(updateData, { merge: true });
                    });
            })
            .then(() => {
                showNotification('Tour information saved successfully!', 'success');
                // Reload tours info to show updated data
                const currentUser = firebase.auth().currentUser;
                if (currentUser) {
                    // Small delay to ensure database write is complete
                    setTimeout(() => {
                        loadToursInfo(currentUser);
                    }, 500);
                }
            })
            .catch((error) => {
                console.error('Error saving tours info:', error);
                let errorMsg = 'Error saving tour information. Please try again.';
                if (error.code === 'permission-denied') {
                    errorMsg = 'Permission denied. You can only update your own tour information.';
                } else if (error.message) {
                    errorMsg = error.message;
                }
                showNotification(errorMsg, 'error');
            });
    }
}

// Badge Feature Functions
// Helper function to convert image to data URL to avoid CORS issues
function imageToDataURL(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Enable CORS
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (error) {
                // If CORS fails, try without crossOrigin
                const img2 = new Image();
                img2.onload = function() {
                    const canvas = document.createElement('canvas');
                    canvas.width = img2.width;
                    canvas.height = img2.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img2, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img2.onerror = () => resolve(null); // Return null if image can't be loaded
                img2.src = url;
            }
        };
        img.onerror = () => {
            // If CORS fails, try without crossOrigin
            const img2 = new Image();
            img2.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img2.width;
                    canvas.height = img2.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img2, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (error) {
                    resolve(null); // Return null if conversion fails
                }
            };
            img2.onerror = () => resolve(null); // Return null if image can't be loaded
            img2.src = url;
        };
        img.src = url;
    });
}

function showBadge(name, country, shreni, barcode, uniqueId) {
    // Create badge modal
    const modal = document.createElement('div');
    modal.id = 'badgeModal';
    modal.className = 'modal';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Use uniqueId if barcode is empty or same as uniqueId
    const barcodeValue = barcode && barcode !== 'N/A' && barcode !== uniqueId ? barcode : uniqueId;

    // Load logo and convert to data URL to avoid CORS issues
    imageToDataURL('docs/logo.png').then(logoDataUrl => {
        const logoSrc = logoDataUrl || 'docs/logo.png'; // Fallback to original if conversion fails
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="close" onclick="closeBadge()">&times;</span>
                <h2>VSS2025 Badge</h2>
                <div id="badgeContainer" class="badge-container">
                    <div class="badge-content">
                        <img src="${logoSrc}" alt="VSS Logo" class="badge-logo" crossorigin="anonymous" onerror="this.style.display='none'">
                        <h3 class="badge-name">${escapeHtml(name)}</h3>
                        <div class="badge-details">
                            <p><strong>Country:</strong> ${escapeHtml(country)}</p>
                            <p><strong>Shreni:</strong> ${escapeHtml(shreni)}</p>
                            <p><strong>Praveshika ID:</strong> ${escapeHtml(uniqueId)}</p>
                        </div>
                        <div class="badge-barcode-container">
                            <svg id="badgeBarcode"></svg>
                        </div>
                    </div>
                </div>
                <div class="badge-actions">
                    <button class="btn btn-primary" onclick="downloadBadgeAsPDF('${escapeHtml(name)}', '${escapeHtml(country)}', '${escapeHtml(shreni)}', '${escapeHtml(barcodeValue)}')">
                        📄 Download PDF
                    </button>
                    <button class="btn btn-secondary" onclick="downloadBadgeAsJPG('${escapeHtml(name)}', '${escapeHtml(country)}', '${escapeHtml(shreni)}', '${escapeHtml(barcodeValue)}')">
                        🖼️ Download JPG
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Generate barcode using JsBarcode
        setTimeout(() => {
            if (typeof JsBarcode !== 'undefined' && barcodeValue && barcodeValue !== 'N/A') {
                try {
                    JsBarcode("#badgeBarcode", barcodeValue, {
                        format: "CODE128",
                        width: 2,
                        height: 60,
                        displayValue: true
                    });
                } catch (error) {
                    console.error('Barcode generation error:', error);
                    document.getElementById('badgeBarcode').innerHTML = `<text>${escapeHtml(barcodeValue)}</text>`;
                }
            } else {
                document.getElementById('badgeBarcode').innerHTML = `<text>${escapeHtml(barcodeValue)}</text>`;
            }
        }, 100);
    }).catch(error => {
        console.error('Error loading logo:', error);
        // Create modal without logo if image loading fails
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="close" onclick="closeBadge()">&times;</span>
                <h2>VSS2025 Badge</h2>
                <div id="badgeContainer" class="badge-container">
                    <div class="badge-content">
                        <h3 class="badge-name">${escapeHtml(name)}</h3>
                        <div class="badge-details">
                            <p><strong>Country:</strong> ${escapeHtml(country)}</p>
                            <p><strong>Shreni:</strong> ${escapeHtml(shreni)}</p>
                            <p><strong>Praveshika ID:</strong> ${escapeHtml(uniqueId)}</p>
                        </div>
                        <div class="badge-barcode-container">
                            <svg id="badgeBarcode"></svg>
                        </div>
                    </div>
                </div>
                <div class="badge-actions">
                    <button class="btn btn-primary" onclick="downloadBadgeAsPDF('${escapeHtml(name)}', '${escapeHtml(country)}', '${escapeHtml(shreni)}', '${escapeHtml(barcodeValue)}')">
                        📄 Download PDF
                    </button>
                    <button class="btn btn-secondary" onclick="downloadBadgeAsJPG('${escapeHtml(name)}', '${escapeHtml(country)}', '${escapeHtml(shreni)}', '${escapeHtml(barcodeValue)}')">
                        🖼️ Download JPG
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Generate barcode
        setTimeout(() => {
            if (typeof JsBarcode !== 'undefined' && barcodeValue && barcodeValue !== 'N/A') {
                try {
                    JsBarcode("#badgeBarcode", barcodeValue, {
                        format: "CODE128",
                        width: 2,
                        height: 60,
                        displayValue: true
                    });
                } catch (error) {
                    document.getElementById('badgeBarcode').innerHTML = `<text>${escapeHtml(barcodeValue)}</text>`;
                }
            }
        }, 100);
    });
}

function closeBadge() {
    const modal = document.getElementById('badgeModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

function downloadBadgeAsPDF(name, country, shreni, barcode) {
    const badgeContainer = document.getElementById('badgeContainer');
    if (!badgeContainer) return;

    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        showNotification('PDF library not loaded. Please refresh the page.', 'error');
        return;
    }

    showNotification('Generating PDF...', 'info');

    // Ensure logo is loaded before capturing
    const logoImg = badgeContainer.querySelector('.badge-logo');
    const logoLoaded = new Promise((resolve) => {
        if (!logoImg || logoImg.complete) {
            resolve();
            return;
        }
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve(); // Continue even if logo fails
        // Timeout after 2 seconds
        setTimeout(() => resolve(), 2000);
    });

    logoLoaded.then(() => {
        // Small delay to ensure rendering is complete
        setTimeout(() => {
            html2canvas(badgeContainer, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: false,
                imageTimeout: 15000,
                onclone: (clonedDoc) => {
                    // Ensure logo is visible in cloned document
                    const clonedLogo = clonedDoc.querySelector('.badge-logo');
                    if (clonedLogo && logoImg) {
                        clonedLogo.src = logoImg.src;
                        clonedLogo.style.display = 'block';
                    }
                }
            }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('portrait', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

                pdf.save(`VSS2025_Badge_${name.replace(/\s+/g, '_')}.pdf`);
                showNotification('PDF downloaded successfully!', 'success');
            }).catch(error => {
                console.error('PDF generation error:', error);
                showNotification('Error generating PDF. Please try again.', 'error');
            });
        }, 100);
    });
}

function downloadBadgeAsJPG(name, country, shreni, barcode) {
    const badgeContainer = document.getElementById('badgeContainer');
    if (!badgeContainer) return;

    if (typeof html2canvas === 'undefined') {
        showNotification('Image library not loaded. Please refresh the page.', 'error');
        return;
    }

    showNotification('Generating image...', 'info');

    // Ensure logo is loaded before capturing
    const logoImg = badgeContainer.querySelector('.badge-logo');
    const logoLoaded = new Promise((resolve) => {
        if (!logoImg || logoImg.complete) {
            resolve();
            return;
        }
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve(); // Continue even if logo fails
        // Timeout after 2 seconds
        setTimeout(() => resolve(), 2000);
    });

    logoLoaded.then(() => {
        // Small delay to ensure rendering is complete
        setTimeout(() => {
            html2canvas(badgeContainer, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: false,
                imageTimeout: 15000,
                onclone: (clonedDoc) => {
                    // Ensure logo is visible in cloned document
                    const clonedLogo = clonedDoc.querySelector('.badge-logo');
                    if (clonedLogo && logoImg) {
                        clonedLogo.src = logoImg.src;
                        clonedLogo.style.display = 'block';
                    }
                }
            }).then(canvas => {
                canvas.toBlob(blob => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `VSS2025_Badge_${name.replace(/\s+/g, '_')}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    showNotification('Image downloaded successfully!', 'success');
                }, 'image/jpeg', 0.95);
            }).catch(error => {
                console.error('Image generation error:', error);
                showNotification('Error generating image. Please try again.', 'error');
            });
        }, 100);
    });
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Close badge modal when clicking outside
window.addEventListener('click', function(event) {
    const badgeModal = document.getElementById('badgeModal');
    if (event.target === badgeModal) {
        closeBadge();
    }
});

// Initialize auth UI on page load
document.addEventListener('DOMContentLoaded', function() {
    // Wait for Firebase to load
    setTimeout(() => {
        updateAuthUI();
    }, 1000);
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

// Function to scroll to specific sections in Shibirarthi Info
function scrollToSection(sectionId) {
    if (!sectionId) return;
    
    const targetElement = document.getElementById(sectionId);
    if (targetElement) {
        // Calculate offset to account for fixed navigation
        const navHeight = document.querySelector('.navigation').offsetHeight;
        const targetPosition = targetElement.offsetTop - navHeight - 20;
        
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
        
        // Highlight the section briefly
        targetElement.style.backgroundColor = 'rgba(255, 107, 53, 0.1)';
        targetElement.style.transition = 'background-color 0.3s ease';
        
        setTimeout(() => {
            targetElement.style.backgroundColor = '';
        }, 2000);
        
        // Reset dropdown selection
        const dropdown = document.querySelector('.section-dropdown');
        if (dropdown) {
            dropdown.value = '';
        }
    }
}

// Navigate from header dropdown into Shibirarthi and scroll
function navigateToShibirSection(sectionId) {
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContents = document.querySelectorAll('.tab-content');
    navLinks.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));
    const shibirLink = document.querySelector('.nav-link[data-tab="shibirarthi"]');
    const shibirTab = document.getElementById('shibirarthi');
    if (shibirLink && shibirTab) {
        shibirLink.classList.add('active');
        shibirTab.classList.add('active');
        
        // Update URL hash
        window.history.pushState(null, null, '#shibirarthi');
        
        // Wait a tick to ensure visibility, then scroll
        setTimeout(() => scrollToSection(sectionId), 50);
    }
}

// Media view switcher
function switchMediaView(view) {
    const vids = document.getElementById('mediaVideos');
    const imgs = document.getElementById('mediaImages');
    if (!vids || !imgs) return;
    if (view === 'images') {
        imgs.style.display = 'block';
        vids.style.display = 'none';
    } else {
        vids.style.display = 'block';
        imgs.style.display = 'none';
    }
}

// Add loading animation for images and Firefox compatibility
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
        // Handle image load
        img.addEventListener('load', function() {
            this.style.opacity = '1';
            this.classList.add('loaded');
        });
        
        // Handle image error
        img.addEventListener('error', function() {
            this.style.display = 'none';
            // Show fallback if it exists
            const fallback = this.nextElementSibling;
            if (fallback && fallback.style) {
                fallback.style.display = 'block';
            }
        });
        
        // Set initial opacity to 0 for loading effect (only for lazy loaded images)
        if (img.getAttribute('loading') === 'lazy') {
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.3s ease';
        } else {
            img.style.opacity = '1';
        }
        
        // Force load for Firefox compatibility
        if (img.complete && img.naturalHeight !== 0) {
            img.dispatchEvent(new Event('load'));
        }
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

// Firebase initialization is handled in firebase-config.js
// Check if Firebase is properly initialized (with longer timeout for slow connections)
document.addEventListener('DOMContentLoaded', function() {
    // Wait longer for Firebase to initialize, especially on slow connections
    setTimeout(() => {
        waitForFirebase(function() {
            // Firebase initialization check complete
        }, 60); // Wait up to 6 seconds
    }, 200);
});
