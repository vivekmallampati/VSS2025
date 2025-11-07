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
const PROTECTED_TABS = ['shibirarthi', 'myprofile', 'mytransportation', 'mytours', 'checkin', 'admin-dashboard', 'user-management'];

// Helper function to check if a tab is protected
function isProtectedTab(tabName) {
    return PROTECTED_TABS.includes(tabName);
}

// Helper function to check if user is a superadmin
// 
// TO SETUP INITIAL SUPERADMIN:
// 1. User must first register an account through the normal registration flow
// 2. Once registered, go to Firebase Console > Firestore Database
// 3. Navigate to the 'users' collection
// 4. Find the user document by their UID (you can find this in Firebase Authentication)
// 5. Edit the document and add a field: role = "superadmin" (type: string)
// 6. Save the document
// 7. The user will now have access to the Admin Dashboard on next login
//
// ALTERNATIVE: Use Firebase Admin SDK to set role programmatically:
//   const admin = require('firebase-admin');
//   const db = admin.firestore();
//   await db.collection('users').doc(USER_UID).update({ role: 'superadmin' });
//
async function isSuperadmin(user) {
    if (!user || !window.firebase || !firebase.firestore) {
        return false;
    }
    
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            return false;
        }
        
        const userData = userDoc.data();
        return userData.role === 'superadmin';
    } catch (error) {
        // Silently return false for permission errors (happens during user creation flow)
        if (error.code === 'permission-denied') {
            return false;
        }
        console.error('Error checking superadmin status:', error);
        return false;
    }
}

// Helper function to check if user is an admin (superadmin or admin)
async function isAdmin(user) {
    if (!user || !window.firebase || !firebase.firestore) {
        return false;
    }
    
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            return false;
        }
        
        const userData = userDoc.data();
        return userData.role === 'superadmin' || userData.role === 'admin';
    } catch (error) {
        // Silently return false for permission errors (happens during user creation flow)
        if (error.code === 'permission-denied') {
            return false;
        }
        console.error('Error checking admin status:', error);
        return false;
    }
}

// Helper function to check if user is a volunteer
async function isVolunteer(user) {
    if (!user || !window.firebase || !firebase.firestore) {
        return false;
    }
    
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            return false;
        }
        
        const userData = userDoc.data();
        return userData.role === 'volunteer';
    } catch (error) {
        // Silently return false for permission errors (happens during user creation flow)
        if (error.code === 'permission-denied') {
            return false;
        }
        console.error('Error checking volunteer status:', error);
        return false;
    }
}

// Helper function to get volunteer teams
async function getVolunteerTeams(user) {
    if (!user || !window.firebase || !firebase.firestore) {
        return [];
    }
    
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            return [];
        }
        
        const userData = userDoc.data();
        return userData.volunteerTeams || [];
    } catch (error) {
        // Silently return empty array for permission errors (happens during user creation flow)
        if (error.code === 'permission-denied') {
            return [];
        }
        console.error('Error getting volunteer teams:', error);
        return [];
    }
}

// Helper function to check if user can view dashboard
async function canViewDashboard(user) {
    return await isAdmin(user);
}

// Helper function to check if user can perform checkin
async function canPerformCheckin(user) {
    if (!user) return false;
    const isAdminUser = await isAdmin(user);
    const isVolunteerUser = await isVolunteer(user);
    return isAdminUser || isVolunteerUser;
}

