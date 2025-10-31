// Global variables
let pendingRegistration = null;

// Global function to activate a tab and update URL
function activateTab(tabName) {
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
                // Check if trying to access protected tab without login
                const protectedTabs = ['shibirarthi', 'myprofile', 'mytransportation'];
                if (protectedTabs.includes(targetTab)) {
                    const navItem = document.getElementById(targetTab + 'NavItem') || 
                                   document.getElementById('shibirarthiNavItem');
                    if (navItem && navItem.style.display === 'none') {
                        showNotification('Please login to access this page.', 'info');
                        openLogin();
                        return;
                    }
                }
                activateTab(targetTab);
            }
        });
    });

    // Handle hash changes (browser back/forward buttons)
    window.addEventListener('hashchange', function() {
        const hash = window.location.hash.substring(1); // Remove #
        if (hash) {
            // Check if trying to access protected tab without login
            const protectedTabs = ['shibirarthi', 'myprofile', 'mytransportation'];
            if (protectedTabs.includes(hash)) {
                const navItem = document.getElementById(hash + 'NavItem') || 
                               document.getElementById('shibirarthiNavItem');
                if (navItem && navItem.style.display === 'none') {
                    showNotification('Please login to access this page.', 'info');
                    window.history.pushState(null, null, '#home');
                    activateTab('home');
                    openLogin();
                    return;
                }
            }
            activateTab(hash);
        }
    });

    // Handle initial page load - check for hash or default to home
    const initialHash = window.location.hash.substring(1);
    const protectedTabs = ['shibirarthi', 'myprofile', 'mytransportation'];
    
    if (initialHash) {
        // Check if trying to access protected tab without login
        if (protectedTabs.includes(initialHash)) {
            const navItem = document.getElementById(initialHash + 'NavItem') || 
                           document.getElementById('shibirarthiNavItem');
            if (navItem && navItem.style.display === 'none') {
                showNotification('Please login to access this page.', 'info');
                window.history.pushState(null, null, '#home');
                activateTab('home');
                // Don't auto-open login on page load, just redirect
            } else {
                activateTab(initialHash);
            }
        } else {
            activateTab(initialHash);
        }
    } else {
        // Default to home if no hash
        activateTab('home');
    }

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
}

// Register Modal Functionality
function openRegister() {
    const modal = document.getElementById('registerModal');
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

// Login Form Submission - Supports Email or UniqueID
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.querySelector('.login-form');
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
                            handleLoginError(error);
                        });
                } else {
                    // UniqueID login - look up email first
                    const db = firebase.firestore();
                    db.collection('users').where('uniqueId', '==', identifier).limit(1).get()
                        .then((querySnapshot) => {
                            if (querySnapshot.empty) {
                                // Try checking registrations collection as fallback
                                return db.collection('registrations').doc(identifier).get()
                                    .then((doc) => {
                                        if (!doc.exists || !doc.data().email) {
                                            throw { code: 'auth/user-not-found', message: 'Unique ID not found.' };
                                        }
                                        return doc.data().email;
                                    });
                            } else {
                                return querySnapshot.docs[0].data().email;
                            }
                        })
                        .then((email) => {
                            if (!email) {
                                throw { code: 'auth/user-not-found', message: 'No email found for this Unique ID.' };
                            }
                            // Login with the found email
                            return firebase.auth().signInWithEmailAndPassword(email, password);
                        })
                        .then((userCredential) => {
                            handleLoginSuccess(loginForm);
                        })
                        .catch((error) => {
                            handleLoginError(error);
                        });
                }
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
        });
    }
});

// Helper function for successful login
function handleLoginSuccess(loginForm) {
    showNotification('Logged in successfully!', 'success');
    closeLogin();
    loginForm.reset();
    updateAuthUI();
    // Redirect to Shibirarthi Info tab after login
    setTimeout(() => {
        activateTab('shibirarthi');
    }, 100);
}

