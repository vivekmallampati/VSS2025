// Global variables
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
const PROTECTED_TABS = ['shibirarthi', 'shibir-resources', 'myprofile', 'mytransportation', 'mytours', 'checkin', 'admin-dashboard', 'user-management', 'participant-lookup'];

// Helper function to check if a tab is protected
function isProtectedTab(tabName) {
    return PROTECTED_TABS.includes(tabName);
}

// Generic helper to fetch user data from Firestore
// 
// TO SETUP INITIAL SUPERADMIN:
// 1. User logs in with their registered email and default password
// 2. Once logged in, go to Firebase Console > Firestore Database
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
async function getUserData(user) {
    if (!user || !window.firebase || !firebase.firestore) {
        return null;
    }
    
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            return null;
        }
        
        return userDoc.data();
    } catch (error) {
        // Silently return null for permission errors (happens during user creation flow)
        if (error.code === 'permission-denied') {
            return null;
        }
        console.error('Error fetching user data:', error);
        return null;
    }
}

// Helper function to check if user is a superadmin
async function isSuperadmin(user) {
    const userData = await getUserData(user);
    return userData?.role === 'superadmin';
}

// Helper function to check if user is an admin (superadmin or admin)
async function isAdmin(user) {
    const userData = await getUserData(user);
    return userData?.role === 'superadmin' || userData?.role === 'admin';
}

// Helper function to check if user is a volunteer
async function isVolunteer(user) {
    const userData = await getUserData(user);
    return userData?.role === 'volunteer';
}

// Helper function to get volunteer teams
async function getVolunteerTeams(user) {
    const userData = await getUserData(user);
    return userData?.volunteerTeams || [];
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
    
    // Volunteers: restrict by assigned teams matching Firestore rules
    const isVolunteerUser = await isVolunteer(user);
    if (!isVolunteerUser) return false;
    
    const teams = await getVolunteerTeams(user);
    if (!Array.isArray(teams) || teams.length === 0) return false;
    
    const teamMap = {
        'pickup_location': 'transportation',
        'registration': 'registration',
        'shulk_paid': 'registration',  // Shulk paid is part of registration
        'kit_collected': 'registration',  // Kit collected is part of registration
        'ganvesh_collected': 'ganvesh_collected',
        'cloak_room': 'cloak_room',
        'post_tour': 'post_tour'
    };
    const requiredTeam = teamMap[checkinType];
    if (!requiredTeam) return false;
    
    return teams.includes(requiredTeam);
    
    // Default deny
    return false;
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
        
        // Volunteers: only CheckIn tab is considered accessible
        // (UI already hides other tabs, but this is an extra guard)
        // We can't await here, so we rely on nav visibility as an additional check.
        
        const navItemId = tabName === 'shibirarthi' ? 'shibirarthiNavItem' : 
                         tabName === 'shibir-resources' ? 'shibirResourcesNavItem' :
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

// Load page-specific content when on a separate page
function loadPageContent(pageName) {
    if (window.firebase && firebase.auth) {
        const user = firebase.auth().currentUser;
        if (user) {
            switch(pageName) {
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
                case 'participant-lookup':
                    loadParticipantLookupPage(user);
                    break;
                case 'shibir-resources':
                    initializeShibirResources(user);
                    break;
            }
        } else if (pageName === 'shibir-resources') {
            // Show unauthorized message if not logged in
            initializeShibirResources(null);
        }
    }
}

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
                    case 'participant-lookup':
                        loadParticipantLookupPage(user);
                        break;
                    case 'shibir-resources':
                        initializeShibirResources(user);
                        break;
                }
            } else if (tabName === 'shibir-resources') {
                // Show unauthorized message if not logged in
                initializeShibirResources(null);
            }
        }
        
        // Scroll to top of page
        window.scrollTo(0, 0);
    }
}

// Clear shibir resources when user logs out
function clearShibirResources() {
    // Clear PDF iframes
    const schedulePdfIframe = document.getElementById('schedulePdfIframe');
    if (schedulePdfIframe) {
        schedulePdfIframe.src = '';
    }
    
    const pdfIframe = document.getElementById('orientationPdfIframe');
    if (pdfIframe) {
        pdfIframe.src = '';
    }
    
    // Clear video
    const videoElement = document.getElementById('vyayamyogVideo');
    if (videoElement && videoElement.querySelector('source')) {
        videoElement.querySelector('source').src = '';
        videoElement.load();
    }
    
    // Hide content and show unauthorized message
    const loadingDiv = document.getElementById('shibirResourcesLoading');
    const contentDiv = document.getElementById('shibirResourcesContent');
    const unauthorizedDiv = document.getElementById('shibirResourcesUnauthorized');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (contentDiv) contentDiv.style.display = 'none';
    if (unauthorizedDiv) unauthorizedDiv.style.display = 'block';
}

// Initialize Shibir Resources page with authentication check
function initializeShibirResources(user) {
    const loadingDiv = document.getElementById('shibirResourcesLoading');
    const contentDiv = document.getElementById('shibirResourcesContent');
    const unauthorizedDiv = document.getElementById('shibirResourcesUnauthorized');
    
    if (!loadingDiv || !contentDiv || !unauthorizedDiv) return;
    
    if (!user) {
        // User not logged in - clear resources and show unauthorized message
        clearShibirResources();
        return;
    }
    
    // User is logged in - show content
    loadingDiv.style.display = 'none';
    unauthorizedDiv.style.display = 'none';
    contentDiv.style.display = 'block';
    
    // Load resources (PDF, video) only when authenticated
    const schedulePdfIframe = document.getElementById('schedulePdfIframe');
    if (schedulePdfIframe) {
        schedulePdfIframe.src = 'docs/VSS 2025 Schedule for website.pdf#toolbar=1&navpanes=1&scrollbar=1';
    }
    
    const pdfIframe = document.getElementById('orientationPdfIframe');
    if (pdfIframe) {
        pdfIframe.src = 'docs/VSS2025_countrywise_preshibir_orientation.pdf#toolbar=1&navpanes=1&scrollbar=1';
    }
    
    const videoElement = document.getElementById('vyayamyogVideo');
    if (videoElement && videoElement.querySelector('source')) {
        videoElement.querySelector('source').src = 'docs/VyayamYog.mp4';
        videoElement.load();
    }
}

// Check authentication before allowing download
function checkAuthBeforeDownload(event) {
    if (!window.firebase || !firebase.auth) {
        event.preventDefault();
        showNotification('Please log in to download resources', 'error');
        return false;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        event.preventDefault();
        showNotification('Please log in to download resources', 'error');
        openLogin();
        return false;
    }
    
    // User is authenticated - allow download
    return true;
}

// Tab Navigation Functionality with URL hash support
// Updated to support both tab-based (index.html) and page-based navigation
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-link');
    const tabContents = document.querySelectorAll('.tab-content');

    // Handle nav link clicks - support both page-based and tab-based navigation
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            const targetTab = this.getAttribute('data-tab');
            const targetPage = this.getAttribute('data-page');
            
            // If link has an href and it's not a hash link, let it navigate normally
            if (href && !href.startsWith('#')) {
                // Page-based navigation - check auth before navigating
                const pageName = targetPage || href.split('/').pop().replace('.html', '') || 'home';
                
                if (isProtectedTab(pageName) && !canAccessProtectedTab(pageName)) {
                    e.preventDefault();
                    // Show login modal or redirect
                    if (!loginModalOpened) {
                        loginModalOpened = true;
                        openLogin();
                        setTimeout(() => {
                            loginModalOpened = false;
                        }, 1000);
                    }
                    return;
                }
                // Allow normal navigation for page-based links
                return;
            }
            
            // Tab-based navigation (for index.html)
            e.preventDefault();
            if (targetTab) {
                activateTab(targetTab);
            }
        });
    });

    // Handle hash changes (browser back/forward buttons, direct URL access)
    // Only for tab-based navigation (index.html)
    window.addEventListener('hashchange', function() {
        // Only handle hash navigation if we're on index.html with tab-based system
        if (document.querySelectorAll('.tab-content').length > 1) {
            const hash = window.location.hash.substring(1); // Remove #
            if (hash) {
                activateTab(hash);
            } else {
                activateTab('home');
            }
        }
    });

    // Handle initial page load - wait for Firebase to initialize first
    // For page-based navigation, load page-specific content
    const currentPath = window.location.pathname;
    const isPageBased = currentPath.includes('/pages/') || currentPath.endsWith('.html');
    
    if (isPageBased) {
        // Extract page name from path
        const pageName = currentPath.split('/').pop().replace('.html', '').replace('index.html', 'home') || 'home';
        
        // Check if protected page and user is authenticated
        if (isProtectedTab(pageName)) {
            waitForFirebase(function() {
                if (!canAccessProtectedTab(pageName)) {
                    // Redirect to home or show login
                    window.location.href = '/';
                    return;
                }
                // Load page-specific content
                loadPageContent(pageName);
            });
        } else {
            // Public page - just load content
            waitForFirebase(function() {
                loadPageContent(pageName);
            });
        }
    } else {
        // Tab-based navigation (index.html) - original code
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
    }

    // Media filter default
    const mediaSelect = document.getElementById('mediaType');
    if (mediaSelect) {
        switchMediaView(mediaSelect.value);
    }
});