// Helper function to check if user has access to specific checkin type
async function hasAccessToCheckinType(user, checkinType) {
    if (!user) return false;
    
    // Admins (superadmin and admin) have access to all checkin types
    const isAdminUser = await isAdmin(user);
    if (isAdminUser) return true;
    
    // Volunteers need to check their assigned teams
    const isVolunteerUser = await isVolunteer(user);
    if (!isVolunteerUser) return false;
    
    const teams = await getVolunteerTeams(user);
    // Map checkin types to team names
    const teamMap = {
        'pickup_location': 'transportation',
        'venue_entrance': 'venue_entrance',
        'cloak_room': 'cloak_room',
        'accommodation': 'accommodation',
        'food': 'food',
        'post_tour': 'post_tour'
    };
    
    const requiredTeam = teamMap[checkinType];
    if (!requiredTeam) return false;
    
    return teams.includes(requiredTeam);
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
// Track if we're still initializing auth to prevent premature login prompts
let authInitializing = true;
let loginModalOpened = false;

function activateTab(tabName, skipAuthCheck = false) {
    // During initialization, skip auth check to prevent premature login prompts
    // Wait for auth state to be determined first
    if (!skipAuthCheck && authInitializing && isProtectedTab(tabName)) {
        // Don't open login modal during initialization - just redirect to home
        window.history.pushState(null, null, '#home');
        activateTab('home', true); // Skip auth check for home
        return;
    }
    
    // Check if trying to access protected tab without authentication
    if (!skipAuthCheck && isProtectedTab(tabName) && !canAccessProtectedTab(tabName)) {
        // showNotification('Please login to access this page.', 'info');
        // window.history.pushState(null, null, '#home');
        setTimeout(() => {
                    loginModalOpened = false;
                }, 1000);
        activateTab('shibirarthi', true); // Skip auth check for home
        // Prevent duplicate login modal opens
        // if (!loginModalOpened) {
        //     loginModalOpened = true;
        //     // openLogin();
        //     // Reset flag after a delay
        //     setTimeout(() => {
        //         loginModalOpened = false;
        //     }, 1000);
        // }
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
                    case 'checkin':
                        initializeCheckinInterface();
                        break;
                    case 'myprofile':
                        loadUserProfile(user);
                        break;
                    case 'mytransportation':
                        loadTransportationInfo(user);
                        break;
                    case 'mytours':
                        loadToursInfo(user);
                        break;
                    case 'admin-dashboard':
                        loadAdminDashboard(user);
                        break;
                    case 'user-management':
                        loadUserManagementPage(user);
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
            // Mark that we're initializing - this prevents premature login prompts
            authInitializing = true;
            
            // Use a one-time listener or check current user immediately
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                // Mark initialization as complete
                authInitializing = false;
                
                // Small delay to ensure UI is updated
                setTimeout(() => {
                    if (initialHash) {
                        activateTab(initialHash);
                    } else {
                        activateTab('home');
                    }
                }, 100);
                
                // Unsubscribe after first auth state change to prevent duplicate calls
                unsubscribe();
            });
        } else {
            // If Firebase not available, mark as initialized and activate based on hash
            authInitializing = false;
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
            
            // Function to send email via API endpoint
            const sendEmailViaAPI = () => {
                // Use full URL to work in all environments
                const apiUrl = window.location.origin + '/api/send-email';
                return fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: name,
                        email: email,
                        category: category,
                        message: message
                    })
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(err => {
                            throw new Error(err.error || 'Failed to send email');
                        });
                    }
                    return response.json();
                });
            };
            
            // Function to send email via EmailJS (fallback)
            const sendEmailViaEmailJS = () => {
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
            
            // Try API endpoint first, fallback to EmailJS if API fails
            const sendEmail = () => {
                return sendEmailViaAPI()
                    .catch((apiError) => {
                        console.warn('API email failed, trying EmailJS fallback:', apiError);
                        return sendEmailViaEmailJS();
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
            
            // Wait for Firebase to be fully initialized before attempting login
            waitForFirebase(function() {
                // Firebase login
                if (window.firebase && firebase.auth && firebase.firestore) {
                    // Ensure auth is ready before attempting login
                    if (!firebase.auth().currentUser || firebase.auth().currentUser === null) {
                        // Clear any stale auth state
                        firebase.auth().signOut().catch(() => {
                            // Ignore errors if not signed in
                        });
                    }
                    
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
                                showNotification('No account found with this email. Contact your administrator if you are a volunteer/admin.', 'error');
                            } else if (error.code === 'auth/wrong-password') {
                                showNotification('Incorrect password. Please try again.', 'error');
                            } else {
                                handleLoginError(error);
                            }
                        });
                } else {
                    // Praveshika ID login - normalize and look up email
                    const db = firebase.firestore();
                    const normalizedId = normalizePraveshikaId(identifier);
                    
                    // Helper function to find email by normalized Praveshika ID or User ID
                    // Checks both registrations (for shibirarthi) and users (for volunteers/admins)
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
                                // Third: Check users collection for volunteers/admins by uniqueId
                                return db.collection('users').where('uniqueId', '==', identifier).limit(1).get()
                                    .then((userQuerySnapshot) => {
                                        if (!userQuerySnapshot.empty) {
                                            const userData = userQuerySnapshot.docs[0].data();
                                            // For volunteers/admins, use their email or generate placeholder
                                            if (userData.role === 'volunteer' || userData.role === 'admin') {
                                                // If they have a real email, use it; otherwise use placeholder format
                                                return userData.email || `${userData.uniqueId}@placeholder.local`;
                                            }
                                        }
                                        return null;
                                    });
                            })
                            .then((email) => {
                                if (email) return email;
                                // Fourth: Search all registration documents by normalizing document IDs (fallback for old data)
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
                                showNotification('ID not found. Volunteers/Admins: Contact your administrator. Shibirarthi: Register first.', 'error');
                                throw { code: 'auth/user-not-found', message: 'No email found for this ID.' };
                            }
                            // Login with the found email
                            return firebase.auth().signInWithEmailAndPassword(email, password);
                        })
                        .then((userCredential) => {
                            handleLoginSuccess(loginForm);
                        })
                        .catch((error) => {
                            // Check if user doesn't exist or wrong password
                            if (error.code === 'auth/user-not-found') {
                                // Don't redirect to register - could be volunteer/admin
                                showNotification('ID not found. Contact your administrator if you are a volunteer/admin.', 'error');
                            } else if (error.code === 'auth/wrong-password') {
                                showNotification('Incorrect password. Please try again.', 'error');
                            } else {
                                handleLoginError(error);
                            }
                        });
                }
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
            }); // waitForFirebase callback
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

    closeLogin();

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
                            return Promise.reject(new Error('Praveshika ID not found'));
                        }
                        
                        const data = matchingDoc.data();
                        const storedEmail = data.email ? data.email.toLowerCase().trim() : '';
                        
                        // Validate that the email exists in the registration
                        if (!storedEmail) {
                            showNotification('Email not found in registration for this Praveshika ID.', 'error');
                            return Promise.reject(new Error('Email not found'));
                        }
                        
                        // Validate that the email matches the one stored for this Praveshika ID
                        if (storedEmail !== normalizedEmail) {
                            showNotification('Email does not match the one associated with this Praveshika ID.', 'error');
                            return Promise.reject(new Error('Email mismatch'));
                        }
                        
                        // Check if Firebase Auth account already exists for this email
                        // This is the critical check - if account exists, DO NOT proceed to password setup
                        return firebase.auth().fetchSignInMethodsForEmail(data.email || email)
                            .then((signInMethods) => {
                                // If signInMethods array has any methods, account exists
                                if (signInMethods && signInMethods.length > 0) {
                                    // Account already exists - DO NOT proceed to password setup
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
                                    return Promise.reject(new Error('Account already exists'));
                                }
                                
                                // No sign-in methods found - account doesn't exist, proceed with registration
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
                                return Promise.resolve();
                            })
                            .catch((fetchError) => {
                                // Handle errors from fetchSignInMethodsForEmail
                                console.error('Error checking email existence:', fetchError);
                                
                                // If the error indicates email is already in use, handle it
                                if (fetchError.code === 'auth/email-already-in-use' || 
                                    fetchError.message && fetchError.message.includes('already in use')) {
                                    showNotification('An account with this email already exists. Please login instead.', 'error');
                                    closeRegister();
                                    setTimeout(() => {
                                        const loginIdentifier = document.getElementById('loginIdentifier');
                                        if (loginIdentifier) {
                                            loginIdentifier.value = data.email || email;
                                        }
                                        openLogin();
                                    }, 300);
                                    return Promise.reject(fetchError);
                                }
                                
                                // For other errors (like network issues), still show error but don't proceed
                                let errorMsg = 'Unable to verify email. Please try again.';
                                if (fetchError.code === 'auth/invalid-email') {
                                    errorMsg = 'Invalid email address.';
                                } else if (fetchError.message) {
                                    errorMsg = fetchError.message;
                                }
                                showNotification(errorMsg, 'error');
                                return Promise.reject(fetchError);
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

            // Final check before creating account - verify email is still not in use
            // This catches any edge cases where email was registered between verify and password setup
            if (window.firebase && firebase.auth) {
                showNotification('Verifying email availability...', 'info');
                
                firebase.auth().fetchSignInMethodsForEmail(pendingRegistration.email)
                    .then((signInMethods) => {
                        if (signInMethods && signInMethods.length > 0) {
                            // Account was created between verify and password setup - show error
                            showNotification('An account with this email already exists. Please login instead.', 'error');
                            // Save email before clearing pendingRegistration
                            const emailToUse = pendingRegistration ? pendingRegistration.email : '';
                            // Reset registration form back to verify step
                            document.getElementById('registerVerifyForm').style.display = 'block';
                            document.getElementById('registerPasswordForm').style.display = 'none';
                            pendingRegistration = null;
                            // Close register modal and open login modal
                            setTimeout(() => {
                                closeRegister();
                                setTimeout(() => {
                                    const loginIdentifier = document.getElementById('loginIdentifier');
                                    if (loginIdentifier && emailToUse) {
                                        loginIdentifier.value = emailToUse;
                                    }
                                    openLogin();
                                }, 300);
                            }, 2000);
                            return Promise.reject(new Error('Account already exists'));
                        }
                        
                        // Email is still available - proceed with account creation
                        showNotification('Creating your account...', 'info');
                        
                        return firebase.auth().createUserWithEmailAndPassword(pendingRegistration.email, password);
                    })
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
                        
                        if (error.code === 'auth/email-already-in-use' || error.message === 'Account already exists') {
                            // This should rarely happen now since we check at verify step and before creation
                            // But handle it gracefully if it does
                            errorMessage = 'This email is already registered. Please login instead.';
                            // Save email before clearing pendingRegistration
                            const emailToUse = pendingRegistration ? pendingRegistration.email : '';
                            // Reset registration form back to verify step
                            document.getElementById('registerVerifyForm').style.display = 'block';
                            document.getElementById('registerPasswordForm').style.display = 'none';
                            pendingRegistration = null;
                            // Display error in modal
                            showRegisterError(errorMessage);
                            // Close register modal and open login modal after a short delay
                            setTimeout(() => {
                                closeRegister();
                                setTimeout(() => {
                                    const loginIdentifier = document.getElementById('loginIdentifier');
                                    if (loginIdentifier && emailToUse) {
                                        loginIdentifier.value = emailToUse;
                                    }
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
            // Check current user first to avoid waiting for auth state change
            const currentUser = firebase.auth().currentUser;
            if (currentUser) {
                // User is already logged in, update UI immediately
                handleAuthStateChange(currentUser);
            }
            
            // Set up listener for future auth state changes
            firebase.auth().onAuthStateChanged(async (user) => {
                handleAuthStateChange(user);
            });
        }
    });
}

// Helper function to handle auth state changes
async function handleAuthStateChange(user) {
    // Mark initialization as complete when we get auth state
    if (authInitializing) {
        authInitializing = false;
    }
    
    const loginBtn = document.querySelector('.header-actions .login-btn');
    const homeNavItem = document.getElementById('homeNavItem');
    const aboutNavItem = document.getElementById('aboutNavItem');
    const mediaNavItem = document.getElementById('mediaNavItem');
    const shibirarthiNavItem = document.getElementById('shibirarthiNavItem');
    const myProfileNavItem = document.getElementById('myProfileNavItem');
    const myTransportationNavItem = document.getElementById('myTransportationNavItem');
    const myToursNavItem = document.getElementById('myToursNavItem');
    const checkinNavItem = document.getElementById('checkinNavItem');
    const adminDashboardNavItem = document.getElementById('adminDashboardNavItem');
    const userManagementNavItem = document.getElementById('userManagementNavItem');
    
    if (user) {
        // Check user roles
        const isSuperadminUser = await isSuperadmin(user);
        const isAdminUser = await isAdmin(user);
        const canPerformCheckinUser = await canPerformCheckin(user);
        const canViewDashboardUser = await canViewDashboard(user);
        
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
        
        // If user is admin (but not superadmin), show only checkin and myprofile tabs
        if (isAdminUser && !isSuperadminUser) {
            // Hide all tabs except checkin and myprofile for admins
            if (shibirarthiNavItem) {
                shibirarthiNavItem.style.display = 'none';
            }
            if (myProfileNavItem) {
                myProfileNavItem.style.display = '';
                loadUserProfile(user);
            }
            if (myTransportationNavItem) {
                myTransportationNavItem.style.display = 'none';
            }
            if (myToursNavItem) {
                myToursNavItem.style.display = 'none';
            }
            if (checkinNavItem) {
                if (canPerformCheckinUser) {
                    checkinNavItem.style.display = '';
                } else {
                    checkinNavItem.style.display = 'none';
                }
            }
            if (adminDashboardNavItem) {
                adminDashboardNavItem.style.display = 'none';
            }
            if (userManagementNavItem) {
                userManagementNavItem.style.display = 'none';
            }
        } else {
            // For superadmins and regular users, show all appropriate tabs
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
            
            // Show checkin tab for superadmin, admin, or volunteers
            if (checkinNavItem) {
                if (canPerformCheckinUser) {
                    checkinNavItem.style.display = '';
                } else {
                    checkinNavItem.style.display = 'none';
                }
            }
            
            // Show admin dashboard only for superadmins
            if (adminDashboardNavItem) {
                if (isSuperadminUser) {
                    adminDashboardNavItem.style.display = '';
                } else {
                    adminDashboardNavItem.style.display = 'none';
                }
            }
            
            // Show user management only for superadmins
            if (userManagementNavItem) {
                if (isSuperadminUser) {
                    userManagementNavItem.style.display = '';
                } else {
                    userManagementNavItem.style.display = 'none';
                }
            }
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
        if (checkinNavItem) {
            checkinNavItem.style.display = 'none';
        }
        if (adminDashboardNavItem) {
            adminDashboardNavItem.style.display = 'none';
        }
        if (userManagementNavItem) {
            userManagementNavItem.style.display = 'none';
        }
        
        // If user is on protected tab, redirect to home
        const currentHash = window.location.hash.substring(1);
        if (isProtectedTab(currentHash)) {
            window.history.pushState(null, null, '#home');
            activateTab('home');
        }
    }
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
                        // Load checkin status
                        loadCheckinStatusForProfile(uniqueIdsToFetch.length > 0 ? uniqueIdsToFetch[0] : (primaryUniqueId || ''));
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
                        
                        // Get all uniqueIds for checkin status
                        const allUniqueIdsForCheckin = profiles.map(p => p.uniqueId).filter(Boolean);
                        
                        
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
                            <div id="checkinStatusSection" class="checkin-status-section" style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #e0e0e0;">
                                <h3>Checkin Status</h3>
                                <div id="checkinStatusContent">Loading checkin status...</div>
                            </div>
                        `;
                        // Load checkin status for all uniqueIds
                        loadCheckinStatusForProfile(allUniqueIdsForCheckin);
                    });
            })
            .catch((error) => {
                // Silently ignore permission errors (happens during user creation flow)
                if (error.code === 'permission-denied') {
                    profileInfo.innerHTML = '<p>Loading...</p>';
                    return;
                }
                console.error('Error loading profile:', error);
                profileInfo.innerHTML = '<p>Error loading profile information.</p>';
            });
    }
}

// Helper function to create transportation tab button HTML - similar to profile tabs
function createTransportationTabHTML(transportationData, index, isActive = false) {
    const { name, uniqueId } = transportationData;
    const displayName = name && name.trim() && !name.startsWith('User ') ? name : (uniqueId || 'Unknown User');
    
    return `
        <button class="profile-tab-btn ${isActive ? 'active' : ''}" onclick="switchTransportationTab(${index})" data-tab-index="${index}">
            ${escapeHtml(displayName)}
        </button>
    `;
}

// Function to switch transportation tabs
function switchTransportationTab(index) {
    const transportationInfo = document.getElementById('transportationInfo');
    if (!transportationInfo) return;
    
    // Remove active class from all tab buttons within transportation section
    const tabButtons = transportationInfo.querySelectorAll('.profile-tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all transportation tab panes immediately
    const tabPanes = transportationInfo.querySelectorAll('.transportation-tab-pane');
    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
        // Ensure no residual styling
        pane.style.height = '';
        pane.style.overflow = '';
    });
    
    // Show selected tab pane
    const selectedPane = document.getElementById(`transportationTab${index}`);
    if (selectedPane) {
        selectedPane.classList.add('active');
        selectedPane.style.display = 'block';
    }
    
    // Activate selected tab button
    const selectedButton = transportationInfo.querySelector(`.profile-tab-btn[data-tab-index="${index}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    // Force a reflow to ensure layout updates immediately
    if (selectedPane) {
        selectedPane.offsetHeight;
    }
}

// Helper function to create transportation card HTML for a single person (as tab pane - no collapse)
function createTransportationCardHTML(transportationData, index, isExpanded = false) {
    const { name, uniqueId, pickupLocation, arrivalDate, arrivalTime, flightTrainNumber,
            returnDate, returnTime, returnFlightTrainNumber, pickupNeeded, dropoffNeeded } = transportationData;
    
    const safeName = escapeHtml(name || '');
    const safeUniqueId = escapeHtml(uniqueId || '');
    
    const hasArrivalInfo = pickupLocation || arrivalDate || arrivalTime || flightTrainNumber;
    const hasReturnInfo = returnDate || returnTime || returnFlightTrainNumber;
    const hasAnyInfo = hasArrivalInfo || hasReturnInfo;
    
    // Check if pickup/dropoff was explicitly set to "No"
    const pickupNeededNo = pickupNeeded === 'No' || pickupNeeded === 'no';
    const dropoffNeededNo = dropoffNeeded === 'No' || dropoffNeeded === 'no';
    
    // Display name - use uniqueId if name is missing or just "User {uniqueId}"
    const displayName = name && !name.startsWith('User ') ? name : (uniqueId || 'Unknown User');
    
    return `
        <div class="transportation-tab-pane profile-tab-pane ${isExpanded ? 'active' : ''}" id="transportationTab${index}" style="display: ${isExpanded ? 'block' : 'none'};">
            <div class="user-profile-card-actions">
                ${hasArrivalInfo ? `<button class="btn btn-primary btn-sm" onclick="editTransportationArrival('${safeUniqueId}');">✏️ Edit Arrival</button>` : ''}
                ${hasReturnInfo ? `<button class="btn btn-primary btn-sm" onclick="editTransportationReturn('${safeUniqueId}');">✏️ Edit Return</button>` : ''}
                ${!hasArrivalInfo ? `<button class="btn btn-primary btn-sm" onclick="editTransportationArrival('${safeUniqueId}');">✏️ Add Arrival</button>` : ''}
                ${!hasReturnInfo ? `<button class="btn btn-primary btn-sm" onclick="editTransportationReturn('${safeUniqueId}');">✏️ Add Return</button>` : ''}
            </div>
            <div class="transportation-display">
                <div class="transportation-sections-container">
                    <div class="transportation-section" data-section="arrival" data-tab-index="${index}">
                        <h4 class="section-title">🛬 Arrival Information</h4>
                        ${pickupNeededNo ? `
                        <p class="no-info" style="color: #666; font-style: italic;">No arrival request. Please click "Add Arrival" to change.</p>
                        ` : hasArrivalInfo ? `
                        <div class="info-item">
                            <span class="info-label">Pickup Needed:</span>
                            <span class="info-value">${formatValue(pickupNeeded) || 'Not specified'}</span>
                        </div>
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
                        ` : '<p class="no-info">No arrival information provided <span style="background-color: #ff4444; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; margin-left: 8px;">Missing Info</span></p>'}
                    </div>
                    <div class="transportation-section" data-section="return" data-tab-index="${index}">
                        <h4 class="section-title">🛫 Return Information</h4>
                        ${dropoffNeededNo ? `
                        <p class="no-info" style="color: #666; font-style: italic;">No departure request. Please click "Add Return" to change.</p>
                        ` : hasReturnInfo ? `
                        <div class="info-item">
                            <span class="info-label">Drop Off Needed:</span>
                            <span class="info-value">${formatValue(dropoffNeeded) || 'Not specified'}</span>
                        </div>
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
                        ` : '<p class="no-info">No return information provided <span style="background-color: #ff4444; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.85em; margin-left: 8px;">Missing Info</span></p>'}
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

// Global function to toggle transportation section (arrival/return)
function toggleTransportationSection(tabIndex, sectionName, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Find the tab pane by ID
    const tabPane = document.getElementById(`transportationTab${tabIndex}`);
    if (!tabPane) return;
    
    // Get all section buttons for this tab
    const sectionButtons = tabPane.querySelectorAll(`.transportation-section-btn[data-tab-index="${tabIndex}"]`);
    
    // Get all section content divs for this tab
    const sections = tabPane.querySelectorAll(`.transportation-section[data-tab-index="${tabIndex}"]`);
    
    // Remove active class from all buttons
    sectionButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Hide all sections
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    // Show selected section and activate its button
    const selectedSection = tabPane.querySelector(`.transportation-section[data-section="${sectionName}"][data-tab-index="${tabIndex}"]`);
    const selectedButton = tabPane.querySelector(`.transportation-section-btn[data-section="${sectionName}"][data-tab-index="${tabIndex}"]`);
    
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }
    
    if (selectedButton) {
        selectedButton.classList.add('active');
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
                                
                                // Map Excel field names to display names (prioritize form response field names)
                                const pickupLocation = regData['Place of Arrival'] || regData.pickupLocation || regData['Pickup Location'] || regData['PickupLocation'] || '';
                                const arrivalDate = regData['Date of Arrival'] || regData.arrivalDate || regData['Arrival Date'] || regData['ArrivalDate'] || '';
                                const arrivalTime = regData['Time of Arrival'] || regData.arrivalTime || regData['Arrival Time'] || regData['ArrivalTime'] || '';
                                const flightTrainNumber = regData['Arrival Flight/Train Number'] || regData.flightTrainNumber || regData['Flight/Train Number'] || regData['FlightTrainNumber'] || regData['Flight Number'] || '';
                                const returnDate = regData['Date of Departure Train/Flight'] || regData.returnDate || regData['Return Date'] || regData['ReturnDate'] || '';
                                const returnTime = regData['Time of Departure Train/Flight'] || regData.returnTime || regData['Return Time'] || regData['ReturnTime'] || '';
                                const returnFlightTrainNumber = regData['Departure Flight/Train Number'] || regData.returnFlightTrainNumber || regData['Return Flight/Train Number'] || regData['ReturnFlightTrainNumber'] || '';
                                const pickupNeeded = regData['Do you need a pickup on arrival?'] || regData.pickupNeeded || '';
                                const dropoffNeeded = regData['Do you need a drop off for departure?'] || regData.dropoffNeeded || '';
                                
                                return {
                                    uniqueId: uid,
                                    name: name,
                                    pickupLocation,
                                    arrivalDate,
                                    arrivalTime,
                                    flightTrainNumber,
                                    returnDate,
                                    returnTime,
                                    returnFlightTrainNumber,
                                    pickupNeeded,
                                    dropoffNeeded
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
                                    returnFlightTrainNumber: '',
                                    pickupNeeded: '',
                                    dropoffNeeded: ''
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
                
                // Create tabs and tab panes for each person
                const tabsHTML = validData.map((data, index) => 
                    createTransportationTabHTML(data, index, index === 0)
                ).join('');
                
                const panesHTML = validData.map((data, index) => 
                    createTransportationCardHTML(data, index, index === 0)
                ).join('');
                
                transportationInfo.innerHTML = `
                    <div class="profile-tabs-container">
                        <div class="profile-tabs">
                            ${tabsHTML}
                        </div>
                        <div class="profile-tab-content">
                            ${panesHTML}
                        </div>
                    </div>
                `;
            })
            .catch((error) => {
                // Silently ignore permission errors (happens during user creation flow)
                if (error.code === 'permission-denied') {
                    transportationInfo.innerHTML = '<p>Loading...</p>';
                    return;
                }
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
                
                // Prioritize form response field names: "Place of Arrival", "Date of Arrival", "Time of Arrival", "Arrival Flight/Train Number"
                const pickupLocation = data['Place of Arrival'] || data.pickupLocation || data['Pickup Location'] || data['PickupLocation'] || '';
                const arrivalDate = data['Date of Arrival'] || data.arrivalDate || data['Arrival Date'] || data['ArrivalDate'] || '';
                const arrivalTime = data['Time of Arrival'] || data.arrivalTime || data['Arrival Time'] || data['ArrivalTime'] || '';
                const flightTrainNumber = data['Arrival Flight/Train Number'] || data.flightTrainNumber || data['Flight/Train Number'] || data['FlightTrainNumber'] || data['Flight Number'] || '';
                const returnDate = data['Date of Departure Train/Flight'] || data.returnDate || data['Return Date'] || data['ReturnDate'] || '';
                const returnTime = data['Time of Departure Train/Flight'] || data.returnTime || data['Return Time'] || data['ReturnTime'] || '';
                const returnFlightTrainNumber = data['Departure Flight/Train Number'] || data.returnFlightTrainNumber || data['Return Flight/Train Number'] || data['ReturnFlightTrainNumber'] || '';
                const pickupNeeded = data['Do you need a pickup on arrival?'] || data.pickupNeeded || '';
                const dropoffNeeded = data['Do you need a drop off for departure?'] || data.dropoffNeeded || '';

                if (section === 'arrival') {
                    // Determine if pickup is needed (default to 'Yes' if fields are filled, 'No' if empty)
                    const needsPickup = pickupNeeded === 'Yes' || pickupNeeded === 'yes' || (pickupNeeded === '' && (pickupLocation || arrivalDate || arrivalTime || flightTrainNumber));
                    const showArrivalFields = needsPickup;
                    
                    transportationInfo.innerHTML = `
                        <h3>Edit Arrival Information</h3>
                        <form id="transportationForm" class="transportation-form">
                            <div class="transportation-section-form">
                                <h4>Arrival Details</h4>
                                <div class="form-group">
                                    <label for="pickupNeeded">Do you need a pickup on arrival? <span class="required">*</span></label>
                                    <select id="pickupNeeded" onchange="toggleArrivalFields(); validateTransportationSection('arrival');" required>
                                        <option value="">Select an option</option>
                                        <option value="Yes" ${pickupNeeded === 'Yes' || pickupNeeded === 'yes' || (pickupNeeded === '' && showArrivalFields) ? 'selected' : ''}>Yes</option>
                                        <option value="No" ${pickupNeeded === 'No' || pickupNeeded === 'no' ? 'selected' : ''}>No</option>
                                    </select>
                                </div>
                                <div id="arrivalFieldsContainer" style="display: ${showArrivalFields ? 'block' : 'none'};">
                                    <p class="form-note">All fields below are required if you need pickup.</p>
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
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">💾 Save Arrival Details</button>
                                <button type="button" class="btn btn-secondary" onclick="loadTransportationInfo(firebase.auth().currentUser)">❌ Cancel</button>
                            </div>
                        </form>
                    `;
                } else {
                    // Determine if dropoff is needed (default to 'Yes' if fields are filled, 'No' if empty)
                    const needsDropoff = dropoffNeeded === 'Yes' || dropoffNeeded === 'yes' || (dropoffNeeded === '' && (returnDate || returnTime || returnFlightTrainNumber));
                    const showReturnFields = needsDropoff;
                    
                    transportationInfo.innerHTML = `
                        <h3>Edit Return Information</h3>
                        <form id="transportationForm" class="transportation-form">
                            <div class="transportation-section-form">
                                <h4>Return Details</h4>
                                <div class="form-group">
                                    <label for="dropoffNeeded">Do you need a drop off for departure? <span class="required">*</span></label>
                                    <select id="dropoffNeeded" onchange="toggleReturnFields(); validateTransportationSection('return');" required>
                                        <option value="">Select an option</option>
                                        <option value="Yes" ${dropoffNeeded === 'Yes' || dropoffNeeded === 'yes' || (dropoffNeeded === '' && showReturnFields) ? 'selected' : ''}>Yes</option>
                                        <option value="No" ${dropoffNeeded === 'No' || dropoffNeeded === 'no' ? 'selected' : ''}>No</option>
                                    </select>
                                </div>
                                <div id="returnFieldsContainer" style="display: ${showReturnFields ? 'block' : 'none'};">
                                    <p class="form-note">All fields below are required if you need drop off.</p>
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
                            const pickupNeeded = document.getElementById('pickupNeeded')?.value.trim() || '';
                            if (!pickupNeeded) {
                                showNotification('Please answer whether you need a pickup on arrival.', 'error');
                                return;
                            }
                            
                            if (pickupNeeded === 'Yes') {
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
                            }
                        } else if (section === 'return') {
                            const dropoffNeeded = document.getElementById('dropoffNeeded')?.value.trim() || '';
                            if (!dropoffNeeded) {
                                showNotification('Please answer whether you need a drop off for departure.', 'error');
                                return;
                            }
                            
                            if (dropoffNeeded === 'Yes') {
                                const returnDate = document.getElementById('returnDate')?.value.trim() || '';
                                const returnTime = document.getElementById('returnTime')?.value.trim() || '';
                                const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
                                
                                if (!returnDate || !returnTime || !returnFlightTrainNumber) {
                                    showNotification('Please fill all return details: Date, Time, and Flight/Train Number are required.', 'error');
                                    validateTransportationSection('return');
                                    return;
                                }
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
                
                // Prioritize form response field names: "Place of Arrival", "Date of Arrival", "Time of Arrival", "Arrival Flight/Train Number"
                const pickupLocation = data['Place of Arrival'] || data.pickupLocation || data['Pickup Location'] || data['PickupLocation'] || '';
                const arrivalDate = data['Date of Arrival'] || data.arrivalDate || data['Arrival Date'] || data['ArrivalDate'] || '';
                const arrivalTime = data['Time of Arrival'] || data.arrivalTime || data['Arrival Time'] || data['ArrivalTime'] || '';
                const flightTrainNumber = data['Arrival Flight/Train Number'] || data.flightTrainNumber || data['Flight/Train Number'] || data['FlightTrainNumber'] || data['Flight Number'] || '';
                const returnDate = data['Date of Departure Train/Flight'] || data.returnDate || data['Return Date'] || data['ReturnDate'] || '';
                const returnTime = data['Time of Departure Train/Flight'] || data.returnTime || data['Return Time'] || data['ReturnTime'] || '';
                const returnFlightTrainNumber = data['Departure Flight/Train Number'] || data.returnFlightTrainNumber || data['Return Flight/Train Number'] || data['ReturnFlightTrainNumber'] || '';
                const pickupNeeded = data['Do you need a pickup on arrival?'] || data.pickupNeeded || '';
                const dropoffNeeded = data['Do you need a drop off for departure?'] || data.dropoffNeeded || '';
                
                // Determine if pickup/dropoff is needed (default to 'Yes' if fields are filled, 'No' if empty)
                const needsPickup = pickupNeeded === 'Yes' || pickupNeeded === 'yes' || (pickupNeeded === '' && (pickupLocation || arrivalDate || arrivalTime || flightTrainNumber));
                const needsDropoff = dropoffNeeded === 'Yes' || dropoffNeeded === 'yes' || (dropoffNeeded === '' && (returnDate || returnTime || returnFlightTrainNumber));
                const showArrivalFields = needsPickup;
                const showReturnFields = needsDropoff;

                transportationInfo.innerHTML = `
                    <h3>Edit Transportation Details</h3>
                    <form id="transportationForm" class="transportation-form">
                        <div class="transportation-section-form">
                            <h4>🛬 Arrival Information</h4>
                            <div class="form-group">
                                <label for="pickupNeeded">Do you need a pickup on arrival?</label>
                                <select id="pickupNeeded" onchange="toggleArrivalFields(); validateTransportationSection('arrival');">
                                    <option value="">Select an option</option>
                                    <option value="Yes" ${pickupNeeded === 'Yes' || pickupNeeded === 'yes' || (pickupNeeded === '' && showArrivalFields) ? 'selected' : ''}>Yes</option>
                                    <option value="No" ${pickupNeeded === 'No' || pickupNeeded === 'no' ? 'selected' : ''}>No</option>
                                </select>
                            </div>
                            <div id="arrivalFieldsContainer" style="display: ${showArrivalFields ? 'block' : 'none'};">
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
                        </div>
                        <div class="transportation-section-form">
                            <h4>🛫 Return Information</h4>
                            <div class="form-group">
                                <label for="dropoffNeeded">Do you need a drop off for departure?</label>
                                <select id="dropoffNeeded" onchange="toggleReturnFields(); validateTransportationSection('return');">
                                    <option value="">Select an option</option>
                                    <option value="Yes" ${dropoffNeeded === 'Yes' || dropoffNeeded === 'yes' || (dropoffNeeded === '' && showReturnFields) ? 'selected' : ''}>Yes</option>
                                    <option value="No" ${dropoffNeeded === 'No' || dropoffNeeded === 'no' ? 'selected' : ''}>No</option>
                                </select>
                            </div>
                            <div id="returnFieldsContainer" style="display: ${showReturnFields ? 'block' : 'none'};">
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
                        const pickupNeeded = document.getElementById('pickupNeeded')?.value.trim() || '';
                        const dropoffNeeded = document.getElementById('dropoffNeeded')?.value.trim() || '';
                        
                        if (pickupNeeded === 'Yes') {
                            const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
                            const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
                            const pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
                            const arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
                            const arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
                            const flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
                            
                            // Check arrival validation
                            if (!pickupLocation || !arrivalDate || !arrivalTime || !flightTrainNumber) {
                                showNotification('Please fill all arrival details (Pickup Location, Date, Time, and Flight/Train Number) when pickup is needed.', 'error');
                                validateTransportationSection('arrival');
                                return;
                            }
                            
                            if (pickupLocationSelect === 'Other' && !pickupLocationOther) {
                                showNotification('Please specify the other pickup location.', 'error');
                                return;
                            }
                        }
                        
                        if (dropoffNeeded === 'Yes') {
                            const returnDate = document.getElementById('returnDate')?.value.trim() || '';
                            const returnTime = document.getElementById('returnTime')?.value.trim() || '';
                            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
                            
                            // Check return validation
                            if (!returnDate || !returnTime || !returnFlightTrainNumber) {
                                showNotification('Please fill all return details (Date, Time, and Flight/Train Number) when drop off is needed.', 'error');
                                validateTransportationSection('return');
                                return;
                            }
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

    const pickupNeeded = document.getElementById('pickupNeeded')?.value.trim() || '';
    const dropoffNeeded = document.getElementById('dropoffNeeded')?.value.trim() || '';
    
    let pickupLocation = '';
    let arrivalDate = '';
    let arrivalTime = '';
    let flightTrainNumber = '';
    let returnDate = '';
    let returnTime = '';
    let returnFlightTrainNumber = '';
    
    if (pickupNeeded === 'Yes') {
        const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
        const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
        pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
        arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
        arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
        flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
    }
    
    if (dropoffNeeded === 'Yes') {
        returnDate = document.getElementById('returnDate')?.value.trim() || '';
        returnTime = document.getElementById('returnTime')?.value.trim() || '';
        returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
    }

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
                            pickupNeeded: pickupNeeded || '',
                            dropoffNeeded: dropoffNeeded || '',
                            transportationUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        // Update form response field names (prioritize these)
                        updateData['Place of Arrival'] = pickupLocation || '';
                        updateData['Date of Arrival'] = arrivalDate || '';
                        updateData['Time of Arrival'] = arrivalTime || '';
                        updateData['Arrival Flight/Train Number'] = flightTrainNumber || '';
                        updateData['Do you need a pickup on arrival?'] = pickupNeeded || '';
                        updateData['Date of Departure Train/Flight'] = returnDate || '';
                        updateData['Time of Departure Train/Flight'] = returnTime || '';
                        updateData['Departure Flight/Train Number'] = returnFlightTrainNumber || '';
                        updateData['Do you need a drop off for departure?'] = dropoffNeeded || '';
                        
                        // Update Excel column names (with special characters) only if they exist (for backward compatibility)
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
    let pickupNeeded = '';
    let dropoffNeeded = '';

    if (section === 'arrival') {
        pickupNeeded = document.getElementById('pickupNeeded')?.value.trim() || '';
        if (!pickupNeeded) {
            showNotification('Please answer whether you need a pickup on arrival.', 'error');
            return;
        }
        
        if (pickupNeeded === 'Yes') {
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
        } else {
            // If No, clear all arrival fields
            pickupLocation = '';
            arrivalDate = '';
            arrivalTime = '';
            flightTrainNumber = '';
        }
    } else if (section === 'return') {
        dropoffNeeded = document.getElementById('dropoffNeeded')?.value.trim() || '';
        if (!dropoffNeeded) {
            showNotification('Please answer whether you need a drop off for departure.', 'error');
            return;
        }
        
        if (dropoffNeeded === 'Yes') {
            returnDate = document.getElementById('returnDate')?.value.trim() || '';
            returnTime = document.getElementById('returnTime')?.value.trim() || '';
            returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
            
            // Validate all return fields are filled
            if (!returnDate || !returnTime || !returnFlightTrainNumber) {
                showNotification('Please fill all return details: Date, Time, and Flight/Train Number are required.', 'error');
                return;
            }
        } else {
            // If No, clear all return fields
            returnDate = '';
            returnTime = '';
            returnFlightTrainNumber = '';
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
                            updateData.pickupNeeded = pickupNeeded;
                            
                            // Update form response field names (prioritize these)
                            updateData['Place of Arrival'] = pickupLocation;
                            updateData['Date of Arrival'] = arrivalDate;
                            updateData['Time of Arrival'] = arrivalTime;
                            updateData['Arrival Flight/Train Number'] = flightTrainNumber;
                            updateData['Do you need a pickup on arrival?'] = pickupNeeded;
                            
                            // Update Excel column names if they exist (for backward compatibility)
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
                            updateData.dropoffNeeded = dropoffNeeded;
                            
                            // Update form response field names (prioritize these)
                            updateData['Date of Departure Train/Flight'] = returnDate;
                            updateData['Time of Departure Train/Flight'] = returnTime;
                            updateData['Departure Flight/Train Number'] = returnFlightTrainNumber;
                            updateData['Do you need a drop off for departure?'] = dropoffNeeded;
                            
                            // Update Excel column names if they exist (for backward compatibility)
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

// Toggle arrival fields based on pickup needed answer
function toggleArrivalFields() {
    const pickupNeeded = document.getElementById('pickupNeeded');
    const arrivalFieldsContainer = document.getElementById('arrivalFieldsContainer');
    
    if (pickupNeeded && arrivalFieldsContainer) {
        const needsPickup = pickupNeeded.value === 'Yes';
        
        if (needsPickup) {
            arrivalFieldsContainer.style.display = 'block';
            // Make fields required
            const pickupLocation = document.getElementById('pickupLocation');
            const arrivalDate = document.getElementById('arrivalDate');
            const arrivalTime = document.getElementById('arrivalTime');
            const flightTrainNumber = document.getElementById('flightTrainNumber');
            if (pickupLocation) pickupLocation.required = true;
            if (arrivalDate) arrivalDate.required = true;
            if (arrivalTime) arrivalTime.required = true;
            if (flightTrainNumber) flightTrainNumber.required = true;
        } else {
            arrivalFieldsContainer.style.display = 'none';
            // Make fields not required and clear them
            const pickupLocation = document.getElementById('pickupLocation');
            const arrivalDate = document.getElementById('arrivalDate');
            const arrivalTime = document.getElementById('arrivalTime');
            const flightTrainNumber = document.getElementById('flightTrainNumber');
            if (pickupLocation) {
                pickupLocation.required = false;
                pickupLocation.value = '';
            }
            if (arrivalDate) {
                arrivalDate.required = false;
                arrivalDate.value = '';
            }
            if (arrivalTime) {
                arrivalTime.required = false;
                arrivalTime.value = '';
            }
            if (flightTrainNumber) {
                flightTrainNumber.required = false;
                flightTrainNumber.value = '';
            }
            // Also clear "Other" location if visible
            const pickupLocationOther = document.getElementById('pickupLocationOther');
            if (pickupLocationOther) {
                pickupLocationOther.value = '';
            }
            const pickupLocationOtherContainer = document.getElementById('pickupLocationOtherContainer');
            if (pickupLocationOtherContainer) {
                pickupLocationOtherContainer.style.display = 'none';
            }
        }
    }
}

// Toggle return fields based on dropoff needed answer
function toggleReturnFields() {
    const dropoffNeeded = document.getElementById('dropoffNeeded');
    const returnFieldsContainer = document.getElementById('returnFieldsContainer');
    
    if (dropoffNeeded && returnFieldsContainer) {
        const needsDropoff = dropoffNeeded.value === 'Yes';
        
        if (needsDropoff) {
            returnFieldsContainer.style.display = 'block';
            // Make fields required
            const returnDate = document.getElementById('returnDate');
            const returnTime = document.getElementById('returnTime');
            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber');
            if (returnDate) returnDate.required = true;
            if (returnTime) returnTime.required = true;
            if (returnFlightTrainNumber) returnFlightTrainNumber.required = true;
        } else {
            returnFieldsContainer.style.display = 'none';
            // Make fields not required and clear them
            const returnDate = document.getElementById('returnDate');
            const returnTime = document.getElementById('returnTime');
            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber');
            if (returnDate) {
                returnDate.required = false;
                returnDate.value = '';
            }
            if (returnTime) {
                returnTime.required = false;
                returnTime.value = '';
            }
            if (returnFlightTrainNumber) {
                returnFlightTrainNumber.required = false;
                returnFlightTrainNumber.value = '';
            }
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

// Helper function to create tours tab button HTML
function createToursTabHTML(toursData, index, isActive = false) {
    const displayName = escapeHtml(toursData.name || `ID: ${toursData.uniqueId}`);
    return `
        <button class="profile-tab-btn ${isActive ? 'active' : ''}" 
                onclick="switchToursTab(${index})" 
                data-tab-index="${index}">
            ${displayName}
        </button>
    `;
}

// Function to switch tours tabs
function switchToursTab(index) {
    const toursInfo = document.getElementById('toursInfo');
    if (!toursInfo) return;
    
    // Remove active class from all tab buttons within tours section
    const tabButtons = toursInfo.querySelectorAll('.profile-tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all tours tab panes
    const tabPanes = toursInfo.querySelectorAll('.tours-tab-pane');
    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });
    
    // Show selected tab pane
    const selectedPane = document.getElementById(`toursTab${index}`);
    if (selectedPane) {
        selectedPane.classList.add('active');
        selectedPane.style.display = 'block';
    }
    
    // Activate selected tab button
    const selectedButton = toursInfo.querySelector(`.profile-tab-btn[data-tab-index="${index}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
}

// Helper function to create tours card HTML for a single person
function createToursCardHTML(toursData, index, isActive = false) {
    const { uniqueId, name, postShibirTour } = toursData;
    
    // Get post shibir tour field
    const tourValue = postShibirTour ? postShibirTour.toString().trim() : '';
    const tourValueLower = tourValue.toLowerCase();
    
    // Handle Kandukurthi - default to Yadadri and show note
    let showKandukurthiNote = false;
    let activeTab = 'none';
    if (tourValueLower.includes('kandakurthi')) {
        showKandukurthiNote = true;
        activeTab = 'yadadri';
    } else if (tourValueLower.includes('srisailam')) {
        activeTab = 'srisailam';
    } else if (tourValueLower.includes('yadadri') || tourValueLower.includes('bhagyanagar')) {
        activeTab = 'yadadri';
    }
    
    // Display only the selected tour with Change Tour option
    let tourDisplayName = 'None';
    let tourDescription = 'No post shibir tour selected.';
    let tourImage = '';
    
    if (activeTab === 'srisailam') {
        tourDisplayName = 'Srisailam';
        tourDescription = 'Information about the Srisailam tour will be displayed here.';
        tourImage = '<img src="docs/Srisailam.jpg" alt="Srisailam" class="tour-image" onerror="this.style.display=\'none\'">';
    } else if (activeTab === 'yadadri') {
        tourDisplayName = 'Yadadri Mandir and local sites in Bhagyanagar';
        tourDescription = 'Information about Yadadri Mandir and local sites in Bhagyanagar tour will be displayed here.';
    }
    
    return `
        <div class="tours-tab-pane ${isActive ? 'active' : ''}" id="toursTab${index}" style="display: ${isActive ? 'block' : 'none'};">
            <div class="tour-display-section">
                <h3>Your Selected Tour</h3>
                ${showKandukurthiNote ? `
                    <div class="tour-notice" style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 10px; padding: 1.5rem; margin-bottom: 2rem;">
                        <p style="color: #856404; font-weight: 600; margin-bottom: 0.5rem;">⚠️ Important Notice</p>
                        <p style="color: #856404; margin: 0;">We regret to inform you that the tour to Kandakurthi has to be cancelled as the project undertaken there is not yet complete. You have been added to Yadadri Mandir and local sites in Bhagyanagar tour. If you plan to change, please scroll to bottom to change.</p>
                    </div>
                ` : ''}
                <div class="tour-content-display">
                    ${tourImage}
                    <h4 style="color: var(--primary-brown); margin-top: 1rem;">${escapeHtml(tourDisplayName)}</h4>
                    <p class="tour-description">${tourDescription}</p>
                </div>
                <div class="tour-actions" style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid var(--light-cream);">
                    <button class="btn btn-primary" onclick="editToursInfo('${uniqueId}')">Change Tour</button>
                </div>
            </div>
        </div>
    `;
}

// Load tours information - now per ID like My Transportation and My Profile
function loadToursInfo(user) {
    const toursInfo = document.getElementById('toursInfo');
    if (!toursInfo) return;
    
    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        
        // First get user document
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    toursInfo.innerHTML = '<p>Tours information not found.</p>';
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
                        console.error('Error checking emailToUids in loadToursInfo:', error);
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
                    toursInfo.innerHTML = '<p>Tours information not found.</p>';
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
                    toursInfo.innerHTML = '<p>Error: User unique ID not found.</p>';
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
                
                // Fetch all registration documents for tours info
                const registrationPromises = uniqueIdsToFetch.map(uid => {
                    return db.collection('registrations').doc(uid).get()
                        .then(regDoc => {
                            if (regDoc.exists) {
                                const regData = regDoc.data();
                                // Try to get name from registration, then from associatedRegistrations, then use uniqueId as fallback
                                const name = regData.name || regData['Full Name'] || nameLookup[uid] || `User ${uid}`;
                                
                                // Get post shibir tour field
                                let postShibirTour = regData.postShibirTour || 
                                                    regData['Post Shibir Tour'] || 
                                                    regData['Post Shibir Tours'] ||
                                                    regData['Please select a post shibir tour option'] ||
                                                    null;
                                
                                // Fallback: try to find any field containing "tour" and "post"/"shibir"
                                if (!postShibirTour) {
                                    const allKeys = Object.keys(regData);
                                    const tourKey = allKeys.find(key => {
                                        const lowerKey = key.toLowerCase();
                                        return (lowerKey.includes('tour') && (lowerKey.includes('post') || lowerKey.includes('shibir'))) ||
                                               (lowerKey.includes('post') && lowerKey.includes('shibir'));
                                    });
                                    
                                    if (tourKey) {
                                        postShibirTour = regData[tourKey];
                                    }
                                }
                                
                                return {
                                    uniqueId: uid,
                                    name: name,
                                    postShibirTour: postShibirTour
                                };
                            } else {
                                // Use name from associatedRegistrations if available, otherwise use uniqueId as identifier
                                const name = nameLookup[uid] || `User ${uid}`;
                                return {
                                    uniqueId: uid,
                                    name: name,
                                    postShibirTour: null
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
                                postShibirTour: null
                            };
                        });
                });
                
                return Promise.all(registrationPromises);
            })
            .then((toursDataArray) => {
                // Filter out null results and ensure we have valid data with uniqueId
                const validData = toursDataArray.filter(data => data && data.uniqueId);
                
                if (validData.length === 0) {
                    toursInfo.innerHTML = '<p>No users found associated with this account.</p>';
                    return;
                }
                
                // Create tabs and tab panes for each person
                const tabsHTML = validData.map((data, index) => 
                    createToursTabHTML(data, index, index === 0)
                ).join('');
                
                const panesHTML = validData.map((data, index) => 
                    createToursCardHTML(data, index, index === 0)
                ).join('');
                
                toursInfo.innerHTML = `
                    <div class="profile-tabs-container">
                        <div class="profile-tabs">
                            ${tabsHTML}
                        </div>
                        <div class="profile-tab-content">
                            ${panesHTML}
                        </div>
                    </div>
                `;
            })
            .catch((error) => {
                // Silently ignore permission errors (happens during user creation flow)
                if (error.code === 'permission-denied') {
                    toursInfo.innerHTML = '<p>Loading...</p>';
                    return;
                }
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
                                throw new Error('You can only update tour information for accounts associated with your email.');
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
                        
                        // Prepare update data - update both camelCase and original field names
                        const updateData = {
                            ...existingData,
                            postShibirTour: postShibirTour,
                            'Post Shibir Tour': postShibirTour,
                            'Post Shibir Tours': postShibirTour,
                            'Please select a post shibir tour option': postShibirTour,
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

// Admin Dashboard Functions
async function loadAdminDashboard(user) {
    // Verify user is admin (superadmin or admin)
    const isAdminUser = await isAdmin(user);
    if (!isAdminUser) {
        const loadingDiv = document.getElementById('adminDashboardLoading');
        if (loadingDiv) {
            loadingDiv.innerHTML = '<p style="color: red;">Access denied. You do not have permission to view this dashboard.</p>';
        }
        return;
    }
    
    const loadingDiv = document.getElementById('adminDashboardLoading');
    const dataDiv = document.getElementById('adminDashboardData');
    
    if (!loadingDiv || !dataDiv) return;
    
    loadingDiv.style.display = 'block';
    dataDiv.style.display = 'none';
    
    if (!window.firebase || !firebase.firestore) {
        loadingDiv.innerHTML = '<p style="color: red;">Firebase not initialized.</p>';
        return;
    }
    
    try {
        const db = firebase.firestore();
        const CACHE_KEY = 'adminDashboardStatsCache';
        const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds
        
        // Check cache first
        const cachedData = getCachedData(CACHE_KEY, CACHE_MAX_AGE);
        let registrations, users, stats;
        
        if (cachedData) {
            // Use cached data
            registrations = cachedData.registrations;
            users = cachedData.users;
            stats = cachedData.stats;
        } else {
            // Cache expired or missing - fetch fresh data
            // Fetch all registrations
            const registrationsSnapshot = await db.collection('registrations').get();
            registrations = [];
            registrationsSnapshot.forEach(doc => {
                registrations.push(doc.data());
            });
            
            // Fetch all users
            const usersSnapshot = await db.collection('users').get();
            users = [];
            usersSnapshot.forEach(doc => {
                users.push(doc.data());
            });
            
            // Calculate statistics
            stats = calculateStatistics(registrations, users);
            
            // Cache the results
            setCachedData(CACHE_KEY, {
                registrations: registrations,
                users: users,
                stats: stats
            });
        }
        
        // Display statistics
        displayAdminStatistics(stats, registrations);
        
        // Load transportation analytics
        loadTransportationAnalytics(registrations);
        
        // Load transportation changes (default to "all")
        loadTransportationChanges('all');
        
        // Load checkin analytics
        await loadCheckinAnalytics();
        
        // Show data div, hide loading
        loadingDiv.style.display = 'none';
        dataDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        loadingDiv.innerHTML = '<p style="color: red;">Error loading dashboard data. Please try again.</p>';
    }
}

// User Management Functions

// Generate a secure random password
function generateSecurePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const crypto = window.crypto || window.msCrypto;
    
    if (crypto && crypto.getRandomValues) {
        const values = new Uint32Array(length);
        crypto.getRandomValues(values);
        for (let i = 0; i < length; i++) {
            password += charset[values[i] % charset.length];
        }
    } else {
        // Fallback for older browsers
        for (let i = 0; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }
    }
    
    return password;
}

// Create a new user (volunteer or admin)
async function createNewUser(name, email, uniqueId, role) {
    if (!window.firebase || !firebase.auth || !firebase.firestore) {
        throw new Error('Firebase not initialized');
    }
    
    // Verify current user is admin
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        throw new Error('Not authenticated');
    }
    
    const isAdminUser = await isAdmin(currentUser);
    if (!isAdminUser) {
        throw new Error('Permission denied. Only admins can create users.');
    }
    
    // Validate inputs
    if (!name || !name.trim()) {
        throw new Error('Name is required');
    }
    if (!uniqueId || !uniqueId.trim()) {
        throw new Error('ID is required');
    }
    if (!role || (role !== 'volunteer' && role !== 'admin')) {
        throw new Error('Role must be either "volunteer" or "admin"');
    }
    
    // Validate email format if provided
    if (email && email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }
    }
    
    const trimmedEmail = email ? email.trim() : '';
    const trimmedName = name.trim();
    const trimmedUniqueId = uniqueId.trim();
    
    // Generate secure random password
    const tempPassword = generateSecurePassword(12);
    
    try {
        // Store current auth credentials to restore later
        const currentUserEmail = currentUser.email;
        
        // If no email provided, generate a placeholder email using the uniqueId
        const userEmail = trimmedEmail || `${trimmedUniqueId}@placeholder.local`;
        
        // Create the user account
        // NOTE: This will sign out the current user and sign in the new user
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(userEmail, tempPassword);
        const newUser = userCredential.user;
        
        // Create user document in Firestore
        const db = firebase.firestore();
        await db.collection('users').doc(newUser.uid).set({
            email: trimmedEmail || null,
            name: trimmedName,
            uniqueId: trimmedUniqueId,
            role: role,
            country: 'Bharat',
            shreni: 'Volunteer',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid
        });
        
        // Also create a registration record for volunteers/admins
        // This allows them to have profile information like shibirarthi
        const normalizedId = trimmedUniqueId.toLowerCase().replace(/[/-]/g, '');
        await db.collection('registrations').doc(trimmedUniqueId).set({
            uniqueId: trimmedUniqueId,
            normalizedId: normalizedId,
            name: trimmedName,
            email: trimmedEmail || null,
            country: 'Bharat',
            Country: 'Bharat',
            shreni: 'Volunteer',
            Shreni: 'Volunteer',
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid
        });
        
        // Sign out the newly created user
        await firebase.auth().signOut();
        
        // Send password reset email to the new user (only if email provided)
        if (trimmedEmail) {
            try {
                await firebase.auth().sendPasswordResetEmail(trimmedEmail);
            } catch (emailError) {
                console.warn('Could not send password reset email:', emailError);
            }
        }
        
        return {
            success: true,
            uid: newUser.uid,
            email: trimmedEmail || 'No email provided',
            name: trimmedName,
            uniqueId: trimmedUniqueId,
            role: role,
            temporaryPassword: tempPassword,
            needsReauth: true,
            adminEmail: currentUserEmail
        };
        
    } catch (error) {
        console.error('Error creating user:', error);
        
        // Handle specific error cases
        if (error.code === 'auth/email-already-in-use') {
            throw new Error('This email is already registered');
        } else if (error.code === 'auth/invalid-email') {
            throw new Error('Invalid email address');
        } else if (error.code === 'auth/weak-password') {
            throw new Error('Password is too weak');
        } else {
            throw new Error(error.message || 'Failed to create user');
        }
    }
}

// Load and display user management UI
async function loadUserManagement() {
    if (!window.firebase || !firebase.firestore) {
        console.error('Firebase not initialized');
        return;
    }
    
    try {
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) return;
        
        // Verify user is admin
        const isAdminUser = await isAdmin(currentUser);
        if (!isAdminUser) return;
        
        const db = firebase.firestore();
        
        // Fetch all users with role (volunteers and admins)
        const usersSnapshot = await db.collection('users')
            .where('role', 'in', ['volunteer', 'admin'])
            .get();
        
        const users = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                uid: doc.id,
                ...data
            });
        });
        
        // Sort by creation date (newest first)
        users.sort((a, b) => {
            if (a.createdAt && b.createdAt) {
                return b.createdAt.toMillis() - a.createdAt.toMillis();
            }
            return 0;
        });
        
        displayUserManagementUI(users);
        
    } catch (error) {
        console.error('Error loading user management:', error);
    }
}

// Load the User Management page
async function loadUserManagementPage(user) {
    // Verify user is admin
    const isAdminUser = await isAdmin(user);
    if (!isAdminUser) {
        const loadingDiv = document.getElementById('userManagementLoading');
        if (loadingDiv) {
            loadingDiv.innerHTML = '<p style="color: red;">Access denied. You do not have permission to view this page.</p>';
        }
        return;
    }
    
    const loadingDiv = document.getElementById('userManagementLoading');
    const dataDiv = document.getElementById('userManagementData');
    
    if (!loadingDiv || !dataDiv) return;
    
    loadingDiv.style.display = 'block';
    dataDiv.style.display = 'none';
    
    if (!window.firebase || !firebase.firestore) {
        loadingDiv.innerHTML = '<p style="color: red;">Firebase not initialized.</p>';
        return;
    }
    
    try {
        // Load user management data
        await loadUserManagement();
        
        // Show data div, hide loading
        loadingDiv.style.display = 'none';
        dataDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading user management page:', error);
        loadingDiv.innerHTML = '<p style="color: red;">Error loading user management. Please try again.</p>';
    }
}

// Display user management UI
function displayUserManagementUI(users) {
    // We'll insert this into the admin dashboard
    // The HTML structure will be added to index.html
    const userListContainer = document.getElementById('userManagementList');
    if (!userListContainer) return;
    
    if (users.length === 0) {
        userListContainer.innerHTML = '<p>No users found.</p>';
        return;
    }
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>ID</th>
                    <th>Role</th>
                    <th>Created</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    users.forEach(user => {
        const createdDate = user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'N/A';
        const roleBadgeClass = user.role === 'admin' ? 'role-badge-admin' : 'role-badge-volunteer';
        
        html += `
            <tr>
                <td>${escapeHtml(user.name || 'N/A')}</td>
                <td>${escapeHtml(user.email || 'N/A')}</td>
                <td>${escapeHtml(user.uniqueId || '-')}</td>
                <td><span class="role-badge ${roleBadgeClass}">${escapeHtml(user.role || 'N/A')}</span></td>
                <td>${createdDate}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    userListContainer.innerHTML = html;
}

// Helper function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Handle user creation form submission
async function handleUserCreationSubmit(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('newUserName');
    const emailInput = document.getElementById('newUserEmail');
    const idInput = document.getElementById('newUserId');
    const roleSelect = document.getElementById('newUserRole');
    const submitButton = event.target.querySelector('button[type="submit"]');
    const messageContainer = document.getElementById('userCreationMessage');
    
    if (!nameInput || !emailInput || !roleSelect) {
        console.error('Form inputs not found');
        return;
    }
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const uniqueId = idInput ? idInput.value.trim() : '';
    const role = roleSelect.value;
    
    // Disable form during submission
    if (submitButton) submitButton.disabled = true;
    if (messageContainer) {
        messageContainer.style.display = 'block';
        messageContainer.className = 'user-creation-message info';
        messageContainer.textContent = 'Creating user...';
    }
    
    try {
        const result = await createNewUser(name, email, uniqueId, role);
        
        // Show success message with important note about re-authentication
        if (messageContainer) {
            messageContainer.className = 'user-creation-message success';
            const emailDisplay = result.email !== 'No email provided' 
                ? `<strong>Email:</strong> ${escapeHtml(result.email)}<br>` 
                : '<strong>Email:</strong> Not provided<br>';
            const emailSentNote = result.email !== 'No email provided'
                ? `<em>A password reset email has been sent to ${escapeHtml(result.email)}.</em><br><br>`
                : '<em>No email provided - user must use the temporary password shown below.</em><br><br>';
            
            messageContainer.innerHTML = `
                <strong>Success!</strong> User created successfully.<br>
                <strong>Name:</strong> ${escapeHtml(result.name)}<br>
                <strong>ID:</strong> ${escapeHtml(result.uniqueId)}<br>
                ${emailDisplay}
                <strong>Temporary Password:</strong> <code>${escapeHtml(result.temporaryPassword)}</code><br>
                ${emailSentNote}
                <strong style="color: #ff6b35;">Note:</strong> You have been signed out. Please log back in to continue.<br>
                <button class="btn btn-primary" onclick="window.location.reload()">Reload and Login</button>
            `;
        }
        
        // Clear form
        nameInput.value = '';
        emailInput.value = '';
        if (idInput) idInput.value = '';
        roleSelect.value = 'volunteer';
        
    } catch (error) {
        console.error('Error creating user:', error);
        
        if (messageContainer) {
            messageContainer.className = 'user-creation-message error';
            messageContainer.innerHTML = `<strong>Error:</strong> ${escapeHtml(error.message)}`;
        }
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

function calculateStatistics(registrations, users) {
    const stats = {
        totalRegistrations: registrations.length,
        totalUsers: users.length,
        totalUserAccounts: 0, // Unique email addresses
        totalPraveshikaIds: registrations.length,
        countryBreakdown: {},
        zoneBreakdown: {},
        zoneCountryMap: {}, // Map of zone -> {country: count}
        shreniBreakdown: {},
        tourBreakdown: {},
        pickupBreakdown: {},
        dropoffBreakdown: {},
        genderBreakdown: {}
    };
    
    // Count unique email addresses
    const uniqueEmails = new Set();
    users.forEach(user => {
        if (user.email) {
            uniqueEmails.add(user.email.toLowerCase().trim());
        }
    });
    stats.totalUserAccounts = uniqueEmails.size;
    
    // Process each registration
    registrations.forEach(reg => {
        // Country breakdown
        const country = reg.Country || reg.country || reg['Country of Current Residence'] || 'Unknown';
        stats.countryBreakdown[country] = (stats.countryBreakdown[country] || 0) + 1;
        
        // Zone breakdown (zone can be in various fields)
        const zone = reg.Zone || reg.zone || reg['Zone/Shreni'] || reg['Zone'] || 'Unknown';
        stats.zoneBreakdown[zone] = (stats.zoneBreakdown[zone] || 0) + 1;
        
        // Build zone -> country mapping
        if (!stats.zoneCountryMap[zone]) {
            stats.zoneCountryMap[zone] = {};
        }
        stats.zoneCountryMap[zone][country] = (stats.zoneCountryMap[zone][country] || 0) + 1;
        
        // Shreni breakdown
        const shreni = reg.Shreni || reg.shreni || reg['Corrected Shreni'] || reg['Default Shreni'] || 'Unknown';
        stats.shreniBreakdown[shreni] = (stats.shreniBreakdown[shreni] || 0) + 1;
        
        // Tour breakdown
        const tour = reg.postShibirTour || reg['Post Shibir Tour'] || reg['Post Shibir Tours'] || 
                    reg['Please select a post shibir tour option'] || 'Not Selected';
        stats.tourBreakdown[tour] = (stats.tourBreakdown[tour] || 0) + 1;
        
        // Pickup location breakdown
        const pickup = reg.pickupLocation || reg['Pickup Location'] || 
                      reg['Do you need a pickup on arrival?'] || 'Not Specified';
        stats.pickupBreakdown[pickup] = (stats.pickupBreakdown[pickup] || 0) + 1;
        
        // Dropoff location breakdown
        const dropoff = reg.dropoffLocation || reg['Dropoff Location'] || 
                       reg['Drop-off Location'] || reg['Return Location'] || 'Not Specified';
        stats.dropoffBreakdown[dropoff] = (stats.dropoffBreakdown[dropoff] || 0) + 1;
        
        // Gender breakdown
        const gender = reg.gender || reg.Gender || 'Not Specified';
        stats.genderBreakdown[gender] = (stats.genderBreakdown[gender] || 0) + 1;
    });
    
    // Calculate totals for percentages
    stats.totalCountries = Object.keys(stats.countryBreakdown).length;
    stats.totalShrenis = Object.keys(stats.shreniBreakdown).length;
    
    return stats;
}

function displayAdminStatistics(stats, registrations) {
    // Update metric cards with null checks
    const totalRegistrationsEl = document.getElementById('totalRegistrations');
    if (totalRegistrationsEl) {
        totalRegistrationsEl.textContent = stats.totalRegistrations;
    }
    
    const totalUsersEl = document.getElementById('totalUsers');
    if (totalUsersEl) {
        totalUsersEl.textContent = stats.totalUsers;
    }
    
    const totalUserAccountsEl = document.getElementById('totalUserAccounts');
    if (totalUserAccountsEl) {
        totalUserAccountsEl.textContent = stats.totalUserAccounts;
    }
    
    const totalPraveshikaIdsEl = document.getElementById('totalPraveshikaIds');
    if (totalPraveshikaIdsEl) {
        totalPraveshikaIdsEl.textContent = stats.totalPraveshikaIds;
    }
    
    const totalCountriesEl = document.getElementById('totalCountries');
    if (totalCountriesEl) {
        totalCountriesEl.textContent = stats.totalCountries;
    }
    
    const totalShrenisEl = document.getElementById('totalShrenis');
    if (totalShrenisEl) {
        totalShrenisEl.textContent = stats.totalShrenis;
    }
    
    // Display zone breakdown with clickable rows
    displayZoneBreakdownTable(stats.zoneBreakdown, stats.zoneCountryMap, stats.totalRegistrations);
    
    // Display country breakdown
    displayBreakdownTable('countryTableBody', stats.countryBreakdown, stats.totalRegistrations);
    
    // Display shreni breakdown
    displayBreakdownTable('shreniTableBody', stats.shreniBreakdown, stats.totalRegistrations);
    
    // Display tour breakdown
    displayBreakdownTable('tourTableBody', stats.tourBreakdown, stats.totalRegistrations);
    
    // Display pickup breakdown
    displayBreakdownTable('pickupTableBody', stats.pickupBreakdown, stats.totalRegistrations);
    
    // Display dropoff breakdown
    displayBreakdownTable('dropoffTableBody', stats.dropoffBreakdown, stats.totalRegistrations);
    
    // Display gender breakdown
    displayBreakdownTable('genderTableBody', stats.genderBreakdown, stats.totalRegistrations);
}

function displayBreakdownTable(tableBodyId, breakdown, total) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    
    // Sort by count descending
    const sortedEntries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    
    let html = '';
    sortedEntries.forEach(([key, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        html += `
            <tr>
                <td>${escapeHtml(key)}</td>
                <td>${count}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });
    
    if (sortedEntries.length === 0) {
        html = '<tr><td colspan="3" style="text-align: center;">No data available</td></tr>';
    }
    
    tbody.innerHTML = html;
}

// Zone breakdown table with clickable rows
function displayZoneBreakdownTable(zoneBreakdown, zoneCountryMap, total) {
    const tbody = document.getElementById('zoneTableBody');
    if (!tbody) return;
    
    // Sort by count descending
    const sortedEntries = Object.entries(zoneBreakdown).sort((a, b) => b[1] - a[1]);
    
    let html = '';
    sortedEntries.forEach(([zone, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const zoneEscaped = escapeHtml(zone);
        const countryMapJson = JSON.stringify(zoneCountryMap[zone] || {}).replace(/"/g, '&quot;');
        html += `
            <tr style="cursor: pointer;" onclick="showZoneCountryDetails('${zoneEscaped}', '${countryMapJson}', ${total})">
                <td>${zoneEscaped}</td>
                <td>${count}</td>
                <td>${percentage}%</td>
                <td><button class="btn btn-small btn-secondary">View Countries</button></td>
            </tr>
        `;
    });
    
    if (sortedEntries.length === 0) {
        html = '<tr><td colspan="4" style="text-align: center;">No data available</td></tr>';
    }
    
    tbody.innerHTML = html;
}

// Show country breakdown for a specific zone
function showZoneCountryDetails(zone, countryBreakdownJson, total) {
    const zoneBreakdownDiv = document.getElementById('zoneBreakdown');
    const zoneCountryDetailsDiv = document.getElementById('zoneCountryDetails');
    const zoneCountryTitle = document.getElementById('zoneCountryTitle');
    const zoneCountryTableBody = document.getElementById('zoneCountryTableBody');
    
    if (!zoneBreakdownDiv || !zoneCountryDetailsDiv || !zoneCountryTitle || !zoneCountryTableBody) return;
    
    // Parse the country breakdown JSON
    let countryBreakdown;
    try {
        countryBreakdown = JSON.parse(countryBreakdownJson.replace(/&quot;/g, '"'));
    } catch (e) {
        console.error('Error parsing country breakdown:', e);
        countryBreakdown = {};
    }
    
    // Hide zone breakdown, show country details
    zoneBreakdownDiv.style.display = 'none';
    zoneCountryDetailsDiv.style.display = 'block';
    zoneCountryTitle.textContent = `Countries in Zone: ${zone}`;
    
    // Sort by count descending
    const sortedEntries = Object.entries(countryBreakdown).sort((a, b) => b[1] - a[1]);
    
    // Build table with headers
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Country</th>
                    <th>Count</th>
                    <th>Percentage</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sortedEntries.forEach(([country, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const countryEscaped = escapeHtml(country);
        html += `
            <tr style="cursor: pointer;" onclick="showCountryShibirarthis('${escapeHtml(zone)}', '${countryEscaped.replace(/'/g, "\\'")}')">
                <td>${countryEscaped}</td>
                <td>${count}</td>
                <td>${percentage}%</td>
                <td><button class="btn btn-small btn-secondary">View Shibirarthis</button></td>
            </tr>
        `;
    });
    
    if (sortedEntries.length === 0) {
        html += '<tr><td colspan="4" style="text-align: center;">No data available</td></tr>';
    }
    
    html += `
            </tbody>
        </table>
    `;
    
    zoneCountryTableBody.innerHTML = html;
}

// Show Shibirarthis for a specific country
async function showCountryShibirarthis(zone, country) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const zoneCountryDetailsDiv = document.getElementById('zoneCountryDetails');
    const zoneCountryTitle = document.getElementById('zoneCountryTitle');
    
    if (!zoneCountryDetailsDiv || !zoneCountryTitle) return;
    
    // Show loading
    const tbody = document.getElementById('zoneCountryTableBody');
    if (tbody) {
        tbody.innerHTML = '<p style="text-align: center; padding: 2rem;">Loading Shibirarthis...</p>';
    }
    
    try {
        const db = firebase.firestore();
        
        // Fetch all registrations for this country
        const registrationsSnapshot = await db.collection('registrations').get();
        const countryRegistrations = [];
        
        registrationsSnapshot.forEach(doc => {
            const data = doc.data();
            const regCountry = data.Country || data.country || data['Country of Current Residence'] || '';
            const regZone = data.Zone || data.zone || data['Zone/Shreni'] || '';
            
            if (regCountry === country && (zone === 'Unknown' || regZone === zone)) {
                countryRegistrations.push({
                    uniqueId: data.uniqueId || doc.id,
                    name: data.name || data['Full Name'] || 'Unknown',
                    email: data.email || data['Email address'] || '',
                    shreni: data.Shreni || data.shreni || data['Corrected Shreni'] || '',
                    phone: data.phone || data.Phone || '',
                    city: data.city || data.City || data['City of Current Residence'] || ''
                });
            }
        });
        
        // Sort by name
        countryRegistrations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        // Update UI
        zoneCountryTitle.textContent = `Shibirarthis in ${country} (Zone: ${zone})`;
        
        if (tbody) {
            if (countryRegistrations.length === 0) {
                tbody.innerHTML = '<p style="text-align: center; padding: 2rem;">No Shibirarthis found in this country.</p>';
            } else {
                let html = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Praveshika ID</th>
                                <th>Email</th>
                                <th>Shreni</th>
                                <th>City</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                countryRegistrations.forEach(reg => {
                    html += `
                        <tr>
                            <td>${escapeHtml(reg.name)}</td>
                            <td>${escapeHtml(reg.uniqueId)}</td>
                            <td>${escapeHtml(reg.email)}</td>
                            <td>${escapeHtml(reg.shreni)}</td>
                            <td>${escapeHtml(reg.city)}</td>
                        </tr>
                    `;
                });
                
                html += `
                        </tbody>
                    </table>
                    <p style="margin-top: 1rem;"><strong>Total:</strong> ${countryRegistrations.length} Shibirarthi(s)</p>
                `;
                
                tbody.innerHTML = html;
            }
        }
        
    } catch (error) {
        console.error('Error loading country Shibirarthis:', error);
        if (tbody) {
            tbody.innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">Error loading Shibirarthis</p>';
        }
    }
}

// Close zone country details view
function closeZoneCountryDetails() {
    const zoneBreakdownDiv = document.getElementById('zoneBreakdown');
    const zoneCountryDetailsDiv = document.getElementById('zoneCountryDetails');
    
    if (zoneBreakdownDiv) zoneBreakdownDiv.style.display = 'block';
    if (zoneCountryDetailsDiv) zoneCountryDetailsDiv.style.display = 'none';
}

// Load transportation analytics
function loadTransportationAnalytics(registrations) {
    // Display pickup location summary (same as pickup breakdown)
    const pickupBreakdown = {};
    registrations.forEach(reg => {
        const pickup = reg.pickupLocation || reg['Pickup Location'] || reg['Place of Arrival'] || 'Not Specified';
        pickupBreakdown[pickup] = (pickupBreakdown[pickup] || 0) + 1;
    });
    
    displayBreakdownTable('pickupLocationSummaryTableBody', pickupBreakdown, registrations.length);
    
    // Enhanced transportation analytics with more fields
    displayEnhancedTransportationAnalytics(registrations);
    
    // Load complex transportation view
    displayComplexTransportationView(registrations);
}

// Display enhanced transportation analytics
function displayEnhancedTransportationAnalytics(registrations) {
    // Add analytics sections to the transportation analytics area
    const transportationSection = document.querySelector('.transportation-changes-section');
    if (!transportationSection) return;
    
    // Create analytics container if it doesn't exist
    let analyticsContainer = document.getElementById('enhancedTransportationAnalytics');
    if (!analyticsContainer) {
        analyticsContainer = document.createElement('div');
        analyticsContainer.id = 'enhancedTransportationAnalytics';
        analyticsContainer.className = 'analytics-section';
        analyticsContainer.style.cssText = 'margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #e0e0e0;';
        transportationSection.parentNode.insertBefore(analyticsContainer, transportationSection.nextSibling);
    }
    
    // Extract all transportation-related fields
    const placeOfArrivalBreakdown = {};
    const arrivalDateBreakdown = {};
    const arrivalTimeBreakdown = {};
    const modeOfTravelBreakdown = {};
    const returnPlaceBreakdown = {};
    const returnDateBreakdown = {};
    
    registrations.forEach(reg => {
        // Place of Arrival
        const placeOfArrival = reg['Place of Arrival'] || reg.placeOfArrival || reg.pickupLocation || reg['Pickup Location'] || 'Not Specified';
        if (placeOfArrival && placeOfArrival !== 'Not Specified') {
            placeOfArrivalBreakdown[placeOfArrival] = (placeOfArrivalBreakdown[placeOfArrival] || 0) + 1;
        }
        
        // Date of Arrival
        const arrivalDate = reg['Date of Arrival'] || reg.dateOfArrival || reg.arrivalDate || reg['Arrival Date'] || '';
        if (arrivalDate) {
            arrivalDateBreakdown[arrivalDate] = (arrivalDateBreakdown[arrivalDate] || 0) + 1;
        }
        
        // Arrival Time
        const arrivalTime = reg['Arrival Time'] || reg.arrivalTime || reg['Time of Arrival'] || '';
        if (arrivalTime) {
            // Group by time ranges for better analytics
            const timeRange = getTimeRange(arrivalTime);
            arrivalTimeBreakdown[timeRange] = (arrivalTimeBreakdown[timeRange] || 0) + 1;
        }
        
        // Mode of Travel
        const modeOfTravel = reg['Mode of Travel'] || reg.modeOfTravel || reg['Transportation Mode'] || '';
        if (modeOfTravel) {
            modeOfTravelBreakdown[modeOfTravel] = (modeOfTravelBreakdown[modeOfTravel] || 0) + 1;
        }
        
        // Return Place
        const returnPlace = reg['Place of Return'] || reg.returnPlace || reg.dropoffLocation || reg['Dropoff Location'] || '';
        if (returnPlace) {
            returnPlaceBreakdown[returnPlace] = (returnPlaceBreakdown[returnPlace] || 0) + 1;
        }
        
        // Return Date
        const returnDate = reg['Date of Return'] || reg.returnDate || reg['Return Date'] || '';
        if (returnDate) {
            returnDateBreakdown[returnDate] = (returnDateBreakdown[returnDate] || 0) + 1;
        }
    });
    
    // Build HTML for analytics
    let html = `
        <h3>Enhanced Transportation Analytics</h3>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem; margin-top: 1.5rem;">
    `;
    
    // Place of Arrival breakdown
    if (Object.keys(placeOfArrivalBreakdown).length > 0) {
        html += `
            <div class="analytics-subsection">
                <h4>Place of Arrival</h4>
                ${createBreakdownHTML(placeOfArrivalBreakdown, registrations.length)}
            </div>
        `;
    }
    
    // Date of Arrival breakdown
    if (Object.keys(arrivalDateBreakdown).length > 0) {
        html += `
            <div class="analytics-subsection">
                <h4>Date of Arrival</h4>
                ${createBreakdownHTML(arrivalDateBreakdown, registrations.length)}
            </div>
        `;
    }
    
    // Arrival Time breakdown
    if (Object.keys(arrivalTimeBreakdown).length > 0) {
        html += `
            <div class="analytics-subsection">
                <h4>Arrival Time Distribution</h4>
                ${createBreakdownHTML(arrivalTimeBreakdown, registrations.length)}
            </div>
        `;
    }
    
    // Mode of Travel breakdown
    if (Object.keys(modeOfTravelBreakdown).length > 0) {
        html += `
            <div class="analytics-subsection">
                <h4>Mode of Travel</h4>
                ${createBreakdownHTML(modeOfTravelBreakdown, registrations.length)}
            </div>
        `;
    }
    
    // Return Place breakdown
    if (Object.keys(returnPlaceBreakdown).length > 0) {
        html += `
            <div class="analytics-subsection">
                <h4>Place of Return</h4>
                ${createBreakdownHTML(returnPlaceBreakdown, registrations.length)}
            </div>
        `;
    }
    
    // Return Date breakdown
    if (Object.keys(returnDateBreakdown).length > 0) {
        html += `
            <div class="analytics-subsection">
                <h4>Date of Return</h4>
                ${createBreakdownHTML(returnDateBreakdown, registrations.length)}
            </div>
        `;
    }
    
    html += `
        </div>
    `;
    
    analyticsContainer.innerHTML = html;
}

// Helper to create breakdown HTML
function createBreakdownHTML(breakdown, total) {
    const sortedEntries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    let html = '<table class="data-table" style="margin-top: 0.5rem;">';
    html += '<thead><tr><th>Value</th><th>Count</th><th>Percentage</th></tr></thead><tbody>';
    
    sortedEntries.forEach(([key, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        html += `
            <tr>
                <td>${escapeHtml(key)}</td>
                <td>${count}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    return html;
}

// Helper to get time range from time string
function getTimeRange(timeStr) {
    if (!timeStr) return 'Unknown';
    
    // Convert to string in case it's a number, Date, or other type
    const timeString = String(timeStr);
    
    // Try to extract hour from time string (format: HH:MM or HH:MM:SS)
    const timeMatch = timeString.match(/(\d{1,2}):\d{2}/);
    if (!timeMatch) return 'Unknown';
    
    const hour = parseInt(timeMatch[1]);
    
    if (hour >= 0 && hour < 6) return '00:00 - 05:59';
    if (hour >= 6 && hour < 12) return '06:00 - 11:59';
    if (hour >= 12 && hour < 18) return '12:00 - 17:59';
    return '18:00 - 23:59';
}

// Load transportation changes based on time period
async function loadTransportationChanges(period) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized.', 'error');
        return;
    }
    
    const db = firebase.firestore();
    const now = new Date();
    let startTime;
    
    if (period === 'day') {
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === 'week') {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
        startTime = null; // Anytime
    }
    
    try {
        // For "anytime" period, use optimized query limited to 1000 most recent changes
        if (!startTime) {
            // Use query with orderBy and limit instead of loading all documents
            // This shows the last 1000 transportation changes, not all historical changes
            // Note: orderBy only returns documents where the field exists
            let query = db.collection('registrations')
                .orderBy('transportationUpdatedAt', 'desc')
                .limit(1000);
            
            const snapshot = await query.get();
            const changes = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.transportationUpdatedAt) {
                    changes.push({
                        name: data.name || data['Full Name'] || 'Unknown',
                        uniqueId: data.uniqueId || doc.id,
                        email: data.email || data['Email address'] || '',
                        pickupLocation: data.pickupLocation || data['Pickup Location'] || 'Not Specified',
                        arrivalDate: data.arrivalDate || data['Arrival Date'] || '',
                        arrivalTime: data.arrivalTime || data['Arrival Time'] || '',
                        transportationUpdatedAt: data.transportationUpdatedAt
                    });
                }
            });
            
            displayTransportationChanges(changes);
            return;
        }
        
        // For day/week periods, use query
        let query = db.collection('registrations')
            .where('transportationUpdatedAt', '>=', firebase.firestore.Timestamp.fromDate(startTime))
            .orderBy('transportationUpdatedAt', 'desc');
        
        const snapshot = await query.get();
        
        const changes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.transportationUpdatedAt) {
                changes.push({
                    name: data.name || data['Full Name'] || 'Unknown',
                    uniqueId: data.uniqueId || doc.id,
                    email: data.email || data['Email address'] || '',
                    pickupLocation: data.pickupLocation || data['Pickup Location'] || 'Not Specified',
                    arrivalDate: data.arrivalDate || data['Arrival Date'] || '',
                    arrivalTime: data.arrivalTime || data['Arrival Time'] || '',
                    transportationUpdatedAt: data.transportationUpdatedAt
                });
            }
        });
        
        displayTransportationChanges(changes);
        
    } catch (error) {
        console.error('Error loading transportation changes:', error);
        // If the query fails (e.g., no index), show error message
        // Note: Firestore requires a composite index for queries with orderBy on different fields
        showNotification('Error loading transportation changes. The query may require a Firestore index. Please try again or contact support.', 'error');
    }
}

// Helper function to display transportation changes
function displayTransportationChanges(changes) {
    // Update total changes count
    const totalChangesEl = document.getElementById('totalTransportationChanges');
    if (totalChangesEl) {
        totalChangesEl.textContent = changes.length;
    }
    
    // Display changes
    const tbody = document.getElementById('transportationChangesTableBody');
    if (!tbody) return;
    
    let html = '';
    if (changes.length === 0) {
        html = '<tr><td colspan="7" style="text-align: center;">No changes found for the selected period.</td></tr>';
    } else {
        changes.forEach(change => {
            const updateTime = change.transportationUpdatedAt.toDate ? 
                change.transportationUpdatedAt.toDate().toLocaleString() : 
                'Unknown';
            
            html += `
                <tr>
                    <td>${escapeHtml(change.name)}</td>
                    <td>${escapeHtml(change.uniqueId)}</td>
                    <td>${escapeHtml(change.email)}</td>
                    <td>${escapeHtml(change.pickupLocation)}</td>
                    <td>${escapeHtml(change.arrivalDate)}</td>
                    <td>${escapeHtml(change.arrivalTime)}</td>
                    <td>${escapeHtml(updateTime)}</td>
                </tr>
            `;
        });
    }
    
    tbody.innerHTML = html;
}

// Helper function to format date value (handles Excel serial dates, Date objects, strings, etc.)
function formatDateValue(dateValue) {
    if (!dateValue) return '';
    
    const str = String(dateValue).trim();
    if (!str) return '';
    
    const num = parseFloat(str);
    
    // If it's a number that looks like an Excel serial date (between 1 and 100000)
    if (!isNaN(num) && num > 0 && num < 100000) {
        // Excel serial date - convert to actual date
        // Excel epoch is January 1, 1900 (serial number 1)
        // Excel incorrectly treats 1900 as a leap year, so we adjust
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
        const days = Math.floor(num);
        const date = new Date(excelEpoch);
        date.setDate(date.getDate() + days);
        
        // Verify it's a reasonable date (between 1900 and 2100)
        if (date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
    }
    
    // If it's a valid date string or Date object
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        // Check if it's a reasonable date (not year 1900 from Excel conversion)
        if (date.getFullYear() > 1900 && date.getFullYear() < 2100) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
    }
    
    // If it looks like a date string already (contains / or -)
    if (str.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) {
        return str;
    }
    
    // If it's just a number that's too large to be a date, return empty
    if (!isNaN(num) && num >= 100000) {
        return '';
    }
    
    return str;
}

// Helper function to format time value (handles decimal numbers, invalid formats, etc.)
function formatTimeValue(timeValue) {
    if (!timeValue) return '';
    
    const str = String(timeValue).trim();
    if (!str) return '';
    
    // If it's a decimal number (like 0.33333333333575865), return empty
    const num = parseFloat(str);
    if (!isNaN(num) && num >= 0 && num < 1 && str.includes('.')) {
        return '';
    }
    
    // If it's a number that looks like a time in decimal format (e.g., 14.5 for 14:30)
    if (!isNaN(num) && num >= 0 && num < 24 && num % 1 !== 0) {
        const hours = Math.floor(num);
        const minutes = Math.round((num - hours) * 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    
    // If it matches time format (HH:MM or HH:MM:SS)
    if (str.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
        return str;
    }
    
    // If it's a valid time string, try to parse it
    const timeMatch = str.match(/(\d{1,2}):?(\d{2})?/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
    }
    
    // If it's an invalid number format, return empty
    if (!isNaN(num) && (num < 0 || num >= 24)) {
        return '';
    }
    
    return str;
}

// Display complex transportation view: sorted by location, date, time
function displayComplexTransportationView(registrations) {
    const tbody = document.getElementById('complexTransportationTableBody');
    if (!tbody) return;
    
    // Filter registrations that have transportation details
    // Look for various field name variations
    const transportationData = registrations
        .filter(reg => {
            const pickup = reg.pickupLocation || reg['Pickup Location'] || reg['Place of Arrival'] || reg.placeOfArrival;
            const arrivalDate = reg.arrivalDate || reg['Arrival Date'] || reg['Date of Arrival'] || reg.dateOfArrival;
            const arrivalTime = reg.arrivalTime || reg['Arrival Time'] || reg['Time of Arrival'] || reg.timeOfArrival;
            return pickup || arrivalDate || arrivalTime;
        })
        .map(reg => {
            // Get raw values
            const rawPickupLocation = reg.pickupLocation || reg['Pickup Location'] || reg['Place of Arrival'] || reg.placeOfArrival || '';
            const rawArrivalDate = reg.arrivalDate || reg['Arrival Date'] || reg['Date of Arrival'] || reg.dateOfArrival || '';
            const rawArrivalTime = reg.arrivalTime || reg['Arrival Time'] || reg['Time of Arrival'] || reg.timeOfArrival || '';
            
            // Clean up pickup location - if it's a number that looks like a date, it's probably wrong
            let pickupLocation = rawPickupLocation;
            const pickupNum = parseFloat(rawPickupLocation);
            if (!isNaN(pickupNum) && pickupNum > 10000 && pickupNum < 100000) {
                // This looks like a date serial number in the wrong field
                pickupLocation = '';
            }
            
            return {
                name: reg.name || reg['Full Name'] || 'Unknown',
                uniqueId: reg.uniqueId || '',
                email: reg.email || reg['Email address'] || '',
                pickupLocation: pickupLocation,
                arrivalDate: formatDateValue(rawArrivalDate),
                arrivalTime: formatTimeValue(rawArrivalTime),
                flightTrainNumber: reg.flightTrainNumber || reg['Flight/Train Number'] || reg['Flight Number'] || reg['Train Number'] || '',
                modeOfTravel: reg['Mode of Travel'] || reg.modeOfTravel || ''
            };
        });
    
    // Sort by: 1) Pickup Location (alphabetical), 2) Arrival Date, 3) Arrival Time
    transportationData.sort((a, b) => {
        // First by pickup location
        const locationCompare = String(a.pickupLocation || '').localeCompare(String(b.pickupLocation || ''));
        if (locationCompare !== 0) return locationCompare;
        
        // Then by arrival date
        const dateCompare = String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || ''));
        if (dateCompare !== 0) return dateCompare;
        
        // Finally by arrival time
        return String(a.arrivalTime || '').localeCompare(String(b.arrivalTime || ''));
    });
    
    let html = '';
    if (transportationData.length === 0) {
        html = '<tr><td colspan="8" style="text-align: center;">No transportation data available.</td></tr>';
    } else {
        transportationData.forEach(item => {
            html += `
                <tr>
                    <td>${escapeHtml(item.pickupLocation)}</td>
                    <td>${escapeHtml(item.arrivalDate)}</td>
                    <td>${escapeHtml(item.arrivalTime)}</td>
                    <td>${escapeHtml(item.modeOfTravel)}</td>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(item.uniqueId)}</td>
                    <td>${escapeHtml(item.flightTrainNumber)}</td>
                    <td>${escapeHtml(item.email)}</td>
                </tr>
            `;
        });
    }
    
    tbody.innerHTML = html;
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
    modal.className = 'modal badge-modal';
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Use uniqueId if barcode is empty or same as uniqueId
    const barcodeValue = barcode && barcode !== 'N/A' && barcode !== uniqueId ? barcode : uniqueId;

    // Load logo and convert to data URL to avoid CORS issues
    imageToDataURL('docs/logo.png').then(logoDataUrl => {
        const logoSrc = logoDataUrl || 'docs/logo.png'; // Fallback to original if conversion fails
        
        modal.innerHTML = `
            <div class="modal-content badge-modal-content">
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
            <div class="modal-content badge-modal-content">
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
    if (text == null) return ''; // Handle null and undefined
    // Convert to string to handle numbers, Date objects, and other types
    const textStr = String(text);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return textStr.replace(/[&<>"']/g, m => map[m]);
}

// Close badge modal when clicking outside
window.addEventListener('click', function(event) {
    const badgeModal = document.getElementById('badgeModal');
    if (event.target === badgeModal) {
        closeBadge();
    }
});

// ============================================
// CHECKIN MODULE FUNCTIONS
// ============================================

// Global variables for checkin
let currentCheckinType = 'pickup_location';
let currentParticipantUniqueId = null;
let checkinHistoryListener = null;
let currentHistoryPage = 1;
let historyPageSize = 50;
let checkinNotificationSettings = {
    enabled: true,
    types: [],
    soundEnabled: false,
    duration: 5000
};

// Checkin type labels
const CHECKIN_TYPE_LABELS = {
    'pickup_location': 'Pickup Location',
    'venue_entrance': 'Venue Entrance',
    'cloak_room': 'Cloak Room',
    'accommodation': 'Accommodation',
    'food': 'Food',
    'post_tour': 'Post Tour'
};

// Load notification settings from localStorage
function loadNotificationSettings() {
    const saved = localStorage.getItem('checkinNotificationSettings');
    if (saved) {
        try {
            checkinNotificationSettings = JSON.parse(saved);
        } catch (e) {
            console.error('Error loading notification settings:', e);
        }
    }
}

// Save notification settings to localStorage
function saveNotificationSettings() {
    localStorage.setItem('checkinNotificationSettings', JSON.stringify(checkinNotificationSettings));
}

// Initialize checkin interface
async function initializeCheckinInterface() {
    if (!window.firebase || !firebase.auth) return;
    
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    const canPerform = await canPerformCheckin(user);
    if (!canPerform) return;
    
    // Check if user has access to checkin tab
    const checkinTab = document.getElementById('checkin');
    if (!checkinTab) return;
    
    // Load notification settings
    loadNotificationSettings();
    
    // Initialize checkin interface
    const checkinLoading = document.getElementById('checkinLoading');
    const checkinData = document.getElementById('checkinData');
    
    if (checkinLoading && checkinData) {
        try {
            // Filter checkin type tabs based on user permissions
            await filterCheckinTypeTabs(user);
            
            // Load recent checkins
            await loadRecentCheckins(currentCheckinType);
            
            // Setup checkin form
            setupCheckinForm();
            
            // Setup real-time listeners
            setupCheckinListeners();
            
            // Load checkin history
            await loadCheckinHistory();
            
            checkinLoading.style.display = 'none';
            checkinData.style.display = 'block';
        } catch (error) {
            console.error('Error initializing checkin interface:', error);
            if (checkinLoading) {
                checkinLoading.innerHTML = '<p>Error loading checkin interface. Please refresh the page.</p>';
            }
        }
    }
}

// Filter checkin type tabs based on user permissions
async function filterCheckinTypeTabs(user) {
    const tabs = document.querySelectorAll('.checkin-type-tab');
    const isAdminUser = await isAdmin(user);
    
    if (isAdminUser) {
        // Admins can see all tabs
        tabs.forEach(tab => tab.style.display = '');
        return;
    }
    
    // Volunteers can only see their assigned teams
    const teams = await getVolunteerTeams(user);
    const teamMap = {
        'pickup_location': 'transportation',
        'venue_entrance': 'venue_entrance',
        'cloak_room': 'cloak_room',
        'accommodation': 'accommodation',
        'food': 'food',
        'post_tour': 'post_tour'
    };
    
    tabs.forEach(tab => {
        const checkinType = tab.getAttribute('data-checkin-type');
        const requiredTeam = teamMap[checkinType];
        if (requiredTeam && teams.includes(requiredTeam)) {
            tab.style.display = '';
        } else {
            tab.style.display = 'none';
        }
    });
}

// Switch checkin type
function switchCheckinType(checkinType) {
    currentCheckinType = checkinType;
    
    // Update tab active state
    document.querySelectorAll('.checkin-type-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-checkin-type') === checkinType) {
            tab.classList.add('active');
        }
    });
    
    // Update form
    updateCheckinFormForType();
    
    // Load recent checkins
    loadRecentCheckins(checkinType);
    
    // Clear participant info
    clearParticipantInfo();
}

// Update checkin form based on type
function updateCheckinFormForType() {
    const pickupLocationGroup = document.getElementById('pickupLocationGroup');
    const cloakRoomFields = document.getElementById('cloakRoomFields');
    const checkinTypeDisplay = document.getElementById('checkinTypeDisplay');
    
    if (checkinTypeDisplay) {
        checkinTypeDisplay.textContent = CHECKIN_TYPE_LABELS[currentCheckinType] || currentCheckinType;
    }
    
    if (pickupLocationGroup) {
        pickupLocationGroup.style.display = currentCheckinType === 'pickup_location' ? 'block' : 'none';
    }
    
    if (cloakRoomFields) {
        cloakRoomFields.style.display = currentCheckinType === 'cloak_room' ? 'block' : 'none';
    }
}

// Switch search mode
function switchSearchMode(mode) {
    // Update button states
    document.querySelectorAll('.search-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event?.target?.classList.add('active');
    
    // Show/hide search modes
    document.querySelectorAll('.search-mode').forEach(div => {
        div.classList.remove('active');
    });
    
    const targetMode = document.getElementById(`searchMode-${mode}`);
    if (targetMode) {
        targetMode.classList.add('active');
    }
    
    // Clear participant info when switching modes
    clearParticipantInfo();
    
    // Stop camera if active
    if (barcodeScannerActive) {
        stopBarcodeScan();
    }
}

// Search participant by barcode/Praveshika ID
async function searchParticipant() {
    const barcodeInput = document.getElementById('barcodeInput');
    if (!barcodeInput) return;
    
    const uniqueId = barcodeInput.value.trim();
    if (!uniqueId) {
        showNotification('Please enter a barcode or Praveshika ID', 'error');
        return;
    }
    
    await searchByPraveshikaIdDirect(uniqueId);
}

// Search by Praveshika ID
async function searchByPraveshikaId() {
    const manualInput = document.getElementById('manualPraveshikaId');
    if (!manualInput) return;
    
    const uniqueId = manualInput.value.trim();
    if (!uniqueId) {
        showNotification('Please enter a Praveshika ID', 'error');
        return;
    }
    
    await searchByPraveshikaIdDirect(uniqueId);
}

// Direct search by Praveshika ID
async function searchByPraveshikaIdDirect(uniqueId) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const normalizedId = normalizePraveshikaId(uniqueId);
        
        // Search in registrations collection
        const registrationsQuery = await db.collection('registrations')
            .where('normalizedId', '==', normalizedId)
            .limit(1)
            .get();
        
        if (registrationsQuery.empty) {
            // Try direct document ID lookup
            const regDoc = await db.collection('registrations').doc(uniqueId).get();
            if (regDoc.exists) {
                displayParticipantInfo(regDoc.data(), uniqueId);
            } else {
                showNotification('Participant not found', 'error');
            }
        } else {
            const regData = registrationsQuery.docs[0].data();
            displayParticipantInfo(regData, uniqueId);
        }
    } catch (error) {
        console.error('Error searching participant:', error);
        showNotification('Error searching participant: ' + error.message, 'error');
    }
}

// Advanced search by name or email
async function advancedSearch() {
    const nameInput = document.getElementById('searchByName');
    const emailInput = document.getElementById('searchByEmail');
    
    if (!nameInput || !emailInput) return;
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    
    if (!name && !email) {
        showNotification('Please enter a name or email to search', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        let results = [];
        let searchType = null;
        
        if (email) {
            // Email search: find all users with matching email (case-insensitive)
            searchType = 'email';
            const emailLower = email.toLowerCase();
            
            // Fetch all registrations and filter client-side for case-insensitive email match
            // Note: This approach works but may be slow with large datasets
            // For production, consider using a search service or indexing
            const allRegistrations = await db.collection('registrations').limit(1000).get();
            
            allRegistrations.docs.forEach(doc => {
                const data = doc.data();
                const regEmail = (data.email || data['Email address'] || '').toLowerCase();
                if (regEmail.includes(emailLower)) {
                    results.push(doc);
                }
            });
        } else if (name) {
            // Name search: case-insensitive partial search
            searchType = 'name';
            const nameLower = name.toLowerCase();
            
            // Fetch all registrations and filter client-side for case-insensitive partial name match
            const allRegistrations = await db.collection('registrations').limit(1000).get();
            
            allRegistrations.docs.forEach(doc => {
                const data = doc.data();
                const regName = (data.name || data['Full Name'] || '').toLowerCase();
                if (regName.includes(nameLower)) {
                    results.push(doc);
                }
            });
        }
        
        if (results.length === 0) {
            showNotification('No participants found', 'info');
            return;
        }
        
        if (results.length === 1) {
            const regData = results[0].data();
            const uniqueId = regData.uniqueId || results[0].id;
            displayParticipantInfo(regData, uniqueId);
        } else {
            // Show list of results with appropriate options
            displayParticipantSearchResults(results, searchType);
        }
    } catch (error) {
        console.error('Error in advanced search:', error);
        showNotification('Error searching: ' + error.message, 'error');
    }
}

// Display participant search results
function displayParticipantSearchResults(docs, searchType) {
    const participantInfo = document.getElementById('participantInfo');
    const participantDetails = document.getElementById('participantDetails');
    
    if (!participantInfo || !participantDetails) return;
    
    const isEmailSearch = searchType === 'email';
    const uniqueIds = [];
    
    let html = `<div class="participant-search-results">
        <h4>${docs.length} result(s) found${isEmailSearch ? ' with this email' : ''}. Please select:</h4>
        <ul style="list-style: none; padding: 0;">`;
    
    docs.forEach(doc => {
        const data = doc.data();
        const name = data.name || data['Full Name'] || 'Unknown';
        const uniqueId = data.uniqueId || doc.id;
        const email = data.email || data['Email address'] || '';
        uniqueIds.push(uniqueId);
        
        html += `
            <li style="margin: 0.5rem 0; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                <button class="btn btn-link" onclick="selectParticipantFromSearch('${escapeHtml(uniqueId)}')" style="text-align: left; width: 100%;">
                    <strong>${escapeHtml(name)}</strong><br>
                    <small>${escapeHtml(uniqueId)}${email ? ' - ' + escapeHtml(email) : ''}</small>
                </button>
            </li>`;
    });
    
    html += '</ul>';
    
    // Show batch check-in button for email search with multiple results
    if (isEmailSearch && docs.length > 1) {
        html += `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #007bff;">
                <p><strong>Batch Check-in:</strong> Check in all ${docs.length} participants with this email?</p>
                <button class="btn btn-primary" onclick="batchCheckinFromEmail([${uniqueIds.map(id => `'${escapeHtml(id)}'`).join(',')}])">
                    Check In All (${docs.length})
                </button>
            </div>`;
    }
    
    html += '</div>';
    participantDetails.innerHTML = html;
    participantInfo.style.display = 'block';
}

// Select participant from search results
async function selectParticipantFromSearch(uniqueId) {
    const db = firebase.firestore();
    const regDoc = await db.collection('registrations').doc(uniqueId).get();
    if (regDoc.exists) {
        displayParticipantInfo(regDoc.data(), uniqueId);
    }
}

// Batch check-in from email search results
async function batchCheckinFromEmail(uniqueIds) {
    if (!uniqueIds || uniqueIds.length === 0) {
        showNotification('No participants selected for batch check-in', 'error');
        return;
    }
    
    // Confirm batch check-in
    const confirmMessage = `Are you sure you want to check in ${uniqueIds.length} participant(s)?`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    // Use existing batch check-in function
    await executeBatchCheckin(uniqueIds);
    
    // Clear participant info display
    clearParticipantInfo();
}

// Display participant information
function displayParticipantInfo(regData, uniqueId) {
    const participantInfo = document.getElementById('participantInfo');
    const participantDetails = document.getElementById('participantDetails');
    const checkinForm = document.getElementById('checkinForm');
    
    if (!participantInfo || !participantDetails || !checkinForm) return;
    
    currentParticipantUniqueId = uniqueId;
    
    const name = regData.name || regData['Full Name'] || 'Unknown';
    const email = regData.email || regData['Email address'] || 'N/A';
    const country = regData.country || regData.Country || 'N/A';
    const shreni = regData.shreni || regData.Shreni || 'N/A';
    
    participantDetails.innerHTML = `
        <div class="participant-details">
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Praveshika ID:</strong> ${escapeHtml(uniqueId)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Country:</strong> ${escapeHtml(country)}</p>
            <p><strong>Shreni:</strong> ${escapeHtml(shreni)}</p>
        </div>
    `;
    
    participantInfo.style.display = 'block';
    checkinForm.style.display = 'block';
    
    // Check if already checked in
    checkCheckinStatus(uniqueId);
}

// Clear participant info
function clearParticipantInfo() {
    currentParticipantUniqueId = null;
    const participantInfo = document.getElementById('participantInfo');
    const checkinForm = document.getElementById('checkinForm');
    
    if (participantInfo) participantInfo.style.display = 'none';
    if (checkinForm) checkinForm.style.display = 'none';
    
    // Clear inputs
    const barcodeInput = document.getElementById('barcodeInput');
    const manualInput = document.getElementById('manualPraveshikaId');
    if (barcodeInput) barcodeInput.value = '';
    if (manualInput) manualInput.value = '';
}

// Setup checkin form
function setupCheckinForm() {
    const form = document.getElementById('checkinFormElement');
    if (!form) return;
    
    // Prevent duplicate event listeners by checking if form already has listener
    if (form.dataset.checkinFormSetup === 'true') {
        return;
    }
    
    // Mark form as set up
    form.dataset.checkinFormSetup = 'true';
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await performCheckin();
    });
}

// Perform checkin
async function performCheckin() {
    if (!currentParticipantUniqueId) {
        showNotification('Please search for a participant first', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.auth || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('Please log in to perform checkin', 'error');
        return;
    }
    
    // Check permissions
    const hasAccess = await hasAccessToCheckinType(user, currentCheckinType);
    if (!hasAccess) {
        showNotification('You do not have permission to perform this checkin type', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Get user data for checkedInByName
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const checkedInByName = userData.volunteerName || userData.name || user.email || 'Unknown';
        
        // Get participant data
        const regDoc = await db.collection('registrations').doc(currentParticipantUniqueId).get();
        const regData = regDoc.exists ? regDoc.data() : {};
        
        // Build checkin data - store only Praveshika ID
        const checkinData = {
            uniqueId: currentParticipantUniqueId,
            checkinType: currentCheckinType,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            checkedInBy: user.uid,
            checkedInByName: checkedInByName,
            notes: document.getElementById('checkinNotes')?.value.trim() || null
        };
        
        // Add type-specific fields
        if (currentCheckinType === 'pickup_location') {
            const pickupLocation = document.getElementById('checkinPickupLocation')?.value.trim();
            if (pickupLocation) {
                checkinData.pickupLocation = pickupLocation;
            } else {
                // Try to get from registration
                checkinData.pickupLocation = regData.pickupLocation || regData['Pickup Location'] || null;
            }
        }
        
        if (currentCheckinType === 'cloak_room') {
            const bagCount = document.getElementById('checkinBagCount')?.value;
            const lockerId = document.getElementById('checkinLockerId')?.value.trim();
            if (bagCount) checkinData.bagCount = parseInt(bagCount);
            if (lockerId) checkinData.lockerId = lockerId;
        }
        
        // Create checkin document
        const checkinId = `${currentParticipantUniqueId}_${currentCheckinType}_${Date.now()}`;
        await db.collection('checkins').doc(checkinId).set(checkinData);
        
        showNotification('Checkin successful!', 'success');
        
        // Clear form
        clearCheckinForm();
        clearParticipantInfo();
        
        // Reload recent checkins
        await loadRecentCheckins(currentCheckinType);
        
        // Reload history if on history view
        await loadCheckinHistory();
        
    } catch (error) {
        console.error('Error performing checkin:', error);
        showNotification('Error performing checkin: ' + error.message, 'error');
    }
}

// Clear checkin form
function clearCheckinForm() {
    const form = document.getElementById('checkinFormElement');
    if (form) form.reset();
    
    const notes = document.getElementById('checkinNotes');
    if (notes) notes.value = '';
    
    const bagCount = document.getElementById('checkinBagCount');
    const lockerId = document.getElementById('checkinLockerId');
    if (bagCount) bagCount.value = '';
    if (lockerId) lockerId.value = '';
}

// Check checkin status
async function checkCheckinStatus(uniqueId) {
    if (!window.firebase || !firebase.firestore) return;
    
    try {
        const db = firebase.firestore();
        const checkinsQuery = await db.collection('checkins')
            .where('uniqueId', '==', uniqueId)
            .where('checkinType', '==', currentCheckinType)
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        if (!checkinsQuery.empty) {
            const checkinData = checkinsQuery.docs[0].data();
            const timestamp = checkinData.timestamp?.toDate();
            const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
            
            showNotification(`Already checked in at ${timeStr}`, 'info');
        }
    } catch (error) {
        console.error('Error checking checkin status:', error);
    }
}

// Load recent checkins
async function loadRecentCheckins(checkinType, limit = 5) {
    if (!window.firebase || !firebase.firestore) return;
    
    const recentCheckinsList = document.getElementById('recentCheckinsList');
    if (!recentCheckinsList) return;
    
    try {
        const db = firebase.firestore();
        const user = firebase.auth().currentUser;
        if (!user) return;
        
        let query = db.collection('checkins')
            .where('checkinType', '==', checkinType)
            .orderBy('timestamp', 'desc')
            .limit(limit);
        
        // If volunteer, filter by their access
        const isAdminUser = await isAdmin(user);
        if (!isAdminUser) {
            // Volunteers can only see checkins they have access to
            // This is handled by Firestore rules, but we can add additional filtering if needed
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            recentCheckinsList.innerHTML = '<p>No recent checkins</p>';
            return;
        }
        
        // Fetch participant names from registrations
        const uniqueIds = snapshot.docs.map(doc => doc.data().uniqueId).filter(id => id);
        const registrationsMap = new Map();
        
        if (uniqueIds.length > 0) {
            const registrationPromises = uniqueIds.map(uniqueId => 
                db.collection('registrations').doc(uniqueId).get()
            );
            const registrationDocs = await Promise.all(registrationPromises);
            
            registrationDocs.forEach(regDoc => {
                if (regDoc.exists) {
                    const regData = regDoc.data();
                    const name = regData.name || regData['Full Name'] || 'Unknown';
                    registrationsMap.set(regDoc.id, name);
                }
            });
        }
        
        let html = '<ul class="recent-checkins-list">';
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const timestamp = data.timestamp?.toDate();
            const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
            const participantName = registrationsMap.get(data.uniqueId) || 'Unknown';
            
            html += `
                <li class="recent-checkin-item">
                    <div class="checkin-item-name">${escapeHtml(participantName)}</div>
                    <div class="checkin-item-id">${escapeHtml(data.uniqueId)}</div>
                    <div class="checkin-item-time">${escapeHtml(timeStr)}</div>
                    <div class="checkin-item-by">By: ${escapeHtml(data.checkedInByName)}</div>
                </li>
            `;
        });
        html += '</ul>';
        
        recentCheckinsList.innerHTML = html;
    } catch (error) {
        console.error('Error loading recent checkins:', error);
        recentCheckinsList.innerHTML = '<p>Error loading recent checkins</p>';
    }
}

// ============================================
// BATCH CHECKIN FUNCTIONS
// ============================================

// Process batch checkin
async function processBatchCheckin() {
    const batchInput = document.getElementById('batchInput');
    if (!batchInput) return;
    
    const inputText = batchInput.value.trim();
    if (!inputText) {
        showNotification('Please enter Praveshika IDs', 'error');
        return;
    }
    
    // Parse input (support both comma-separated and newline-separated)
    const ids = inputText.split(/[,\n]/)
        .map(id => id.trim())
        .filter(id => id.length > 0);
    
    if (ids.length === 0) {
        showNotification('No valid Praveshika IDs found', 'error');
        return;
    }
    
    // Show preview
    const batchPreview = document.getElementById('batchPreview');
    if (batchPreview) {
        batchPreview.style.display = 'block';
        // Store IDs globally for the confirm button
        window.batchCheckinIds = ids;
        batchPreview.innerHTML = `
            <div class="batch-preview">
                <h4>Batch Checkin Preview</h4>
                <p>Found ${ids.length} participant(s) to check in</p>
                <ul class="batch-preview-list">
                    ${ids.map(id => `<li>${escapeHtml(id)}</li>`).join('')}
                </ul>
                <button class="btn btn-primary" onclick="executeBatchCheckinFromPreview()">Confirm Batch Checkin</button>
                <button class="btn btn-secondary" onclick="cancelBatchCheckin()">Cancel</button>
            </div>
        `;
    }
}

// Execute batch checkin from preview
async function executeBatchCheckinFromPreview() {
    const ids = window.batchCheckinIds;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        showNotification('No participants to check in', 'error');
        return;
    }
    await executeBatchCheckin(ids);
}

// Execute batch checkin
async function executeBatchCheckin(ids) {
    if (!window.firebase || !firebase.auth || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('Please log in to perform checkin', 'error');
        return;
    }
    
    // Check permissions
    const hasAccess = await hasAccessToCheckinType(user, currentCheckinType);
    if (!hasAccess) {
        showNotification('You do not have permission to perform this checkin type', 'error');
        return;
    }
    
    const batchPreview = document.getElementById('batchPreview');
    if (batchPreview) {
        batchPreview.innerHTML = '<p>Processing batch checkin...</p>';
    }
    
    const db = firebase.firestore();
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const checkedInByName = userData.volunteerName || userData.name || user.email || 'Unknown';
    
    let successCount = 0;
    let failCount = 0;
    const results = [];
    
    for (const uniqueId of ids) {
        try {
            // Get participant data
            const regDoc = await db.collection('registrations').doc(uniqueId).get();
            if (!regDoc.exists) {
                results.push({ uniqueId, status: 'failed', error: 'Participant not found' });
                failCount++;
                continue;
            }
            
            const regData = regDoc.data();
            
            // Build checkin data - store only Praveshika ID
            const checkinData = {
                uniqueId: uniqueId,
                checkinType: currentCheckinType,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                checkedInBy: user.uid,
                checkedInByName: checkedInByName,
                notes: null
            };
            
            // Add type-specific fields
            if (currentCheckinType === 'pickup_location') {
                checkinData.pickupLocation = regData.pickupLocation || regData['Pickup Location'] || null;
            }
            
            // Create checkin document
            const checkinId = `${uniqueId}_${currentCheckinType}_${Date.now()}`;
            await db.collection('checkins').doc(checkinId).set(checkinData);
            
            results.push({ uniqueId, status: 'success' });
            successCount++;
        } catch (error) {
            console.error(`Error checking in ${uniqueId}:`, error);
            results.push({ uniqueId, status: 'failed', error: error.message });
            failCount++;
        }
    }
    
    // Show results
    if (batchPreview) {
        let html = `
            <div class="batch-results">
                <h4>Batch Checkin Results</h4>
                <p><strong>Total:</strong> ${ids.length} | <strong>Success:</strong> ${successCount} | <strong>Failed:</strong> ${failCount}</p>
                <div class="batch-results-list">
        `;
        
        results.forEach(result => {
            const statusClass = result.status === 'success' ? 'success' : 'error';
            html += `
                <div class="batch-result-item ${statusClass}">
                    <span>${escapeHtml(result.uniqueId)}</span>
                    <span>${result.status === 'success' ? '✓' : '✗'} ${result.error || ''}</span>
                </div>
            `;
        });
        
        html += `
                </div>
                <button class="btn btn-secondary" onclick="cancelBatchCheckin()">Close</button>
            </div>
        `;
        
        batchPreview.innerHTML = html;
    }
    
    // Reload recent checkins
    await loadRecentCheckins(currentCheckinType);
    await loadCheckinHistory();
    
    showNotification(`Batch checkin complete: ${successCount} successful, ${failCount} failed`, 
        failCount === 0 ? 'success' : 'info');
}

// Cancel batch checkin
function cancelBatchCheckin() {
    const batchInput = document.getElementById('batchInput');
    const batchPreview = document.getElementById('batchPreview');
    
    if (batchInput) batchInput.value = '';
    if (batchPreview) {
        batchPreview.style.display = 'none';
        batchPreview.innerHTML = '';
    }
}

// ============================================
// CHECKIN HISTORY FUNCTIONS
// ============================================

// Load checkin history
async function loadCheckinHistory(page = 1) {
    if (!window.firebase || !firebase.firestore) return;
    
    currentHistoryPage = page;
    
    const historyList = document.getElementById('checkinHistoryList');
    const resultsCount = document.getElementById('historyResultsCount');
    
    if (!historyList) return;
    
    try {
        const db = firebase.firestore();
        const user = firebase.auth().currentUser;
        if (!user) return;
        
        // Get filters
        const filterType = document.getElementById('historyFilterType')?.value || '';
        const filterSearch = document.getElementById('historyFilterSearch')?.value.trim() || '';
        
        let query = db.collection('checkins');
        
        // Apply filters
        if (filterType) {
            query = query.where('checkinType', '==', filterType);
        }
        
        // Order by timestamp
        query = query.orderBy('timestamp', 'desc');
        
        // Get total count (for pagination)
        const totalSnapshot = await query.get();
        const totalCount = totalSnapshot.size;
        
        // Apply pagination
        const startAfter = (page - 1) * historyPageSize;
        if (startAfter > 0) {
            const startDoc = totalSnapshot.docs[startAfter - 1];
            query = query.startAfter(startDoc);
        }
        query = query.limit(historyPageSize);
        
        const snapshot = await query.get();
        
        // Fetch participant data from registrations for all checkins
        const uniqueIds = snapshot.docs.map(doc => doc.data().uniqueId).filter(id => id);
        const registrationsMap = new Map();
        
        if (uniqueIds.length > 0) {
            const registrationPromises = uniqueIds.map(uniqueId => 
                db.collection('registrations').doc(uniqueId).get()
            );
            const registrationDocs = await Promise.all(registrationPromises);
            
            registrationDocs.forEach(regDoc => {
                if (regDoc.exists) {
                    const regData = regDoc.data();
                    const name = regData.name || regData['Full Name'] || 'Unknown';
                    const email = regData.email || regData['Email address'] || '';
                    registrationsMap.set(regDoc.id, { name, email });
                }
            });
        }
        
        // Filter by search term if provided (client-side)
        let filteredDocs = snapshot.docs;
        if (filterSearch) {
            const searchLower = filterSearch.toLowerCase();
            filteredDocs = filteredDocs.filter(doc => {
                const data = doc.data();
                const regInfo = registrationsMap.get(data.uniqueId) || { name: '', email: '' };
                const name = (regInfo.name || '').toLowerCase();
                const email = (regInfo.email || '').toLowerCase();
                const uniqueId = (data.uniqueId || '').toLowerCase();
                return name.includes(searchLower) || email.includes(searchLower) || uniqueId.includes(searchLower);
            });
        }
        
        // Update results count
        if (resultsCount) {
            resultsCount.innerHTML = `<p><strong>Total Results:</strong> ${filterSearch ? filteredDocs.length : totalCount}</p>`;
        }
        
        // Display results
        if (filteredDocs.length === 0) {
            historyList.innerHTML = '<p>No checkins found</p>';
            return;
        }
        
        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Participant</th>
                        <th>Praveshika ID</th>
                        <th>Checkin Type</th>
                        <th>Location</th>
                        <th>Checked In By</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        filteredDocs.forEach(doc => {
            const data = doc.data();
            const timestamp = data.timestamp?.toDate();
            const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
            const regInfo = registrationsMap.get(data.uniqueId) || { name: 'Unknown', email: '' };
            
            html += `
                <tr>
                    <td>${escapeHtml(timeStr)}</td>
                    <td>${escapeHtml(regInfo.name)}</td>
                    <td>${escapeHtml(data.uniqueId || 'N/A')}</td>
                    <td>${escapeHtml(CHECKIN_TYPE_LABELS[data.checkinType] || data.checkinType)}</td>
                    <td>${escapeHtml(data.pickupLocation || 'N/A')}</td>
                    <td>${escapeHtml(data.checkedInByName || 'Unknown')}</td>
                    <td>${escapeHtml(data.notes || '')}</td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        historyList.innerHTML = html;
        
        // Update pagination
        updateHistoryPagination(Math.ceil(totalCount / historyPageSize), page);
        
    } catch (error) {
        console.error('Error loading checkin history:', error);
        historyList.innerHTML = '<p>Error loading checkin history</p>';
    }
}

// Apply history filters
function applyHistoryFilters() {
    loadCheckinHistory(1);
}

// Clear history filters
function clearHistoryFilters() {
    const filterType = document.getElementById('historyFilterType');
    const filterSearch = document.getElementById('historyFilterSearch');
    
    if (filterType) filterType.value = '';
    if (filterSearch) filterSearch.value = '';
    
    loadCheckinHistory(1);
}

// Toggle checkin history visibility
function toggleCheckinHistory() {
    const historyContent = document.getElementById('checkinHistoryContent');
    const toggleIcon = document.getElementById('historyToggleIcon');
    const toggleBtn = document.getElementById('toggleHistoryBtn');
    
    if (!historyContent || !toggleIcon) return;
    
    if (historyContent.style.display === 'none') {
        historyContent.style.display = 'block';
        toggleIcon.textContent = '▲';
        toggleBtn.innerHTML = '<span id="historyToggleIcon">▲</span> Hide History';
        // Load history if not already loaded
        if (document.getElementById('checkinHistoryList')?.innerHTML === '') {
            loadCheckinHistory(1);
        }
    } else {
        historyContent.style.display = 'none';
        toggleIcon.textContent = '▼';
        toggleBtn.innerHTML = '<span id="historyToggleIcon">▼</span> Show History';
    }
}

// Update history pagination
function updateHistoryPagination(totalPages, currentPage) {
    const pagination = document.getElementById('historyPagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '<div class="pagination-controls">';
    
    // Previous button
    if (currentPage > 1) {
        html += `<button class="btn btn-secondary" onclick="loadCheckinHistory(${currentPage - 1})">Previous</button>`;
    }
    
    // Page numbers
    for (let i = 1; i <= totalPages && i <= 10; i++) {
        if (i === currentPage) {
            html += `<button class="btn btn-primary" disabled>${i}</button>`;
        } else {
            html += `<button class="btn btn-secondary" onclick="loadCheckinHistory(${i})">${i}</button>`;
        }
    }
    
    // Next button
    if (currentPage < totalPages) {
        html += `<button class="btn btn-secondary" onclick="loadCheckinHistory(${currentPage + 1})">Next</button>`;
    }
    
    html += '</div>';
    pagination.innerHTML = html;
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

// Export checkin history
async function exportCheckinHistory(format) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Get all filtered data (not paginated)
        const filterType = document.getElementById('historyFilterType')?.value || '';
        const filterSearch = document.getElementById('historyFilterSearch')?.value.trim() || '';
        
        let query = db.collection('checkins');
        
        if (filterType) {
            query = query.where('checkinType', '==', filterType);
        }
        
        // Order by timestamp
        query = query.orderBy('timestamp', 'desc');
        
        const snapshot = await query.get();
        
        // Fetch participant data from registrations
        const uniqueIds = snapshot.docs.map(doc => doc.data().uniqueId).filter(id => id);
        const registrationsMap = new Map();
        
        if (uniqueIds.length > 0) {
            const registrationPromises = uniqueIds.map(uniqueId => 
                db.collection('registrations').doc(uniqueId).get()
            );
            const registrationDocs = await Promise.all(registrationPromises);
            
            registrationDocs.forEach(regDoc => {
                if (regDoc.exists) {
                    const regData = regDoc.data();
                    const name = regData.name || regData['Full Name'] || 'Unknown';
                    const email = regData.email || regData['Email address'] || '';
                    registrationsMap.set(regDoc.id, { name, email });
                }
            });
        }
        
        // Filter by search term
        let docs = snapshot.docs;
        if (filterSearch) {
            const searchLower = filterSearch.toLowerCase();
            docs = docs.filter(doc => {
                const data = doc.data();
                const regInfo = registrationsMap.get(data.uniqueId) || { name: '', email: '' };
                const name = (regInfo.name || '').toLowerCase();
                const email = (regInfo.email || '').toLowerCase();
                const uniqueId = (data.uniqueId || '').toLowerCase();
                return name.includes(searchLower) || email.includes(searchLower) || uniqueId.includes(searchLower);
            });
        }
        
        if (format === 'csv') {
            exportToCSV(docs, registrationsMap);
        } else if (format === 'pdf') {
            exportToPDF(docs, registrationsMap);
        }
        
    } catch (error) {
        console.error('Error exporting checkin history:', error);
        showNotification('Error exporting: ' + error.message, 'error');
    }
}

// Export to CSV
function exportToCSV(docs, registrationsMap) {
    const headers = ['Timestamp', 'Participant Name', 'Praveshika ID', 'Email', 'Checkin Type', 'Location', 'Bag Count', 'Locker ID', 'Checked In By', 'Notes'];
    
    let csv = headers.join(',') + '\n';
    
    docs.forEach(doc => {
        const data = doc.data();
        const timestamp = data.timestamp?.toDate();
        const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
        const regInfo = registrationsMap?.get(data.uniqueId) || { name: '', email: '' };
        
        const row = [
            timeStr,
            regInfo.name || '',
            data.uniqueId || '',
            regInfo.email || '',
            CHECKIN_TYPE_LABELS[data.checkinType] || data.checkinType || '',
            data.pickupLocation || '',
            data.bagCount || '',
            data.lockerId || '',
            data.checkedInByName || '',
            (data.notes || '').replace(/"/g, '""') // Escape quotes in CSV
        ];
        
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `checkin_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('CSV exported successfully', 'success');
}

// Export to PDF
function exportToPDF(docs, registrationsMap) {
    if (typeof window.jspdf === 'undefined') {
        showNotification('PDF library not loaded', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add header
    doc.setFontSize(16);
    doc.text('Checkin History Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Records: ${docs.length}`, 14, 36);
    
    // Add table
    let y = 45;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 14;
    
    // Headers
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Timestamp', margin, y);
    doc.text('Participant', margin + 40, y);
    doc.text('ID', margin + 80, y);
    doc.text('Type', margin + 110, y);
    doc.text('By', margin + 140, y);
    
    y += 8;
    doc.setFont(undefined, 'normal');
    
    docs.forEach((docItem, index) => {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = 20;
        }
        
        const data = docItem.data();
        const timestamp = data.timestamp?.toDate();
        const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
        const regInfo = registrationsMap?.get(data.uniqueId) || { name: '', email: '' };
        
        doc.setFontSize(8);
        doc.text(timeStr.substring(0, 16), margin, y);
        doc.text((regInfo.name || '').substring(0, 20), margin + 40, y);
        doc.text((data.uniqueId || '').substring(0, 15), margin + 80, y);
        doc.text((CHECKIN_TYPE_LABELS[data.checkinType] || '').substring(0, 15), margin + 110, y);
        doc.text((data.checkedInByName || '').substring(0, 20), margin + 140, y);
        
        y += 6;
    });
    
    // Save
    doc.save(`checkin_history_${new Date().toISOString().split('T')[0]}.pdf`);
    showNotification('PDF exported successfully', 'success');
}

// ============================================
// REAL-TIME NOTIFICATIONS
// ============================================

// Setup checkin listeners
function setupCheckinListeners() {
    if (!window.firebase || !firebase.firestore) return;
    
    // Remove existing listener if any
    if (checkinHistoryListener) {
        checkinHistoryListener();
    }
    
    const db = firebase.firestore();
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    // Limit listener scope to last 24 hours to reduce read costs
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    const last24HoursTimestamp = firebase.firestore.Timestamp.fromDate(last24Hours);
    
    // Listen for new checkins (limited to last 24 hours)
    // Note: This requires a Firestore index on checkins collection with timestamp field
    checkinHistoryListener = db.collection('checkins')
        .where('timestamp', '>=', last24HoursTimestamp)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot((snapshot) => {
            if (!checkinNotificationSettings.enabled) return;
            
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    
                    // Check if notification should be shown for this type
                    if (checkinNotificationSettings.types.length > 0 && 
                        !checkinNotificationSettings.types.includes(data.checkinType)) {
                        return;
                    }
                    
                    // Show notification
                    showCheckinNotification(data);
                    
                    // Play sound if enabled
                    if (checkinNotificationSettings.soundEnabled) {
                        playNotificationSound();
                    }
                    
                    // Reload recent checkins
                    loadRecentCheckins(currentCheckinType);
                }
            });
        }, (error) => {
            console.error('Error in checkin listener:', error);
        });
}

// Show checkin notification
async function showCheckinNotification(data) {
    const timestamp = data.timestamp?.toDate();
    const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
    
    // Fetch participant name from registrations
    let participantName = 'Unknown';
    if (data.uniqueId && window.firebase && firebase.firestore) {
        try {
            const db = firebase.firestore();
            const regDoc = await db.collection('registrations').doc(data.uniqueId).get();
            if (regDoc.exists) {
                const regData = regDoc.data();
                participantName = regData.name || regData['Full Name'] || 'Unknown';
            }
        } catch (error) {
            console.error('Error fetching participant name for notification:', error);
        }
    }
    
    const notification = document.createElement('div');
    notification.className = 'checkin-notification';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: #4CAF50;
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10001;
        max-width: 350px;
        animation: slideInRight 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 0.5rem;">New Checkin</div>
        <div>${escapeHtml(participantName)}</div>
        <div style="font-size: 0.85em; opacity: 0.9;">${escapeHtml(CHECKIN_TYPE_LABELS[data.checkinType] || data.checkinType)}</div>
        <div style="font-size: 0.75em; opacity: 0.8; margin-top: 0.25rem;">${escapeHtml(timeStr)}</div>
        <button onclick="this.parentElement.remove()" style="position: absolute; top: 5px; right: 5px; background: rgba(255,255,255,0.2); border: none; color: white; cursor: pointer; padding: 2px 6px; border-radius: 3px;">×</button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, checkinNotificationSettings.duration || 5000);
}

// Play notification sound
function playNotificationSound() {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// Barcode scanning state
let barcodeScannerActive = false;
let barcodeScanningStream = null;

// Start barcode scan (camera)
async function startBarcodeScan() {
    if (typeof Quagga === 'undefined') {
        showNotification('Barcode scanning library not loaded. Please refresh the page.', 'error');
        return;
    }
    
    if (barcodeScannerActive) {
        showNotification('Camera is already active', 'info');
        return;
    }
    
    try {
        // Request camera access
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment' // Use back camera on mobile devices
            }
        });
        
        barcodeScanningStream = stream;
        barcodeScannerActive = true;
        
        // Show camera UI
        const container = document.getElementById('barcodeScannerContainer');
        const video = document.getElementById('barcodeVideo');
        const startBtn = document.getElementById('startCameraBtn');
        const stopBtn = document.getElementById('stopCameraBtn');
        
        if (container) container.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        
        // Set up video stream
        if (video) {
            video.srcObject = stream;
            video.play();
        }
        
        // Initialize QuaggaJS
        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: video,
                constraints: {
                    width: { min: 640 },
                    height: { min: 480 },
                    facingMode: "environment"
                }
            },
            decoder: {
                readers: [
                    "code_128_reader",
                    "ean_reader",
                    "ean_8_reader",
                    "code_39_reader",
                    "code_39_vin_reader",
                    "codabar_reader",
                    "upc_reader",
                    "upc_e_reader",
                    "i2of5_reader"
                ]
            },
            locate: true
        }, function(err) {
            if (err) {
                console.error('Quagga initialization error:', err);
                stopBarcodeScan();
                showNotification('Failed to initialize barcode scanner: ' + err.message, 'error');
                return;
            }
            
            Quagga.start();
        });
        
        // Listen for barcode detection
        Quagga.onDetected(function(result) {
            if (!barcodeScannerActive) return;
            
            const code = result.codeResult.code;
            if (code) {
                // Stop scanning immediately
                stopBarcodeScan();
                
                // Set the barcode input value
                const barcodeInput = document.getElementById('barcodeInput');
                if (barcodeInput) {
                    barcodeInput.value = code;
                }
                
                // Automatically search for the participant
                showNotification('Barcode detected: ' + code, 'success');
                setTimeout(() => {
                    searchByPraveshikaIdDirect(code);
                }, 500);
            }
        });
        
    } catch (error) {
        console.error('Error starting barcode scan:', error);
        stopBarcodeScan();
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            showNotification('Camera access denied. Please allow camera access and try again.', 'error');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            showNotification('No camera found. Please connect a camera and try again.', 'error');
        } else {
            showNotification('Error accessing camera: ' + error.message, 'error');
        }
    }
}