// Helper function for login errors
function handleLoginError(error) {
    console.error('Login error:', error);
    let errorMessage = 'Login failed. ';
    
    if (error.code === 'auth/user-not-found') {
        errorMessage += 'No account found. Please register first.';
    } else if (error.code === 'auth/wrong-password') {
        errorMessage += 'Incorrect password.';
    } else if (error.code === 'auth/invalid-email') {
        errorMessage += 'Invalid email address.';
    } else if (error.code === 'auth/user-disabled') {
        errorMessage += 'This account has been disabled.';
    } else {
        errorMessage += error.message || 'Please try again.';
    }
    
    showNotification(errorMessage, 'error');
}

// Register Form Submission - Verification Step
document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.querySelector('.register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('regName').value.trim();
            const uniqueId = document.getElementById('regUniqueId').value.trim();
            const email = document.getElementById('regEmail').value.trim();

            if (!name || !uniqueId || !email) {
                showNotification('Please fill in all fields.', 'error');
                return;
            }
            if (!isValidEmail(email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }

            // Verify with Firestore
            if (window.firebase && firebase.firestore) {
                const db = firebase.firestore();
                const uniqueIdDoc = db.collection('registrations').doc(uniqueId);
                
                showNotification('Verifying your details...', 'info');
                
                uniqueIdDoc.get()
                    .then(doc => {
                        if (!doc.exists) {
                            showNotification('Verification failed. Unique ID not found.', 'error');
                            return;
                        }
                        
                        const data = doc.data();
                        const dbName = (data.name || '').trim().toLowerCase();
                        const inputName = name.toLowerCase();
                        
                        // Case-insensitive name matching
                        if (dbName !== inputName) {
                            showNotification('Verification failed. Name does not match records.', 'error');
                            return;
                        }
                        
                        // Check if email matches (if stored)
                        if (data.email && data.email.toLowerCase() !== email.toLowerCase()) {
                            showNotification('Email does not match records.', 'error');
                            return;
                        }
                        
                        // Verification successful - show password setup
                        pendingRegistration = {
                            name: name,
                            uniqueId: uniqueId,
                            email: email
                        };
                        
                        // Switch to password setup form
                        document.getElementById('registerVerifyForm').style.display = 'none';
                        document.getElementById('registerPasswordForm').style.display = 'block';
                        showNotification('Verification successful! Please set a password.', 'success');
                    })
                    .catch(err => {
                        console.error('Firestore error:', err);
                        showNotification(err.message || 'Verification error. Please try again.', 'error');
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
                        return db.collection('users').doc(user.uid).set({
                            email: pendingRegistration.email,
                            name: pendingRegistration.name,
                            uniqueId: pendingRegistration.uniqueId,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
                        } else if (error.code === 'auth/invalid-email') {
                            errorMessage += 'Invalid email address.';
                        } else if (error.code === 'auth/weak-password') {
                            errorMessage += 'Password is too weak.';
                        } else {
                            errorMessage += error.message;
                        }
                        
                        showNotification(errorMessage, 'error');
                    });
            } else {
                showNotification('Firebase not initialized. Please check your configuration.', 'error');
            }
        });
    }
});