// Generic modal utility functions
function openModal(modalId, options = {}) {
    const { onOpen = null, closeOtherModals = [] } = options;
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal ${modalId} not found!`);
        return;
    }
    
    // Close other modals if specified
    closeOtherModals.forEach(otherModalId => {
        const otherModal = document.getElementById(otherModalId);
        if (otherModal) {
            otherModal.style.display = 'none';
        }
    });
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    if (onOpen) onOpen();
}

function closeModal(modalId, options = {}) {
    const { onClose = null } = options;
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // Restore scrolling
        if (onClose) onClose();
    }
}

// Login Modal Functionality
function openLogin() {
    openModal('loginModal');
}
// Ensure openLogin is available globally for inline onclick handlers
window.openLogin = openLogin;

function closeLogin() {
    closeModal('loginModal', {
        onClose: () => showLoginForm()
    });
}

// Close modal when clicking outside of it
window.addEventListener('click', function(event) {
    const loginModal = document.getElementById('loginModal');
    if (event.target === loginModal) {
        closeLogin();
    }
    
    const passwordResetModal = document.getElementById('passwordResetModal');
    if (event.target === passwordResetModal) {
        closePasswordResetModal();
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
                    // Direct email login with default password support
                    const DEFAULT_PASSWORD = 'Vss@2025!';
                    const db = firebase.firestore();
                    
                    // Try to login first
                    firebase.auth().signInWithEmailAndPassword(identifier, password)
                        .then((userCredential) => {
                            // Check if password reset is required (first login)
                            checkAndPromptPasswordReset(userCredential.user, loginForm);
                        })
                        .catch((error) => {
                            // If user not found or invalid credentials and password is default, try to auto-create account
                            // Firebase may return different error codes: 'auth/user-not-found', 'auth/invalid-credential', or 'auth/invalid-login-credentials'
                            const isUserNotFound = error.code === 'auth/user-not-found' || 
                                                  error.code === 'auth/invalid-credential' || 
                                                  error.code === 'auth/invalid-login-credentials';
                            
                            // Check if user exists in nonShibirarthiUsers or registrations (for auto-creation)
                            // Allow this check even if password doesn't match exactly (user might have typo)
                            if (isUserNotFound) {
                                // First check if email exists in nonShibirarthiUsers (volunteers/admins)
                                showNotification('Checking account...', 'info');
                                
                                db.collection('nonShibirarthiUsers').where('email', '==', identifier).limit(1).get()
                                    .then(volunteerSnapshot => {
                                        if (!volunteerSnapshot.empty) {
                                            // Found volunteer/admin - create Auth account for them
                                            const volunteerDoc = volunteerSnapshot.docs[0];
                                            const volunteerData = volunteerDoc.data();
                                            
                                            // If password matches default, create account
                                            if (password === DEFAULT_PASSWORD) {
                                                showNotification('Creating your volunteer account...', 'info');
                                                return firebase.auth().createUserWithEmailAndPassword(identifier, DEFAULT_PASSWORD)
                                                    .then((userCredential) => {
                                                        const user = userCredential.user;
                                                        showNotification('Account created! You are now logged in.', 'success');
                                                        // Volunteer accounts don't need password reset prompt
                                                        return 'volunteer_created';
                                                    })
                                                    .catch((createError) => {
                                                        if (createError.code === 'auth/email-already-in-use') {
                                                            showNotification('Incorrect password. Please check your credentials.', 'error');
                                                        } else {
                                                            console.error('Volunteer account creation error:', createError);
                                                            showNotification('Error creating account: ' + createError.message, 'error');
                                                        }
                                                        return 'error';
                                                    });
                                            } else {
                                                // Password doesn't match - account might already exist with different password
                                                showNotification('Incorrect password. Please check your credentials or use "Forgot Password".', 'error');
                                                return 'error';
                                            }
                                        }
                                        
                                        // Not found in nonShibirarthiUsers, check registrations
                                        return db.collection('registrations').where('email', '==', identifier).limit(1).get();
                                    })
                                    .then(result => {
                                        // If volunteer was created or error occurred, stop here
                                        if (result === 'volunteer_created' || result === 'error') {
                                            return null;
                                        }
                                        
                                        const querySnapshot = result;
                                        let matchingDoc = null;
                                        
                                        if (querySnapshot && !querySnapshot.empty) {
                                            matchingDoc = querySnapshot.docs[0];
                                        } else if (querySnapshot) {
                                            // Fallback: search through all documents
                                            return db.collection('registrations').get()
                                                .then(allDocs => {
                                                    const normalizedEmail = identifier.toLowerCase().trim();
                                                    for (const doc of allDocs.docs) {
                                                        const docData = doc.data();
                                                        const docEmail = docData.email ? docData.email.toLowerCase().trim() : '';
                                                        if (docEmail === normalizedEmail) {
                                                            matchingDoc = doc;
                                                            break;
                                                        }
                                                    }
                                                    return matchingDoc;
                                                });
                                        }
                                        
                                        return matchingDoc;
                                    })
                                    .then(matchingDoc => {
                                        // If null, volunteer was already handled
                                        if (matchingDoc === null) {
                                            return;
                                        }
                                        
                                        if (!matchingDoc) {
                                            showNotification('Email not found. Please contact your administrator.', 'error');
                                            return;
                                        }
                                        
                                        const data = matchingDoc.data();
                                        const actualPraveshikaId = matchingDoc.id;
                                        
                                        // Auto-create Firebase Auth account with default password
                                        // DO NOT create user document in Firestore yet - will be created after password reset
                                        showNotification('Creating your account...', 'info');
                                        return firebase.auth().createUserWithEmailAndPassword(identifier, DEFAULT_PASSWORD)
                                            .then((userCredential) => {
                                                const user = userCredential.user;
                                                
                                                // Store registration data temporarily for later use
                                                // We'll create the user document after password is changed
                                                // For now, just prompt password reset
                                                checkAndPromptPasswordReset(user, loginForm, {
                                                    email: identifier,
                                                    name: data.name || data['Full Name'] || '',
                                                    uniqueId: actualPraveshikaId || '',
                                                    registrationData: data
                                                });
                                            })
                                            .catch((createError) => {
                                                console.error('Account creation error:', createError);
                                                if (createError.code === 'auth/email-already-in-use') {
                                                    // Account already exists - this means user has a different password
                                                    // Try to login again with default password
                                                    firebase.auth().signInWithEmailAndPassword(identifier, DEFAULT_PASSWORD)
                                                        .then((userCredential) => {
                                                            checkAndPromptPasswordReset(userCredential.user, loginForm);
                                                        })
                                                        .catch((loginError) => {
                                                            // If login still fails, the password was changed
                                                            if (loginError.code === 'auth/wrong-password' || 
                                                                loginError.code === 'auth/invalid-credential' || 
                                                                loginError.code === 'auth/invalid-login-credentials') {
                                                                showNotification('The default password has been changed. Please use your current password or use "Forgot Password" to reset it.', 'error');
                                                            } else {
                                                                handleLoginError(loginError);
                                                            }
                                                        });
                                                } else {
                                                    handleLoginError(createError);
                                                }
                                            });
                                    })
                                    .catch((dbError) => {
                                        console.error('Database error:', dbError);
                                        // If permission denied, user might need to contact admin
                                        if (dbError.code === 'permission-denied') {
                                            showNotification('Permission error. Please contact your administrator or try logging in with your exact password.', 'error');
                                        } else {
                                            showNotification('Error checking account. Please try again or contact your administrator.', 'error');
                                        }
                                    });
                            } else if (error.code === 'auth/user-not-found') {
                                showNotification('Email not found. Please contact your administrator.', 'error');
                            } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-login-credentials' || error.code === 'auth/invalid-credential') {
                                showNotification('Incorrect password. Please check your credentials.', 'error');
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
                                showNotification('ID not found. Volunteers/Admins: Contact your administrator.', 'error');
                                throw { code: 'auth/user-not-found', message: 'No email found for this ID.' };
                            }
                            // Login with the found email
                            return firebase.auth().signInWithEmailAndPassword(email, password);
                        })
                        .then((userCredential) => {
                            checkAndPromptPasswordReset(userCredential.user, loginForm);
                        })
                        .catch((error) => {
                            // Check if user doesn't exist or wrong password
                            if (error.code === 'auth/user-not-found') {
                                showNotification('ID not found. Contact your administrator if you are a volunteer/admin.', 'error');
                            } else if (error.code === 'auth/wrong-password') {
                                showNotification('Incorrect password. Please try again.', 'error');
                            } else if (error.code === 'auth/invalid-login-credentials' || error.code === 'auth/invalid-credential') {
                                showNotification('Email not found or incorrect password. Please check your credentials.', 'error');
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

// Password Reset Modal Functions
function openPasswordResetModal(user, loginForm, registrationInfo = null) {
    const modal = document.getElementById('passwordResetModal');
    if (modal) {
        // Store user info for password reset
        modal.dataset.userUid = user.uid;
        modal.dataset.userEmail = user.email;
        if (registrationInfo) {
            modal.dataset.registrationInfo = JSON.stringify(registrationInfo);
        }
        modal.dataset.loginFormId = loginForm ? loginForm.id : '';
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Focus on first input
        setTimeout(() => {
            const firstInput = document.getElementById('resetPasswordNew');
            if (firstInput) firstInput.focus();
        }, 100);
    }
}

function closePasswordResetModal() {
    const modal = document.getElementById('passwordResetModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        // Reset form
        const form = document.getElementById('passwordResetForm');
        if (form) form.reset();
        
        // Reset password visibility toggles
        const newPasswordInput = document.getElementById('resetPasswordNew');
        const confirmPasswordInput = document.getElementById('resetPasswordConfirm');
        const toggleNew = document.getElementById('toggleNewPassword');
        const toggleConfirm = document.getElementById('toggleConfirmPassword');
        
        if (newPasswordInput) newPasswordInput.type = 'password';
        if (confirmPasswordInput) confirmPasswordInput.type = 'password';
        if (toggleNew) toggleNew.textContent = '👁️';
        if (toggleConfirm) toggleConfirm.textContent = '👁️';
        
        // Clear stored data
        delete modal.dataset.userUid;
        delete modal.dataset.userEmail;
        delete modal.dataset.registrationInfo;
        delete modal.dataset.loginFormId;
    }
}

// Toggle password visibility
function togglePasswordVisibility(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    
    if (input && toggle) {
        if (input.type === 'password') {
            input.type = 'text';
            toggle.textContent = '🙈';
        } else {
            input.type = 'password';
            toggle.textContent = '👁️';
        }
    }
}

// Password Reset Form Submission (for first-time login)
document.addEventListener('DOMContentLoaded', function() {
    const passwordResetForm = document.getElementById('passwordResetForm');
    if (passwordResetForm) {
        passwordResetForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const modal = document.getElementById('passwordResetModal');
            if (!modal) return;
            
            const userUid = modal.dataset.userUid;
            const registrationInfo = modal.dataset.registrationInfo ? JSON.parse(modal.dataset.registrationInfo) : null;
            const loginFormId = modal.dataset.loginFormId;
            const loginForm = loginFormId ? document.getElementById(loginFormId) : null;
            
            if (!userUid) {
                showNotification('Session expired. Please login again.', 'error');
                closePasswordResetModal();
                return;
            }
            
            const newPassword = document.getElementById('resetPasswordNew').value;
            const confirmPassword = document.getElementById('resetPasswordConfirm').value;
            
            if (!newPassword) {
                showNotification('Please enter a new password.', 'error');
                return;
            }
            
            if (newPassword.length < 6) {
                showNotification('New password must be at least 6 characters long.', 'error');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                showNotification('New password and confirm password do not match.', 'error');
                return;
            }
            
            // Get current user
            const currentUser = firebase.auth().currentUser;
            if (!currentUser || currentUser.uid !== userUid) {
                showNotification('Session expired. Please login again.', 'error');
                closePasswordResetModal();
                return;
            }
            
            // Update password
            showNotification('Resetting password...', 'info');
            
            currentUser.updatePassword(newPassword)
                .then(() => {
                    showNotification('Password reset successfully!', 'success');
                    
                    // Create user document (required for first-time login)
                    if (window.firebase && firebase.firestore) {
                        const db = firebase.firestore();
                        let userData;
                        
                        // If registrationInfo exists (account creation), use it to populate user data
                        if (registrationInfo) {
                            userData = {
                                email: currentUser.email,
                                name: registrationInfo.name || '',
                                uniqueId: registrationInfo.uniqueId || '',
                                role: registrationInfo.role || 'participant',
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                associatedRegistrations: registrationInfo.uniqueId ? [{
                                    uniqueId: registrationInfo.uniqueId,
                                    name: registrationInfo.name || '',
                                    email: currentUser.email
                                }] : []
                            };
                        } else {
                            // First-time login without registrationInfo - create basic user document
                            userData = {
                                email: currentUser.email,
                                name: '',
                                uniqueId: '',
                                role: 'participant',
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                associatedRegistrations: []
                            };
                        }
                        
                        return db.collection('users').doc(currentUser.uid).set(userData, { merge: true })
                            .then(() => {
                                // Clear pending user creation if exists
                                localStorage.removeItem('pendingUserCreation_' + currentUser.uid);
                            });
                    }
                })
                .then(() => {
                    // Close modal and proceed with login
                    closePasswordResetModal();
                    closeLogin();
                    
                    if (loginForm) {
                        handleLoginSuccess(loginForm);
                    } else {
                        updateAuthUI();
                    }
                })
                .catch((error) => {
                    console.error('Error resetting password:', error);
                    let errorMessage = 'Error resetting password. ';
                    
                    if (error.code === 'auth/weak-password') {
                        errorMessage = 'New password is too weak. Please choose a stronger password.';
                    } else if (error.code === 'auth/requires-recent-login') {
                        errorMessage = 'For security, please login again and then reset your password.';
                        // Sign out and close modal
                        firebase.auth().signOut().then(() => {
                            closePasswordResetModal();
                            closeLogin();
                        });
                    } else {
                        errorMessage += error.message || 'Please try again.';
                    }
                    
                    showNotification(errorMessage, 'error');
                });
        });
    }
});

// Check if password reset is required and prompt user
// Shows password reset modal when user document doesn't exist (first-time login or account creation)
function checkAndPromptPasswordReset(user, loginForm, registrationInfo = null) {
    if (!window.firebase || !firebase.firestore) {
        handleLoginSuccess(loginForm);
        return;
    }
    
    const db = firebase.firestore();
    
    // Check if user document exists in Firestore
    db.collection('users').doc(user.uid).get()
        .then((userDoc) => {
            const userExists = userDoc.exists;
            
            // FIRST-TIME LOGIN OR ACCOUNT CREATION: If user document doesn't exist, show password reset modal
            // This applies whether it's a first-time login or a newly created account
            if (!userExists) {
                // User successfully authenticated but no document in Firestore
                // Close login modal and show password reset modal
                // Pass registrationInfo so user document can be created after password reset
                closeLogin();
                openPasswordResetModal(user, loginForm, registrationInfo);
            } 
            // REGULAR LOGIN: User document exists, proceed with normal login
            else {
                handleLoginSuccess(loginForm);
            }
        })
        .catch((error) => {
            console.error('Error checking user document:', error);
            // If check fails, proceed with normal login
            handleLoginSuccess(loginForm);
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
        errorMessage = 'Email not found. Please contact your administrator.';
        // This is handled in the login flow, but keeping for other cases
    } else if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
        errorMessage = 'Permission denied. Please make sure Firestore security rules are properly deployed.';
    } else if (error.code === 'auth/wrong-password') {
        errorMessage += 'Incorrect password.';
    } else if (error.code === 'auth/invalid-email') {
        errorMessage += 'Invalid email address.';
    } else if (error.code === 'auth/user-disabled') {
        errorMessage += 'This account has been disabled.';
    } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') {
        errorMessage = 'Email not found or incorrect password. Please check your credentials.';
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
    
    // Update lastLoginAt timestamp when user logs in
    if (user && window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        try {
            await db.collection('users').doc(user.uid).update({
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            // Silently fail if user document doesn't exist yet (will be created during registration)
            if (error.code !== 'not-found') {
                console.error('Error updating lastLoginAt:', error);
            }
        }
    }
    
    const loginBtn = document.querySelector('.header-actions .login-btn');
    const homeNavItem = document.getElementById('homeNavItem');
    const aboutNavItem = document.getElementById('aboutNavItem');
    const mediaNavItem = document.getElementById('mediaNavItem');
    const shibirarthiNavItem = document.getElementById('shibirarthiNavItem');
    const shibirResourcesNavItem = document.getElementById('shibirResourcesNavItem');
    const myProfileNavItem = document.getElementById('myProfileNavItem');
    const myTransportationNavItem = document.getElementById('myTransportationNavItem');
    const myToursNavItem = document.getElementById('myToursNavItem');
    const checkinNavItem = document.getElementById('checkinNavItem');
    const adminDashboardNavItem = document.getElementById('adminDashboardNavItem');
    const userManagementNavItem = document.getElementById('userManagementNavItem');
    const participantLookupNavItem = document.getElementById('participantLookupNavItem');
    
    if (user) {
        // Check user roles
        const isSuperadminUser = await isSuperadmin(user);
        const isAdminUser = await isAdmin(user);
        const canPerformCheckinUser = await canPerformCheckin(user);
        const canViewDashboardUser = await canViewDashboard(user);
        const isVolunteerUser = await isVolunteer(user);
        
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
        
        if (isVolunteerUser && !isAdminUser && !isSuperadminUser) {
            // Volunteers: CheckIn-only experience (plus logout)
            if (homeNavItem) homeNavItem.style.display = 'none';
            if (aboutNavItem) homeNavItem.style.display = 'none';
            if (mediaNavItem) mediaNavItem.style.display = 'none';
            if (shibirarthiNavItem) shibirarthiNavItem.style.display = 'none';
            if (shibirResourcesNavItem) shibirResourcesNavItem.style.display = 'none';
            if (myProfileNavItem) myProfileNavItem.style.display = 'none';
            if (myTransportationNavItem) myTransportationNavItem.style.display = 'none';
            if (myToursNavItem) myToursNavItem.style.display = 'none';
            if (adminDashboardNavItem) adminDashboardNavItem.style.display = 'none';
            if (userManagementNavItem) userManagementNavItem.style.display = 'none';
            if (participantLookupNavItem) participantLookupNavItem.style.display = 'none';
            
            if (checkinNavItem && canPerformCheckinUser) {
                checkinNavItem.style.display = '';
            } else if (checkinNavItem) {
                checkinNavItem.style.display = 'none';
            }
            
            // Force navigation to CheckIn tab
            window.history.pushState(null, null, '#checkin');
            activateTab('checkin', true);
        } else {
            // Admins / superadmins / regular authenticated users
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
            
            // Show protected tabs for all authenticated shibirarthis/admins
            if (shibirarthiNavItem) {
                shibirarthiNavItem.style.display = '';
            }
            if (shibirResourcesNavItem) {
                shibirResourcesNavItem.style.display = '';
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
            
            // Show admin dashboard for both superadmins and admins
            if (adminDashboardNavItem) {
                if (isAdminUser) {
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
            
            // Show participant lookup for both superadmins and admins
            if (participantLookupNavItem) {
                if (isAdminUser) {
                    participantLookupNavItem.style.display = '';
                } else {
                    participantLookupNavItem.style.display = 'none';
                }
            }
        }
    } else {
        // User is logged out - clear shibir resources
        clearShibirResources();
        
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
        if (shibirResourcesNavItem) {
            shibirResourcesNavItem.style.display = 'none';
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
        if (participantLookupNavItem) {
            participantLookupNavItem.style.display = 'none';
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
// Prioritizes normalized field names, with fallbacks for backward compatibility
function extractProfileData(data, userData = null, userEmail = '') {
    return {
        name: data.name || data['Full Name'] || userData?.name || '',
        email: data.email || data['Email address'] || userData?.email || userEmail || '',
        uniqueId: data.uniqueId || data['Praveshika ID'] || userData?.uniqueId || '',
        country: data.country || data.Country || data['Country of Current Residence'] || '',
        shreni: data.shreni || data.Shreni || data['Corrected Shreni'] || data['Default Shreni'] || data['Shreni for Sorting'] || '',
        barcode: data.barcode || data.Barcode || data.BarCode || data.uniqueId || data['Praveshika ID'] || '',
        phone: data.phone || data.Phone || data['Phone number on which you can be contacted in Bharat (by call or WhatsApp)'] || '',
        whatsapp: data.whatsapp || data['Whatsapp Number'] || '',
        address: data.address || data.Address || data['Current Address'] || '',
        city: data.city || data.City || data['City of Current Residence'] || '',
        state: data.state || data.State || data['State/Province'] || '',
        postalCode: data.postalCode || data['Postal Code'] || data.zipcode || '',
        gender: data.gender || data.Gender || '',
        age: data.age || data.Age || '',
        occupation: data.occupation || data['Occupation (e.g. Engineer/Business/Homemaker/Student)'] || '',
        educationalQual: data.educationalQual || data['Educational Qualification'] || data.educationalQualification || '',
        zone: data.zone || data.Zone || data['Zone/Shreni'] || '',
        ganveshSize: data.ganveshSize || data['Ganvesh Kurta Shoulder Size in cm (for swayamevaks and sevikas)'] || '',
        sanghYears: data.sanghYears || data['Associated with sangh for how many years/months'] || '',
        hssResponsibility: data.hssResponsibility || data['Do you have any responsibility in Hindu Swayamsevak Sangh?'] || '',
        currentResponsibility: data.currentResponsibility || data['What is your current responsibility in HSS or other organisation?'] || '',
        otherOrgResponsibility: data.otherOrgResponsibility || data['Do you have any responsibility in any other organisation (e.g. VHP, Sewa International etc)?'] || '',
        shikshaVarg: data.shikshaVarg || data['Which Sangh Shiksha Varg have you completed'] || '',
        emergencyContactName: data.emergencyContactName || data['Emergency Contact Name'] || '',
        emergencyContactNumber: data.emergencyContactNumber || data['Emergency Contact Number'] || '',
        emergencyContactRelation: data.emergencyContactRelation || data['Relationship of Emergency Contact Person'] || '',
        pickupNeeded: data.pickupNeeded || data['Do you need a pickup on arrival?'] || '',
        dropoffNeeded: data.dropoffNeeded || data['Do you need a drop off for departure?'] || ''
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
            emergencyContactNumber, emergencyContactRelation, pickupNeeded, dropoffNeeded,
            accommodation, ganaNumber, vahiniNumber, anikiniNumber } = profileData;
    
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
                        ${accommodation || ganaNumber || vahiniNumber || anikiniNumber ? `
                        <div class="profile-tile">
                            <h4 class="tile-title">Shibir Assignment</h4>
                            <div class="tile-content">
                                ${accommodation ? `<div class="info-item">
                                    <span class="info-label">Accommodation</span>
                                    <span class="info-value">${formatValue(accommodation)}</span>
                                </div>` : ''}
                                ${ganaNumber ? `<div class="info-item">
                                    <span class="info-label">Gana Number</span>
                                    <span class="info-value">${formatValue(ganaNumber)}</span>
                                </div>` : ''}
                                ${vahiniNumber ? `<div class="info-item">
                                    <span class="info-label">Vahini Number</span>
                                    <span class="info-value">${formatValue(vahiniNumber)}</span>
                                </div>` : ''}
                                ${anikiniNumber ? `<div class="info-item">
                                    <span class="info-label">Anikini Number</span>
                                    <span class="info-value">${formatValue(anikiniNumber)}</span>
                                </div>` : ''}
                            </div>
                        </div>` : ''}
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

// Generic tab switching utility
function switchTab(index, options = {}) {
    const {
        tabButtonSelector = '.profile-tab-btn',
        tabPaneSelector = '.profile-tab-pane',
        tabPaneIdPrefix = 'profileTab',
        containerSelector = null,
        clearStyles = true
    } = options;
    
    const container = containerSelector ? document.querySelector(containerSelector) : document;
    const scope = containerSelector ? container : document;
    
    // Remove active class from all tab buttons
    const tabButtons = scope.querySelectorAll(tabButtonSelector);
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all tab panes
    const tabPanes = scope.querySelectorAll(tabPaneSelector);
    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
        if (clearStyles) {
            pane.style.height = '';
            pane.style.overflow = '';
        }
    });
    
    // Show selected tab pane
    const selectedPane = document.getElementById(`${tabPaneIdPrefix}${index}`);
    if (selectedPane) {
        selectedPane.classList.add('active');
        selectedPane.style.display = 'block';
    }
    
    // Activate selected tab button
    const selectedButton = scope.querySelector(`${tabButtonSelector}[data-tab-index="${index}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    // Force a reflow to ensure layout updates immediately
    if (selectedPane) {
        selectedPane.offsetHeight;
    }
}

// Function to switch profile tabs
function switchProfileTab(index) {
    switchTab(index, {
        tabButtonSelector: '.profile-tab-btn',
        tabPaneSelector: '.profile-tab-pane',
        tabPaneIdPrefix: 'profileTab'
    });
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
    
    switchTab(index, {
        tabButtonSelector: '.profile-tab-btn',
        tabPaneSelector: '.transportation-tab-pane',
        tabPaneIdPrefix: 'transportationTab',
        containerSelector: '#transportationInfo'
    });
}

// Helper function to create transportation card HTML for a single person (as tab pane - no collapse)
function createTransportationCardHTML(transportationData, index, isExpanded = false) {
    const { name, uniqueId, pickupLocation, arrivalDate, arrivalTime, flightTrainNumber,
            returnDate, returnTime, returnFlightTrainNumber, dropoffLocation, pickupNeeded, dropoffNeeded } = transportationData;
    
    const safeName = escapeHtml(name || '');
    const safeUniqueId = escapeHtml(uniqueId || '');
    
    const hasArrivalInfo = pickupLocation || arrivalDate || arrivalTime || flightTrainNumber;
    const hasReturnInfo = dropoffLocation || returnDate || returnTime || returnFlightTrainNumber;
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
                            <span class="info-label">Drop off Location:</span>
                            <span class="info-value">${formatValue(dropoffLocation) || 'Not specified'}</span>
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
                                
                                // Map normalized field names (with fallbacks for backward compatibility)
                                const pickupLocation = regData.arrivalPlace || regData['Place of Arrival'] || regData.pickupLocation || regData['Pickup Location'] || regData['PickupLocation'] || '';
                                const arrivalDate = regData.arrivalDate || regData['Date of Arrival'] || regData['Arrival Date'] || regData['ArrivalDate'] || '';
                                const arrivalTime = regData.arrivalTime || regData['Time of Arrival'] || regData['Arrival Time'] || regData['ArrivalTime'] || '';
                                const flightTrainNumber = regData.arrivalFlightTrain || regData['Arrival Flight/Train Number'] || regData.flightTrainNumber || regData['Flight/Train Number'] || regData['FlightTrainNumber'] || regData['Flight Number'] || '';
                                const returnDate = regData.departureDate || regData['Date of Departure Train/Flight'] || regData.returnDate || regData['Return Date'] || regData['ReturnDate'] || '';
                                const returnTime = regData.departureTime || regData['Time of Departure Train/Flight'] || regData.returnTime || regData['Return Time'] || regData['ReturnTime'] || '';
                                const returnFlightTrainNumber = regData.departureFlightTrain || regData['Departure Flight/Train Number'] || regData.returnFlightTrainNumber || regData['Return Flight/Train Number'] || regData['ReturnFlightTrainNumber'] || '';
                                const dropoffLocation = regData.departurePlace || regData['Place of Departure Train/Flight'] || regData.dropoffLocation || regData['Drop off Location'] || regData['DropoffLocation'] || '';
                                const pickupNeeded = regData.pickupNeeded || regData['Do you need a pickup on arrival?'] || '';
                                const dropoffNeeded = regData.dropoffNeeded || regData['Do you need a drop off for departure?'] || '';
                                
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
                                    dropoffLocation,
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
                
                // Prioritize normalized field names (with fallbacks for backward compatibility)
                const pickupLocation = data.arrivalPlace || data['Place of Arrival'] || data.pickupLocation || data['Pickup Location'] || data['PickupLocation'] || '';
                const arrivalDate = data.arrivalDate || data['Date of Arrival'] || data['Arrival Date'] || data['ArrivalDate'] || '';
                const arrivalTime = data.arrivalTime || data['Time of Arrival'] || data['Arrival Time'] || data['ArrivalTime'] || '';
                const flightTrainNumber = data.arrivalFlightTrain || data['Arrival Flight/Train Number'] || data.flightTrainNumber || data['Flight/Train Number'] || data['FlightTrainNumber'] || data['Flight Number'] || '';
                const returnDate = data.departureDate || data['Date of Departure Train/Flight'] || data.returnDate || data['Return Date'] || data['ReturnDate'] || '';
                const returnTime = data.departureTime || data['Time of Departure Train/Flight'] || data.returnTime || data['Return Time'] || data['ReturnTime'] || '';
                const returnFlightTrainNumber = data.departureFlightTrain || data['Departure Flight/Train Number'] || data.returnFlightTrainNumber || data['Return Flight/Train Number'] || data['ReturnFlightTrainNumber'] || '';
                const dropoffLocation = data.departurePlace || data['Place of Departure Train/Flight'] || data.dropoffLocation || data['Drop off Location'] || data['DropoffLocation'] || '';
                const pickupNeeded = data.pickupNeeded || data['Do you need a pickup on arrival?'] || '';
                const dropoffNeeded = data.dropoffNeeded || data['Do you need a drop off for departure?'] || '';

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
                } else if (section === 'return') {
                    // Determine if dropoff is needed (default to 'Yes' if fields are filled, 'No' if empty)
                    const needsDropoff = dropoffNeeded === 'Yes' || dropoffNeeded === 'yes' || (dropoffNeeded === '' && (dropoffLocation || returnDate || returnTime || returnFlightTrainNumber));
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
                                        <label for="dropoffLocation">Drop off Location: <span class="required">*</span></label>
                                    <select id="dropoffLocation" onchange="handleDropoffLocationChange(); validateTransportationSection('return');" required>
                                        <option value="">Select drop off location</option>
                                        <option value="Rajiv Gandhi International Airport (RGIA)" ${dropoffLocation === 'Rajiv Gandhi International Airport (RGIA)' ? 'selected' : ''}>Rajiv Gandhi International Airport (RGIA)</option>
                                        <option value="Secunderabad Railway Station" ${dropoffLocation === 'Secunderabad Railway Station' ? 'selected' : ''}>Secunderabad Railway Station</option>
                                        <option value="Nampally Railway Station" ${dropoffLocation === 'Nampally Railway Station' ? 'selected' : ''}>Nampally Railway Station</option>
                                        <option value="Kacheguda Railway Station" ${dropoffLocation === 'Kacheguda Railway Station' ? 'selected' : ''}>Kacheguda Railway Station</option>
                                        <option value="Cherlapally Railway Station" ${dropoffLocation === 'Cherlapally Railway Station' ? 'selected' : ''}>Cherlapally Railway Station</option>
                                        <option value="Lingampally Railway Station" ${dropoffLocation === 'Lingampally Railway Station' ? 'selected' : ''}>Lingampally Railway Station</option>
                                        <option value="Mahatma Gandhi Bus Station (MGBS)" ${dropoffLocation === 'Mahatma Gandhi Bus Station (MGBS)' ? 'selected' : ''}>Mahatma Gandhi Bus Station (MGBS)</option>
                                        <option value="Jubilee Bus Station (JBS)" ${dropoffLocation === 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Jubilee Bus Station (JBS)</option>
                                        <option value="Other" ${dropoffLocation !== '' && dropoffLocation !== 'Rajiv Gandhi International Airport (RGIA)' && dropoffLocation !== 'Secunderabad Railway Station' && dropoffLocation !== 'Nampally Railway Station' && dropoffLocation !== 'Kacheguda Railway Station' && dropoffLocation !== 'Cherlapally Railway Station' && dropoffLocation !== 'Lingampally Railway Station' && dropoffLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && dropoffLocation !== 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Other</option>
                                    </select>
                                    <div id="dropoffLocationOtherContainer" style="display: none; margin-top: 0.5rem;">
                                        <input type="text" id="dropoffLocationOther" placeholder="Please specify other location" value="${dropoffLocation !== '' && dropoffLocation !== 'Rajiv Gandhi International Airport (RGIA)' && dropoffLocation !== 'Secunderabad Railway Station' && dropoffLocation !== 'Nampally Railway Station' && dropoffLocation !== 'Kacheguda Railway Station' && dropoffLocation !== 'Cherlapally Railway Station' && dropoffLocation !== 'Lingampally Railway Station' && dropoffLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && dropoffLocation !== 'Jubilee Bus Station (JBS)' ? dropoffLocation : ''}" onchange="validateTransportationSection('return')">
                                    </div>
                                </div>
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
                                const dropoffLocationSelect = document.getElementById('dropoffLocation')?.value.trim() || '';
                                const dropoffLocationOther = document.getElementById('dropoffLocationOther')?.value.trim() || '';
                                const dropoffLocation = dropoffLocationSelect === 'Other' ? dropoffLocationOther : dropoffLocationSelect;
                                const returnDate = document.getElementById('returnDate')?.value.trim() || '';
                                const returnTime = document.getElementById('returnTime')?.value.trim() || '';
                                const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
                                
                                if (!dropoffLocation || !returnDate || !returnTime || !returnFlightTrainNumber) {
                                    showNotification('Please fill all return details: Drop off Location, Date, Time, and Flight/Train Number are required.', 'error');
                                    validateTransportationSection('return');
                                    return;
                                }
                                
                                if (dropoffLocationSelect === 'Other' && !dropoffLocationOther) {
                                    showNotification('Please specify the other drop off location.', 'error');
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
                const dropoffLocation = data['Place of Departure Train/Flight'] || data.departurePlace || data.dropoffLocation || data['Drop off Location'] || data['DropoffLocation'] || '';
                const pickupNeeded = data['Do you need a pickup on arrival?'] || data.pickupNeeded || '';
                const dropoffNeeded = data['Do you need a drop off for departure?'] || data.dropoffNeeded || '';
                
                // Determine if pickup/dropoff is needed (default to 'Yes' if fields are filled, 'No' if empty)
                const needsPickup = pickupNeeded === 'Yes' || pickupNeeded === 'yes' || (pickupNeeded === '' && (pickupLocation || arrivalDate || arrivalTime || flightTrainNumber));
                const needsDropoff = dropoffNeeded === 'Yes' || dropoffNeeded === 'yes' || (dropoffNeeded === '' && (dropoffLocation || returnDate || returnTime || returnFlightTrainNumber));
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
                                    <label for="dropoffLocation">Drop off Location:</label>
                                <select id="dropoffLocation" onchange="handleDropoffLocationChange(); validateTransportationSection('return');">
                                    <option value="">Select drop off location</option>
                                    <option value="Rajiv Gandhi International Airport (RGIA)" ${dropoffLocation === 'Rajiv Gandhi International Airport (RGIA)' ? 'selected' : ''}>Rajiv Gandhi International Airport (RGIA)</option>
                                    <option value="Secunderabad Railway Station" ${dropoffLocation === 'Secunderabad Railway Station' ? 'selected' : ''}>Secunderabad Railway Station</option>
                                    <option value="Nampally Railway Station" ${dropoffLocation === 'Nampally Railway Station' ? 'selected' : ''}>Nampally Railway Station</option>
                                    <option value="Kacheguda Railway Station" ${dropoffLocation === 'Kacheguda Railway Station' ? 'selected' : ''}>Kacheguda Railway Station</option>
                                    <option value="Cherlapally Railway Station" ${dropoffLocation === 'Cherlapally Railway Station' ? 'selected' : ''}>Cherlapally Railway Station</option>
                                    <option value="Lingampally Railway Station" ${dropoffLocation === 'Lingampally Railway Station' ? 'selected' : ''}>Lingampally Railway Station</option>
                                    <option value="Mahatma Gandhi Bus Station (MGBS)" ${dropoffLocation === 'Mahatma Gandhi Bus Station (MGBS)' ? 'selected' : ''}>Mahatma Gandhi Bus Station (MGBS)</option>
                                    <option value="Jubilee Bus Station (JBS)" ${dropoffLocation === 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Jubilee Bus Station (JBS)</option>
                                    <option value="Other" ${dropoffLocation !== '' && dropoffLocation !== 'Rajiv Gandhi International Airport (RGIA)' && dropoffLocation !== 'Secunderabad Railway Station' && dropoffLocation !== 'Nampally Railway Station' && dropoffLocation !== 'Kacheguda Railway Station' && dropoffLocation !== 'Cherlapally Railway Station' && dropoffLocation !== 'Lingampally Railway Station' && dropoffLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && dropoffLocation !== 'Jubilee Bus Station (JBS)' ? 'selected' : ''}>Other</option>
                                </select>
                                <div id="dropoffLocationOtherContainer" style="display: none; margin-top: 0.5rem;">
                                    <input type="text" id="dropoffLocationOther" placeholder="Please specify other location" value="${dropoffLocation !== '' && dropoffLocation !== 'Rajiv Gandhi International Airport (RGIA)' && dropoffLocation !== 'Secunderabad Railway Station' && dropoffLocation !== 'Nampally Railway Station' && dropoffLocation !== 'Kacheguda Railway Station' && dropoffLocation !== 'Cherlapally Railway Station' && dropoffLocation !== 'Lingampally Railway Station' && dropoffLocation !== 'Mahatma Gandhi Bus Station (MGBS)' && dropoffLocation !== 'Jubilee Bus Station (JBS)' ? dropoffLocation : ''}" onchange="validateTransportationSection('return')">
                                </div>
                            </div>
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
                            const dropoffLocationSelect = document.getElementById('dropoffLocation')?.value.trim() || '';
                            const dropoffLocationOther = document.getElementById('dropoffLocationOther')?.value.trim() || '';
                            const dropoffLocation = dropoffLocationSelect === 'Other' ? dropoffLocationOther : dropoffLocationSelect;
                            const returnDate = document.getElementById('returnDate')?.value.trim() || '';
                            const returnTime = document.getElementById('returnTime')?.value.trim() || '';
                            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
                            
                            // Check return validation
                            if (!dropoffLocation || !returnDate || !returnTime || !returnFlightTrainNumber) {
                                showNotification('Please fill all return details (Drop off Location, Date, Time, and Flight/Train Number) when drop off is needed.', 'error');
                                validateTransportationSection('return');
                                return;
                            }
                            
                            if (dropoffLocationSelect === 'Other' && !dropoffLocationOther) {
                                showNotification('Please specify the other drop off location.', 'error');
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
    let dropoffLocation = '';
    
    if (pickupNeeded === 'Yes') {
        const pickupLocationSelect = document.getElementById('pickupLocation')?.value.trim() || '';
        const pickupLocationOther = document.getElementById('pickupLocationOther')?.value.trim() || '';
        pickupLocation = pickupLocationSelect === 'Other' ? pickupLocationOther : pickupLocationSelect;
        arrivalDate = document.getElementById('arrivalDate')?.value.trim() || '';
        arrivalTime = document.getElementById('arrivalTime')?.value.trim() || '';
        flightTrainNumber = document.getElementById('flightTrainNumber')?.value.trim() || '';
    }
    
    if (dropoffNeeded === 'Yes') {
        const dropoffLocationSelect = document.getElementById('dropoffLocation')?.value.trim() || '';
        const dropoffLocationOther = document.getElementById('dropoffLocationOther')?.value.trim() || '';
        dropoffLocation = dropoffLocationSelect === 'Other' ? dropoffLocationOther : dropoffLocationSelect;
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
                        
                        // Prepare update data with normalized field names
                        const updateData = {
                            ...existingData, // Preserve all existing fields
                            arrivalPlace: pickupLocation || '',
                            arrivalDate: arrivalDate || '',
                            arrivalTime: arrivalTime || '',
                            arrivalFlightTrain: flightTrainNumber || '',
                            departureDate: returnDate || '',
                            departureTime: returnTime || '',
                            departurePlace: dropoffLocation || '',
                            departureFlightTrain: returnFlightTrainNumber || '',
                            pickupNeeded: pickupNeeded || '',
                            dropoffNeeded: dropoffNeeded || '',
                            travelupdateAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        // Use set with merge: true
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
            const dropoffLocationSelect = document.getElementById('dropoffLocation')?.value.trim() || '';
            const dropoffLocationOther = document.getElementById('dropoffLocationOther')?.value.trim() || '';
            dropoffLocation = dropoffLocationSelect === 'Other' ? dropoffLocationOther : dropoffLocationSelect;
            returnDate = document.getElementById('returnDate')?.value.trim() || '';
            returnTime = document.getElementById('returnTime')?.value.trim() || '';
            returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim() || '';
            
            // Validate all return fields are filled (including dropoff location)
            if (!dropoffLocation || !returnDate || !returnTime || !returnFlightTrainNumber) {
                showNotification('Please fill all return details: Drop off Location, Date, Time, and Flight/Train Number are required.', 'error');
                return;
            }
            
            // Validate "Other" option requires text input
            if (dropoffLocationSelect === 'Other' && !dropoffLocationOther) {
                showNotification('Please specify the other drop off location.', 'error');
                return;
            }
        } else {
            // If No, clear all return fields
            dropoffLocation = '';
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
                        
                        // Prepare update data - only update the section being edited (normalized field names)
                        const updateData = {
                            ...existingData, // Preserve all existing fields
                            travelupdateAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        if (section === 'arrival') {
                            updateData.arrivalPlace = pickupLocation;
                            updateData.arrivalDate = arrivalDate;
                            updateData.arrivalTime = arrivalTime;
                            updateData.arrivalFlightTrain = flightTrainNumber;
                            updateData.pickupNeeded = pickupNeeded;
                        } else if (section === 'return') {
                            updateData.departureDate = returnDate;
                            updateData.departureTime = returnTime;
                            updateData.departurePlace = dropoffLocation;
                            updateData.departureFlightTrain = returnFlightTrainNumber;
                            updateData.dropoffNeeded = dropoffNeeded;
                        }
                        
                        // Use set with merge: true
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

// Handle dropoff location dropdown change - show/hide "Other" textbox
function handleDropoffLocationChange() {
    const dropoffLocationSelect = document.getElementById('dropoffLocation');
    const otherContainer = document.getElementById('dropoffLocationOtherContainer');
    const otherInput = document.getElementById('dropoffLocationOther');
    
    if (dropoffLocationSelect && otherContainer && otherInput) {
        if (dropoffLocationSelect.value === 'Other') {
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
            const dropoffLocation = document.getElementById('dropoffLocation');
            const returnDate = document.getElementById('returnDate');
            const returnTime = document.getElementById('returnTime');
            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber');
            if (dropoffLocation) dropoffLocation.required = true;
            if (returnDate) returnDate.required = true;
            if (returnTime) returnTime.required = true;
            if (returnFlightTrainNumber) returnFlightTrainNumber.required = true;
        } else {
            returnFieldsContainer.style.display = 'none';
            // Make fields not required and clear them
            const dropoffLocation = document.getElementById('dropoffLocation');
            const dropoffLocationOther = document.getElementById('dropoffLocationOther');
            const dropoffLocationOtherContainer = document.getElementById('dropoffLocationOtherContainer');
            const returnDate = document.getElementById('returnDate');
            const returnTime = document.getElementById('returnTime');
            const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber');
            if (dropoffLocation) {
                dropoffLocation.required = false;
                dropoffLocation.value = '';
            }
            if (dropoffLocationOtherContainer) {
                dropoffLocationOtherContainer.style.display = 'none';
            }
            if (dropoffLocationOther) {
                dropoffLocationOther.required = false;
                dropoffLocationOther.value = '';
            }
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
        const dropoffLocationSelect = document.getElementById('dropoffLocation')?.value.trim();
        const dropoffLocationOther = document.getElementById('dropoffLocationOther')?.value.trim();
        const dropoffLocation = dropoffLocationSelect === 'Other' ? dropoffLocationOther : dropoffLocationSelect;
        const returnDate = document.getElementById('returnDate')?.value.trim();
        const returnTime = document.getElementById('returnTime')?.value.trim();
        const returnFlightTrainNumber = document.getElementById('returnFlightTrainNumber')?.value.trim();
        
        const hasPartial = dropoffLocation || returnDate || returnTime || returnFlightTrainNumber;
        const hasAll = dropoffLocation && returnDate && returnTime && returnFlightTrainNumber;
        
        if (hasPartial && !hasAll) {
            isValid = false;
            const inputs = ['dropoffLocation', 'returnDate', 'returnTime', 'returnFlightTrainNumber'];
            inputs.forEach(id => {
                const input = document.getElementById(id);
                if (input && !input.value.trim()) {
                    input.style.borderColor = '#ff6b6b';
                } else if (input) {
                    input.style.borderColor = '';
                }
            });
            // Also check dropoffLocationOther if "Other" is selected
            if (dropoffLocationSelect === 'Other') {
                const dropoffLocationOtherInput = document.getElementById('dropoffLocationOther');
                if (dropoffLocationOtherInput && !dropoffLocationOtherInput.value.trim()) {
                    dropoffLocationOtherInput.style.borderColor = '#ff6b6b';
                } else if (dropoffLocationOtherInput) {
                    dropoffLocationOtherInput.style.borderColor = '';
                }
            }
        } else {
            ['dropoffLocation', 'returnDate', 'returnTime', 'returnFlightTrainNumber'].forEach(id => {
                const input = document.getElementById(id);
                if (input) input.style.borderColor = '';
            });
            const dropoffLocationOtherInput = document.getElementById('dropoffLocationOther');
            if (dropoffLocationOtherInput) dropoffLocationOtherInput.style.borderColor = '';
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
    
    switchTab(index, {
        tabButtonSelector: '.profile-tab-btn',
        tabPaneSelector: '.tours-tab-pane',
        tabPaneIdPrefix: 'toursTab',
        containerSelector: '#toursInfo',
        clearStyles: false
    });
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
                                <option value="Yadadri and local tour" ${currentTour.toString().toLowerCase().includes('yadadri') || currentTour.toString().toLowerCase().includes('bhagyanagar') ? 'selected' : ''}>Yadadri and local tour</option>
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
                        
                        // Prepare update data with normalized field names
                        const updateData = {
                            ...existingData,
                            postShibirTour: postShibirTour,
                            tourupdateAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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
    
    // Set a timeout to prevent infinite loading (30 seconds)
    const loadingTimeout = setTimeout(() => {
        if (loadingDiv.style.display !== 'none') {
            console.error('Dashboard loading timeout - showing partial data');
            loadingDiv.innerHTML = `
                <p style="color: orange;">Dashboard is taking longer than expected to load.</p>
                <p>Some data may still be loading in the background.</p>
                <button onclick="window.location.reload();" class="btn btn-primary" style="padding: 0.5rem 1rem; margin-top: 1rem;">
                    Reload Page
                </button>
            `;
            // Try to show whatever data we have
            if (dataDiv) {
                dataDiv.style.display = 'block';
            }
        }
    }, 30000);
    
    try {
        const db = firebase.firestore();
        const CACHE_KEY = 'adminDashboardStatsCache';
        const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds
        
        // Check cache first
        const cachedData = getCachedData(CACHE_KEY, CACHE_MAX_AGE);
        let registrations, users, stats;
        
        if (cachedData) {
            // Use cached data (convert ISO strings back to Date objects for compatibility)
            registrations = cachedData.registrations || [];
            users = cachedData.users || [];
            stats = cachedData.stats || {};
            
            // Store registrations globally for export functions
            window.dashboardRegistrations = registrations;
        } else {
            // Cache expired or missing - fetch fresh data
            // Fetch all registrations (only approved remain after migration)
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
            
            // Store registrations globally for export functions
            window.dashboardRegistrations = registrations;
            
            // Cache the results (convert Firestore Timestamps to plain objects for JSON serialization)
            try {
                const cacheableData = {
                    registrations: registrations.map(reg => {
                        const clean = { ...reg };
                        // Convert Firestore Timestamps to ISO strings
                        Object.keys(clean).forEach(key => {
                            if (clean[key] && typeof clean[key].toDate === 'function') {
                                clean[key] = clean[key].toDate().toISOString();
                            }
                        });
                        return clean;
                    }),
                    users: users.map(user => {
                        const clean = { ...user };
                        Object.keys(clean).forEach(key => {
                            if (clean[key] && typeof clean[key].toDate === 'function') {
                                clean[key] = clean[key].toDate().toISOString();
                            }
                        });
                        return clean;
                    }),
                    stats: stats
                };
                setCachedData(CACHE_KEY, cacheableData);
            } catch (cacheError) {
                console.warn('Could not cache dashboard data (likely due to non-serializable values):', cacheError);
                // Continue without caching - dashboard will still work
            }
        }
        
        // Display statistics
        displayAdminStatistics(stats, registrations, users);
        
        // Clear timeout since we loaded successfully
        clearTimeout(loadingTimeout);
        
        // Show data div, hide loading - show dashboard immediately
        loadingDiv.style.display = 'none';
        dataDiv.style.display = 'block';
        
        // Load additional analytics in background (non-blocking)
        // Wrap each in try-catch to prevent one failure from breaking the dashboard
        try {
            loadTransportationAnalytics(registrations);
    } catch (error) {
            console.error('Error loading transportation analytics:', error);
        }
        
        try {
            // Load transportation changes (default to "all") - non-blocking
            loadTransportationChanges('all').catch(error => {
                console.error('Error loading transportation changes:', error);
            });
        } catch (error) {
            console.error('Error initiating transportation changes load:', error);
        }
        
        try {
            // Load checkin analytics - non-blocking
            loadCheckinAnalytics().catch(error => {
                console.error('Error loading checkin analytics:', error);
            });
        } catch (error) {
            console.error('Error initiating checkin analytics load:', error);
        }
        
    } catch (error) {
        // Clear timeout
        clearTimeout(loadingTimeout);
        
        console.error('Error loading admin dashboard:', error);
        
        // Clear potentially corrupted cache
        const CACHE_KEY = 'adminDashboardStatsCache';
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch (e) {
            console.warn('Could not clear cache:', e);
        }
        
        loadingDiv.innerHTML = `
            <p style="color: red;">Error loading dashboard data: ${error.message || error}</p>
            <p style="margin-top: 1rem;">
                <button onclick="localStorage.removeItem('adminDashboardStatsCache'); window.location.reload();" 
                        class="btn btn-primary" style="padding: 0.5rem 1rem;">
                    Clear Cache & Retry
                </button>
            </p>
        `;
    }
}

// Registration Status Management Functions

// Move registration to cancelled collection
async function moveToCancelled(uniqueId, reason = '') {
    if (!window.firebase || !firebase.firestore) {
        throw new Error('Firebase not initialized');
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        throw new Error('Not authenticated');
    }
    
    const isAdminUser = await isAdmin(user);
    if (!isAdminUser) {
        throw new Error('Permission denied. Only admins can cancel registrations.');
    }
    
    const db = firebase.firestore();
    
    try {
        // Get the registration document
        const regDoc = await db.collection('registrations').doc(uniqueId).get();
        if (!regDoc.exists) {
            throw new Error(`Registration ${uniqueId} not found`);
        }
        
        const regData = regDoc.data();
        
        // Copy to cancelledRegistrations
        await db.collection('cancelledRegistrations').doc(uniqueId).set({
            ...regData,
            status: 'Cancelled',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelledBy: user.uid,
            cancelledByName: (await getUserData(user))?.name || user.email || 'Unknown',
            cancellationReason: reason
        });
        
        // Delete from registrations
        await db.collection('registrations').doc(uniqueId).delete();
        
        // Update emailToUids mapping - remove this UID
        // NOTE: This is best-effort and may be blocked by security rules;
        // in that case we log a warning but do NOT fail the cancellation.
        const email = regData.email || '';
        if (email) {
            try {
                const normalizedEmail = email.toLowerCase().trim();
                const emailToUidsDoc = await db.collection('emailToUids').doc(normalizedEmail).get();
                if (emailToUidsDoc.exists) {
                    const emailData = emailToUidsDoc.data();
                    const uids = (emailData.uids || []).filter(uid => uid !== uniqueId);
                    if (uids.length > 0) {
                        await db.collection('emailToUids').doc(normalizedEmail).update({
                            uids: uids,
                            count: uids.length,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    } else {
                        // Remove the emailToUids document if no UIDs remain
                        await db.collection('emailToUids').doc(normalizedEmail).delete();
                    }
                }
            } catch (e) {
                if (e.code === 'permission-denied') {
                    console.warn('Skipping emailToUids cleanup due to security rules; will rely on backend sync scripts.', e);
                } else {
                    throw e;
                }
            }
        }
        
        return { success: true, uniqueId };
    } catch (error) {
        console.error('Error moving to cancelled:', error);
        throw error;
    }
}

// Restore registration from cancelled collection
async function restoreFromCancelled(uniqueId) {
    if (!window.firebase || !firebase.firestore) {
        throw new Error('Firebase not initialized');
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        throw new Error('Not authenticated');
    }
    
    const isAdminUser = await isAdmin(user);
    if (!isAdminUser) {
        throw new Error('Permission denied. Only admins can restore registrations.');
    }
    
    const db = firebase.firestore();
    
    try {
        // Get the cancelled registration document
        const cancelledDoc = await db.collection('cancelledRegistrations').doc(uniqueId).get();
        if (!cancelledDoc.exists) {
            throw new Error(`Cancelled registration ${uniqueId} not found`);
        }
        
        const regData = cancelledDoc.data();
        
        // Remove cancellation-specific fields
        const { cancelledAt, cancelledBy, cancelledByName, cancellationReason, migratedAt, originalCollection, originalStatus, ...cleanData } = regData;
        
        // Copy to registrations
        await db.collection('registrations').doc(uniqueId).set({
            ...cleanData,
            status: 'Approved',
            restoredAt: firebase.firestore.FieldValue.serverTimestamp(),
            restoredBy: user.uid,
            restoredByName: (await getUserData(user))?.name || user.email || 'Unknown'
        });
        
        // Delete from cancelledRegistrations
        await db.collection('cancelledRegistrations').doc(uniqueId).delete();
        
        // Update emailToUids mapping - add this UID back
        const email = regData.email || '';
        if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            const emailToUidsDoc = await db.collection('emailToUids').doc(normalizedEmail).get();
            if (emailToUidsDoc.exists) {
                const emailData = emailToUidsDoc.data();
                const uids = emailData.uids || [];
                if (!uids.includes(uniqueId)) {
                    uids.push(uniqueId);
                    await db.collection('emailToUids').doc(normalizedEmail).update({
                        uids: uids,
                        count: uids.length,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } else {
                // Create new emailToUids document
                await db.collection('emailToUids').doc(normalizedEmail).set({
                    email: normalizedEmail,
                    uids: [uniqueId],
                    count: 1,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        return { success: true, uniqueId };
    } catch (error) {
        console.error('Error restoring from cancelled:', error);
        throw error;
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
async function createNewUser(name, email, uniqueId, role, volunteerTeams = []) {
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
    // const tempPassword = generateSecurePassword(12);
    const tempPassword = "Vss@2025";
    
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
            volunteerTeams: role === 'volunteer' ? volunteerTeams : [],
            country: 'Bharat',
            shreni: 'Volunteer',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid
        });
        
        // Create a record in nonShibirarthiUsers collection for volunteers/admins
        // This allows them to have profile information like shibirarthi
        const normalizedId = trimmedUniqueId.toLowerCase().replace(/[/-]/g, '');
        await db.collection('nonShibirarthiUsers').doc(trimmedUniqueId).set({
            uniqueId: trimmedUniqueId,
            normalizedId: normalizedId,
            name: trimmedName,
            email: trimmedEmail || null,
            country: 'Bharat',
            Country: 'Bharat',
            shreni: 'Volunteer',
            Shreni: 'Volunteer',
            role: role,
            volunteerTeams: role === 'volunteer' ? volunteerTeams : [],
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
            throw new Error('This email is already in use');
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
        
        // Fetch all users from nonShibirarthiUsers collection (volunteers and admins)
        const usersSnapshot = await db.collection('nonShibirarthiUsers')
            .where('role', 'in', ['volunteer', 'admin'])
            .get();
        
        const users = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                docId: doc.id,
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
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    users.forEach(user => {
        const createdDate = user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'N/A';
        const roleBadgeClass = user.role === 'admin' ? 'role-badge-admin' : 'role-badge-volunteer';
        const userDataJson = escapeHtml(JSON.stringify({
            uniqueId: user.uniqueId,
            name: user.name,
            email: user.email
        }));
        
        html += `
            <tr id="userRow_${escapeHtml(user.uniqueId || user.docId)}">
                <td>${escapeHtml(user.name || 'N/A')}</td>
                <td>${escapeHtml(user.email || 'N/A')}</td>
                <td>${escapeHtml(user.uniqueId || '-')}</td>
                <td>
                    <span class="role-badge ${roleBadgeClass}">${escapeHtml(user.role || 'N/A')}</span>
                    ${user.role === 'volunteer' && Array.isArray(user.volunteerTeams) && user.volunteerTeams.length > 0
                        ? `<div style="margin-top: 0.25rem; font-size: 0.8em; color: #555;">Teams: ${escapeHtml(user.volunteerTeams.join(', '))}</div>`
                        : ''}
                </td>
                <td>${createdDate}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser('${escapeHtml(user.uniqueId)}', '${escapeHtml(user.name)}', '${escapeHtml(user.email || '')}')" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    userListContainer.innerHTML = html;
}

// Delete a user from nonShibirarthiUsers, users collection, and Firebase Auth
async function deleteUser(uniqueId, name, email) {
    if (!uniqueId) {
        showNotification('Invalid user ID', 'error');
        return;
    }
    
    // Confirm deletion
    const confirmDelete = confirm(`Are you sure you want to delete user "${name}" (${uniqueId})?\n\nThis will remove them from:\n- nonShibirarthiUsers collection\n- users collection\n- Firebase Authentication\n\nThis action cannot be undone.`);
    if (!confirmDelete) return;
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        showNotification('Not authenticated', 'error');
        return;
    }
    
    const isAdminUser = await isAdmin(currentUser);
    if (!isAdminUser) {
        showNotification('Permission denied. Only admins can delete users.', 'error');
        return;
    }
    
    const db = firebase.firestore();
    const row = document.getElementById(`userRow_${uniqueId}`);
    
    try {
        // Update row to show deleting status
        if (row) {
            row.style.opacity = '0.5';
            row.style.backgroundColor = '#fff3cd';
        }
        
        showNotification(`Deleting user ${name}...`, 'info');
        
        // 1. Delete from nonShibirarthiUsers collection first
        try {
            await db.collection('nonShibirarthiUsers').doc(uniqueId).delete();
            console.log(`Deleted ${uniqueId} from nonShibirarthiUsers`);
        } catch (e) {
            console.warn(`Could not delete from nonShibirarthiUsers:`, e);
        }
        
        // 2. Delete from users collection (may have different doc ID)
        let deletedFromUsers = false;
        let deletedDocIds = [];
        try {
            // First try with uniqueId as doc ID
            const userDoc = await db.collection('users').doc(uniqueId).get();
            if (userDoc.exists) {
                await db.collection('users').doc(uniqueId).delete();
                // Verify deletion
                const verifyDoc = await db.collection('users').doc(uniqueId).get();
                if (!verifyDoc.exists) {
                    console.log(`✓ Verified: Deleted ${uniqueId} from users collection (by doc ID)`);
                    deletedFromUsers = true;
                    deletedDocIds.push(uniqueId);
                } else {
                    console.error(`✗ Failed: Document ${uniqueId} still exists after delete attempt`);
                }
            }
            
            // Also search by uniqueId field (exact match)
            if (!deletedFromUsers) {
                const usersSnapshot = await db.collection('users')
                    .where('uniqueId', '==', uniqueId)
                    .get();
                console.log(`Found ${usersSnapshot.size} users with uniqueId field = ${uniqueId}`);
                for (const doc of usersSnapshot.docs) {
                    if (!deletedDocIds.includes(doc.id)) {
                        await db.collection('users').doc(doc.id).delete();
                        // Verify deletion
                        const verifyDoc = await db.collection('users').doc(doc.id).get();
                        if (!verifyDoc.exists) {
                            console.log(`✓ Verified: Deleted ${doc.id} from users collection (by uniqueId field)`);
                            deletedFromUsers = true;
                            deletedDocIds.push(doc.id);
                        } else {
                            console.error(`✗ Failed: Document ${doc.id} still exists after delete attempt`);
                        }
                    }
                }
            }
            
            // Try searching by email if still not found
            if (!deletedFromUsers && email) {
                const emailSnapshot = await db.collection('users')
                    .where('email', '==', email)
                    .get();
                console.log(`Found ${emailSnapshot.size} users with email = ${email}`);
                for (const doc of emailSnapshot.docs) {
                    const data = doc.data();
                    // Only delete if uniqueId matches or is close
                    if ((data.uniqueId === uniqueId || data.uniqueId?.toUpperCase() === uniqueId?.toUpperCase()) &&
                        !deletedDocIds.includes(doc.id)) {
                        await db.collection('users').doc(doc.id).delete();
                        // Verify deletion
                        const verifyDoc = await db.collection('users').doc(doc.id).get();
                        if (!verifyDoc.exists) {
                            console.log(`✓ Verified: Deleted ${doc.id} from users collection (by email)`);
                            deletedFromUsers = true;
                            deletedDocIds.push(doc.id);
                        } else {
                            console.error(`✗ Failed: Document ${doc.id} still exists after delete attempt`);
                        }
                    }
                }
            }
            
            // Last resort: scan all users with role volunteer/admin and match uniqueId
            if (!deletedFromUsers) {
                console.log('Scanning all volunteer/admin users to find match...');
                const allUsersSnapshot = await db.collection('users')
                    .where('role', 'in', ['volunteer', 'admin'])
                    .get();
                for (const doc of allUsersSnapshot.docs) {
                    const data = doc.data();
                    if (data.uniqueId && data.uniqueId.toUpperCase() === uniqueId.toUpperCase() &&
                        !deletedDocIds.includes(doc.id)) {
                        await db.collection('users').doc(doc.id).delete();
                        // Verify deletion
                        const verifyDoc = await db.collection('users').doc(doc.id).get();
                        if (!verifyDoc.exists) {
                            console.log(`✓ Verified: Deleted ${doc.id} from users collection (by role scan, uniqueId: ${data.uniqueId})`);
                            deletedFromUsers = true;
                            deletedDocIds.push(doc.id);
                        } else {
                            console.error(`✗ Failed: Document ${doc.id} still exists after delete attempt`);
                        }
                    }
                }
            }
            
            // Ultimate fallback: scan ALL users in collection
            if (!deletedFromUsers) {
                console.log('Scanning ALL users in collection...');
                const allUsersSnapshot = await db.collection('users').get();
                console.log(`Total users in collection: ${allUsersSnapshot.size}`);
                for (const doc of allUsersSnapshot.docs) {
                    const data = doc.data();
                    const docUniqueId = data.uniqueId || '';
                    const docEmail = data.email || '';
                    
                    // Match by uniqueId (case-insensitive) or by email
                    if (((docUniqueId && docUniqueId.toUpperCase() === uniqueId.toUpperCase()) ||
                        (email && docEmail && docEmail.toLowerCase() === email.toLowerCase())) &&
                        !deletedDocIds.includes(doc.id)) {
                        console.log(`Found match: doc.id=${doc.id}, uniqueId=${docUniqueId}, email=${docEmail}`);
                        await db.collection('users').doc(doc.id).delete();
                        // Verify deletion
                        const verifyDoc = await db.collection('users').doc(doc.id).get();
                        if (!verifyDoc.exists) {
                            console.log(`✓ Verified: Deleted ${doc.id} from users collection (by full collection scan)`);
                            deletedFromUsers = true;
                            deletedDocIds.push(doc.id);
                        } else {
                            console.error(`✗ Failed: Document ${doc.id} still exists after delete attempt - may be a permission issue`);
                        }
                    }
                }
            }
            
            if (!deletedFromUsers) {
                console.warn(`No matching user found in users collection for uniqueId: ${uniqueId}, email: ${email}`);
                // List all users for debugging
                const debugSnapshot = await db.collection('users').get();
                console.log('All users in collection:');
                debugSnapshot.forEach(doc => {
                    const d = doc.data();
                    console.log(`  - ${doc.id}: uniqueId=${d.uniqueId}, email=${d.email}, role=${d.role}`);
                });
            }
        } catch (e) {
            console.error(`Error deleting from users collection:`, e);
            showNotification(`Error deleting from users: ${e.message}`, 'error');
        }
        
        // 3. Delete from Firebase Authentication (requires email)
        let deletedFromAuth = false;
        if (email) {
            try {
                showNotification('Deleting Auth account...', 'info');
                const adminToken = await currentUser.getIdToken();
                
                const response = await fetch('/api/delete-auth-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        adminToken: adminToken
                    })
                });
                
                // Check if response is OK and is JSON
                if (response.ok) {
                    try {
                        const result = await response.json();
                        if (result.success) {
                            deletedFromAuth = true;
                            console.log(`✓ Deleted Auth account for ${email}`);
                        } else {
                            console.warn(`Could not delete Auth account: ${result.error || 'Unknown error'}`);
                        }
                    } catch (jsonError) {
                        console.warn('API returned non-JSON response (API may not be deployed):', jsonError);
                    }
                } else {
                    // API endpoint doesn't exist (local development) or server error
                    if (response.status === 404 || response.status === 501) {
                        console.warn('Auth deletion API not available (local development). Auth account must be deleted manually from Firebase Console.');
                    } else {
                        const errorText = await response.text();
                        console.error(`Auth deletion API error (${response.status}):`, errorText);
                    }
                }
            } catch (authError) {
                // Network error or API not available
                if (authError.message.includes('Failed to fetch') || authError.message.includes('501')) {
                    console.warn('Auth deletion API not available (local development). Auth account must be deleted manually from Firebase Console.');
                } else {
                    console.error('Error deleting Auth account:', authError);
                }
            }
        } else {
            console.warn('No email provided, cannot delete Auth account');
        }
        
        const usersStatus = deletedFromUsers ? 'deleted from users ✓' : 'not found in users';
        const authStatus = deletedFromAuth ? 'deleted from Auth ✓' : (email ? 'Auth deletion failed' : 'no email');
        const statusMessage = `User "${name}" deleted:\n- ${usersStatus}\n- ${authStatus}`;
        
        if (deletedFromUsers && deletedFromAuth) {
            showNotification(statusMessage, 'success');
        } else if (deletedFromUsers) {
            showNotification(statusMessage, 'warning');
        } else {
            showNotification(statusMessage, 'error');
        }
        
        // Remove row from UI
        if (row) {
            row.remove();
        }
        
        // Reload user list
        setTimeout(() => {
            loadUserManagement();
        }, 500);
        
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification(`Error deleting user: ${error.message}`, 'error');
        
        // Reset row style
        if (row) {
            row.style.opacity = '1';
            row.style.backgroundColor = '';
        }
    }
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
    const teamCheckboxes = document.querySelectorAll('#newUserTeams .volunteer-team-checkbox');
    const volunteerTeams = [];
    if (role === 'volunteer') {
        teamCheckboxes.forEach(cb => {
            if (cb.checked) {
                volunteerTeams.push(cb.value);
            }
        });
    }
    
    // Disable form during submission
    if (submitButton) submitButton.disabled = true;
    if (messageContainer) {
        messageContainer.style.display = 'block';
        messageContainer.className = 'user-creation-message info';
        messageContainer.textContent = 'Creating user...';
    }
    
    try {
        const result = await createNewUser(name, email, uniqueId, role, volunteerTeams);
        
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
        // Clear team selections
        teamCheckboxes.forEach(cb => { cb.checked = false; });
        
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

// ============================================
// MIGRATE VOLUNTEERS FUNCTION
// ============================================

// Migrate volunteers from users collection to nonShibirarthiUsers collection
async function migrateVolunteersToNonShibirarthi() {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        showNotification('Not authenticated', 'error');
        return;
    }
    
    const isAdminUser = await isAdmin(currentUser);
    if (!isAdminUser) {
        showNotification('Permission denied. Only admins can migrate users.', 'error');
        return;
    }
    
    // Confirm migration
    const confirmMigrate = confirm('This will migrate all users with shreni="Volunteer" from the users collection to the nonShibirarthiUsers collection.\n\nThis will:\n- Copy user data to nonShibirarthiUsers\n- Skip users that already exist in nonShibirarthiUsers\n\nContinue?');
    if (!confirmMigrate) return;
    
    const db = firebase.firestore();
    
    try {
        showNotification('Fetching volunteers from users collection...', 'info');
        
        // Get all users with shreni = "Volunteer"
        const usersSnapshot = await db.collection('users')
            .where('shreni', '==', 'Volunteer')
            .get();
        
        if (usersSnapshot.empty) {
            showNotification('No volunteers found in users collection with shreni="Volunteer"', 'info');
            return;
        }
        
        const volunteers = [];
        usersSnapshot.forEach(doc => {
            volunteers.push({
                docId: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`Found ${volunteers.length} volunteers to migrate`);
        showNotification(`Found ${volunteers.length} volunteers. Starting migration...`, 'info');
        
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const volunteer of volunteers) {
            try {
                // Use uniqueId as the doc ID in nonShibirarthiUsers
                const uniqueId = volunteer.uniqueId;
                if (!uniqueId) {
                    console.warn('Skipping volunteer without uniqueId:', volunteer);
                    skippedCount++;
                    continue;
                }
                
                // Check if already exists in nonShibirarthiUsers
                const existingDoc = await db.collection('nonShibirarthiUsers').doc(uniqueId).get();
                if (existingDoc.exists) {
                    console.log(`Skipping ${uniqueId} - already exists in nonShibirarthiUsers`);
                    skippedCount++;
                    continue;
                }
                
                // Create normalized ID
                const normalizedId = uniqueId.toLowerCase().replace(/[/-]/g, '');
                
                // Migrate to nonShibirarthiUsers
                await db.collection('nonShibirarthiUsers').doc(uniqueId).set({
                    uniqueId: uniqueId,
                    normalizedId: normalizedId,
                    name: volunteer.name || '',
                    email: volunteer.email || null,
                    country: volunteer.country || 'Bharat',
                    Country: volunteer.Country || volunteer.country || 'Bharat',
                    shreni: 'Volunteer',
                    Shreni: 'Volunteer',
                    role: volunteer.role || 'volunteer',
                    volunteerTeams: volunteer.volunteerTeams || [],
                    createdAt: volunteer.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: volunteer.createdBy || currentUser.uid,
                    migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    migratedFrom: 'users',
                    originalDocId: volunteer.docId
                });
                
                console.log(`Migrated ${uniqueId} to nonShibirarthiUsers`);
                migratedCount++;
                
            } catch (e) {
                console.error(`Error migrating volunteer:`, e);
                errorCount++;
            }
        }
        
        // Show results
        const message = `Migration complete!\n- Migrated: ${migratedCount}\n- Skipped (already exists): ${skippedCount}\n- Errors: ${errorCount}`;
        showNotification(message.replace(/\n/g, ' | '), migratedCount > 0 ? 'success' : 'info');
        alert(message);
        
        // Reload user list
        await loadUserManagement();
        
    } catch (error) {
        console.error('Error during migration:', error);
        showNotification(`Migration error: ${error.message}`, 'error');
    }
}

// ============================================
// BATCH USER UPLOAD FUNCTIONS
// ============================================

// Store parsed batch user data
let batchUserData = [];

// Download template CSV for batch user upload
function downloadUserTemplate() {
    const headers = ['name', 'uniqueId', 'email', 'role', 'volunteerTeams'];
    const exampleRows = [
        ['Volunteer One', 'VOL001', 'volunteer1@example.com', 'volunteer', 'registration,transportation'],
        ['Volunteer Two', 'VOL002', 'volunteer2@example.com', 'volunteer', 'ganvesh_collected,cloak_room,post_tour'],
        ['Admin User', 'ADM001', 'admin@example.com', 'admin', '']
    ];
    
    // Build CSV content
    let csvContent = headers.join(',') + '\n';
    exampleRows.forEach(row => {
        csvContent += row.map(cell => {
            // Quote cells that contain commas
            if (cell.includes(',')) {
                return `"${cell}"`;
            }
            return cell;
        }).join(',') + '\n';
    });
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'user_upload_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('Template CSV downloaded!', 'success');
}

// Preview batch users from CSV file
async function previewBatchUsers(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const previewDiv = document.getElementById('batchUserPreview');
    const previewBody = document.getElementById('batchUserPreviewBody');
    const countSpan = document.getElementById('batchUserCount');
    const messageDiv = document.getElementById('batchUserMessage');
    
    if (!previewDiv || !previewBody) return;
    
    // Reset message
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
    
    // Valid volunteer teams
    const validTeams = ['transportation', 'registration', 'ganvesh_collected', 'cloak_room', 'post_tour'];
    
    try {
        const text = await file.text();
        const rows = parseCSV(text);
        
        if (rows.length === 0) {
            showNotification('No data found in CSV file', 'error');
            return;
        }
        
        // Parse headers (first row) - ALL columns are required
        const headers = rows[0].map(h => h.toLowerCase().trim());
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name');
        const idIdx = headers.findIndex(h => h === 'uniqueid' || h === 'id' || h === 'unique id');
        const emailIdx = headers.findIndex(h => h === 'email');
        const roleIdx = headers.findIndex(h => h === 'role');
        const teamsIdx = headers.findIndex(h => h === 'volunteerteams' || h === 'teams' || h === 'volunteer teams');
        
        // Validate all required columns exist
        const missingCols = [];
        if (nameIdx === -1) missingCols.push('name');
        if (idIdx === -1) missingCols.push('uniqueId');
        if (emailIdx === -1) missingCols.push('email');
        if (roleIdx === -1) missingCols.push('role');
        if (teamsIdx === -1) missingCols.push('volunteerTeams');
        
        if (missingCols.length > 0) {
            showNotification(`CSV missing required columns: ${missingCols.join(', ')}`, 'error');
            return;
        }
        
        // Parse and validate data rows
        batchUserData = [];
        const validationErrors = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length === 0 || (row.length === 1 && !row[0])) continue; // Skip empty rows
            
            const rowNum = i + 1;
            const name = (row[nameIdx] || '').trim();
            const uniqueId = (row[idIdx] || '').trim().toUpperCase();
            const email = (row[emailIdx] || '').trim();
            const role = (row[roleIdx] || '').trim().toLowerCase();
            const teamsStr = (row[teamsIdx] || '').trim();
            const teams = teamsStr ? teamsStr.split(/[,;]/).map(t => t.trim().toLowerCase()).filter(Boolean) : [];
            
            // Rigorous validation for each row
            const rowErrors = [];
            
            // Name validation
            if (!name) {
                rowErrors.push('name is empty');
            } else if (name.length < 2) {
                rowErrors.push('name too short');
            }
            
            // UniqueId validation
            if (!uniqueId) {
                rowErrors.push('uniqueId is empty');
            } else if (uniqueId.length < 3) {
                rowErrors.push('uniqueId too short');
            } else if (!/^[A-Z0-9]+$/i.test(uniqueId)) {
                rowErrors.push('uniqueId contains invalid characters');
            }
            
            // Email validation
            if (!email) {
                rowErrors.push('email is empty');
            } else {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    rowErrors.push('invalid email format');
                }
            }
            
            // Role validation
            if (!role) {
                rowErrors.push('role is empty');
            } else if (role !== 'volunteer' && role !== 'admin') {
                rowErrors.push('role must be "volunteer" or "admin"');
            }
            
            // Teams validation (required for volunteers)
            if (role === 'volunteer') {
                if (teams.length === 0) {
                    rowErrors.push('volunteerTeams required for volunteers');
                } else {
                    const invalidTeams = teams.filter(t => !validTeams.includes(t));
                    if (invalidTeams.length > 0) {
                        rowErrors.push(`invalid teams: ${invalidTeams.join(', ')}`);
                    }
                }
            }
            
            if (rowErrors.length > 0) {
                validationErrors.push({ row: rowNum, errors: rowErrors, name, uniqueId });
                batchUserData.push({
                    name: name || '(empty)',
                    uniqueId: uniqueId || '(empty)',
                    email: email || '(empty)',
                    role: role || '(empty)',
                    volunteerTeams: teams,
                    status: 'invalid',
                    errors: rowErrors
                });
            } else {
                batchUserData.push({
                    name,
                    uniqueId,
                    email,
                    role: role === 'admin' ? 'admin' : 'volunteer',
                    volunteerTeams: teams,
                    status: 'pending',
                    errors: []
                });
            }
        }
        
        if (batchUserData.length === 0) {
            showNotification('No data rows found in CSV', 'error');
            return;
        }
        
        // Check for duplicate uniqueIds within the CSV itself
        const uniqueIdsInCsv = new Set();
        for (const user of batchUserData) {
            if (user.uniqueId && user.uniqueId !== '(empty)') {
                if (uniqueIdsInCsv.has(user.uniqueId)) {
                    user.status = 'invalid';
                    user.errors.push('duplicate uniqueId in CSV');
                } else {
                    uniqueIdsInCsv.add(user.uniqueId);
                }
            }
        }
        
        // Check for existing uniqueIds in Firestore users collection
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            
            // Collect all uniqueIds to check
            const uniqueIdsToCheck = batchUserData
                .filter(u => u.status === 'pending' && u.uniqueId && u.uniqueId !== '(empty)')
                .map(u => u.uniqueId);
            
            if (uniqueIdsToCheck.length > 0) {
                showNotification('Checking for existing users in database...', 'info');
                
                // Check users collection by querying the uniqueId field
                const existingInUsers = new Set();
                try {
                    const usersSnapshot = await db.collection('users').get();
                    usersSnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.uniqueId) {
                            existingInUsers.add(data.uniqueId.toUpperCase());
                        }
                    });
                    console.log('Existing uniqueIds in users collection:', Array.from(existingInUsers));
                } catch (e) {
                    console.error('Error fetching users collection:', e);
                }
                
                // Mark existing users as invalid
                for (const user of batchUserData) {
                    if (user.status === 'pending' && user.uniqueId) {
                        if (existingInUsers.has(user.uniqueId.toUpperCase())) {
                            user.status = 'invalid';
                            user.errors.push('uniqueId already exists in users collection');
                        }
                    }
                }
            }
        }
        
        // Display preview with validation status
        const validCount = batchUserData.filter(u => u.status === 'pending').length;
        const invalidCount = batchUserData.filter(u => u.status === 'invalid').length;
        
        countSpan.textContent = `${validCount} valid, ${invalidCount} invalid`;
        previewBody.innerHTML = batchUserData.map((user, idx) => {
            const isInvalid = user.status === 'invalid';
            const rowStyle = isInvalid ? 'background-color: #f8d7da;' : '';
            const statusText = isInvalid ? `❌ ${user.errors.join('; ')}` : '✓ Ready';
            const statusColor = isInvalid ? '#dc3545' : '#28a745';
            
            return `
            <tr id="batchUserRow${idx}" style="${rowStyle}">
                <td>${escapeHtml(user.name)}</td>
                <td>${escapeHtml(user.uniqueId)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td style="font-size: 0.8rem;">${escapeHtml(user.volunteerTeams.join(', ') || '-')}</td>
                <td id="batchUserStatus${idx}" style="color: ${statusColor}; font-size: 0.85rem;">${statusText}</td>
            </tr>
        `}).join('');
        
        previewDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Error parsing CSV:', error);
        showNotification('Error parsing CSV file: ' + error.message, 'error');
    }
}

// Parse CSV text into rows
function parseCSV(text) {
    const rows = [];
    const lines = text.split(/\r?\n/);
    
    for (const line of lines) {
        // Simple CSV parsing (handles quoted fields)
        const row = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim());
        rows.push(row);
    }
    
    return rows;
}

// Clear batch user preview
function clearBatchUserPreview() {
    const previewDiv = document.getElementById('batchUserPreview');
    const fileInput = document.getElementById('batchUserCsv');
    const messageDiv = document.getElementById('batchUserMessage');
    
    if (previewDiv) previewDiv.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (messageDiv) messageDiv.style.display = 'none';
    
    batchUserData = [];
}

// Execute batch user creation
async function executeBatchUserCreation() {
    if (!batchUserData || batchUserData.length === 0) {
        showNotification('No users to create', 'error');
        return;
    }
    
    // Filter out invalid entries
    const validUsers = batchUserData.filter(u => u.status === 'pending');
    if (validUsers.length === 0) {
        showNotification('No valid users to create. Please fix validation errors first.', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.auth || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
        showNotification('Not authenticated', 'error');
        return;
    }
    
    const isAdminUser = await isAdmin(currentUser);
    if (!isAdminUser) {
        showNotification('Permission denied. Only admins can create users.', 'error');
        return;
    }
    
    const messageDiv = document.getElementById('batchUserMessage');
    if (messageDiv) {
        messageDiv.style.display = 'block';
        messageDiv.style.backgroundColor = '#cce5ff';
        messageDiv.innerHTML = `Creating ${validUsers.length} users... Please wait.`;
    }
    
    const db = firebase.firestore();
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < batchUserData.length; i++) {
        const user = batchUserData[i];
        const statusCell = document.getElementById(`batchUserStatus${i}`);
        const row = document.getElementById(`batchUserRow${i}`);
        
        // Skip invalid users
        if (user.status === 'invalid') {
            continue;
        }
        
        try {
            // Update status to processing
            if (statusCell) {
                statusCell.textContent = 'Creating...';
                statusCell.style.color = '#007bff';
            }
            
            // Check if user already exists in nonShibirarthiUsers
            const existingUser = await db.collection('nonShibirarthiUsers').doc(user.uniqueId).get();
            if (existingUser.exists) {
                if (statusCell) {
                    statusCell.textContent = 'Already exists';
                    statusCell.style.color = '#ffc107';
                }
                if (row) row.style.backgroundColor = '#fff3cd';
                errorCount++;
                continue;
            }
            
            // Create user in Firestore collections (NO Firebase Auth - stays logged in as admin)
            try {
                const normalizedId = user.uniqueId.toLowerCase().replace(/[/-]/g, '');
                
                // 1. First create in users collection (using uniqueId as doc ID)
                await db.collection('users').doc(user.uniqueId).set({
                    email: user.email,
                    name: user.name,
                    uniqueId: user.uniqueId,
                    normalizedId: normalizedId,
                    role: user.role,
                    volunteerTeams: user.role === 'volunteer' ? user.volunteerTeams : [],
                    country: 'Bharat',
                    shreni: 'Volunteer',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: currentUser.uid,
                    batchCreated: true
                });
                
                // 2. Then create in nonShibirarthiUsers collection
                await db.collection('nonShibirarthiUsers').doc(user.uniqueId).set({
                    uniqueId: user.uniqueId,
                    normalizedId: normalizedId,
                    name: user.name,
                    email: user.email,
                    country: 'Bharat',
                    Country: 'Bharat',
                    shreni: 'Volunteer',
                    Shreni: 'Volunteer',
                    role: user.role,
                    volunteerTeams: user.role === 'volunteer' ? user.volunteerTeams : [],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: currentUser.uid,
                    batchCreated: true
                });
                
                // Update status
                if (statusCell) {
                    statusCell.textContent = 'Created ✓';
                    statusCell.style.color = '#28a745';
                }
                if (row) row.style.backgroundColor = '#d4edda';
                
                successCount++;
                
            } catch (createError) {
                console.error(`Error creating user ${user.uniqueId}:`, createError);
                if (statusCell) {
                    statusCell.textContent = 'Error: ' + createError.message;
                    statusCell.style.color = '#dc3545';
                }
                if (row) row.style.backgroundColor = '#f8d7da';
                errorCount++;
            }
            
        } catch (error) {
            console.error(`Error creating user ${user.uniqueId}:`, error);
            if (statusCell) {
                statusCell.textContent = 'Error: ' + error.message;
                statusCell.style.color = '#dc3545';
            }
            if (row) row.style.backgroundColor = '#f8d7da';
            errorCount++;
        }
    }
    
    // Now create Firebase Auth accounts via API
    if (successCount > 0) {
        if (messageDiv) {
            messageDiv.innerHTML = `Created ${successCount} Firestore records. Creating Auth accounts...`;
        }
        
        try {
            // Get users that were successfully created in Firestore
            const usersForAuth = batchUserData
                .filter((u, idx) => {
                    const statusCell = document.getElementById(`batchUserStatus${idx}`);
                    return statusCell && statusCell.textContent === 'Created ✓';
                })
                .map(u => ({
                    email: u.email,
                    name: u.name,
                    uniqueId: u.uniqueId
                }));
            
            if (usersForAuth.length > 0) {
                // Get admin token for API verification
                const adminToken = await currentUser.getIdToken();
                
                // Call the API to create Auth accounts
                const response = await fetch('/api/create-auth-users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        users: usersForAuth,
                        adminToken: adminToken
                    })
                });
                
                const authResult = await response.json();
                console.log('Auth creation result:', authResult);
                
                if (authResult.success) {
                    // Update status cells with auth results
                    for (const result of authResult.results) {
                        const userIndex = batchUserData.findIndex(u => u.uniqueId === result.uniqueId);
                        if (userIndex !== -1) {
                            const statusCell = document.getElementById(`batchUserStatus${userIndex}`);
                            const row = document.getElementById(`batchUserRow${userIndex}`);
                            
                            if (result.success) {
                                if (statusCell) {
                                    statusCell.textContent = 'Created + Auth ✓';
                                    statusCell.style.color = '#28a745';
                                }
                            } else {
                                if (statusCell) {
                                    statusCell.textContent = `Firestore ✓, Auth: ${result.error}`;
                                    statusCell.style.color = '#ffc107';
                                }
                                if (row) row.style.backgroundColor = '#fff3cd';
                            }
                        }
                    }
                    
                    const authSuccessCount = authResult.results.filter(r => r.success).length;
                    showNotification(`Created ${successCount} users. ${authSuccessCount} can now log in.`, 'success');
                } else {
                    showNotification(`Firestore: ${successCount} created. Auth API error: ${authResult.error}`, 'warning');
                }
            }
        } catch (authError) {
            console.error('Error creating auth accounts:', authError);
            showNotification(`Firestore: ${successCount} created. Auth error: ${authError.message}`, 'warning');
        }
    }
    
    // Show final message
    if (messageDiv) {
        if (successCount > 0 && errorCount === 0) {
            messageDiv.style.backgroundColor = '#d4edda';
            messageDiv.innerHTML = `<strong>Success!</strong> Created ${successCount} user(s) with login access.`;
        } else if (successCount > 0) {
            messageDiv.style.backgroundColor = '#fff3cd';
            messageDiv.innerHTML = `<strong>Partial success:</strong> Created ${successCount} user(s), ${errorCount} failed/skipped.`;
        } else {
            messageDiv.style.backgroundColor = '#f8d7da';
            messageDiv.innerHTML = `<strong>Error:</strong> Failed to create users. ${errorCount} error(s).`;
        }
    }
    
    // Reload user list
    if (successCount > 0) {
        setTimeout(() => {
            loadUserManagement();
        }, 500);
    }
}

// ============================================
// PARTICIPANT LOOKUP FUNCTIONS
// ============================================

// Load participant lookup page
async function loadParticipantLookupPage(user) {
    // Verify user is admin (superadmin or admin)
    const isAdminUser = await isAdmin(user);
    if (!isAdminUser) {
        const loadingDiv = document.getElementById('participantLookupLoading');
        if (loadingDiv) {
            loadingDiv.innerHTML = '<p style="color: red;">Access denied. You do not have permission to view this page.</p>';
        }
        return;
    }
    
    const loadingDiv = document.getElementById('participantLookupLoading');
    const dataDiv = document.getElementById('participantLookupData');
    
    if (!loadingDiv || !dataDiv) return;
    
    loadingDiv.style.display = 'block';
    dataDiv.style.display = 'none';
    
    if (!window.firebase || !firebase.firestore) {
        loadingDiv.innerHTML = '<p style="color: red;">Firebase not initialized.</p>';
        return;
    }
    
    try {
        // Clear previous results
        clearParticipantLookupResults();
        
        // Show data div, hide loading
        loadingDiv.style.display = 'none';
        dataDiv.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading participant lookup page:', error);
        loadingDiv.innerHTML = '<p style="color: red;">Error loading participant lookup. Please try again.</p>';
    }
}

// Search participant by Unique ID (exact match) - kept for backward compatibility
async function searchParticipantByUniqueId() {
    // Redirect to enhanced search function
    await searchParticipantByLoginId();
}

// Search participant by Name
async function searchParticipantByName() {
    const nameInput = document.getElementById('lookupName');
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    if (!name) {
        showNotification('Please enter a name to search', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const nameLower = name.toLowerCase();
        const results = [];
        
        // Fetch all registrations and filter client-side for case-insensitive partial name match
        // Only show registrations with status "Approved"
        const allRegistrations = await db.collection('registrations').limit(1000).get();
        
        allRegistrations.docs.forEach(doc => {
            const data = doc.data();
            // Only include registrations with status "Approved"
            if (data.status === 'Approved') {
                const regName = (data.name || data['Full Name'] || '').toLowerCase();
                if (regName.includes(nameLower)) {
                    results.push(doc);
                }
            }
        });
        
        if (results.length === 0) {
            showNotification('No participants found with this name', 'info');
            clearParticipantLookupResults();
            return;
        }
        
        if (results.length === 1) {
            const regData = results[0].data();
            const uniqueId = regData.uniqueId || results[0].id;
            displayParticipantLookupResults(regData, uniqueId);
        } else {
            // Show selection list
            displayParticipantSelectionList(results, 'name');
        }
    } catch (error) {
        console.error('Error searching participant by name:', error);
        showNotification('Error searching participant: ' + error.message, 'error');
    }
}

// Search participant by Email (group match) - using emailToUids collection
async function searchParticipantByEmail() {
    const emailInput = document.getElementById('lookupEmail');
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    if (!email) {
        showNotification('Please enter an email address', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const emailLower = email.toLowerCase().trim();
        const results = [];
        
        // First, try exact match using emailToUids collection
        const emailToUidsDoc = await db.collection('emailToUids').doc(emailLower).get();
        
        if (emailToUidsDoc.exists) {
            // Found exact match - get all UIDs for this email
            const emailToUidsData = emailToUidsDoc.data();
            const uids = emailToUidsData.uids || [];
            
            // Fetch all registration documents for these UIDs
            const registrationPromises = uids.map(uid => 
                db.collection('registrations').doc(uid).get()
                    .then(doc => doc.exists ? doc : null)
                    .catch(error => {
                        console.error(`Error fetching registration for ${uid}:`, error);
                        return null;
                    })
            );
            
            const registrationDocs = await Promise.all(registrationPromises);
            registrationDocs.forEach(doc => {
                if (doc) {
                    results.push(doc);
                }
            });
        } else {
            // No exact match - try partial search in emailToUids collection
            // Get all emailToUids documents and filter for emails containing the search term
            const allEmailToUids = await db.collection('emailToUids').get();
            const matchingEmails = [];
            
            allEmailToUids.docs.forEach(doc => {
                const emailData = doc.data();
                const docEmail = (emailData.email || doc.id).toLowerCase();
                if (docEmail.includes(emailLower)) {
                    matchingEmails.push(doc);
                }
            });
            
            // Collect all UIDs from matching emails
            const allUids = new Set();
            matchingEmails.forEach(doc => {
                const emailData = doc.data();
                const uids = emailData.uids || [];
                uids.forEach(uid => allUids.add(uid));
            });
            
            // Fetch all registration documents for these UIDs
            const registrationPromises = Array.from(allUids).map(uid => 
                db.collection('registrations').doc(uid).get()
                    .then(doc => doc.exists ? doc : null)
                    .catch(error => {
                        console.error(`Error fetching registration for ${uid}:`, error);
                        return null;
                    })
            );
            
            const registrationDocs = await Promise.all(registrationPromises);
            registrationDocs.forEach(doc => {
                if (doc) {
                    results.push(doc);
                }
            });
        }
        
        if (results.length === 0) {
            showNotification('No participants found with this email', 'info');
            clearParticipantLookupResults();
            return;
        }
        
        if (results.length === 1) {
            const regData = results[0].data();
            const uniqueId = regData.uniqueId || results[0].id;
            displayParticipantLookupResults(regData, uniqueId);
        } else {
            // Show selection list
            displayParticipantSelectionList(results, 'email');
        }
    } catch (error) {
        console.error('Error searching participant by email:', error);
        showNotification('Error searching participant: ' + error.message, 'error');
    }
}

// Display participant selection list (when email or name search returns multiple results)
function displayParticipantSelectionList(docs, searchType = 'email') {
    const resultsDiv = document.getElementById('participantLookupResults');
    const detailsDiv = document.getElementById('participantLookupDetails');
    
    if (!resultsDiv) return;
    
    if (detailsDiv) {
        detailsDiv.style.display = 'none';
    }
    
    const searchTypeText = searchType === 'name' ? 'with this name' : 'with this email';
    let html = `<div class="participant-search-results">
        <h4>${docs.length} participant(s) found ${searchTypeText}. Please select:</h4>
        <ul style="list-style: none; padding: 0;">`;
    
    docs.forEach(doc => {
        const data = doc.data();
        const name = data.name || data['Full Name'] || 'Unknown';
        const uniqueId = data.uniqueId || doc.id;
        const email = data.email || data['Email address'] || '';
        
        html += `
            <li style="margin: 0.5rem 0; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                <button class="btn btn-link" onclick="selectParticipantFromLookup('${escapeHtml(uniqueId)}')" style="text-align: left; width: 100%;">
                    <strong>${escapeHtml(name)}</strong><br>
                    <small>Praveshika ID: ${escapeHtml(uniqueId)}${email ? ' - ' + escapeHtml(email) : ''}</small>
                </button>
            </li>`;
    });
    
    html += '</ul></div>';
    
    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

// Select participant from lookup results
async function selectParticipantFromLookup(uniqueId) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const regDoc = await db.collection('registrations').doc(uniqueId).get();
        
        if (regDoc.exists) {
            const regData = regDoc.data();
            displayParticipantLookupResults(regData, uniqueId);
        } else {
            // Check if it's in cancelled collection
            const cancelledDoc = await db.collection('cancelledRegistrations').doc(uniqueId).get();
            if (cancelledDoc.exists) {
                displayParticipantLookupResults(cancelledDoc.data(), uniqueId);
            } else {
                showNotification('Participant not found', 'error');
            }
        }
    } catch (error) {
        console.error('Error loading participant:', error);
        showNotification('Error loading participant: ' + error.message, 'error');
    }
}

// Store current participant data for editing
let currentParticipantData = null;
let currentParticipantUniqueId = null;

// Display participant lookup results with all fields
function displayParticipantLookupResults(regData, uniqueId) {
    const resultsDiv = document.getElementById('participantLookupResults');
    const detailsDiv = document.getElementById('participantLookupDetails');
    const fieldsDiv = document.getElementById('participantLookupFields');
    const editBtn = document.getElementById('editParticipantBtn');
    const saveBtn = document.getElementById('saveParticipantBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    
    if (!detailsDiv || !fieldsDiv) return;
    
    // Hide results selection list
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    
    // Store current data
    currentParticipantData = regData;
    currentParticipantUniqueId = uniqueId;
    
    // Reset edit mode buttons to default state
    if (editBtn) editBtn.style.display = 'inline-block';
    if (saveBtn) saveBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    
    // Check if user is admin to show status management buttons
    const user = firebase.auth().currentUser;
    if (user) {
        isAdmin(user).then(isAdminUser => {
            if (isAdminUser) {
                const statusBtnContainer = document.getElementById('statusManagementButtons');
                if (statusBtnContainer) {
                    // Check if registration exists in cancelled collection
                    const db = firebase.firestore();
                    db.collection('cancelledRegistrations').doc(uniqueId).get().then(cancelledDoc => {
                        if (cancelledDoc.exists) {
                            // Show restore button
                            statusBtnContainer.innerHTML = `
                                <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: 4px; border: 1px solid #ffc107;">
                                    <h4 style="margin: 0 0 0.5rem 0; color: #856404;">⚠️ This registration is cancelled</h4>
                                    <button class="btn btn-info" onclick="handleRestoreRegistration('${uniqueId}')">
                                        Restore to Active
                                    </button>
                                </div>
                            `;
                        } else {
                            // Show cancel button
                            statusBtnContainer.innerHTML = `
                                <div style="margin: 1rem 0; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
                                    <h4 style="margin: 0 0 0.5rem 0;">Status Management</h4>
                                    <button class="btn btn-warning" onclick="handleCancelRegistration('${uniqueId}')">
                                        Cancel Registration
                                    </button>
                                </div>
                            `;
                        }
                    }).catch(() => {
                        // On error, assume active and show cancel button
                        if (statusBtnContainer) {
                            statusBtnContainer.innerHTML = `
                                <div style="margin: 1rem 0; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
                                    <h4 style="margin: 0 0 0.5rem 0;">Status Management</h4>
                                    <button class="btn btn-warning" onclick="handleCancelRegistration('${uniqueId}')">
                                        Cancel Registration
                                    </button>
                                </div>
                            `;
                        }
                    });
                }
            }
        }).catch(() => {});
    }
    
    // Display all fields
    let html = '<div class="participant-fields-display">';
    
    // Get all fields from the registration document
    const fieldNames = Object.keys(regData).sort();
    
    fieldNames.forEach(fieldName => {
        const fieldValue = regData[fieldName];
        // Handle Firestore timestamp fields
        if (fieldName === 'importedAt' || fieldName === 'createdAt' || fieldName === 'updatedAt' || 
            fieldName === 'travelupdateAt' || fieldName === 'tourupdateAt') {
            // Format timestamp fields
            let displayValue = '';
            if (fieldValue && fieldValue.toDate) {
                displayValue = new Date(fieldValue.toDate()).toLocaleString();
            } else if (fieldValue) {
                displayValue = String(fieldValue);
            } else {
                displayValue = 'N/A';
            }
            html += `
                <div class="field-row" data-field="${escapeHtml(fieldName)}">
                    <label><strong>${escapeHtml(fieldName)}:</strong></label>
                    <div class="field-value">${escapeHtml(displayValue)}</div>
                </div>`;
        } else {
            // Regular field - display as string
            const displayValue = fieldValue !== null && fieldValue !== undefined ? String(fieldValue) : '';
            html += `
                <div class="field-row" data-field="${escapeHtml(fieldName)}">
                    <label><strong>${escapeHtml(fieldName)}:</strong></label>
                    <div class="field-value">${escapeHtml(displayValue)}</div>
                </div>`;
        }
    });
    
    html += '</div>';
    
    fieldsDiv.innerHTML = html;
    detailsDiv.style.display = 'block';
}

// Enable edit mode
function enableParticipantEditMode() {
    const fieldsDiv = document.getElementById('participantLookupFields');
    const editBtn = document.getElementById('editParticipantBtn');
    const saveBtn = document.getElementById('saveParticipantBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    
    if (!fieldsDiv || !currentParticipantData) return;
    
    // Convert display fields to input fields
    const fieldRows = fieldsDiv.querySelectorAll('.field-row');
    fieldRows.forEach(row => {
        const fieldName = row.getAttribute('data-field');
        const fieldValueDiv = row.querySelector('.field-value');
        
        if (fieldValueDiv) {
            const currentValue = fieldValueDiv.textContent.trim();
            // Skip timestamp fields - they shouldn't be edited
            if (fieldName === 'importedAt' || fieldName === 'createdAt' || fieldName === 'updatedAt' || 
                fieldName === 'travelupdateAt' || fieldName === 'tourupdateAt') {
                return; // Keep as display only
            }
            
            // Replace with input field
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input';
            input.value = currentValue;
            input.style.width = '100%';
            input.setAttribute('data-field-name', fieldName);
            
            fieldValueDiv.replaceWith(input);
        }
    });
    
    // Show/hide buttons
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
}

// Cancel edit mode
function cancelParticipantEditMode() {
    if (!currentParticipantData || !currentParticipantUniqueId) return;
    displayParticipantLookupResults(currentParticipantData, currentParticipantUniqueId);
}

// Handle cancel registration
async function handleCancelRegistration(uniqueId) {
    if (!uniqueId) {
        showNotification('Invalid registration ID', 'error');
        return;
    }
    
    const reason = prompt('Please provide a reason for cancellation (optional):');
    if (reason === null) {
        return; // User cancelled
    }
    
    try {
        showNotification('Cancelling registration...', 'info');
        await moveToCancelled(uniqueId, reason || '');
        showNotification('Registration cancelled successfully', 'success');
        
        // Refresh the display
        const db = firebase.firestore();
        const cancelledDoc = await db.collection('cancelledRegistrations').doc(uniqueId).get();
        if (cancelledDoc.exists) {
            displayParticipantLookupResults(cancelledDoc.data(), uniqueId);
        } else {
            showNotification('Error: Could not find cancelled registration', 'error');
        }
    } catch (error) {
        console.error('Error cancelling registration:', error);
        showNotification('Error cancelling registration: ' + error.message, 'error');
    }
}

// Handle restore registration
async function handleRestoreRegistration(uniqueId) {
    if (!uniqueId) {
        showNotification('Invalid registration ID', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to restore this registration to active status?')) {
        return;
    }
    
    try {
        showNotification('Restoring registration...', 'info');
        await restoreFromCancelled(uniqueId);
        showNotification('Registration restored successfully', 'success');
        
        // Refresh the display
        const db = firebase.firestore();
        const regDoc = await db.collection('registrations').doc(uniqueId).get();
        if (regDoc.exists) {
            displayParticipantLookupResults(regDoc.data(), uniqueId);
        } else {
            showNotification('Error: Could not find restored registration', 'error');
        }
    } catch (error) {
        console.error('Error restoring registration:', error);
        showNotification('Error restoring registration: ' + error.message, 'error');
    }
}

// Field name mapping from old format to normalized format (for Firestore compatibility)
// Firestore field paths cannot contain: ~ * / [ ]
const fieldNameMapping = {
    'Age': 'age',
    'Any Dietary Restrictions': 'dietaryRestrictions',
    'Any Other Details': 'otherDetails',
    'Any Pre-existing Medical Condition': 'medicalCondition',
    'Arrival Flight/Train Number': 'arrivalFlightTrain',
    'Associated with sangh for how many years/months': 'sanghYears',
    'BarCode': 'barcode',
    'Barcode': 'barcode',
    'City of Current Residence': 'city',
    'Country': 'country',
    'Country of Current Residence': 'country',
    'Date of Arrival': 'arrivalDate',
    'Date of Departure Train/Flight': 'departureDate',
    'Departure Flight/Train Number': 'departureFlightTrain',
    'Do you have any responsibility in Hindu Swayamsevak Sangh?': 'hssResponsibility',
    'Do you have any responsibility in any other organisation (e.g. VHP, Sewa International etc)?': 'otherOrgResponsibility',
    'Do you need a drop off for departure?': 'dropoffNeeded',
    'Do you need a pickup on arrival?': 'pickupNeeded',
    'Educational Qualification': 'educationalQual',
    'Email address': 'email',
    'Emergency Contact Name': 'emergencyContactName',
    'Emergency Contact Number': 'emergencyContactNumber',
    'Emergency Contact Relation': 'emergencyContactRelation',
    'Full Name': 'name',
    'Ganvesh Kurta Shoulder Size in cm (for swayamevaks and sevikas)': 'ganveshSize',
    'Gender': 'gender',
    'Occupation (e.g. Engineer/Business/Homemaker/Student)': 'occupation',
    'Phone number on which you can be contacted in Bharat (by call or WhatsApp)': 'phone',
    'Place of Arrival': 'arrivalPlace',
    'Place of Departure Train/Flight': 'departurePlace',
    'Please select a post shibir tour option': 'postShibirTour',
    'Praveshika ID': 'uniqueId',
    'Relationship of Emergency Contact Person': 'emergencyContactRelation',
    'SeqNum': 'seqNum',
    'Shreni': 'shreni',
    'Corrected Shreni': 'shreni',
    'Default Shreni': 'shreni',
    'Status': 'status',
    'Time of Arrival': 'arrivalTime',
    'Time of Departure Train/Flight': 'departureTime',
    'Timestamp': 'createdAt',
    'What is your current responsibility in HSS or other organisation?': 'currentResponsibility',
    'Whatsapp Number': 'whatsapp',
    'Which Sangh Shiksha Varg have you completed': 'shikshaVarg',
    'Zone': 'zone',
    'Zone/Shreni': 'zone'
};

// Validate if a field name is valid for Firestore
// Firestore field paths cannot contain: * ~ / [ ] and cannot be empty
function isValidFirestoreFieldName(fieldName) {
    if (!fieldName || fieldName.trim() === '') {
        return false;
    }
    // Firestore field names cannot contain these characters: * ~ / [ ]
    const invalidChars = ['*', '~', '/', '[', ']'];
    for (const char of invalidChars) {
        if (fieldName.includes(char)) {
            return false;
        }
    }
    return true;
}

// Normalize a field name to a valid Firestore field name
function normalizeFieldName(fieldName) {
    if (!fieldName) return fieldName;
    
    // If the field name is already valid, return it as-is
    if (isValidFirestoreFieldName(fieldName)) {
        // Check if it needs mapping to normalized name
        return fieldNameMapping[fieldName] || fieldName;
    }
    
    // If invalid, try to map it to a normalized name
    if (fieldNameMapping[fieldName]) {
        return fieldNameMapping[fieldName];
    }
    
    // If no mapping exists and field name is invalid, replace invalid characters
    // This is a fallback for any unmapped invalid field names
    let normalized = fieldName;
    const invalidChars = ['*', '~', '/', '[', ']'];
    invalidChars.forEach(char => {
        normalized = normalized.replace(new RegExp('\\' + char, 'g'), '_');
    });
    
    console.warn(`Field name "${fieldName}" contains invalid characters. Using normalized name: "${normalized}"`);
    return normalized;
}

// Save participant edits
async function saveParticipantEdits() {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    // Verify user is authenticated and is an admin
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('You must be logged in to update participant information', 'error');
        return;
    }
    
    // Double-check user document exists and has admin role (required for Firestore rules)
    const db = firebase.firestore();
    let userDoc;
    try {
        userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            showNotification('Error: Your user account is not properly set up. Please contact an administrator.', 'error');
            console.error('User document does not exist for uid:', user.uid);
            return;
        }
        
        const userData = userDoc.data();
        const userRole = userData?.role;
        if (userRole !== 'admin' && userRole !== 'superadmin') {
            showNotification('Permission denied. Only administrators can update participant information.', 'error');
            console.error('User does not have admin role. Current role:', userRole);
            return;
        }
    } catch (error) {
        console.error('Error verifying user permissions:', error);
        showNotification('Error verifying permissions. Please try again.', 'error');
        return;
    }
    
    const isAdminUser = await isAdmin(user);
    if (!isAdminUser) {
        showNotification('Permission denied. Only administrators can update participant information.', 'error');
        return;
    }
    
    const fieldsDiv = document.getElementById('participantLookupFields');
    if (!fieldsDiv || !currentParticipantUniqueId) return;
    
    // Collect all field values and normalize field names
    const updatedData = {};
    const inputs = fieldsDiv.querySelectorAll('input[data-field-name]');
    
    inputs.forEach(input => {
        const originalFieldName = input.getAttribute('data-field-name');
        // Skip uniqueId from inputs - we'll set it explicitly below
        if (originalFieldName !== 'uniqueId') {
            // Normalize the field name to ensure it's valid for Firestore
            const normalizedFieldName = normalizeFieldName(originalFieldName);
            const fieldValue = input.value.trim();
            
            // Only add valid field names to updateData
            if (isValidFirestoreFieldName(normalizedFieldName)) {
                updatedData[normalizedFieldName] = fieldValue;
            } else {
                console.warn(`Skipping invalid field name: "${originalFieldName}" (normalized to: "${normalizedFieldName}")`);
            }
        }
    });
    
    // Verify the existing registration document exists and has uniqueId
    let existingRegDoc;
    try {
        existingRegDoc = await db.collection('registrations').doc(currentParticipantUniqueId).get();
        if (!existingRegDoc.exists) {
            showNotification('Error: Registration document not found.', 'error');
            return;
        }
        
        const existingData = existingRegDoc.data();
        // Ensure uniqueId exists in the document (required by Firestore rules)
        // If it doesn't exist, this is a data integrity issue - the document should always have uniqueId
        if (!existingData.uniqueId) {
            console.warn('Registration document missing uniqueId field. This may cause permission errors.');
            // We'll still try to update, but the Firestore rule may fail
        }
    } catch (error) {
        console.error('Error fetching existing registration:', error);
        showNotification('Error fetching registration data. Please try again.', 'error');
        return;
    }
    
    // Preserve critical fields as required by Firebase security rules
    // uniqueId must be preserved and match the document ID (required for admin updates)
    // Always set uniqueId to ensure it exists (matches document ID)
    updatedData.uniqueId = currentParticipantUniqueId;
    
    // Preserve normalizedId if it exists (should not be changed)
    if (currentParticipantData?.normalizedId) {
        updatedData.normalizedId = currentParticipantData.normalizedId;
    } else if (existingRegDoc?.data()?.normalizedId) {
        updatedData.normalizedId = existingRegDoc.data().normalizedId;
    }
    
    // Note: As an admin, we can update name and email if they're in the form inputs
    // The Firebase rules allow admins to update any field except uniqueId must be preserved
    
    // Add updatedAt timestamp
    updatedData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    
    // Show confirmation dialog
    const confirmMessage = `Are you sure you want to update the registration for Praveshika ID: ${currentParticipantUniqueId}?\n\nThis will modify the database.`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        // Update the document (only updates specified fields, preserves others)
        await db.collection('registrations').doc(currentParticipantUniqueId).update(updatedData);
        
        showNotification('Participant information updated successfully', 'success');
        
        // Reload the data to show updated values
        const regDoc = await db.collection('registrations').doc(currentParticipantUniqueId).get();
        if (regDoc.exists) {
            displayParticipantLookupResults(regDoc.data(), currentParticipantUniqueId);
        }
        
    } catch (error) {
        console.error('Error updating participant:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        console.error('Update data:', updatedData);
        console.error('User UID:', user.uid);
        console.error('User role:', userDoc?.data()?.role);
        
        let errorMsg = 'Error updating participant information. Please try again.';
        if (error.code === 'permission-denied') {
            errorMsg = 'Permission denied. You do not have permission to update this registration. Please ensure you are logged in as an administrator and that your user account has the correct role in Firestore.';
        } else if (error.message) {
            errorMsg = error.message;
        }
        showNotification(errorMsg, 'error');
    }
}

// Clear participant lookup results
function clearParticipantLookupResults() {
    const resultsDiv = document.getElementById('participantLookupResults');
    const detailsDiv = document.getElementById('participantLookupDetails');
    
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
    }
    
    if (detailsDiv) {
        detailsDiv.style.display = 'none';
    }
    
    currentParticipantData = null;
    currentParticipantUniqueId = null;
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
        genderBreakdown: {},
        countryOverallBreakdown: {},
        zoneShreniBreakdown: {},
        ageBreakdown: {},
        shikshaVargBreakdown: {},
        shikshaVargShreniBreakdown: {},
        shreniGenderBreakdown: {},
        arrivalDateBreakdown: {},
        arrivalTimeBucketsBreakdown: {},
        pickupNeededBreakdown: {},
        dropoffNeededBreakdown: {},
        placeOfArrivalBreakdown: {},
        placeArrivalDateBreakdown: {},
        placeArrivalDateTimeBreakdown: {},
        placeOfDepartureBreakdown: {},
        placeDepartureDateBreakdown: {},
        ganaveshSizeBreakdown: {},
        medicalConditionsBreakdown: {},
        dietaryRestrictionsBreakdown: {},
        travelUpdateStats: {
            totalUpdated: 0,
            totalNotUpdated: 0,
            updatePercentage: 0
        },
        totalPraveshikaIdsWithAccounts: 0,
        emailCorrections: {
            lateRegistrations: [],
            updatedRegistrations: [],
            needsConfirmation: []
        }
    };
    
    // Collect all registration uniqueIds (for linking to user accounts)
    const registrationUniqueIds = new Set();
    
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
        // Track registration uniqueId for account linking
        const regId = reg.uniqueId || reg.UniqueId || reg['Praveshika ID'] || reg['Unique ID'] || reg['Praveshika_ID'];
        if (regId) {
            registrationUniqueIds.add(regId.toString().trim());
        }
        
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
        
        // Country overall breakdown (same as countryBreakdown but separate for clarity)
        stats.countryOverallBreakdown[country] = (stats.countryOverallBreakdown[country] || 0) + 1;
        
        // Zone by Shreni breakdown
        const zoneShreniKey = `${zone} | ${shreni}`;
        stats.zoneShreniBreakdown[zoneShreniKey] = (stats.zoneShreniBreakdown[zoneShreniKey] || 0) + 1;
        
        // Age breakdown (dynamic buckets based on data)
        const age = parseInt(reg.age || reg.Age || 0);
        if (age > 0) {
            let ageBucket = '';
            if (age <= 20) ageBucket = '0-20';
            else if (age <= 30) ageBucket = '21-30';
            else if (age <= 35) ageBucket = '31-35';
            else if (age <= 40) ageBucket = '36-40';
            else if (age <= 50) ageBucket = '41-50';
            else if (age <= 60) ageBucket = '51-60';
            else ageBucket = '60+';
            stats.ageBreakdown[ageBucket] = (stats.ageBreakdown[ageBucket] || 0) + 1;
        }
        
        // Shiksha Varg breakdown
        const shikshaVarg = reg.shikshaVarg || reg['Which Sangh Shiksha Varg have you completed'] || reg['Shiksha Varg'] || 'Not specified';
        stats.shikshaVargBreakdown[shikshaVarg] = (stats.shikshaVargBreakdown[shikshaVarg] || 0) + 1;
        
        // Shiksha Varg by Shreni
        const shikshaVargShreniKey = `${shreni} | ${shikshaVarg}`;
        stats.shikshaVargShreniBreakdown[shikshaVargShreniKey] = (stats.shikshaVargShreniBreakdown[shikshaVargShreniKey] || 0) + 1;
        
        // Shreni by Gender breakdown
        const shreniGenderKey = `${shreni} | ${gender}`;
        stats.shreniGenderBreakdown[shreniGenderKey] = (stats.shreniGenderBreakdown[shreniGenderKey] || 0) + 1;
        
        // Date of Arrival breakdown
        const arrivalDate = reg.arrivalDate || reg['Date of Arrival'] || '';
        if (arrivalDate) {
            stats.arrivalDateBreakdown[arrivalDate] = (stats.arrivalDateBreakdown[arrivalDate] || 0) + 1;
        }
        
        // Arrival Time Buckets (2/4 hour sections)
        const arrivalTime = reg.arrivalTime || reg['Time of Arrival'] || '';
        if (arrivalTime) {
            const timeBucket = getTimeBucket(arrivalTime);
            stats.arrivalTimeBucketsBreakdown[timeBucket] = (stats.arrivalTimeBucketsBreakdown[timeBucket] || 0) + 1;
        }
        
        // Pickup Needed breakdown
        const pickupNeeded = reg.pickupNeeded || reg['Do you need a pickup on arrival?'] || 'Not specified';
        stats.pickupNeededBreakdown[pickupNeeded] = (stats.pickupNeededBreakdown[pickupNeeded] || 0) + 1;
        
        // Dropoff Needed breakdown
        const dropoffNeeded = reg.dropoffNeeded || reg['Do you need a drop off for departure?'] || 'Not specified';
        stats.dropoffNeededBreakdown[dropoffNeeded] = (stats.dropoffNeededBreakdown[dropoffNeeded] || 0) + 1;
        
        // Place of Arrival breakdown
        const placeOfArrival = reg.arrivalPlace || reg['Place of Arrival'] || reg.pickupLocation || '';
        if (placeOfArrival) {
            stats.placeOfArrivalBreakdown[placeOfArrival] = (stats.placeOfArrivalBreakdown[placeOfArrival] || 0) + 1;
            
            // Place of Arrival by Date
            if (arrivalDate) {
                const placeDateKey = `${placeOfArrival} | ${arrivalDate}`;
                stats.placeArrivalDateBreakdown[placeDateKey] = (stats.placeArrivalDateBreakdown[placeDateKey] || 0) + 1;
                
                // Place of Arrival by Date and Time Bucket
                if (arrivalTime) {
                    const timeBucket = getTimeBucket(arrivalTime);
                    const placeDateTimeKey = `${placeOfArrival} | ${arrivalDate} | ${timeBucket}`;
                    stats.placeArrivalDateTimeBreakdown[placeDateTimeKey] = (stats.placeArrivalDateTimeBreakdown[placeDateTimeKey] || 0) + 1;
                }
            }
        }
        
        // Place of Departure breakdown
        const placeOfDeparture = reg.departurePlace || reg['Place of Departure'] || '';
        if (placeOfDeparture) {
            stats.placeOfDepartureBreakdown[placeOfDeparture] = (stats.placeOfDepartureBreakdown[placeOfDeparture] || 0) + 1;
            
            // Place of Departure by Date
            const departureDate = reg.departureDate || reg['Date of Departure'] || reg['Date of Departure Train/Flight'] || '';
            if (departureDate) {
                const placeDepDateKey = `${placeOfDeparture} | ${departureDate}`;
                stats.placeDepartureDateBreakdown[placeDepDateKey] = (stats.placeDepartureDateBreakdown[placeDepDateKey] || 0) + 1;
            }
        }
        
        // Ganavesh Size breakdown
        const ganaveshSize = reg.ganveshSize || reg['Ganvesh Kurta Shoulder Size in cm (for swayamevaks and sevikas)'] || '';
        if (ganaveshSize) {
            stats.ganaveshSizeBreakdown[ganaveshSize] = (stats.ganaveshSizeBreakdown[ganaveshSize] || 0) + 1;
        }
        
        // Medical Conditions breakdown
        const medicalCondition = reg.medicalCondition || reg['Medical Condition'] || reg['Do you have any medical condition?'] || '';
        if (medicalCondition && medicalCondition.toLowerCase() !== 'no' && medicalCondition.toLowerCase() !== 'none') {
            stats.medicalConditionsBreakdown[medicalCondition] = (stats.medicalConditionsBreakdown[medicalCondition] || 0) + 1;
        }
        
        // Dietary Restrictions breakdown
        const dietaryRestriction = reg.dietaryRestriction || reg['Dietary Restriction'] || reg['Dietary Restrictions'] || reg['Diet'] || '';
        if (dietaryRestriction) {
            stats.dietaryRestrictionsBreakdown[dietaryRestriction] = (stats.dietaryRestrictionsBreakdown[dietaryRestriction] || 0) + 1;
        }
        
        // Track travel updates (check if travelupdateAt field exists)
        if (reg.travelupdateAt) {
            stats.travelUpdateStats.totalUpdated++;
        } else {
            stats.travelUpdateStats.totalNotUpdated++;
        }
    });
    
    // Calculate travel update percentage
    const totalRegistrations = registrations.length;
    stats.travelUpdateStats.updatePercentage = totalRegistrations > 0 
        ? ((stats.travelUpdateStats.totalUpdated / totalRegistrations) * 100).toFixed(1) 
        : '0.0';
    
    // Calculate totals for percentages
    stats.totalCountries = Object.keys(stats.countryBreakdown).length;
    stats.totalShrenis = Object.keys(stats.shreniBreakdown).length;
    
    // Calculate total distinct Praveshika IDs that have user accounts (for the current registration set)
    // This ensures no double-counting across multiple user docs and respects the current filter
    const praveshikaIdsWithAccounts = new Set();
    users.forEach(user => {
        // Direct uniqueId on user (often primary ID)
        if (user.uniqueId) {
            const id = user.uniqueId.toString().trim();
            if (registrationUniqueIds.has(id)) {
                praveshikaIdsWithAccounts.add(id);
            }
        }
        
        // associatedRegistrations on user
        if (Array.isArray(user.associatedRegistrations)) {
            user.associatedRegistrations.forEach(reg => {
                const id = (reg.uniqueId || reg.id || '').toString().trim();
                if (id && registrationUniqueIds.has(id)) {
                    praveshikaIdsWithAccounts.add(id);
                }
            });
        } else if (user.associatedRegistrations && typeof user.associatedRegistrations === 'object') {
            Object.values(user.associatedRegistrations).forEach(reg => {
                const id = (reg.uniqueId || reg.id || '').toString().trim();
                if (id && registrationUniqueIds.has(id)) {
                    praveshikaIdsWithAccounts.add(id);
                }
            });
        }
        
        // Fallback: emailToUids-style structure on user (if present)
        if (user.emailToUids) {
            const idsArray = Array.isArray(user.emailToUids.uniqueIds)
                ? user.emailToUids.uniqueIds
                : (Array.isArray(user.emailToUids) ? user.emailToUids : []);
            idsArray.forEach(rawId => {
                const id = rawId && rawId.toString().trim();
                if (id && registrationUniqueIds.has(id)) {
                    praveshikaIdsWithAccounts.add(id);
                }
            });
        }
    });
    
    stats.totalPraveshikaIdsWithAccounts = praveshikaIdsWithAccounts.size;
    
    // Track email corrections and late/updated registrations
    registrations.forEach(reg => {
        const email = reg.email || reg['Email address'] || '';
        const createdAt = reg.createdAt || reg.timestamp;
        const updatedAt = reg.updatedAt || reg.travelupdateAt;
        const isLate = createdAt && (() => {
            const regDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
            // Consider late if registered after a certain date (adjust as needed)
            const cutoffDate = new Date('2025-01-01'); // Adjust this date
            return regDate > cutoffDate;
        })();
        
        if (isLate) {
            stats.emailCorrections.lateRegistrations.push({
                uniqueId: reg.uniqueId || '',
                email: email,
                name: reg.name || reg['Full Name'] || '',
                registrationDate: createdAt
            });
        }
        
        if (updatedAt) {
            stats.emailCorrections.updatedRegistrations.push({
                uniqueId: reg.uniqueId || '',
                email: email,
                name: reg.name || reg['Full Name'] || '',
                updatedDate: updatedAt
            });
        }
    });
    
    return stats;
}

function displayAdminStatistics(stats, registrations, users = []) {
    // Guard: ensure users is always defined to avoid ReferenceError
    const safeUsers = Array.isArray(users) ? users : [];
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
    
    // Display three main tables:
    // 1. Registrations by Zone (with Registered, Web Logged In, Venue Check In)
    // 2. Registrations by Shreni (with Male, Female, Total, Percentage + Volunteers, Others, Grand Total)
    // 3. Registrations by Shreni/Zone Matrix
    
    // Store data globally for table population
    // Only store original full data if not already set (preserve original for filter resets)
    if (!window.allDashboardRegistrations || registrations.length >= (window.allDashboardRegistrations?.length || 0)) {
        window.allDashboardRegistrations = registrations;
    }
    window.dashboardStats = stats;
    window.dashboardRegistrations = registrations;
    window.dashboardUsers = safeUsers;
    
    // Populate the three main tables
    displayZoneWithStatusTable(registrations, safeUsers);
    displayShreniWithGenderTable(registrations);
    displayShreniZoneMatrix(registrations);
    
    // Display total Praveshika IDs with accounts
    const totalPraveshikaIdsWithAccountsEl = document.getElementById('totalPraveshikaIdsWithAccounts');
    if (totalPraveshikaIdsWithAccountsEl) {
        totalPraveshikaIdsWithAccountsEl.textContent = stats.totalPraveshikaIdsWithAccounts || 0;
    }
    
    // Initialize dashboard tables with filters (commented out - not using filter dropdown anymore)
    // updateDashboardWithFilter();
}

// Display Registrations by Zone with Registered, Web Logged In, Venue Check In columns
async function displayZoneWithStatusTable(registrations, users) {
    const tableBody = document.getElementById('zoneTableBody');
    if (!tableBody) return;
    
    // Define the zones we want to display
    const zoneOrder = ['AM', 'EU', 'AR', 'AF', 'AS', 'AU'];
    const zoneLabels = {
        'AM': 'Americas',
        'EU': 'Europe',
        'AR': 'AR',
        'AF': 'Africa',
        'AS': 'SE Asia',
        'AU': 'Australasia'
    };
    
    // Get user uniqueIds (for Web Logged In)
    const userUniqueIds = new Set();
    users.forEach(user => {
        if (user.uniqueId) userUniqueIds.add(user.uniqueId);
        if (user.associatedRegistrations) {
            user.associatedRegistrations.forEach(reg => {
                if (reg.uniqueId) userUniqueIds.add(reg.uniqueId);
            });
        }
    });
    
    // Get checked-in uniqueIds (for Venue Check In)
    const checkedInIds = new Set();
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const checkinSnapshot = await db.collection('checkins')
                .where('checkinType', '==', 'registration')
                .get();
            checkinSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.uniqueId) checkedInIds.add(data.uniqueId);
            });
        }
    } catch (error) {
        console.error('Error fetching checkin data:', error);
    }
    
    // Count by zone and build country breakdown
    const zoneCounts = {};
    const zoneCountryMap = {};
    zoneOrder.forEach(zone => {
        zoneCounts[zone] = { registered: 0, loggedIn: 0, checkedIn: 0 };
        zoneCountryMap[zone] = {};
    });
    zoneCounts['Others'] = { registered: 0, loggedIn: 0, checkedIn: 0 };
    zoneCountryMap['Others'] = {};
    
    registrations.forEach(reg => {
        const zone = reg.Zone || reg.zone || 'Unknown';
        const normalizedZone = zoneOrder.find(z => zone.toUpperCase().startsWith(z)) || 'Others';
        const country = reg.Country || reg.country || reg['Country of Current Residence'] || 'Unknown';
        
        zoneCounts[normalizedZone].registered++;
        if (userUniqueIds.has(reg.uniqueId)) {
            zoneCounts[normalizedZone].loggedIn++;
        }
        if (checkedInIds.has(reg.uniqueId)) {
            zoneCounts[normalizedZone].checkedIn++;
        }
        
        // Build country breakdown for each zone
        zoneCountryMap[normalizedZone][country] = (zoneCountryMap[normalizedZone][country] || 0) + 1;
    });
    
    // Build table HTML
    let html = '';
    let totalRegistered = 0, totalLoggedIn = 0, totalCheckedIn = 0;
    
    zoneOrder.forEach(zone => {
        const label = zoneLabels[zone] || zone;
        const counts = zoneCounts[zone];
        totalRegistered += counts.registered;
        totalLoggedIn += counts.loggedIn;
        totalCheckedIn += counts.checkedIn;
        
        // Escape the country breakdown for onclick
        const countryBreakdownJson = JSON.stringify(zoneCountryMap[zone]).replace(/"/g, '&quot;');
        
        html += `
            <tr>
                <td>${escapeHtml(label)}</td>
                <td>${counts.registered}</td>
                <td>${counts.loggedIn}</td>
                <td>${counts.checkedIn}</td>
                <td>
                    <button class="btn btn-small btn-secondary" 
                            onclick="showZoneCountryDetails('${escapeHtml(label)}', '${countryBreakdownJson}', ${counts.registered})">
                        View Countries
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Add Others row
    const others = zoneCounts['Others'];
    totalRegistered += others.registered;
    totalLoggedIn += others.loggedIn;
    totalCheckedIn += others.checkedIn;
    
    const othersCountryBreakdownJson = JSON.stringify(zoneCountryMap['Others']).replace(/"/g, '&quot;');
    html += `
        <tr>
            <td>Others</td>
            <td>${others.registered}</td>
            <td>${others.loggedIn}</td>
            <td>${others.checkedIn}</td>
            <td>
                <button class="btn btn-small btn-secondary" 
                        onclick="showZoneCountryDetails('Others', '${othersCountryBreakdownJson}', ${others.registered})">
                    View Countries
                </button>
            </td>
        </tr>
    `;
    
    // Add Total row
    html += `
        <tr style="font-weight: bold; background-color: #f0f0f0;">
            <td>Total</td>
            <td>${totalRegistered}</td>
            <td>${totalLoggedIn}</td>
            <td>${totalCheckedIn}</td>
            <td></td>
        </tr>
    `;
    
    tableBody.innerHTML = html;
}

// Display Registrations by Shreni with Male, Female, Total, Percentage columns
// Plus Volunteers, Others, Grand Total rows
async function displayShreniWithGenderTable(registrations) {
    const tableBody = document.getElementById('shreniTableBody');
    if (!tableBody) return;
    
    // Define shreni order
    const shreniOrder = ['Karyakarta', 'Swakeeya', 'Yuva', 'Kishor', 'Baal'];
    
    // Normalize shreni names
    const normalizeShreni = (shreni) => {
        if (!shreni) return 'Unknown';
        const s = shreni.toLowerCase().trim();
        if (s.includes('karyakarta') || s === 'kk') return 'Karyakarta';
        if (s.includes('swakeeya') || s === 'sw') return 'Swakeeya';
        if (s.includes('yuva') || s === 'yv') return 'Yuva';
        if (s.includes('kishor') || s === 'ks') return 'Kishor';
        if (s.includes('baal') || s === 'bl') return 'Baal';
        return shreni;
    };
    
    // Count by shreni and gender
    const shreniCounts = {};
    shreniOrder.forEach(shreni => {
        shreniCounts[shreni] = { male: 0, female: 0, total: 0 };
    });
    shreniCounts['Others'] = { male: 0, female: 0, total: 0 };
    
    let totalMale = 0, totalFemale = 0, totalCount = 0;
    
    registrations.forEach(reg => {
        const rawShreni = reg.Shreni || reg.shreni || reg['Corrected Shreni'] || reg['Default Shreni'] || 'Unknown';
        const shreni = normalizeShreni(rawShreni);
        const gender = (reg.gender || reg.Gender || '').toLowerCase();
        
        const bucket = shreniOrder.includes(shreni) ? shreni : 'Others';
        
        if (gender === 'male' || gender === 'm') {
            shreniCounts[bucket].male++;
            totalMale++;
        } else if (gender === 'female' || gender === 'f') {
            shreniCounts[bucket].female++;
            totalFemale++;
        } else {
            // Count as other/unknown - add to total but not male/female
        }
        shreniCounts[bucket].total++;
        totalCount++;
    });
    
    // Build table HTML
    let html = '';
    let subtotalMale = 0, subtotalFemale = 0, subtotalCount = 0;
    
    // Shibirarthi rows (main shrenis)
    shreniOrder.forEach(shreni => {
        const counts = shreniCounts[shreni];
        const percentage = totalCount > 0 ? ((counts.total / totalCount) * 100).toFixed(1) : '0.0';
        subtotalMale += counts.male;
        subtotalFemale += counts.female;
        subtotalCount += counts.total;
        
        html += `
            <tr>
                <td>${escapeHtml(shreni)}</td>
                <td>${counts.male}</td>
                <td>${counts.female}</td>
                <td>${counts.total}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });
    
    // Shibirarthi Total row
    const subtotalPercentage = totalCount > 0 ? ((subtotalCount / totalCount) * 100).toFixed(1) : '0.0';
    html += `
        <tr style="font-weight: bold; background-color: #e8e8e8;">
            <td>Shibirarthi Total</td>
            <td>${subtotalMale}</td>
            <td>${subtotalFemale}</td>
            <td>${subtotalCount}</td>
            <td>${subtotalPercentage}%</td>
        </tr>
    `;
    
    // Volunteers row (from nonShibirarthiUsers collection or role='volunteer')
    // For now, we count from "Others" as placeholder - actual volunteers should come from different collection
    const volunteersCount = { male: 0, female: 0, total: 0 };
    // Note: Actual volunteer counts would come from nonShibirarthiUsers collection
    // This is a placeholder - volunteers aren't in registrations collection
    html += `
        <tr>
            <td>Volunteers</td>
            <td>${volunteersCount.male}</td>
            <td>${volunteersCount.female}</td>
            <td>${volunteersCount.total}</td>
            <td>-</td>
        </tr>
    `;
    
    // Others row
    const others = shreniCounts['Others'];
    const othersPercentage = totalCount > 0 ? ((others.total / totalCount) * 100).toFixed(1) : '0.0';
    html += `
        <tr>
            <td>Others</td>
            <td>${others.male}</td>
            <td>${others.female}</td>
            <td>${others.total}</td>
            <td>${othersPercentage}%</td>
        </tr>
    `;
    
    // Grand Total row
    html += `
        <tr style="font-weight: bold; background-color: #d0d0d0;">
            <td>Grand Total</td>
            <td>${totalMale}</td>
            <td>${totalFemale}</td>
            <td>${totalCount}</td>
            <td>100%</td>
        </tr>
    `;
    
    tableBody.innerHTML = html;
}

// Display Registrations by Shreni/Zone Matrix
// Rows: Americas, Europe, AR, Africa, SE Asia, Australasia, Others, Total
// Columns: Karyakarta, Swakeeya, Yuva, Kishor, Baal, Total
function displayShreniZoneMatrix(registrations) {
    const tableBody = document.getElementById('shreniZoneMatrixTableBody');
    if (!tableBody) return;
    
    // Define zones and shrenis
    const zoneOrder = ['AM', 'EU', 'AR', 'AF', 'AS', 'AU'];
    const zoneLabels = {
        'AM': 'Americas',
        'EU': 'Europe',
        'AR': 'AR',
        'AF': 'Africa',
        'AS': 'SE Asia',
        'AU': 'Australasia'
    };
    const shreniOrder = ['Karyakarta', 'Swakeeya', 'Yuva', 'Kishor', 'Baal'];
    
    // Normalize shreni names
    const normalizeShreni = (shreni) => {
        if (!shreni) return 'Unknown';
        const s = shreni.toLowerCase().trim();
        if (s.includes('karyakarta') || s === 'kk') return 'Karyakarta';
        if (s.includes('swakeeya') || s === 'sw') return 'Swakeeya';
        if (s.includes('yuva') || s === 'yv') return 'Yuva';
        if (s.includes('kishor') || s === 'ks') return 'Kishor';
        if (s.includes('baal') || s === 'bl') return 'Baal';
        return 'Other';
    };
    
    // Initialize matrix
    const matrix = {};
    [...zoneOrder, 'Others'].forEach(zone => {
        matrix[zone] = {};
        shreniOrder.forEach(shreni => {
            matrix[zone][shreni] = 0;
        });
        matrix[zone]['Total'] = 0;
    });
    
    // Count registrations
    registrations.forEach(reg => {
        const zone = reg.Zone || reg.zone || 'Unknown';
        const normalizedZone = zoneOrder.find(z => zone.toUpperCase().startsWith(z)) || 'Others';
        
        const rawShreni = reg.Shreni || reg.shreni || reg['Corrected Shreni'] || reg['Default Shreni'] || 'Unknown';
        const shreni = normalizeShreni(rawShreni);
        
        if (shreniOrder.includes(shreni)) {
            matrix[normalizedZone][shreni]++;
        }
        matrix[normalizedZone]['Total']++;
    });
    
    // Build table HTML
    let html = '';
    const totals = {};
    shreniOrder.forEach(shreni => totals[shreni] = 0);
    totals['Total'] = 0;
    
    // Zone rows
    [...zoneOrder, 'Others'].forEach(zone => {
        const label = zoneLabels[zone] || zone;
        html += `<tr><td>${escapeHtml(label)}</td>`;
        
        shreniOrder.forEach(shreni => {
            const count = matrix[zone][shreni];
            totals[shreni] += count;
            html += `<td>${count}</td>`;
        });
        
        const zoneTotal = matrix[zone]['Total'];
        totals['Total'] += zoneTotal;
        html += `<td>${zoneTotal}</td></tr>`;
    });
    
    // Total row
    html += `<tr style="font-weight: bold; background-color: #f0f0f0;"><td>Total</td>`;
    shreniOrder.forEach(shreni => {
        html += `<td>${totals[shreni]}</td>`;
    });
    html += `<td>${totals['Total']}</td></tr>`;
    
    tableBody.innerHTML = html;
}

// Update dashboard based on status filter
async function updateDashboardWithFilter() {
    const filterValue = document.getElementById('dashboardStatusFilter')?.value || 'registered';
    // Use the original full registrations data for filtering, not the potentially filtered data
    const registrations = window.allDashboardRegistrations || window.dashboardRegistrations || [];
    const users = window.dashboardUsers || [];
    
    // Get filtered registrations based on status
    let filteredRegistrations = [];
    
    if (filterValue === 'registered') {
        filteredRegistrations = registrations;
    } else if (filterValue === 'logged') {
        // Get uniqueIds that have user accounts
        const userUniqueIds = new Set();
        users.forEach(user => {
            if (user.uniqueId) {
                userUniqueIds.add(user.uniqueId);
            }
            // Also check associated registrations
            if (user.associatedRegistrations) {
                user.associatedRegistrations.forEach(reg => {
                    if (reg.uniqueId) {
                        userUniqueIds.add(reg.uniqueId);
                    }
                });
            }
        });
        filteredRegistrations = registrations.filter(reg => userUniqueIds.has(reg.uniqueId));
    } else if (filterValue === 'checkedin') {
        // Get uniqueIds that have registration checkin
        const db = firebase.firestore();
        const checkinSnapshot = await db.collection('checkins')
            .where('checkinType', '==', 'registration')
            .get();
        const checkedInIds = new Set();
        checkinSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.uniqueId) {
                checkedInIds.add(data.uniqueId);
            }
        });
        filteredRegistrations = registrations.filter(reg => checkedInIds.has(reg.uniqueId));
    }
    
    // Recalculate stats with filtered data
    const filteredStats = calculateStatistics(filteredRegistrations, users);
    displayAdminStatistics(filteredStats, filteredRegistrations, users);
    
    // Update specific tables
    updateShreniGenderTable();
    updateZoneStatsTable();
    updateZoneShreniTable();
}

// Update Shreni Gender table with filter
async function updateShreniGenderTable() {
    const filterValue = document.getElementById('shreniGenderFilter')?.value || 'registered';
    const registrations = await getFilteredRegistrations(filterValue);
    
    const shreniGenderMap = {};
    const shrenis = ['Karyakarta', 'Swakeeya', 'Yuva', 'Kishor', 'Baal'];
    
    registrations.forEach(reg => {
        const shreni = reg.shreni || reg.Shreni || '';
        const gender = reg.gender || reg.Gender || '';
        
        if (shrenis.includes(shreni)) {
            if (!shreniGenderMap[shreni]) {
                shreniGenderMap[shreni] = { Female: 0, Male: 0, Total: 0 };
            }
            if (gender.toLowerCase() === 'female') {
                shreniGenderMap[shreni].Female++;
            } else if (gender.toLowerCase() === 'male') {
                shreniGenderMap[shreni].Male++;
            }
            shreniGenderMap[shreni].Total++;
        }
    });
    
    const total = registrations.filter(r => shrenis.includes(r.shreni || r.Shreni || '')).length;
    
    let html = '';
    let grandTotalFemale = 0;
    let grandTotalMale = 0;
    
    shrenis.forEach(shreni => {
        const counts = shreniGenderMap[shreni] || { Female: 0, Male: 0, Total: 0 };
        grandTotalFemale += counts.Female;
        grandTotalMale += counts.Male;
        const percentage = total > 0 ? ((counts.Total / total) * 100).toFixed(0) : 0;
        html += `
            <tr>
                <td>${escapeHtml(shreni)}</td>
                <td>${counts.Female}</td>
                <td>${counts.Male}</td>
                <td>${counts.Total}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });
    
    // Add totals row
    const grandTotal = grandTotalFemale + grandTotalMale;
    html += `
        <tr style="font-weight: bold; background: #f0f0f0;">
            <td>Total</td>
            <td>${grandTotalFemale}</td>
            <td>${grandTotalMale}</td>
            <td>${grandTotal}</td>
            <td>100%</td>
        </tr>
    `;
    
    // Add Volunteer and Others rows (if any)
    const volunteerRegs = registrations.filter(r => (r.shreni || r.Shreni || '').toLowerCase() === 'volunteer');
    if (volunteerRegs.length > 0) {
        const volunteerFemale = volunteerRegs.filter(r => (r.gender || '').toLowerCase() === 'female').length;
        const volunteerMale = volunteerRegs.filter(r => (r.gender || '').toLowerCase() === 'male').length;
        html += `
            <tr>
                <td>Volunteer</td>
                <td>${volunteerFemale}</td>
                <td>${volunteerMale}</td>
                <td>${volunteerRegs.length}</td>
                <td>0%</td>
            </tr>
        `;
    }
    
    document.getElementById('shreniGenderTableBody').innerHTML = html;
}

// Update Zone Statistics table
async function updateZoneStatsTable() {
    const filterValue = document.getElementById('zoneStatsFilter')?.value || 'registered';
    const registrations = await getFilteredRegistrations(filterValue);
    const users = window.dashboardUsers || [];
    
    const zones = ['SE Asia', 'AR', 'Americas', 'Europe', 'Africa', 'Australasia', 'Unknown'];
    const zoneMap = {
        'AS': 'SE Asia',
        'AR': 'AR',
        'AM': 'Americas',
        'EU': 'Europe',
        'AF': 'Africa',
        'AU': 'Australasia'
    };
    
    const stats = {};
    
    // Get logged in uniqueIds
    const userUniqueIds = new Set();
    users.forEach(user => {
        if (user.uniqueId) userUniqueIds.add(user.uniqueId);
        if (user.associatedRegistrations) {
            user.associatedRegistrations.forEach(reg => {
                if (reg.uniqueId) userUniqueIds.add(reg.uniqueId);
            });
        }
    });
    
    // Get checked in uniqueIds
    const db = firebase.firestore();
    const checkinSnapshot = await db.collection('checkins')
        .where('checkinType', '==', 'registration')
        .get();
    const checkedInIds = new Set();
    checkinSnapshot.forEach(doc => {
        if (doc.data().uniqueId) checkedInIds.add(doc.data().uniqueId);
    });
    
    registrations.forEach(reg => {
        const zone = zoneMap[reg.zone] || reg.zone || 'Unknown';
        if (!stats[zone]) {
            stats[zone] = { registered: 0, logged: 0, checkedin: 0 };
        }
        stats[zone].registered++;
        if (userUniqueIds.has(reg.uniqueId)) {
            stats[zone].logged++;
        }
        if (checkedInIds.has(reg.uniqueId)) {
            stats[zone].checkedin++;
        }
    });
    
    let html = '';
    zones.forEach(zone => {
        const s = stats[zone] || { registered: 0, logged: 0, checkedin: 0 };
        html += `
            <tr>
                <td>${escapeHtml(zone)}</td>
                <td>${s.registered}</td>
                <td>${s.logged}</td>
                <td>${s.checkedin}</td>
            </tr>
        `;
    });
    
    // Add totals
    const totalRegistered = Object.values(stats).reduce((sum, s) => sum + s.registered, 0);
    const totalLogged = Object.values(stats).reduce((sum, s) => sum + s.logged, 0);
    const totalCheckedIn = Object.values(stats).reduce((sum, s) => sum + s.checkedin, 0);
    const pctLogged = totalRegistered > 0 ? Math.round((totalLogged / totalRegistered) * 100) : 0;
    const pctCheckedIn = totalRegistered > 0 ? Math.round((totalCheckedIn / totalRegistered) * 100) : 0;
    
    html += `
        <tr style="font-weight: bold; background: #f0f0f0;">
            <td>Total</td>
            <td>${totalRegistered}</td>
            <td>${totalLogged}</td>
            <td>${totalCheckedIn}</td>
        </tr>
        <tr style="font-weight: bold;">
            <td>% to Registered</td>
            <td></td>
            <td>${pctLogged}%</td>
            <td>${pctCheckedIn}%</td>
        </tr>
    `;
    
    document.getElementById('zoneStatsTableBody').innerHTML = html;
}

// Update Zone Shreni table
async function updateZoneShreniTable() {
    const filterValue = document.getElementById('zoneShreniTableFilter')?.value || 'registered';
    const registrations = await getFilteredRegistrations(filterValue);
    
    const zoneMap = {
        'AS': 'SE Asia',
        'AR': 'AR',
        'AM': 'Americas',
        'EU': 'Europe',
        'AF': 'Africa',
        'AU': 'Australasia'
    };
    const zones = ['Americas', 'Europe', 'AR', 'Africa', 'SE Asia', 'Australasia', 'Others'];
    const shrenis = ['Karyakarta', 'Swakeeya', 'Yuva', 'Kishor', 'Baal'];
    
    const matrix = {};
    zones.forEach(zone => {
        matrix[zone] = {};
        shrenis.forEach(shreni => {
            matrix[zone][shreni] = 0;
        });
    });
    
    registrations.forEach(reg => {
        const zone = zoneMap[reg.zone] || reg.zone || 'Others';
        const shreni = reg.shreni || reg.Shreni || '';
        if (shrenis.includes(shreni) && zones.includes(zone)) {
            matrix[zone][shreni]++;
        }
    });
    
    let html = '';
    zones.forEach(zone => {
        html += '<tr><td>' + escapeHtml(zone) + '</td>';
        shrenis.forEach(shreni => {
            html += '<td>' + matrix[zone][shreni] + '</td>';
        });
        html += '</tr>';
    });
    
    // Add totals row
    html += '<tr style="font-weight: bold; background: #f0f0f0;"><td>Total</td>';
    shrenis.forEach(shreni => {
        const total = zones.reduce((sum, zone) => sum + (matrix[zone][shreni] || 0), 0);
        html += '<td>' + total + '</td>';
    });
    html += '</tr>';
    
    document.getElementById('zoneShreniTableTableBody').innerHTML = html;
}

// Helper function to get filtered registrations
async function getFilteredRegistrations(filterValue) {
    const registrations = window.dashboardRegistrations || [];
    const users = window.dashboardUsers || [];
    
    if (filterValue === 'registered') {
        return registrations;
    } else if (filterValue === 'logged') {
        const userUniqueIds = new Set();
        users.forEach(user => {
            if (user.uniqueId) userUniqueIds.add(user.uniqueId);
            if (user.associatedRegistrations) {
                user.associatedRegistrations.forEach(reg => {
                    if (reg.uniqueId) userUniqueIds.add(reg.uniqueId);
                });
            }
        });
        return registrations.filter(reg => userUniqueIds.has(reg.uniqueId));
    } else if (filterValue === 'checkedin') {
        const db = firebase.firestore();
        const checkinSnapshot = await db.collection('checkins')
            .where('checkinType', '==', 'registration')
            .get();
        const checkedInIds = new Set();
        checkinSnapshot.forEach(doc => {
            if (doc.data().uniqueId) checkedInIds.add(doc.data().uniqueId);
        });
        return registrations.filter(reg => checkedInIds.has(reg.uniqueId));
    }
    return registrations;
}

// Export Travel Team Data
async function exportTravelTeamData() {
    const registrations = window.dashboardRegistrations || [];
    
    const headers = ['Praveshika ID', 'Name', 'Email', 'Phone', 'Pickup Location', 'Arrival Date', 'Arrival Time', 
                     'Flight/Train Number', 'Dropoff Location', 'Departure Date', 'Departure Time', 'Departure Flight/Train Number'];
    
    const rows = registrations.map(reg => {
        return [
            reg.uniqueId || '',
            reg.name || reg['Full Name'] || '',
            reg.email || reg['Email address'] || '',
            reg.phone || '',
            reg.normalizedPickupLocation || reg.arrivalPlace || reg['Place of Arrival'] || '',
            reg.arrivalDate || reg['Date of Arrival'] || '',
            reg.arrivalTime || reg['Time of Arrival'] || '',
            reg.arrivalFlightTrain || reg['Arrival Flight/Train Number'] || '',
            reg.departurePlace || reg['Place of Departure Train/Flight'] || '',
            reg.departureDate || reg['Date of Departure Train/Flight'] || '',
            reg.departureTime || reg['Time of Departure Train/Flight'] || '',
            reg.departureFlightTrain || reg['Departure Flight/Train Number'] || ''
        ];
    });
    
    exportToCSV('travel_team_data.csv', headers, rows);
}

// Export Post Tour Team Data
async function exportPostTourTeamData() {
    const registrations = window.dashboardRegistrations || [];
    
    const headers = ['Praveshika ID', 'Name', 'Email', 'Phone', 'Post Tour Selection', 'Accommodation'];
    
    const rows = registrations.map(reg => {
        return [
            reg.uniqueId || '',
            reg.name || reg['Full Name'] || '',
            reg.email || reg['Email address'] || '',
            reg.phone || '',
            reg.postShibirTour || reg['Post Shibir Tour'] || 'None',
            reg.accommodation || ''
        ];
    });
    
    exportToCSV('post_tour_team_data.csv', headers, rows);
}

// Export Tours Data (broader tour-focused slice)
async function exportToursData() {
    const registrations = window.dashboardRegistrations || [];
    
    const headers = [
        'Praveshika ID',
        'Name',
        'Email',
        'Phone',
        'Zone',
        'Shreni',
        'Gender',
        'Post Tour Selection',
        'Accommodation',
        'Arrival Date',
        'Arrival Time',
        'Arrival Place',
        'Departure Date',
        'Departure Time',
        'Departure Place'
    ];
    
    const rows = registrations.map(reg => {
        return [
            reg.uniqueId || '',
            reg.name || reg['Full Name'] || '',
            reg.email || reg['Email address'] || '',
            reg.phone || '',
            reg.zone || reg.Zone || '',
            reg.shreni || reg.Shreni || '',
            reg.gender || reg.Gender || '',
            reg.postShibirTour || reg['Post Shibir Tour'] || reg['Post Shibir Tours'] || reg['Please select a post shibir tour option'] || 'None',
            reg.accommodation || '',
            reg.arrivalDate || reg['Date of Arrival'] || '',
            reg.arrivalTime || reg['Time of Arrival'] || '',
            reg.normalizedPickupLocation || reg.arrivalPlace || reg['Place of Arrival'] || '',
            reg.departureDate || reg['Date of Departure Train/Flight'] || '',
            reg.departureTime || reg['Time of Departure Train/Flight'] || '',
            reg.departurePlace || reg['Place of Departure Train/Flight'] || ''
        ];
    });
    
    exportToCSV('tours_data.csv', headers, rows);
}

// Helper function to export to CSV
function exportToCSV(filename, headers, rows) {
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
            const str = String(cell || '');
            // Escape quotes and wrap in quotes if contains comma or quote
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`Exported ${rows.length} records to ${filename}`, 'success');
}

// Display email corrections for late and updated registrations
function displayEmailCorrections(emailCorrections) {
    // Display late registrations
    const lateRegsTbody = document.getElementById('lateRegistrationsTableBody');
    if (lateRegsTbody && emailCorrections.lateRegistrations) {
        let html = '';
        if (emailCorrections.lateRegistrations.length === 0) {
            html = '<tr><td colspan="5" style="text-align: center;">No late registrations found</td></tr>';
        } else {
            emailCorrections.lateRegistrations.forEach(reg => {
                const regDate = reg.registrationDate && reg.registrationDate.toDate 
                    ? reg.registrationDate.toDate().toLocaleDateString() 
                    : (reg.registrationDate ? new Date(reg.registrationDate).toLocaleDateString() : 'N/A');
                html += `<tr>
                    <td>${escapeHtml(reg.uniqueId)}</td>
                    <td>${escapeHtml(reg.name)}</td>
                    <td>${escapeHtml(reg.email)}</td>
                    <td>${regDate}</td>
                    <td><span style="color: #f57c00;">Late Registration</span></td>
                </tr>`;
            });
        }
        lateRegsTbody.innerHTML = html;
    }
    
    // Display updated registrations
    const updatedRegsTbody = document.getElementById('updatedRegistrationsTableBody');
    if (updatedRegsTbody && emailCorrections.updatedRegistrations) {
        let html = '';
        if (emailCorrections.updatedRegistrations.length === 0) {
            html = '<tr><td colspan="5" style="text-align: center;">No updated registrations found</td></tr>';
        } else {
            emailCorrections.updatedRegistrations.forEach(reg => {
                const updateDate = reg.updatedDate && reg.updatedDate.toDate 
                    ? reg.updatedDate.toDate().toLocaleDateString() 
                    : (reg.updatedDate ? new Date(reg.updatedDate).toLocaleDateString() : 'N/A');
                html += `<tr>
                    <td>${escapeHtml(reg.uniqueId)}</td>
                    <td>${escapeHtml(reg.name)}</td>
                    <td>${escapeHtml(reg.email)}</td>
                    <td>${updateDate}</td>
                    <td><span style="color: #388e3c;">Updated</span></td>
                </tr>`;
            });
        }
        updatedRegsTbody.innerHTML = html;
    }
}

// Export registration data with transportation to CSV
function exportRegistrationDataWithTransport() {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const db = firebase.firestore();
    showNotification('Preparing export...', 'info');
    
    // Fetch all registrations
    db.collection('registrations').get()
        .then((snapshot) => {
            const registrations = [];
            snapshot.forEach((doc) => {
                registrations.push(doc.data());
            });
            
            // Prepare CSV data
            const csvRows = [];
            
            // CSV Header
            csvRows.push([
                'Name',
                'Praveshika ID',
                'Email ID',
                'Phone Number',
                'Pickup Needed',
                'Place of Arrival',
                'Date of Arrival',
                'Time of Arrival',
                'Arrival Flight/Train Number',
                'Dropoff Needed',
                'Date of Departure',
                'Time of Departure',
                'Departure Flight/Train Number',
                'Place of Departure'
            ].join(','));
            
            // CSV Data Rows
            registrations.forEach((reg) => {
                const name = escapeCsvField(reg.name || reg['Full Name'] || '');
                const praveshikaId = escapeCsvField(reg.uniqueId || reg['Praveshika ID'] || '');
                const email = escapeCsvField(reg.email || reg['Email address'] || reg['Email'] || '');
                const phone = escapeCsvField(reg.phone || reg.Phone || reg['Phone number on which you can be contacted in Bharat (by call or WhatsApp)'] || '');
                const pickupNeeded = escapeCsvField(reg.pickupNeeded || reg['Do you need a pickup on arrival?'] || '');
                const placeOfArrival = escapeCsvField(reg.arrivalPlace || reg['Place of Arrival'] || reg.pickupLocation || '');
                const arrivalDate = escapeCsvField(reg.arrivalDate || reg['Date of Arrival'] || '');
                const arrivalTime = escapeCsvField(reg.arrivalTime || reg['Time of Arrival'] || '');
                const arrivalFlightTrain = escapeCsvField(reg.arrivalFlightTrain || reg['Arrival Flight/Train Number'] || reg.flightTrainNumber || '');
                const dropoffNeeded = escapeCsvField(reg.dropoffNeeded || reg['Do you need a drop off for departure?'] || '');
                const departureDate = escapeCsvField(reg.departureDate || reg['Date of Departure'] || reg['Date of Departure Train/Flight'] || '');
                const departureTime = escapeCsvField(reg.departureTime || reg['Time of Departure'] || reg['Time of Departure Train/Flight'] || '');
                const departureFlightTrain = escapeCsvField(reg.departureFlightTrain || reg['Departure Flight/Train Number'] || reg.returnFlightTrainNumber || '');
                const placeOfDeparture = escapeCsvField(reg.departurePlace || reg['Place of Departure'] || '');
                
                csvRows.push([
                    name,
                    praveshikaId,
                    email,
                    phone,
                    pickupNeeded,
                    placeOfArrival,
                    arrivalDate,
                    arrivalTime,
                    arrivalFlightTrain,
                    dropoffNeeded,
                    departureDate,
                    departureTime,
                    departureFlightTrain,
                    placeOfDeparture
                ].join(','));
            });
            
            // Create CSV content
            const csvContent = csvRows.join('\n');
            
            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `VSS2025_Registration_Transport_Data_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showNotification('CSV file downloaded successfully!', 'success');
        })
        .catch((error) => {
            console.error('Error exporting data:', error);
            showNotification('Error exporting data: ' + error.message, 'error');
        });
}

// Helper function to escape CSV fields
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    // If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// Gender slicing with range details
function updateGenderSlicing() {
    const startRange = parseInt(document.getElementById('genderRangeStart')?.value || 0);
    const endRange = parseInt(document.getElementById('genderRangeEnd')?.value || 1000);
    
    if (!window.dashboardStats || !window.dashboardRegistrations) {
        showNotification('Dashboard data not loaded. Please refresh the dashboard.', 'error');
        return;
    }
    
    const stats = window.dashboardStats;
    const registrations = window.dashboardRegistrations;
    
    // Filter registrations by range (using index or ID number)
    const filteredRegs = registrations.filter((reg, index) => {
        const regIndex = index + 1; // 1-based index
        return regIndex >= startRange && regIndex <= endRange;
    });
    
    // Calculate gender breakdown for filtered range
    const genderBreakdown = {};
    filteredRegs.forEach(reg => {
        const gender = reg.gender || reg.Gender || 'Not Specified';
        genderBreakdown[gender] = (genderBreakdown[gender] || 0) + 1;
    });
    
    // Display in table
    const tbody = document.getElementById('genderSlicingTableBody');
    if (!tbody) return;
    
    const total = filteredRegs.length;
    const sortedEntries = Object.entries(genderBreakdown).sort((a, b) => b[1] - a[1]);
    
    let html = '';
    sortedEntries.forEach(([gender, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        html += `<tr>
            <td>${escapeHtml(gender)}</td>
            <td>${count}</td>
            <td>${percentage}%</td>
            <td>Range ${startRange}-${endRange} (${total} total)</td>
        </tr>`;
    });
    
    if (sortedEntries.length === 0) {
        html = '<tr><td colspan="4" style="text-align: center;">No data in this range</td></tr>';
    }
    
    tbody.innerHTML = html;
}

// Enhanced search by login ID (Praveshika ID) to show all related IDs
async function searchParticipantByLoginId() {
    const loginIdInput = document.getElementById('lookupUniqueId');
    if (!loginIdInput) return;
    
    const loginId = loginIdInput.value.trim();
    if (!loginId) {
        showNotification('Please enter a Praveshika ID', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        // Normalize: uppercase the ID
        const uppercasedId = loginId.toUpperCase().trim();
        const normalizedId = normalizePraveshikaId(loginId);
        
        // First, find the registration with this ID
        const regQuery = await db.collection('registrations')
            .where('normalizedId', '==', normalizedId)
            .limit(1)
            .get();
        
        if (regQuery.empty) {
            // Try direct document ID lookup with uppercased ID first
            let regDoc = await db.collection('registrations').doc(uppercasedId).get();
            // Fallback to original ID if not found
            if (!regDoc.exists) {
                regDoc = await db.collection('registrations').doc(loginId).get();
            }
            if (regDoc.exists) {
                const regData = regDoc.data();
                // Only show if status is "Approved"
                if (regData.status !== 'Approved') {
                    showNotification('Participant not found or not approved', 'error');
                    clearParticipantLookupResults();
                    return;
                }
                
                const email = regData.email || regData['Email address'] || '';
                
                // Find all registrations with the same email (only approved ones)
                if (email) {
                    const allRegs = await db.collection('registrations').get();
                    const relatedRegs = [];
                    allRegs.docs.forEach(doc => {
                        const data = doc.data();
                        // Only include registrations with status "Approved"
                        if (data.status === 'Approved') {
                            const regEmail = (data.email || data['Email address'] || '').toLowerCase();
                            if (regEmail === email.toLowerCase()) {
                                relatedRegs.push({
                                    doc: doc,
                                    data: data,
                                    uniqueId: data.uniqueId || doc.id
                                });
                            }
                        }
                    });
                    
                    if (relatedRegs.length > 1) {
                        displayRelatedIds(relatedRegs, loginId);
                    } else {
                        displayParticipantLookupResults(regData, loginId);
                    }
                } else {
                    displayParticipantLookupResults(regData, loginId);
                }
            } else {
                showNotification('Participant not found', 'error');
                clearParticipantLookupResults();
            }
        } else {
            const regData = regQuery.docs[0].data();
            // Only show if status is "Approved"
            if (regData.status !== 'Approved') {
                showNotification('Participant not found or not approved', 'error');
                clearParticipantLookupResults();
                return;
            }
            
            const foundUniqueId = regData.uniqueId || regQuery.docs[0].id;
            const email = regData.email || regData['Email address'] || '';
            
            // Find all registrations with the same email (only approved ones)
            if (email) {
                const allRegs = await db.collection('registrations').get();
                const relatedRegs = [];
                allRegs.docs.forEach(doc => {
                    const data = doc.data();
                    // Only include registrations with status "Approved"
                    if (data.status === 'Approved') {
                        const regEmail = (data.email || data['Email address'] || '').toLowerCase();
                        if (regEmail === email.toLowerCase()) {
                            relatedRegs.push({
                                doc: doc,
                                data: data,
                                uniqueId: data.uniqueId || doc.id
                            });
                        }
                    }
                });
                
                if (relatedRegs.length > 1) {
                    displayRelatedIds(relatedRegs, foundUniqueId);
                } else {
                    displayParticipantLookupResults(regData, foundUniqueId);
                }
            } else {
                displayParticipantLookupResults(regData, foundUniqueId);
            }
        }
    } catch (error) {
        console.error('Error searching participant by login ID:', error);
        showNotification('Error searching participant: ' + error.message, 'error');
    }
}

// Display related IDs when searching by login ID
function displayRelatedIds(relatedRegs, searchedId) {
    const resultsDiv = document.getElementById('participantLookupResults');
    const detailsDiv = document.getElementById('participantLookupDetails');
    
    if (!resultsDiv) return;
    
    if (detailsDiv) {
        detailsDiv.style.display = 'none';
    }
    
    let html = `<div class="participant-search-results">
        <h4>Found ${relatedRegs.length} related registration(s) for this login ID. Please select:</h4>
        <ul style="list-style: none; padding: 0;">`;
    
    relatedRegs.forEach(reg => {
        const name = reg.data.name || reg.data['Full Name'] || 'Unknown';
        const uniqueId = reg.uniqueId;
        const email = reg.data.email || reg.data['Email address'] || '';
        const isSearched = uniqueId === searchedId;
        
        html += `
            <li style="margin: 0.5rem 0; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; ${isSearched ? 'background: #e3f2fd;' : ''}">
                <button class="btn btn-link" onclick="selectParticipantFromLookup('${escapeHtml(uniqueId)}')" style="text-align: left; width: 100%;">
                    <strong>${escapeHtml(name)}</strong> ${isSearched ? '<span style="color: #1976d2;">(Searched ID)</span>' : ''}<br>
                    <small>Praveshika ID: ${escapeHtml(uniqueId)}${email ? ' - ' + escapeHtml(email) : ''}</small>
                </button>
            </li>`;
    });
    
    html += '</ul></div>';
    
    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
}

// Export all data to Excel
async function exportAllDataToExcel() {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    showNotification('Preparing Excel export...', 'info');
    
    try {
        const db = firebase.firestore();
        
        // Fetch all registrations
        const registrationsSnapshot = await db.collection('registrations').get();
        const registrations = [];
        registrationsSnapshot.forEach(doc => {
            const data = doc.data();
            data._documentId = doc.id;
            registrations.push(data);
        });
        
        // Convert to CSV first (Excel can open CSV)
        const csvRows = [];
        
        // Get all unique field names
        const allFields = new Set();
        registrations.forEach(reg => {
            Object.keys(reg).forEach(key => {
                if (key !== '_documentId') allFields.add(key);
            });
        });
        
        const fieldArray = Array.from(allFields).sort();
        
        // Add document ID as first column
        csvRows.push(['Document ID', ...fieldArray].map(f => escapeCsvField(f)).join(','));
        
        // Add data rows
        registrations.forEach(reg => {
            const row = [reg._documentId || ''];
            fieldArray.forEach(field => {
                let value = reg[field];
                if (value && typeof value === 'object') {
                    if (value.toDate) {
                        value = value.toDate().toISOString();
                    } else {
                        value = JSON.stringify(value);
                    }
                }
                row.push(value || '');
            });
            csvRows.push(row.map(f => escapeCsvField(f)).join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `VSS2025_All_Data_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Excel file (CSV format) downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showNotification('Error exporting to Excel: ' + error.message, 'error');
    }
}

// Export collection as comprehensive CSV with all fields
async function exportCollectionAsCSV(collectionName) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    showNotification(`Preparing ${collectionName} export...`, 'info');
    
    try {
        const db = firebase.firestore();
        const snapshot = await db.collection(collectionName).get();
        
        if (snapshot.empty) {
            showNotification(`No data found in ${collectionName} collection`, 'info');
            return;
        }
        
        const docs = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data._documentId = doc.id;
            docs.push(data);
        });
        
        // Get all unique field names
        const allFields = new Set();
        docs.forEach(doc => {
            Object.keys(doc).forEach(key => {
                if (key !== '_documentId') allFields.add(key);
            });
        });
        
        const fieldArray = Array.from(allFields).sort();
        
        // Create CSV
        const csvRows = [];
        csvRows.push(['Document ID', ...fieldArray].map(f => escapeCsvField(f)).join(','));
        
        docs.forEach(doc => {
            const row = [doc._documentId || ''];
            fieldArray.forEach(field => {
                let value = doc[field];
                if (value && typeof value === 'object') {
                    if (value.toDate) {
                        value = value.toDate().toISOString();
                    } else if (value instanceof Date) {
                        value = value.toISOString();
                    } else {
                        value = JSON.stringify(value);
                    }
                }
                row.push(value || '');
            });
            csvRows.push(row.map(f => escapeCsvField(f)).join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `VSS2025_${collectionName}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification(`${collectionName} CSV file downloaded successfully!`, 'success');
    } catch (error) {
        console.error(`Error exporting ${collectionName}:`, error);
        showNotification(`Error exporting ${collectionName}: ` + error.message, 'error');
    }
}

function displayBreakdownTable(tableBodyId, breakdown, total) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    
    // Handle null or undefined breakdown
    if (!breakdown || typeof breakdown !== 'object') {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No data available</td></tr>';
        return;
    }
    
    // Sort by count descending
    const sortedEntries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    
    let html = '';
    sortedEntries.forEach(([key, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        html += `
            <tr>
                <td>${escapeHtml(key || 'Not specified')}</td>
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

// Display multi-column breakdown table (for zone|shreni, place|date, etc.)
function displayMultiColumnBreakdownTable(tableBodyId, breakdown, total, separator) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    
    // Handle null or undefined breakdown
    if (!breakdown || typeof breakdown !== 'object') {
        // Calculate colspan based on table structure - for Shreni/Gender it's 4 columns
        const table = tbody.closest('table');
        const headerCols = table ? table.querySelectorAll('thead th').length : 4;
        tbody.innerHTML = `<tr><td colspan="${headerCols}" style="text-align: center;">No data available</td></tr>`;
        return;
    }
    
    // Sort by count descending
    const sortedEntries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    
    let html = '';
    sortedEntries.forEach(([key, count]) => {
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const parts = key.split(separator).map(p => p.trim());
        
        // Determine number of columns based on separator count
        let rowHtml = '<tr>';
        parts.forEach(part => {
            rowHtml += `<td>${escapeHtml(part || 'Not specified')}</td>`;
        });
        rowHtml += `<td>${count}</td>`;
        rowHtml += `<td>${percentage}%</td>`;
        rowHtml += '</tr>';
        html += rowHtml;
    });
    
    if (sortedEntries.length === 0) {
        // Calculate colspan based on table structure
        const table = tbody.closest('table');
        const headerCols = table ? table.querySelectorAll('thead th').length : 4;
        html = `<tr><td colspan="${headerCols}" style="text-align: center;">No data available</td></tr>`;
    }
    
    tbody.innerHTML = html;
}

/**
 * Get Shreni and Gender breakdown data from registrations
 * @param {Array} registrations - Array of registration objects
 * @returns {Object} Object with shreniGenderBreakdown data and total count
 */
function getShreniGenderBreakdown(registrations) {
    if (!registrations || !Array.isArray(registrations)) {
        return {
            breakdown: {},
            total: 0
        };
    }
    
    const breakdown = {};
    
    registrations.forEach(reg => {
        // Extract Shreni (with fallbacks for different field names)
        const shreni = reg.Shreni || reg.shreni || reg['Corrected Shreni'] || reg['Default Shreni'] || 'Unknown';
        
        // Extract Gender (with fallbacks for different field names)
        const gender = reg.gender || reg.Gender || 'Not Specified';
        
        // Create key in format "Shreni | Gender"
        const key = `${shreni} | ${gender}`;
        breakdown[key] = (breakdown[key] || 0) + 1;
    });
    
    return {
        breakdown: breakdown,
        total: registrations.length
    };
}

// Helper function to get time bucket from time string (2/4 hour sections)
function getTimeBucket(timeStr) {
    if (!timeStr) return 'Unknown';
    
    // Convert to string if it's not already
    const timeString = String(timeStr).trim();
    if (!timeString) return 'Unknown';
    
    // Try to parse time string (could be HH:MM or HH:MM:SS format)
    const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return 'Unknown';
    
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    
    // Create 4-hour buckets: 00-04, 04-08, 08-12, 12-16, 16-20, 20-24
    if (hours >= 0 && hours < 4) return '00:00-04:00';
    if (hours >= 4 && hours < 8) return '04:00-08:00';
    if (hours >= 8 && hours < 12) return '08:00-12:00';
    if (hours >= 12 && hours < 16) return '12:00-16:00';
    if (hours >= 16 && hours < 20) return '16:00-20:00';
    if (hours >= 20 && hours < 24) return '20:00-24:00';
    
    return 'Unknown';
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
    
    // Map zone labels back to zone codes for comparison
    const zoneLabelToCode = {
        'Americas': 'AM',
        'Europe': 'EU',
        'AR': 'AR',
        'Africa': 'AF',
        'SE Asia': 'AS',
        'Australasia': 'AU',
        'Others': 'Others'
    };
    const zoneOrder = ['AM', 'EU', 'AR', 'AF', 'AS', 'AU'];
    const targetZoneCode = zoneLabelToCode[zone] || zone;
    
    try {
        const db = firebase.firestore();
        
        // Fetch all registrations for this country
        const registrationsSnapshot = await db.collection('registrations').get();
        const countryRegistrations = [];
        
        registrationsSnapshot.forEach(doc => {
            const data = doc.data();
            const regCountry = data.Country || data.country || data['Country of Current Residence'] || '';
            const regZone = data.Zone || data.zone || data['Zone/Shreni'] || '';
            
            // Normalize the registration's zone to match how we count
            const normalizedRegZone = zoneOrder.find(z => regZone.toUpperCase().startsWith(z)) || 'Others';
            
            // Match country and zone (using normalized zone code)
            const zoneMatches = targetZoneCode === 'Others' 
                ? normalizedRegZone === 'Others'
                : normalizedRegZone === targetZoneCode;
            
            if (regCountry === country && zoneMatches) {
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
        // First, load summary counts for all periods
        await loadTransportationChangeSummary();
        
        // For "anytime" period, use optimized query limited to 1000 most recent changes
        if (!startTime) {
            // Use query with orderBy and limit instead of loading all documents
            // This shows the last 1000 transportation changes, not all historical changes
            // Note: orderBy only returns documents where the field exists
            let query = db.collection('registrations')
                .orderBy('travelupdateAt', 'desc')
                .limit(1000);
            
            const snapshot = await query.get();
            const changes = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.travelupdateAt) {
                    changes.push({
                        name: data.name || data['Full Name'] || 'Unknown',
                        uniqueId: data.uniqueId || doc.id,
                        email: data.email || data['Email address'] || '',
                        pickupLocation: data.arrivalPlace || data.pickupLocation || data['Pickup Location'] || data['Place of Arrival'] || 'Not Specified',
                        arrivalDate: data.arrivalDate || data['Arrival Date'] || data['Date of Arrival'] || '',
                        arrivalTime: data.arrivalTime || data['Arrival Time'] || data['Time of Arrival'] || '',
                        travelupdateAt: data.travelupdateAt
                    });
                }
            });
            
            displayTransportationChanges(changes);
            return;
        }
        
        // For day/week periods, use query
        let query = db.collection('registrations')
            .where('travelupdateAt', '>=', firebase.firestore.Timestamp.fromDate(startTime))
            .orderBy('travelupdateAt', 'desc');
        
        const snapshot = await query.get();
        
        const changes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.travelupdateAt) {
                changes.push({
                    name: data.name || data['Full Name'] || 'Unknown',
                    uniqueId: data.uniqueId || doc.id,
                    email: data.email || data['Email address'] || '',
                    pickupLocation: data.arrivalPlace || data.pickupLocation || data['Pickup Location'] || data['Place of Arrival'] || 'Not Specified',
                    arrivalDate: data.arrivalDate || data['Arrival Date'] || data['Date of Arrival'] || '',
                    arrivalTime: data.arrivalTime || data['Arrival Time'] || data['Time of Arrival'] || '',
                    travelupdateAt: data.travelupdateAt
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

// Load summary counts for transportation changes
async function loadTransportationChangeSummary() {
    if (!window.firebase || !firebase.firestore) {
        return;
    }
    
    const db = firebase.firestore();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    try {
        // Count changes in last day
        const dayQuery = db.collection('registrations')
            .where('travelupdateAt', '>=', firebase.firestore.Timestamp.fromDate(dayAgo));
        const daySnapshot = await dayQuery.get();
        const dayCount = daySnapshot.size;
        
        // Count changes in last week
        const weekQuery = db.collection('registrations')
            .where('travelupdateAt', '>=', firebase.firestore.Timestamp.fromDate(weekAgo));
        const weekSnapshot = await weekQuery.get();
        const weekCount = weekSnapshot.size;
        
        // Count total changes (all registrations with travelupdateAt)
        const totalQuery = db.collection('registrations')
            .where('travelupdateAt', '>', firebase.firestore.Timestamp.fromDate(new Date(0)));
        const totalSnapshot = await totalQuery.get();
        const totalCount = totalSnapshot.size;
        
        // Update UI
        const dayEl = document.getElementById('transportationChangesDay');
        if (dayEl) dayEl.textContent = dayCount;
        
        const weekEl = document.getElementById('transportationChangesWeek');
        if (weekEl) weekEl.textContent = weekCount;
        
        const totalEl = document.getElementById('totalTransportationChanges');
        if (totalEl) totalEl.textContent = totalCount;
        
    } catch (error) {
        console.error('Error loading transportation change summary:', error);
        // Fallback: try to get approximate counts
        try {
            const allSnapshot = await db.collection('registrations').get();
            let dayCount = 0;
            let weekCount = 0;
            let totalCount = 0;
            
            allSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.travelupdateAt) {
                    totalCount++;
                    const updateTime = data.travelupdateAt.toDate ? data.travelupdateAt.toDate() : null;
                    if (updateTime) {
                        if (updateTime >= dayAgo) dayCount++;
                        if (updateTime >= weekAgo) weekCount++;
                    }
                }
            });
            
            const dayEl = document.getElementById('transportationChangesDay');
            if (dayEl) dayEl.textContent = dayCount;
            
            const weekEl = document.getElementById('transportationChangesWeek');
            if (weekEl) weekEl.textContent = weekCount;
            
            const totalEl = document.getElementById('totalTransportationChanges');
            if (totalEl) totalEl.textContent = totalCount;
        } catch (fallbackError) {
            console.error('Error in fallback summary calculation:', fallbackError);
        }
    }
}

// Helper function to display transportation changes
function displayTransportationChanges(changes) {
    // Display changes
    const tbody = document.getElementById('transportationChangesTableBody');
    if (!tbody) return;
    
    let html = '';
    if (changes.length === 0) {
        html = '<tr><td colspan="7" style="text-align: center;">No changes found for the selected period.</td></tr>';
    } else {
        changes.forEach(change => {
            const updateTime = change.travelupdateAt ? 
                (change.travelupdateAt.toDate ? change.travelupdateAt.toDate().toLocaleString() : 'Unknown') : 
                'Unknown';
            
            // Add "Last changed" indicator to Praveshika ID
            const praveshikaIdDisplay = escapeHtml(change.uniqueId) + 
                ' <span style="color: #28a745; font-size: 0.85rem; font-weight: bold;">(Last changed)</span>';
            
            html += `
                <tr>
                    <td>${escapeHtml(change.name)}</td>
                    <td>${praveshikaIdDisplay}</td>
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
let currentCheckinParticipantUniqueId = null;
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
    'registration': 'Registration',
    'shulk_paid': 'Shulk Paid',
    'kit_collected': 'Kit Collected',
    'ganvesh_collected': 'Ganvesh Collected',
    'cloak_room': 'Cloak Room',
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
    
    // Volunteers: show only tabs their teams allow
    const teams = await getVolunteerTeams(user);
    if (!Array.isArray(teams) || teams.length === 0) {
        // No teams assigned: hide all checkin tabs
        tabs.forEach(tab => tab.style.display = 'none');
        return;
    }
    
    const teamMap = {
        'pickup_location': 'transportation',
        'registration': 'registration',
        'ganvesh_collected': 'ganvesh_collected',
        'cloak_room': 'cloak_room',
        'post_tour': 'post_tour'
    };
    
    let firstVisibleTabId = null;
    
    tabs.forEach(tab => {
        const checkinType = tab.getAttribute('data-checkin-type');
        const requiredTeam = teamMap[checkinType];
        if (requiredTeam && teams.includes(requiredTeam)) {
            tab.style.display = '';
            if (!firstVisibleTabId) {
                firstVisibleTabId = checkinType;
            }
        } else {
            tab.style.display = 'none';
        }
    });
    
    // Ensure currentCheckinType is valid for this volunteer
    if (firstVisibleTabId) {
        currentCheckinType = firstVisibleTabId;
        // For volunteers, automatically activate the first visible tab
        // For registration volunteers, this will be 'registration'
        // This ensures the tab is visually selected when the page loads
        switchCheckinType(firstVisibleTabId);
    }
    
    // Specifically ensure registration is selected if volunteer has registration access
    if (!isAdminUser && teams.includes('registration')) {
        currentCheckinType = 'registration';
        switchCheckinType('registration');
    }
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
    const registrationOptionsGroup = document.getElementById('registrationOptionsGroup');
    const cloakRoomFields = document.getElementById('cloakRoomFields');
    const cloakRoomCheckoutBtn = document.getElementById('cloakRoomCheckoutBtn');
    const checkinTypeDisplay = document.getElementById('checkinTypeDisplay');
    
    if (checkinTypeDisplay) {
        checkinTypeDisplay.textContent = CHECKIN_TYPE_LABELS[currentCheckinType] || currentCheckinType;
    }
    
    if (pickupLocationGroup) {
        pickupLocationGroup.style.display = currentCheckinType === 'pickup_location' ? 'block' : 'none';
    }
    
    if (registrationOptionsGroup) {
        registrationOptionsGroup.style.display = currentCheckinType === 'registration' ? 'block' : 'none';
    }
    
    if (cloakRoomFields) {
        cloakRoomFields.style.display = currentCheckinType === 'cloak_room' ? 'block' : 'none';
    }
    
    if (cloakRoomCheckoutBtn) {
        cloakRoomCheckoutBtn.style.display = currentCheckinType === 'cloak_room' ? 'inline-block' : 'none';
    }
}

// Get selected registration actions from checkboxes
function getSelectedRegistrationActions() {
    const types = [];
    
    const registrationCheckbox = document.getElementById('registrationCheckbox');
    const shulkPaidCheckbox = document.getElementById('shulkPaidCheckbox');
    const kitCollectedCheckbox = document.getElementById('kitCollectedCheckbox');
    
    if (registrationCheckbox && registrationCheckbox.checked) {
        types.push('registration');
    }
    if (shulkPaidCheckbox && shulkPaidCheckbox.checked) {
        types.push('shulk_paid');
    }
    if (kitCollectedCheckbox && kitCollectedCheckbox.checked) {
        types.push('kit_collected');
    }
    
    return types;
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
        // Normalize: uppercase and trim the ID
        const uppercasedId = uniqueId.toUpperCase().trim();
        const normalizedId = normalizePraveshikaId(uniqueId);
        
        // Search in registrations collection by normalized ID
        const registrationsQuery = await db.collection('registrations')
            .where('normalizedId', '==', normalizedId)
            .limit(1)
            .get();
        
        if (registrationsQuery.empty) {
            // Try direct document ID lookup with uppercased ID
            let regDoc = await db.collection('registrations').doc(uppercasedId).get();
            
            // If not found, try original ID as fallback
            if (!regDoc.exists) {
                regDoc = await db.collection('registrations').doc(uniqueId).get();
            }
            
            if (regDoc.exists) {
                displayParticipantInfo(regDoc.data(), regDoc.id);
            } else {
                showNotification(`Participant with Praveshika ID "${uppercasedId}" not found`, 'error');
            }
        } else {
            const regDoc = registrationsQuery.docs[0];
            const regData = regDoc.data();
            displayParticipantInfo(regData, regDoc.id);
        }
    } catch (error) {
        console.error('Error searching participant:', error);
        showNotification('Error searching participant: ' + error.message, 'error');
    }
}

// Search by name for check-in
async function searchByNameForCheckin() {
    const nameInput = document.getElementById('searchByNameCheckin');
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    if (!name) {
        showNotification('Please enter a name to search', 'error');
        return;
    }
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        const nameLower = name.toLowerCase();
        const results = [];
        
        // Fetch all registrations and filter client-side for case-insensitive partial name match
        const allRegistrations = await db.collection('registrations').limit(1000).get();
        
        allRegistrations.docs.forEach(doc => {
            const data = doc.data();
            const regName = (data.name || data['Full Name'] || '').toLowerCase();
            if (regName.includes(nameLower)) {
                results.push(doc);
            }
        });
        
        if (results.length === 0) {
            showNotification('No participants found with this name', 'info');
            clearParticipantInfo();
            return;
        }
        
        if (results.length === 1) {
            const regData = results[0].data();
            const uniqueId = regData.uniqueId || results[0].id;
            displayParticipantInfo(regData, uniqueId);
        } else {
            // Show list of results
            displayParticipantSearchResults(results, 'name');
        }
    } catch (error) {
        console.error('Error searching by name:', error);
        showNotification('Error searching: ' + error.message, 'error');
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
            // Email search: use emailToUids collection to find all Praveshika IDs linked to matching emails
            searchType = 'email';
            const emailLower = email.toLowerCase().trim();
            const allUids = new Set();
            
            // First, try exact match using emailToUids collection
            const emailToUidsDoc = await db.collection('emailToUids').doc(emailLower).get();
            
            if (emailToUidsDoc.exists) {
                // Found exact match - get all UIDs for this email
                const emailToUidsData = emailToUidsDoc.data();
                const uids = emailToUidsData.uids || [];
                uids.forEach(uid => allUids.add(uid));
            } else {
                // No exact match - try partial search in emailToUids collection
                // Get all emailToUids documents and filter for emails containing the search term
                const allEmailToUids = await db.collection('emailToUids').get();
                
                allEmailToUids.docs.forEach(doc => {
                    const emailData = doc.data();
                    const docEmail = (emailData.email || doc.id).toLowerCase();
                    if (docEmail.includes(emailLower)) {
                        const uids = emailData.uids || [];
                        uids.forEach(uid => allUids.add(uid));
                    }
                });
            }
            
            // Fetch all registration documents for these UIDs
            const registrationPromises = Array.from(allUids).map(uid => 
                db.collection('registrations').doc(uid).get()
                    .then(doc => doc.exists ? doc : null)
                    .catch(error => {
                        console.error(`Error fetching registration for ${uid}:`, error);
                        return null;
                    })
            );
            
            const registrationDocs = await Promise.all(registrationPromises);
            registrationDocs.forEach(doc => {
                if (doc) {
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
    if (!uniqueIds || !Array.isArray(uniqueIds) || uniqueIds.length === 0) {
        showNotification('No participants selected for batch check-in', 'error');
        return;
    }
    
    // Validate all IDs are strings
    const validIds = uniqueIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
    if (validIds.length === 0) {
        showNotification('No valid Praveshika IDs provided for batch check-in', 'error');
        return;
    }
    
    // Confirm batch check-in with explicit list of IDs
    const idsList = validIds.slice(0, 5).join(', ') + (validIds.length > 5 ? ` and ${validIds.length - 5} more` : '');
    const confirmMessage = `Are you sure you want to check in ${validIds.length} participant(s) with these Praveshika IDs?\n\n${idsList}\n\nThis will check in ONLY these specific IDs, not all users with the same email.`;
    if (!confirm(confirmMessage)) {
        return;
    }
    
    // Use existing batch check-in function with validated IDs
    await executeBatchCheckin(validIds);
    
    // Clear participant info display
    clearParticipantInfo();
}

// Display participant information
function displayParticipantInfo(regData, uniqueId) {
    const participantInfo = document.getElementById('participantInfo');
    const participantDetails = document.getElementById('participantDetails');
    const checkinForm = document.getElementById('checkinForm');
    
    if (!participantInfo || !participantDetails || !checkinForm) return;
    
    currentCheckinParticipantUniqueId = uniqueId;
    
    const name = regData.name || regData['Full Name'] || 'Unknown';
    const email = regData.email || regData['Email address'] || 'N/A';
    const country = regData.country || regData.Country || 'N/A';
    const shreni = regData.shreni || regData.Shreni || 'N/A';
    
    participantDetails.innerHTML = `
        <div class="participant-details">
            <div style="background: #e8f4f8; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #007bff;">
                <p style="margin: 0; font-weight: bold; color: #007bff;">Ready to Check In</p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.9em;">Praveshika ID: <strong>${escapeHtml(uniqueId)}</strong></p>
            </div>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Praveshika ID:</strong> <strong style="color: #007bff;">${escapeHtml(uniqueId)}</strong></p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Country:</strong> ${escapeHtml(country)}</p>
            <p><strong>Shreni:</strong> ${escapeHtml(shreni)}</p>
        </div>
    `;
    
    participantInfo.style.display = 'block';
    checkinForm.style.display = 'block';
    
    // Display the Praveshika ID in the check-in form for clarity
    const checkinTypeDisplay = document.getElementById('checkinTypeDisplay');
    if (checkinTypeDisplay) {
        const typeLabel = CHECKIN_TYPE_LABELS[currentCheckinType] || currentCheckinType;
        checkinTypeDisplay.textContent = typeLabel;
    }
    
    // Add a clear indicator of which Praveshika ID will be checked in
    const formHeader = checkinForm.querySelector('h3');
    if (formHeader && !formHeader.dataset.praveshikaIdDisplayed) {
        const idDisplay = document.createElement('div');
        idDisplay.style.cssText = 'background: #fff3cd; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; border-left: 4px solid #ffc107;';
        idDisplay.innerHTML = `<strong>Checking in:</strong> <span style="color: #007bff; font-weight: bold;">${escapeHtml(uniqueId)}</span>`;
        checkinForm.insertBefore(idDisplay, checkinForm.querySelector('form'));
        formHeader.dataset.praveshikaIdDisplayed = 'true';
    } else if (formHeader && formHeader.dataset.praveshikaIdDisplayed) {
        // Update the ID display if it already exists
        const existingDisplay = checkinForm.querySelector('div[style*="background: #fff3cd"]');
        if (existingDisplay) {
            existingDisplay.innerHTML = `<strong>Checking in:</strong> <span style="color: #007bff; font-weight: bold;">${escapeHtml(uniqueId)}</span>`;
        }
    }
    
    // Check if already checked in
    checkCheckinStatus(uniqueId);
}

// Clear participant info
function clearParticipantInfo() {
    currentCheckinParticipantUniqueId = null;
    const participantInfo = document.getElementById('participantInfo');
    const checkinForm = document.getElementById('checkinForm');
    
    if (participantInfo) participantInfo.style.display = 'none';
    if (checkinForm) {
        checkinForm.style.display = 'none';
        // Remove the Praveshika ID display indicator
        const idDisplay = checkinForm.querySelector('div[style*="background: #fff3cd"]');
        if (idDisplay) {
            idDisplay.remove();
        }
        const formHeader = checkinForm.querySelector('h3');
        if (formHeader) {
            formHeader.dataset.praveshikaIdDisplayed = 'false';
        }
    }
    
    // Clear inputs
    const barcodeInput = document.getElementById('barcodeInput');
    const manualInput = document.getElementById('manualPraveshikaId');
    const nameSearchInput = document.getElementById('searchByNameCheckin');
    if (barcodeInput) barcodeInput.value = '';
    if (manualInput) manualInput.value = '';
    if (nameSearchInput) nameSearchInput.value = '';
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
    // Validate that we have a specific Praveshika ID selected
    if (!currentCheckinParticipantUniqueId || typeof currentCheckinParticipantUniqueId !== 'string' || currentCheckinParticipantUniqueId.trim() === '') {
        showNotification('Please search for a participant first', 'error');
        return;
    }
    
    const uniqueIdToCheckIn = currentCheckinParticipantUniqueId.trim();
    
    if (!window.firebase || !firebase.auth || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('Please log in to perform checkin', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Verify the registration exists for this specific Praveshika ID
        const regDoc = await db.collection('registrations').doc(uniqueIdToCheckIn).get();
        if (!regDoc.exists) {
            showNotification(`Participant with Praveshika ID "${uniqueIdToCheckIn}" not found`, 'error');
            return;
        }
        const regData = regDoc.data();
        
        // Determine types to process (registration automatically includes shulk_paid and kit_collected)
        let typesToProcess = [];
        if (currentCheckinType === 'registration') {
            typesToProcess = getSelectedRegistrationActions();
            if (!typesToProcess.length) {
                showNotification('Registration check-in is required', 'error');
                return;
            }
            // Registration now automatically includes shulk_paid and kit_collected
            // No need for separate checks
        } else {
            typesToProcess = [currentCheckinType];
        }
        
        // Permission check per type
        for (const type of typesToProcess) {
            const hasAccess = await hasAccessToCheckinType(user, type);
            if (!hasAccess) {
                showNotification(`You do not have permission to perform ${CHECKIN_TYPE_LABELS[type] || type}`, 'error');
                return;
            }
        }
        
        // Common form values
        const notes = document.getElementById('checkinNotes')?.value.trim() || null;
        const pickupLocationInput = document.getElementById('checkinPickupLocation')?.value.trim();
        const tagId = document.getElementById('checkinTagId')?.value.trim();
        const itemCountRaw = document.getElementById('checkinItemCount')?.value;
        const itemCount = itemCountRaw ? parseInt(itemCountRaw, 10) : null;
        
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const checkedInByName = userData.volunteerName || userData.name || user.email || 'Unknown';
        
        const successTypes = [];
        
        for (const type of typesToProcess) {
            // Enforce registration prerequisite for downstream types
            // Note: shulk_paid and kit_collected are now part of registration, so they don't need this check
            const typesRequiringRegistration = ['ganvesh_collected', 'cloak_room'];
            if (type !== 'registration' && typesRequiringRegistration.includes(type)) {
                const registrationCheckin = await db.collection('checkins')
                    .where('uniqueId', '==', uniqueIdToCheckIn)
                    .where('checkinType', '==', 'registration')
                    .limit(1)
                    .get();
                
                if (registrationCheckin.empty) {
                    showNotification('Registration check-in must be completed before this action.', 'error');
                    return;
                }
            }
            
            // Duplicate prevention
            if (type === 'cloak_room') {
                const existingCheckinQuery = await db.collection('checkins')
                    .where('uniqueId', '==', uniqueIdToCheckIn)
                    .where('checkinType', '==', 'cloak_room')
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();
                
                if (!existingCheckinQuery.empty) {
                    const existingCheckin = existingCheckinQuery.docs[0].data();
                    if (!existingCheckin.checkedOutAt) {
                        const timestamp = existingCheckin.timestamp?.toDate();
                        const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
                        showNotification(`Already checked in for Cloak Room at ${timeStr}. Please checkout first.`, 'error');
                        return;
                    }
                }
            } else if (type !== 'pickup_location') {
                const existingCheckinQuery = await db.collection('checkins')
                    .where('uniqueId', '==', uniqueIdToCheckIn)
                    .where('checkinType', '==', type)
                    .limit(1)
                    .get();
                
                if (!existingCheckinQuery.empty) {
                    const existingCheckin = existingCheckinQuery.docs[0].data();
                    const timestamp = existingCheckin.timestamp?.toDate();
                    const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
                    const typeLabel = CHECKIN_TYPE_LABELS[type] || type;
                    showNotification(`Already checked in for ${typeLabel} at ${timeStr}.`, 'info');
                    continue; // Skip duplicates but continue other actions
                }
            }
            
            const checkinData = {
                uniqueId: uniqueIdToCheckIn,
                checkinType: type,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                checkedInBy: user.uid,
                checkedInByName: checkedInByName,
                notes: notes || null
            };
            
            // Type specific fields
            if (type === 'pickup_location') {
                if (pickupLocationInput) {
                    checkinData.pickupLocation = pickupLocationInput;
                } else {
                    checkinData.pickupLocation = regData.normalizedPickupLocation ||
                        regData.pickupLocation || regData['Pickup Location'] || null;
                }
            }
            
            if (type === 'cloak_room') {
                if (itemCount) checkinData.itemCount = itemCount;
                if (tagId) checkinData.tagId = tagId;
            }
            
            const checkinId = `${uniqueIdToCheckIn}_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            await db.collection('checkins').doc(checkinId).set(checkinData);
            successTypes.push(type);
        }
        
        if (successTypes.length) {
            const participantName = regData.name || regData['Full Name'] || uniqueIdToCheckIn;
            const labels = successTypes.map(t => CHECKIN_TYPE_LABELS[t] || t).join(', ');
            showNotification(`Check-in successful for ${participantName} (${uniqueIdToCheckIn}): ${labels}`, 'success');
        }
        
        // Clear form and participant display
        clearCheckinForm();
        clearParticipantInfo();
        
        // Reload recent checkins for current visible tab
        await loadRecentCheckins(currentCheckinType);
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
    
    const itemCount = document.getElementById('checkinItemCount');
    const tagId = document.getElementById('checkinTagId');
    if (itemCount) itemCount.value = '';
    if (tagId) tagId.value = '';
    
    // Reset registration checkboxes
    const registrationCheckbox = document.getElementById('registrationCheckbox');
    const shulkPaidCheckbox = document.getElementById('shulkPaidCheckbox');
    const kitCollectedCheckbox = document.getElementById('kitCollectedCheckbox');
    if (registrationCheckbox) registrationCheckbox.checked = false;
    if (shulkPaidCheckbox) shulkPaidCheckbox.checked = false;
    if (kitCollectedCheckbox) kitCollectedCheckbox.checked = false;
}

// Perform Cloak Room checkout
async function performCloakRoomCheckout() {
    if (!currentCheckinParticipantUniqueId || typeof currentCheckinParticipantUniqueId !== 'string' || currentCheckinParticipantUniqueId.trim() === '') {
        showNotification('Please search for a participant first', 'error');
        return;
    }
    
    const uniqueId = currentCheckinParticipantUniqueId.trim();
    
    if (!window.firebase || !firebase.auth || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('Please log in to perform checkout', 'error');
        return;
    }
    
    // Check permissions
    const hasAccess = await hasAccessToCheckinType(user, 'cloak_room');
    if (!hasAccess) {
        showNotification('You do not have permission to perform cloak room checkout', 'error');
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Find the most recent cloak room check-in for this participant
        const checkinQuery = await db.collection('checkins')
            .where('uniqueId', '==', uniqueId)
            .where('checkinType', '==', 'cloak_room')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        
        if (checkinQuery.empty) {
            showNotification('No cloak room check-in found for this participant. Please check in first.', 'error');
            return;
        }
        
        const checkinDoc = checkinQuery.docs[0];
        const checkinData = checkinDoc.data();
        
        // Check if already checked out
        if (checkinData.checkedOutAt) {
            const checkoutTime = checkinData.checkedOutAt.toDate();
            showNotification(`Already checked out at ${checkoutTime.toLocaleString()}`, 'error');
            return;
        }
        
        // Get user data for checkedOutByName
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        const checkedOutByName = userData.volunteerName || userData.name || user.email || 'Unknown';
        
        // Update check-in with checkout information
        await checkinDoc.ref.update({
            checkedOutAt: firebase.firestore.FieldValue.serverTimestamp(),
            checkedOutBy: user.uid,
            checkedOutByName: checkedOutByName
        });
        
        // Get participant name for notification
        const regDoc = await db.collection('registrations').doc(uniqueId).get();
        const regData = regDoc.exists ? regDoc.data() : {};
        const participantName = regData.name || regData['Full Name'] || uniqueId;
        
        showNotification(`Checkout successful for ${participantName} (${uniqueId})!`, 'success');
        
        // Reload recent checkins
        await loadRecentCheckins('cloak_room');
        
        // Reload history if on history view
        await loadCheckinHistory();
        
    } catch (error) {
        console.error('Error performing checkout:', error);
        showNotification('Error performing checkout: ' + error.message, 'error');
    }
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
        
        const checkinForm = document.getElementById('checkinForm');
        const checkinFormElement = document.getElementById('checkinFormElement');
        const submitButton = checkinFormElement?.querySelector('button[type="submit"]');
        
        if (!checkinsQuery.empty) {
            const checkinDoc = checkinsQuery.docs[0];
            const checkinDocId = checkinDoc.id;
            const checkinData = checkinDoc.data();
            const timestamp = checkinData.timestamp?.toDate();
            const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
            const typeLabel = CHECKIN_TYPE_LABELS[currentCheckinType] || currentCheckinType;
            
            // Get participant name for the undo function
            const participantName = document.getElementById('participantDetails')?.querySelector('.checkin-item-name')?.textContent || uniqueId;
            
            // Show status in the form
            const participantDetails = document.getElementById('participantDetails');
            if (participantDetails) {
                const statusDiv = document.createElement('div');
                statusDiv.id = 'checkinStatusDiv';
                statusDiv.style.cssText = 'background: #f8d7da; padding: 0.75rem; border-radius: 4px; margin-top: 1rem; border-left: 4px solid #dc3545;';
                statusDiv.innerHTML = `
                    <p style="margin: 0; color: #721c24; font-weight: bold;">⚠️ Already Checked In</p>
                    <p style="margin: 0.5rem 0 0 0; color: #721c24; font-size: 0.9em;">
                        This participant is already checked in for <strong>${escapeHtml(typeLabel)}</strong> at ${escapeHtml(timeStr)}.
                    </p>
                    <p style="margin: 0.5rem 0 0 0; color: #721c24; font-size: 0.85em;">
                        Duplicate check-ins are not allowed for the same check-in type.
                    </p>
                    <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                        <button type="button" class="btn" style="background-color: #dc3545; color: white; padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer;" 
                                onclick="undoCheckinFromStatus('${escapeHtml(checkinDocId)}', '${escapeHtml(uniqueId)}', '${escapeHtml(participantName.replace(/'/g, "\\'"))}')">
                            Undo Check-in
                        </button>
                        <button type="button" class="btn btn-secondary" style="padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;" 
                                onclick="clearParticipantInfo()">
                            Clear
                        </button>
                    </div>
                `;
                
                // Remove existing status if any
                const existingStatus = participantDetails.querySelector('#checkinStatusDiv');
                if (existingStatus) {
                    existingStatus.remove();
                }
                participantDetails.appendChild(statusDiv);
            }
            
            // Disable the submit button
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.style.opacity = '0.6';
                submitButton.style.cursor = 'not-allowed';
                submitButton.textContent = 'Already Checked In';
            }
        } else {
            // Remove status message if exists
            const participantDetails = document.getElementById('participantDetails');
            if (participantDetails) {
                const existingStatus = participantDetails.querySelector('#checkinStatusDiv');
                if (existingStatus) {
                    existingStatus.remove();
                }
            }
            
            // Enable the submit button
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
                submitButton.style.cursor = 'pointer';
                submitButton.textContent = 'Check In';
            }
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
        
        const isAdminUser = await isAdmin(user);
        
        let snapshot;
        
        if (isAdminUser) {
            // Admins: show all recent checkins
            snapshot = await db.collection('checkins')
            .where('checkinType', '==', checkinType)
            .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
        } else {
            // Volunteers: only show checkins they created
            // Query by checkedInBy, filter by checkinType client-side, then sort by timestamp
            const allUserCheckins = await db.collection('checkins')
                .where('checkedInBy', '==', user.uid)
                .get();
            
            // Filter by checkinType, sort by timestamp, then limit
            const filteredDocs = allUserCheckins.docs
                .filter(doc => {
                    const data = doc.data();
                    return data.checkinType === checkinType;
                })
                .sort((a, b) => {
                    const aTime = a.data().timestamp?.toMillis() || 0;
                    const bTime = b.data().timestamp?.toMillis() || 0;
                    return bTime - aTime; // Descending order
                })
                .slice(0, limit);
            
            // Create a mock snapshot-like object
            snapshot = {
                docs: filteredDocs,
                empty: filteredDocs.length === 0
            };
        }
        
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
            const docId = doc.id;
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
        let errorMessage = 'Error loading recent checkins';
        if (error.code === 'failed-precondition') {
            errorMessage = 'Database index required. Please contact administrator.';
        } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
        }
        recentCheckinsList.innerHTML = `<p style="color: #dc3545;">${errorMessage}</p>`;
    }
}

// Undo/Cancel a checkin (from recent checkins list)
async function undoCheckin(checkinDocId, uniqueId, participantName) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('Please log in to undo checkin', 'error');
        return;
    }
    
    // Confirm with user
    const confirmed = confirm(`Are you sure you want to undo the check-in for ${participantName} (${uniqueId})?\n\nThis action cannot be undone.`);
    if (!confirmed) {
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Delete the checkin document
        await db.collection('checkins').doc(checkinDocId).delete();
        
        showNotification(`Check-in undone for ${participantName} (${uniqueId})`, 'success');
        
        // Use the same reload mechanism as after check-in
        clearCheckinForm();
        clearParticipantInfo();
        await loadRecentCheckins(currentCheckinType);
        await loadCheckinHistory();
        
    } catch (error) {
        console.error('Error undoing checkin:', error);
        if (error.code === 'permission-denied') {
            showNotification('You do not have permission to undo this check-in', 'error');
        } else {
            showNotification('Error undoing check-in: ' + error.message, 'error');
        }
    }
}

// Undo/Cancel a checkin (from participant status view)
async function undoCheckinFromStatus(checkinDocId, uniqueId, participantName) {
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const user = firebase.auth().currentUser;
    if (!user) {
        showNotification('Please log in to undo checkin', 'error');
        return;
    }
    
    // Confirm with user
    const confirmed = confirm(`Are you sure you want to undo the check-in for ${participantName} (${uniqueId})?\n\nThis action cannot be undone.`);
    if (!confirmed) {
        return;
    }
    
    try {
        const db = firebase.firestore();
        
        // Delete the checkin document
        await db.collection('checkins').doc(checkinDocId).delete();
        
        showNotification(`Check-in undone for ${participantName} (${uniqueId})`, 'success');
        
        // Use the same reload mechanism as after check-in
        clearCheckinForm();
        clearParticipantInfo();
        await loadRecentCheckins(currentCheckinType);
        await loadCheckinHistory();
        
    } catch (error) {
        console.error('Error undoing checkin:', error);
        if (error.code === 'permission-denied') {
            showNotification('You do not have permission to undo this check-in', 'error');
        } else {
            showNotification('Error undoing check-in: ' + error.message, 'error');
        }
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
    
    if (!window.firebase || !firebase.firestore) {
        showNotification('Firebase not initialized', 'error');
        return;
    }
    
    const batchPreview = document.getElementById('batchPreview');
    if (batchPreview) {
        batchPreview.style.display = 'block';
        batchPreview.innerHTML = '<p>Loading participant profiles...</p>';
    }
    
    try {
        const db = firebase.firestore();
        const participantData = [];
        const alreadyCheckedIn = [];
        const notFound = [];
        
        // Fetch all participant data and check checkin status
        for (const uniqueId of ids) {
            try {
                // Get registration data
                const regDoc = await db.collection('registrations').doc(uniqueId).get();
                if (!regDoc.exists) {
                    notFound.push(uniqueId);
                    continue;
                }
                
                const regData = regDoc.data();
                const name = regData.name || regData['Full Name'] || 'Unknown';
                const email = regData.email || regData['Email address'] || 'N/A';
                const country = regData.country || regData.Country || 'N/A';
                const shreni = regData.shreni || regData.Shreni || 'N/A';
                
                // Check if already checked in for current checkin type
                let isAlreadyCheckedIn = false;
                let checkinTimestamp = null;
                let checkedInTypes = [];
                
                if (currentCheckinType === 'registration') {
                    // For registration, check all three types
                    const typesToCheck = ['registration', 'shulk_paid', 'kit_collected'];
                    for (const type of typesToCheck) {
                        const existingCheckinQuery = await db.collection('checkins')
                            .where('uniqueId', '==', uniqueId)
                            .where('checkinType', '==', type)
                            .limit(1)
                            .get();
                        
                        if (!existingCheckinQuery.empty) {
                            isAlreadyCheckedIn = true;
                            checkedInTypes.push(type);
                            const existingCheckin = existingCheckinQuery.docs[0].data();
                            if (!checkinTimestamp) {
                                checkinTimestamp = existingCheckin.timestamp?.toDate();
                            }
                        }
                    }
                } else if (currentCheckinType === 'cloak_room') {
                    const existingCheckinQuery = await db.collection('checkins')
                        .where('uniqueId', '==', uniqueId)
                        .where('checkinType', '==', 'cloak_room')
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .get();
                    
                    if (!existingCheckinQuery.empty) {
                        const existingCheckin = existingCheckinQuery.docs[0].data();
                        if (!existingCheckin.checkedOutAt) {
                            isAlreadyCheckedIn = true;
                            checkinTimestamp = existingCheckin.timestamp?.toDate();
                            checkedInTypes.push('cloak_room');
                        }
                    }
                } else {
                    const existingCheckinQuery = await db.collection('checkins')
                        .where('uniqueId', '==', uniqueId)
                        .where('checkinType', '==', currentCheckinType)
                        .limit(1)
                        .get();
                    
                    if (!existingCheckinQuery.empty) {
                        isAlreadyCheckedIn = true;
                        const existingCheckin = existingCheckinQuery.docs[0].data();
                        checkinTimestamp = existingCheckin.timestamp?.toDate();
                        checkedInTypes.push(currentCheckinType);
                    }
                }
                
                if (isAlreadyCheckedIn) {
                    alreadyCheckedIn.push({
                        uniqueId,
                        name,
                        email,
                        country,
                        shreni,
                        timestamp: checkinTimestamp,
                        checkedInTypes: checkedInTypes
                    });
                } else {
                    participantData.push({
                        uniqueId,
                        name,
                        email,
                        country,
                        shreni
                    });
                }
            } catch (error) {
                console.error(`Error processing ${uniqueId}:`, error);
                notFound.push(uniqueId);
            }
        }
        
        // Store valid IDs globally
        window.batchCheckinIds = participantData.map(p => p.uniqueId);
        
        // Build preview HTML
        let html = `
            <div class="batch-preview">
                <h4>Batch Checkin Preview</h4>
                <p>Found ${ids.length} participant(s) | Valid: ${participantData.length} | Already Checked In: ${alreadyCheckedIn.length} | Not Found: ${notFound.length}</p>
        `;
        
        // Show error for already checked-in participants
        if (alreadyCheckedIn.length > 0) {
            html += `
                <div style="margin: 1rem 0; padding: 1rem; background: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">
                    <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #721c24;">
                        ⚠️ The following participants are already checked in. Please remove them before proceeding:
                    </p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
            `;
            
            alreadyCheckedIn.forEach(participant => {
                const timeStr = participant.timestamp ? participant.timestamp.toLocaleString() : 'Unknown';
                const typesStr = participant.checkedInTypes && participant.checkedInTypes.length > 0 
                    ? participant.checkedInTypes.map(t => CHECKIN_TYPE_LABELS[t] || t).join(', ')
                    : CHECKIN_TYPE_LABELS[currentCheckinType] || currentCheckinType;
                html += `
                    <div style="background: white; padding: 0.75rem; border-radius: 4px; border: 2px solid #dc3545;">
                        <p style="margin: 0 0 0.25rem 0; font-weight: bold; color: #dc3545;">${escapeHtml(participant.uniqueId)}</p>
                        <p style="margin: 0 0 0.25rem 0; font-size: 0.9rem;">${escapeHtml(participant.name)}</p>
                        <p style="margin: 0 0 0.25rem 0; font-size: 0.8rem; color: #666;">Types: ${escapeHtml(typesStr)}</p>
                        <p style="margin: 0; font-size: 0.8rem; color: #666;">Checked in: ${escapeHtml(timeStr)}</p>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Show not found participants
        if (notFound.length > 0) {
            html += `
                <div style="margin: 1rem 0; padding: 0.75rem; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <p style="margin: 0 0 0.5rem 0; font-weight: bold; color: #856404;">
                        ⚠️ The following Praveshika IDs were not found:
                    </p>
                    <p style="margin: 0; font-size: 0.9rem;">${notFound.map(id => escapeHtml(id)).join(', ')}</p>
                </div>
            `;
        }
        
        // Show valid participants with profiles
        if (participantData.length > 0) {
            html += `
                <div style="margin: 1rem 0;">
                    <h5 style="margin-bottom: 0.75rem;">Participants to Check In (${participantData.length}):</h5>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.75rem;">
            `;
            
            participantData.forEach(participant => {
                html += `
                    <div style="background: #e8f4f8; padding: 0.75rem; border-radius: 4px; border-left: 4px solid #007bff;">
                        <p style="margin: 0 0 0.25rem 0; font-weight: bold; color: #007bff;">${escapeHtml(participant.uniqueId)}</p>
                        <p style="margin: 0 0 0.25rem 0; font-size: 0.9rem;"><strong>Name:</strong> ${escapeHtml(participant.name)}</p>
                        <p style="margin: 0 0 0.25rem 0; font-size: 0.85rem;"><strong>Email:</strong> ${escapeHtml(participant.email)}</p>
                        <p style="margin: 0 0 0.25rem 0; font-size: 0.85rem;"><strong>Country:</strong> ${escapeHtml(participant.country)}</p>
                        <p style="margin: 0; font-size: 0.85rem;"><strong>Shreni:</strong> ${escapeHtml(participant.shreni)}</p>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
            
            // Only show confirmation checkboxes and button if there are valid participants and no already checked-in
            if (alreadyCheckedIn.length === 0) {
                html += `
                    <div style="margin: 1rem 0; padding: 0.75rem; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                        <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #856404;">
                            Please confirm the following for this batch:
                        </p>
                        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; font-size: 0.9rem;">
                            <input type="checkbox" id="batchShulkPaidConfirm" onchange="updateBatchConfirmState()">
                            <span>All shulk paid</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                            <input type="checkbox" id="batchKitCollectedConfirm" onchange="updateBatchConfirmState()">
                            <span>All kits collected</span>
                        </label>
                    </div>
                    <button id="batchConfirmButton" class="btn btn-primary" onclick="executeBatchCheckinFromPreview()" disabled style="opacity: 0.6; cursor: not-allowed;">
                        Confirm Batch Checkin
                    </button>
                `;
            } else {
                html += `
                    <div style="margin: 1rem 0; padding: 0.75rem; background: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">
                        <p style="margin: 0; font-weight: bold; color: #721c24;">
                            Cannot proceed: Please remove already checked-in participants from the list above.
                        </p>
                    </div>
                `;
            }
        } else {
            html += `
                <div style="margin: 1rem 0; padding: 0.75rem; background: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">
                    <p style="margin: 0; font-weight: bold; color: #721c24;">
                        No valid participants to check in. Please fix the errors above and try again.
                    </p>
                </div>
            `;
        }
        
        html += `
                <button class="btn btn-secondary" onclick="cancelBatchCheckin()" style="margin-top: 1rem;">Cancel</button>
            </div>
        `;
        
        if (batchPreview) {
            batchPreview.innerHTML = html;
            // Initialize confirm button state if applicable
            if (participantData.length > 0 && alreadyCheckedIn.length === 0) {
                setTimeout(updateBatchConfirmState, 0);
            }
        }
    } catch (error) {
        console.error('Error processing batch checkin:', error);
        showNotification('Error processing batch checkin: ' + error.message, 'error');
        if (batchPreview) {
            batchPreview.innerHTML = '<p style="color: #dc3545;">Error loading participant data. Please try again.</p>';
        }
    }
}

// Execute batch checkin from preview
async function executeBatchCheckinFromPreview() {
    // Ensure confirmation checkboxes are checked
    const shulkCheckbox = document.getElementById('batchShulkPaidConfirm');
    const kitCheckbox = document.getElementById('batchKitCollectedConfirm');
    if (shulkCheckbox && kitCheckbox) {
        if (!shulkCheckbox.checked || !kitCheckbox.checked) {
            showNotification('Please confirm that all shulk are paid and all kits are collected before proceeding.', 'error');
            return;
        }
    }
    
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
            // Validate the uniqueId is a non-empty string
            if (!uniqueId || typeof uniqueId !== 'string' || uniqueId.trim() === '') {
                results.push({ uniqueId: uniqueId || 'Invalid', status: 'failed', error: 'Invalid Praveshika ID format' });
                failCount++;
                continue;
            }
            
            const validatedUniqueId = uniqueId.trim();
            
            // Get participant data - verify this specific Praveshika ID exists
            const regDoc = await db.collection('registrations').doc(validatedUniqueId).get();
            if (!regDoc.exists) {
                results.push({ uniqueId: validatedUniqueId, status: 'failed', error: 'Participant not found' });
                failCount++;
                continue;
            }
            
            // For registration type, we'll check duplicates per type later
            // For other types, check if already checked in
            if (currentCheckinType !== 'registration') {
                if (currentCheckinType === 'cloak_room') {
                    // Get the most recent cloak room check-in
                    const existingCheckinQuery = await db.collection('checkins')
                        .where('uniqueId', '==', validatedUniqueId)
                        .where('checkinType', '==', 'cloak_room')
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .get();
                    
                    if (!existingCheckinQuery.empty) {
                        const existingCheckin = existingCheckinQuery.docs[0].data();
                        // If not checked out, prevent duplicate check-in
                        if (!existingCheckin.checkedOutAt) {
                            const timestamp = existingCheckin.timestamp?.toDate();
                            const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
                            results.push({ uniqueId: validatedUniqueId, status: 'skipped', error: `Already checked in at ${timeStr}. Checkout required first.` });
                            failCount++;
                            continue;
                        }
                        // If checked out, allow new check-in (continue below)
                    }
                } else {
                    // For other check-in types, prevent duplicates
                    const existingCheckinQuery = await db.collection('checkins')
                        .where('uniqueId', '==', validatedUniqueId)
                        .where('checkinType', '==', currentCheckinType)
                        .limit(1)
                        .get();
                    
                    if (!existingCheckinQuery.empty) {
                        const existingCheckin = existingCheckinQuery.docs[0].data();
                        const timestamp = existingCheckin.timestamp?.toDate();
                        const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown';
                        results.push({ uniqueId: validatedUniqueId, status: 'skipped', error: `Already checked in at ${timeStr}` });
                        failCount++;
                        continue;
                    }
                }
            }
            
            const regData = regDoc.data();
            
            // Determine types to process (for registration, use confirmation checkboxes)
            let typesToProcess = [];
            if (currentCheckinType === 'registration') {
                // Get confirmation checkboxes from batch preview
                const shulkCheckbox = document.getElementById('batchShulkPaidConfirm');
                const kitCheckbox = document.getElementById('batchKitCollectedConfirm');
                
                // Always include registration if we're on registration tab
                typesToProcess.push('registration');
                
                // Include shulk_paid and kit_collected if checkboxes are checked
                if (shulkCheckbox && shulkCheckbox.checked) {
                    typesToProcess.push('shulk_paid');
                }
                if (kitCheckbox && kitCheckbox.checked) {
                    typesToProcess.push('kit_collected');
                }
            } else {
                typesToProcess = [currentCheckinType];
            }
            
            // Check if Registration check-in is required for certain types
            const typesRequiringRegistration = ['ganvesh_collected', 'cloak_room'];
            if (typesRequiringRegistration.includes(currentCheckinType)) {
                const registrationCheckin = await db.collection('checkins')
                    .where('uniqueId', '==', validatedUniqueId)
                    .where('checkinType', '==', 'registration')
                    .limit(1)
                    .get();
                
                if (registrationCheckin.empty) {
                    results.push({ uniqueId: validatedUniqueId, status: 'failed', error: 'Registration check-in required first' });
                    failCount++;
                    continue;
                }
            }
            
            // Process each type
            const successTypes = [];
            for (const type of typesToProcess) {
                // Check for duplicates for each type
                if (type === 'cloak_room') {
                    const existingCheckinQuery = await db.collection('checkins')
                        .where('uniqueId', '==', validatedUniqueId)
                        .where('checkinType', '==', 'cloak_room')
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .get();
                    
                    if (!existingCheckinQuery.empty) {
                        const existingCheckin = existingCheckinQuery.docs[0].data();
                        if (!existingCheckin.checkedOutAt) {
                            continue; // Skip this type
                        }
                    }
                } else {
                    const existingCheckinQuery = await db.collection('checkins')
                        .where('uniqueId', '==', validatedUniqueId)
                        .where('checkinType', '==', type)
                        .limit(1)
                        .get();
                    
                    if (!existingCheckinQuery.empty) {
                        continue; // Skip this type (already checked in)
                    }
                }
                
                // Build checkin data
                const checkinData = {
                    uniqueId: validatedUniqueId,
                    checkinType: type,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    checkedInBy: user.uid,
                    checkedInByName: checkedInByName,
                    notes: null
                };
                
                // Add type-specific fields
                if (type === 'pickup_location') {
                    checkinData.pickupLocation = regData.pickupLocation || regData['Pickup Location'] || null;
                }
                
                // Create checkin document
                const checkinId = `${validatedUniqueId}_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                await db.collection('checkins').doc(checkinId).set(checkinData);
                successTypes.push(type);
            }
            
            if (successTypes.length > 0) {
                results.push({ uniqueId: validatedUniqueId, status: 'success', types: successTypes });
                successCount++;
            } else {
                results.push({ uniqueId: validatedUniqueId, status: 'skipped', error: 'All types already checked in' });
                failCount++;
            }
        } catch (error) {
            console.error(`Error checking in ${uniqueId}:`, error);
            results.push({ uniqueId, status: 'failed', error: error.message });
            failCount++;
        }
    }
    
    // Show results
    if (batchPreview) {
        const skippedCount = results.filter(r => r.status === 'skipped').length;
        const actualFailCount = results.filter(r => r.status === 'failed').length;
        let html = `
            <div class="batch-results">
                <h4>Batch Checkin Results</h4>
                <p><strong>Total:</strong> ${ids.length} | <strong>Success:</strong> ${successCount} | <strong>Skipped (Already Checked In):</strong> ${skippedCount} | <strong>Failed:</strong> ${actualFailCount}</p>
                <div class="batch-results-list">
        `;
        
        results.forEach(result => {
            let statusClass = 'error';
            let statusText = 'Failed';
            if (result.status === 'success') {
                statusClass = 'success';
                statusText = 'Success';
            } else if (result.status === 'skipped') {
                statusClass = 'warning';
                statusText = 'Skipped (Already Checked In)';
            }
            html += `
                <div class="batch-result-item ${statusClass}">
                    <span>${escapeHtml(result.uniqueId)}</span>
                    <span>${statusText}</span>
                    ${result.error ? `<span>${escapeHtml(result.error)}</span>` : ''}
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

// Update state of batch confirm button based on shulk/kit confirmation checkboxes
function updateBatchConfirmState() {
    const shulkCheckbox = document.getElementById('batchShulkPaidConfirm');
    const kitCheckbox = document.getElementById('batchKitCollectedConfirm');
    const confirmButton = document.getElementById('batchConfirmButton');
    
    if (!confirmButton || !shulkCheckbox || !kitCheckbox) return;
    
    const enabled = shulkCheckbox.checked && kitCheckbox.checked;
    confirmButton.disabled = !enabled;
    confirmButton.style.opacity = enabled ? '1' : '0.6';
    confirmButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
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
        
        const isAdminUser = await isAdmin(user);
        
        // Get filters
        const filterType = document.getElementById('historyFilterType')?.value || '';
        const filterSearch = document.getElementById('historyFilterSearch')?.value.trim() || '';
        
        let snapshot;
        let totalCount;
        
        if (isAdminUser) {
            // Admins: show all checkins
        let query = db.collection('checkins');
        
        // Apply filters
        if (filterType) {
            query = query.where('checkinType', '==', filterType);
        }
        
        // Order by timestamp
        query = query.orderBy('timestamp', 'desc');
        
        // Get total count (for pagination)
        const totalSnapshot = await query.get();
            totalCount = totalSnapshot.size;
        
        // Apply pagination
        const startAfter = (page - 1) * historyPageSize;
        if (startAfter > 0) {
            const startDoc = totalSnapshot.docs[startAfter - 1];
            query = query.startAfter(startDoc);
        }
        query = query.limit(historyPageSize);
        
            snapshot = await query.get();
        } else {
            // Volunteers: only show checkins they created
            // Query by checkedInBy, then filter client-side to avoid index requirements
            const allUserCheckins = await db.collection('checkins')
                .where('checkedInBy', '==', user.uid)
                .get();
            
            // Filter by checkinType if provided, then sort by timestamp
            let filteredDocs = Array.from(allUserCheckins.docs);
            
            if (filterType) {
                filteredDocs = filteredDocs.filter(doc => doc.data().checkinType === filterType);
            }
            
            // Sort by timestamp descending
            filteredDocs.sort((a, b) => {
                const aTime = a.data().timestamp?.toMillis() || 0;
                const bTime = b.data().timestamp?.toMillis() || 0;
                return bTime - aTime; // Descending order
            });
            
            totalCount = filteredDocs.length;
            
            // Apply pagination
            const startAfter = (page - 1) * historyPageSize;
            const endAt = startAfter + historyPageSize;
            filteredDocs = filteredDocs.slice(startAfter, endAt);
            
            // Create a mock snapshot-like object
            snapshot = {
                docs: filteredDocs,
                empty: filteredDocs.length === 0
            };
        }
        
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
        let errorMessage = 'Error loading checkin history';
        if (error.code === 'failed-precondition') {
            errorMessage = 'Database index required. Please contact administrator.';
        } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
        }
        historyList.innerHTML = `<p style="color: #dc3545;">${errorMessage}</p>`;
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
        const user = firebase.auth().currentUser;
        if (!user) {
            showNotification('Please log in to export', 'error');
            return;
        }
        
        const isAdminUser = await isAdmin(user);
        
        // Get all filtered data (not paginated)
        const filterType = document.getElementById('historyFilterType')?.value || '';
        const filterSearch = document.getElementById('historyFilterSearch')?.value.trim() || '';
        
        let snapshot;
        
        if (isAdminUser) {
            // Admins: export all checkins
        let query = db.collection('checkins');
        
        if (filterType) {
            query = query.where('checkinType', '==', filterType);
        }
        
        // Order by timestamp
        query = query.orderBy('timestamp', 'desc');
        
            snapshot = await query.get();
        } else {
            // Volunteers: only export checkins they created
            const allUserCheckins = await db.collection('checkins')
                .where('checkedInBy', '==', user.uid)
                .get();
            
            // Filter by checkinType if provided, then sort by timestamp
            let filteredDocs = Array.from(allUserCheckins.docs);
            
            if (filterType) {
                filteredDocs = filteredDocs.filter(doc => doc.data().checkinType === filterType);
            }
            
            // Sort by timestamp descending
            filteredDocs.sort((a, b) => {
                const aTime = a.data().timestamp?.toMillis() || 0;
                const bTime = b.data().timestamp?.toMillis() || 0;
                return bTime - aTime; // Descending order
            });
            
            // Create a mock snapshot-like object
            snapshot = {
                docs: filteredDocs,
                empty: filteredDocs.length === 0
            };
        }
        
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
            data.paymentMethod || '',
            data.itemCount || '',
            data.tagId || '',
            data.checkedOutAt ? data.checkedOutAt.toDate().toLocaleString() : '',
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
        let totalCheckins, uniqueParticipants, typeBreakdown, recentCheckins, checkinsByUser;
        
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
            checkinsByUser = cachedData.checkinsByUser || {};
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
            checkinsByUser = {};
            allCheckins.forEach(checkin => {
                const type = checkin.checkinType || 'unknown';
                typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;

                const userId = checkin.checkedInBy || 'unknown';
                const userName = checkin.checkedInByName || 'Unknown';
                if (!checkinsByUser[userId]) {
                    checkinsByUser[userId] = {
                        name: userName,
                        total: 0,
                        byType: {}
                    };
                }
                checkinsByUser[userId].total += 1;
                checkinsByUser[userId].byType[type] = (checkinsByUser[userId].byType[type] || 0) + 1;
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
                recentCheckins: recentCheckins,
                checkinsByUser: checkinsByUser
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
        
        // Display checkins by user
        const checkinsByUserContainer = document.getElementById('checkinsByUser');
        if (checkinsByUserContainer) {
            const entries = Object.entries(checkinsByUser || {});
            if (!entries.length) {
                checkinsByUserContainer.innerHTML = '<p>No checkins yet</p>';
            } else {
                // Sort by total checkins descending
                entries.sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
                let html = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Total Checkins</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                entries.forEach(([userId, info]) => {
                    const name = info.name || 'Unknown';
                    const total = info.total || 0;
                    html += `
                        <tr>
                            <td>${escapeHtml(name)}</td>
                            <td>${total}</td>
                        </tr>
                    `;
                });

                html += `
                        </tbody>
                    </table>
                `;
                checkinsByUserContainer.innerHTML = html;
            }
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
                    ${latestCheckin && latestCheckin.paymentMethod ? 
                        `<div class="checkin-status-details">Payment Method: ${escapeHtml(latestCheckin.paymentMethod)}</div>` : ''}
                    ${latestCheckin && latestCheckin.itemCount !== undefined ? 
                        `<div class="checkin-status-details">Items: ${latestCheckin.itemCount}, Tag: ${escapeHtml(latestCheckin.tagId || 'N/A')}</div>` : ''}
                    ${latestCheckin && latestCheckin.checkedOutAt ? 
                        `<div class="checkin-status-details" style="color: #28a745;">Checked Out: ${latestCheckin.checkedOutAt.toDate().toLocaleString()}</div>` : ''}
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