// Stop barcode scan
function stopBarcodeScan() {
    if (!barcodeScannerActive) return;
    
    barcodeScannerActive = false;
    
    // Stop Quagga
    try {
        if (typeof Quagga !== 'undefined') {
            Quagga.stop();
        }
    } catch (e) {
        console.error('Error stopping Quagga:', e);
    }
    
    // Stop video stream
    if (barcodeScanningStream) {
        barcodeScanningStream.getTracks().forEach(track => track.stop());
        barcodeScanningStream = null;
    }
    
    // Hide camera UI
    const container = document.getElementById('barcodeScannerContainer');
    const video = document.getElementById('barcodeVideo');
    const startBtn = document.getElementById('startCameraBtn');
    const stopBtn = document.getElementById('stopCameraBtn');
    
    if (container) container.style.display = 'none';
    if (video) {
        video.srcObject = null;
    }
    if (startBtn) startBtn.style.display = 'inline-block';
    if (stopBtn) stopBtn.style.display = 'none';
}

// ============================================
// CHECKIN STATUS FOR PROFILE
// ============================================

// ============================================
// CHECKIN ANALYTICS FOR ADMIN DASHBOARD
// ============================================

// Helper function to safely convert timestamp to Date
function safeTimestampToDate(timestamp) {
    if (!timestamp) return null;
    
    // If it's already a Date object
    if (timestamp instanceof Date) {
        return timestamp;
    }
    
    // If it's a Firestore Timestamp (has toDate method)
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    
    // If it's a number (milliseconds or seconds)
    if (typeof timestamp === 'number') {
        // If it's in seconds (less than year 2000 in milliseconds), convert to milliseconds
        if (timestamp < 946684800000) {
            return new Date(timestamp * 1000);
        }
        return new Date(timestamp);
    }
    
    // If it's a string, try to parse it
    if (typeof timestamp === 'string') {
        const parsed = new Date(timestamp);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    
    return null;
}

// Load checkin analytics
async function loadCheckinAnalytics() {
    if (!window.firebase || !firebase.firestore) return;
    
    const CACHE_KEY = 'checkinAnalyticsCache';
    const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds
    
    try {
        const db = firebase.firestore();
        
        // Check cache first
        const cachedData = getCachedData(CACHE_KEY, CACHE_MAX_AGE);
        let totalCheckins, uniqueParticipants, typeBreakdown, recentCheckins;
        
        // Get today's checkins count using query (always fresh)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = firebase.firestore.Timestamp.fromDate(today);
        
        const todayCheckinsSnapshot = await db.collection('checkins')
            .where('timestamp', '>=', todayTimestamp)
            .get();
        const checkinsToday = todayCheckinsSnapshot.size;
        
        if (cachedData) {
            // Use cached data for totals and breakdowns
            totalCheckins = cachedData.totalCheckins;
            uniqueParticipants = cachedData.uniqueParticipants;
            typeBreakdown = cachedData.typeBreakdown;
            recentCheckins = cachedData.recentCheckins;
        } else {
            // Cache expired or missing - fetch fresh data
            // Get all checkins for totals and breakdowns
            const checkinsSnapshot = await db.collection('checkins').get();
            const allCheckins = [];
            checkinsSnapshot.forEach(doc => {
                allCheckins.push(doc.data());
            });
            
            // Calculate statistics
            totalCheckins = allCheckins.length;
            uniqueParticipants = new Set(allCheckins.map(c => c.uniqueId)).size;
            
            // Breakdown by type
            typeBreakdown = {};
            allCheckins.forEach(checkin => {
                const type = checkin.checkinType || 'unknown';
                typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
            });
            
            // Recent checkins timeline (last 50)
            recentCheckins = allCheckins
                .sort((a, b) => {
                    const aTime = safeTimestampToDate(a.timestamp) || new Date(0);
                    const bTime = safeTimestampToDate(b.timestamp) || new Date(0);
                    return bTime - aTime;
                })
                .slice(0, 50);
            
            // Cache the results
            setCachedData(CACHE_KEY, {
                totalCheckins: totalCheckins,
                uniqueParticipants: uniqueParticipants,
                typeBreakdown: typeBreakdown,
                recentCheckins: recentCheckins
            });
        }
        
        // Update metric cards
        const totalCheckinsEl = document.getElementById('totalCheckins');
        const checkedInParticipantsEl = document.getElementById('checkedInParticipants');
        const checkinsTodayEl = document.getElementById('checkinsToday');
        
        if (totalCheckinsEl) totalCheckinsEl.textContent = totalCheckins;
        if (checkedInParticipantsEl) checkedInParticipantsEl.textContent = uniqueParticipants;
        if (checkinsTodayEl) checkinsTodayEl.textContent = checkinsToday;
        
        // Display type breakdown
        const checkinTypeTableBody = document.getElementById('checkinTypeTableBody');
        if (checkinTypeTableBody) {
            let html = '';
            Object.keys(CHECKIN_TYPE_LABELS).forEach(type => {
                const count = typeBreakdown[type] || 0;
                const percentage = totalCheckins > 0 ? ((count / totalCheckins) * 100).toFixed(1) : 0;
                html += `
                    <tr>
                        <td>${CHECKIN_TYPE_LABELS[type]}</td>
                        <td>${count}</td>
                        <td>${percentage}%</td>
                    </tr>
                `;
            });
            checkinTypeTableBody.innerHTML = html;
        }
        
        // Display recent checkins timeline
        const checkinTimelineTableBody = document.getElementById('checkinTimelineTableBody');
        if (checkinTimelineTableBody) {
            // Fetch participant names from registrations
            const uniqueIds = recentCheckins.map(c => c.uniqueId).filter(id => id);
            const registrationsMap = new Map();
            
            if (uniqueIds.length > 0 && window.firebase && firebase.firestore) {
                try {
                    const db = firebase.firestore();
                    const registrationPromises = uniqueIds.map(uniqueId => 
                        db.collection('registrations').doc(uniqueId).get()
                    );
                    const registrationDocs = await Promise.all(registrationPromises);
                    
                    registrationDocs.forEach(regDoc => {
                        if (regDoc.exists) {
                            const regData = regDoc.data();
                            const name = regData.name || regData['Full Name'] || 'Unknown';
                            registrationsMap.set(regDoc.id, name);
                        }
                    });
                } catch (error) {
                    console.error('Error fetching participant names for timeline:', error);
                }
            }
            
            let html = '';
            recentCheckins.forEach(checkin => {
                const timestamp = safeTimestampToDate(checkin.timestamp);
                const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
                const participantName = registrationsMap.get(checkin.uniqueId) || 'Unknown';
                html += `
                    <tr>
                        <td>${escapeHtml(timeStr)}</td>
                        <td>${escapeHtml(participantName)} (${escapeHtml(checkin.uniqueId || 'N/A')})</td>
                        <td>${escapeHtml(CHECKIN_TYPE_LABELS[checkin.checkinType] || checkin.checkinType)}</td>
                        <td>${escapeHtml(checkin.checkedInByName || 'Unknown')}</td>
                    </tr>
                `;
            });
            checkinTimelineTableBody.innerHTML = html || '<tr><td colspan="4">No checkins yet</td></tr>';
        }
        
    } catch (error) {
        console.error('Error loading checkin analytics:', error);
    }
}

// Load checkin status for profile
async function loadCheckinStatusForProfile(uniqueIds) {
    if (!window.firebase || !firebase.firestore) return;
    
    const checkinStatusContent = document.getElementById('checkinStatusContent');
    if (!checkinStatusContent) return;
    
    if (!uniqueIds || (Array.isArray(uniqueIds) && uniqueIds.length === 0) || (!Array.isArray(uniqueIds) && !uniqueIds)) {
        checkinStatusContent.innerHTML = '<p>No Praveshika ID found for checkin status</p>';
        return;
    }
    
    // Convert to array if single value
    const uniqueIdArray = Array.isArray(uniqueIds) ? uniqueIds : [uniqueIds];
    
    try {
        const db = firebase.firestore();
        
        // Get all checkins for these uniqueIds
        const checkinPromises = uniqueIdArray.map(uniqueId => 
            db.collection('checkins')
                .where('uniqueId', '==', uniqueId)
                .orderBy('timestamp', 'desc')
                .get()
        );
        
        const checkinSnapshots = await Promise.all(checkinPromises);
        
        // Combine all checkins
        const allCheckins = [];
        checkinSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
                allCheckins.push(doc.data());
            });
        });
        
        // Group by checkin type
        const checkinByType = {};
        Object.keys(CHECKIN_TYPE_LABELS).forEach(type => {
            checkinByType[type] = allCheckins.filter(c => c.checkinType === type);
        });
        
        // Display checkin status
        let html = '<div class="checkin-status-grid">';
        
        Object.keys(CHECKIN_TYPE_LABELS).forEach(type => {
            const checkins = checkinByType[type];
            const latestCheckin = checkins.length > 0 ? checkins[0] : null;
            const status = latestCheckin ? 'checked-in' : 'not-checked-in';
            const timestamp = latestCheckin && latestCheckin.timestamp ? 
                latestCheckin.timestamp.toDate().toLocaleString() : 'Not checked in';
            
            html += `
                <div class="checkin-status-item ${status}">
                    <div class="checkin-status-type">${CHECKIN_TYPE_LABELS[type]}</div>
                    <div class="checkin-status-time">${escapeHtml(timestamp)}</div>
                    ${latestCheckin && latestCheckin.pickupLocation ? 
                        `<div class="checkin-status-location">Location: ${escapeHtml(latestCheckin.pickupLocation)}</div>` : ''}
                    ${latestCheckin && latestCheckin.bagCount !== undefined ? 
                        `<div class="checkin-status-details">Bags: ${latestCheckin.bagCount}, Locker: ${escapeHtml(latestCheckin.lockerId || 'N/A')}</div>` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        checkinStatusContent.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading checkin status:', error);
        checkinStatusContent.innerHTML = '<p>Error loading checkin status</p>';
    }
}


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

// Cache Helper Functions
function getCachedData(key, maxAgeMs) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        
        const parsed = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is expired
        if (parsed.timestamp && (now - parsed.timestamp) > maxAgeMs) {
            localStorage.removeItem(key);
            return null;
        }
        
        return parsed.data;
    } catch (error) {
        console.error(`Error reading cache for ${key}:`, error);
        return null;
    }
}

function setCachedData(key, data) {
    try {
        const cacheObject = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheObject));
    } catch (error) {
        console.error(`Error writing cache for ${key}:`, error);
        // If storage is full, try to clear old caches
        try {
            localStorage.removeItem('checkinAnalyticsCache');
            localStorage.removeItem('adminDashboardStatsCache');
            localStorage.setItem(key, JSON.stringify({ data: data, timestamp: Date.now() }));
        } catch (e) {
            console.error('Failed to clear cache:', e);
        }
    }
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