// Update UI based on auth state
function updateAuthUI() {
    if (window.firebase && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            const loginBtn = document.querySelector('.header-actions .login-btn');
            const homeNavItem = document.getElementById('homeNavItem');
            const aboutNavItem = document.getElementById('aboutNavItem');
            const mediaNavItem = document.getElementById('mediaNavItem');
            const shibirarthiNavItem = document.getElementById('shibirarthiNavItem');
            const myProfileNavItem = document.getElementById('myProfileNavItem');
            const myTransportationNavItem = document.getElementById('myTransportationNavItem');
            
            if (user) {
                // User is logged in
                if (loginBtn) {
                    loginBtn.textContent = 'Logout';
                    loginBtn.onclick = () => {
                        // Check if user is on protected tab, redirect to home if so
                        const currentHash = window.location.hash.substring(1);
                        const protectedTabs = ['shibirarthi', 'myprofile', 'mytransportation'];
                        if (protectedTabs.includes(currentHash)) {
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
                
                // If user is on protected tab, redirect to home
                const currentHash = window.location.hash.substring(1);
                const protectedTabs = ['shibirarthi', 'myprofile', 'mytransportation'];
                if (protectedTabs.includes(currentHash)) {
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
        
        if (homeNavItem) homeNavItem.style.display = '';
        if (aboutNavItem) aboutNavItem.style.display = '';
        if (mediaNavItem) mediaNavItem.style.display = '';
        if (shibirarthiNavItem) shibirarthiNavItem.style.display = 'none';
        if (myProfileNavItem) myProfileNavItem.style.display = 'none';
        if (myTransportationNavItem) myTransportationNavItem.style.display = 'none';
    }
}

// Load user profile information
function loadUserProfile(user) {
    const profileInfo = document.getElementById('profileInfo');
    if (!profileInfo) return;
    
    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        db.collection('users').doc(user.uid).get()
            .then((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    profileInfo.innerHTML = `
                        <h3>Profile Information</h3>
                        <div class="info-item">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${data.name || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Email:</span>
                            <span class="info-value">${data.email || user.email || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Unique ID:</span>
                            <span class="info-value">${data.uniqueId || 'N/A'}</span>
                        </div>
                        ${data.createdAt ? `
                        <div class="info-item">
                            <span class="info-label">Account Created:</span>
                            <span class="info-value">${new Date(data.createdAt.toDate()).toLocaleDateString()}</span>
                        </div>` : ''}
                    `;
                } else {
                    profileInfo.innerHTML = '<p>Profile information not found.</p>';
                }
            })
            .catch((error) => {
                console.error('Error loading profile:', error);
                profileInfo.innerHTML = '<p>Error loading profile information.</p>';
            });
    }
}

// Load transportation information
function loadTransportationInfo(user) {
    const transportationInfo = document.getElementById('transportationInfo');
    if (!transportationInfo) return;
    
    if (window.firebase && firebase.firestore) {
        const db = firebase.firestore();
        // First get user's uniqueId
        db.collection('users').doc(user.uid).get()
            .then((userDoc) => {
                if (userDoc.exists && userDoc.data().uniqueId) {
                    const uniqueId = userDoc.data().uniqueId;
                    // Get registration details which may contain transportation info
                    return db.collection('registrations').doc(uniqueId).get();
                }
                return null;
            })
            .then((regDoc) => {
                if (regDoc && regDoc.exists) {
                    const data = regDoc.data();
                    transportationInfo.innerHTML = `
                        <h3>Transportation Details</h3>
                        <div class="info-item">
                            <span class="info-label">Pickup Location:</span>
                            <span class="info-value">${data.pickupLocation || 'To be updated'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Arrival Date:</span>
                            <span class="info-value">${data.arrivalDate || 'To be updated'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Arrival Time:</span>
                            <span class="info-value">${data.arrivalTime || 'To be updated'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Flight/Train Number:</span>
                            <span class="info-value">${data.flightTrainNumber || 'To be updated'}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Return Date:</span>
                            <span class="info-value">${data.returnDate || 'To be updated'}</span>
                        </div>
                        <p class="login-note">Please contact the transportation coordinator if you need to update your details.</p>
                    `;
                } else {
                    transportationInfo.innerHTML = `
                        <p>Transportation information will be available after registration is completed.</p>
                        <p class="login-note">For transportation updates, please contact:<br>
                        Raghuram Vemaraju<br>
                        +91 98497 23353<br>
                        raghuvemaraju@gmail.com</p>
                    `;
                }
            })
            .catch((error) => {
                console.error('Error loading transportation info:', error);
                transportationInfo.innerHTML = '<p>Error loading transportation information.</p>';
            });
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
            console.warn('Image failed to load:', this.src);
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
// Check if Firebase is properly initialized
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.firebase && firebase.apps.length > 0) {
            console.log('Firebase initialized successfully');
        } else {
            console.warn('Firebase not initialized. Please check firebase-config.js and ensure you have added your Firebase configuration.');
        }
    }, 500);
});
