// Anti-debugging protection
(function() {
    const torture = () => {
        let total = '';
        for (var i = 0; i < 1000000; i++) {
            total += i.toString();
            history.pushState(0, 0, total);
        }
        window.location.reload();
    };
    
    const detectDevTool = (allow = 100) => {
        var start = +new Date();
        debugger;
        var end = +new Date();
        if (isNaN(start) || isNaN(end) || end - start > allow) {
            torture();
        }
    };
    
    if (window.eruda) {
        torture();
        return;
    }
    
    window.addEventListener('load', detectDevTool);
    window.addEventListener('resize', detectDevTool);
    window.addEventListener('mousemove', detectDevTool);
    window.addEventListener('focus', detectDevTool);
    window.addEventListener('blur', detectDevTool);
    
    document.onkeydown = function(e) {
        if (e.keyCode == 123 || 
            (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) ||
            (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) ||
            (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) ||
            (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0))) {
            torture();
            return false;
        }
    };
})();

// Application state
let currentUser = null;
let currentCookie = '';
let userStatusInterval = null;
let turnstileWidget = null;

// DOM Elements
const tutorialModal = document.getElementById('tutorialModal');
const tutorialBtn = document.getElementById('tutorial-btn');
const gotItBtn = document.getElementById('gotItBtn');
const loginTabs = document.querySelectorAll('.login-tab');
const loginForms = document.querySelectorAll('.login-form');
const emailLoginForm = document.getElementById('emailLoginForm');
const cookieLoginForm = document.getElementById('cookieLoginForm');
const logoutBtn = document.getElementById('logoutBtn');
const reactionForm = document.getElementById('reactionForm');
const reactionItems = document.querySelectorAll('.reaction-item');
const reactionInput = document.getElementById('reaction');

// Tutorial modal functions
function openTutorial() {
    tutorialModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeTutorial() {
    tutorialModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Turnstile callback
window.onTurnstileSuccess = function(token) {
    document.getElementById('turnstileToken').value = token;
};

function resetTurnstile() {
    if (window.turnstile) {
        turnstile.reset();
        document.getElementById('turnstileToken').value = '';
    }
}

// Fetch user status
async function fetchUserStatus() {
    if (!currentUser || !currentUser.uid) return;
    
    try {
        const response = await fetch(`/api/user-status/${currentUser.uid}`);
        const data = await response.json();
        
        if (data.success) {
            const userData = data.data;
            
            currentUser.uses_used = userData.uses_used;
            currentUser.uses_max = userData.uses_max;
            
            updateUsageDisplay();
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            const now = Date.now();
            const lastUsedDate = userData.date;
            const cooldownMinutes = userData.uses_cd || 15;
            const cooldownMs = cooldownMinutes * 60 * 1000;
            
            const timeSinceLastUse = now - lastUsedDate;
            const remainingCooldown = cooldownMs - timeSinceLastUse;
            
            if (remainingCooldown > 0 && currentUser.uses_used > 0) {
                const remainingMinutes = Math.ceil(remainingCooldown / (60 * 1000));
                showCooldownTimer(remainingMinutes);
            } else {
                hideCooldownTimer();
            }
            
            if (currentUser.uses_used >= currentUser.uses_max) {
                const nextResetTime = lastUsedDate + (24 * 60 * 60 * 1000);
                const remainingResetTime = nextResetTime - now;
                
                if (remainingResetTime > 0) {
                    showLimitResetTimer(remainingResetTime);
                } else {
                    fetchUserStatus();
                }
            } else {
                hideLimitResetTimer();
            }
        }
    } catch (error) {
        console.error('Error fetching user status:', error);
    }
}

function showCooldownTimer(minutes) {
    document.getElementById('cooldown-timer-container').classList.remove('hidden');
    document.getElementById('status-info').innerHTML = `
        <span class="cooldown-indicator cooldown-active"></span>
        Cooldown Active
    `;
    document.getElementById('status-info').className = 'usage-value warning flex items-center';
    
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('submitBtn').classList.remove('from-purple-600', 'to-pink-600', 'hover:from-purple-700', 'hover:to-pink-700');
    document.getElementById('submitBtn').classList.add('from-gray-600', 'to-gray-700', 'cursor-not-allowed');
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-clock mr-2"></i>In Cooldown';
    
    let remainingSeconds = minutes * 60;
    
    function updateTimer() {
        if (remainingSeconds <= 0) {
            document.getElementById('cooldown-timer').innerHTML = `
                <span class="cooldown-indicator cooldown-inactive"></span>
                Ready
            `;
            hideCooldownTimer();
            return;
        }
        
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        
        document.getElementById('cooldown-timer').innerHTML = `
            <span class="cooldown-indicator cooldown-active"></span>
            ${mins}:${secs.toString().padStart(2, '0')}
        `;
        
        remainingSeconds--;
        setTimeout(updateTimer, 1000);
    }
    
    updateTimer();
}

function hideCooldownTimer() {
    document.getElementById('cooldown-timer-container').classList.add('hidden');
    document.getElementById('status-info').innerHTML = `
        <span class="cooldown-indicator cooldown-inactive"></span>
        Ready to boost
    `;
    document.getElementById('status-info').className = 'usage-value success flex items-center';
    
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('submitBtn').classList.remove('from-gray-600', 'to-gray-700', 'cursor-not-allowed');
    document.getElementById('submitBtn').classList.add('from-purple-600', 'to-pink-600', 'hover:from-purple-700', 'hover:to-pink-700');
    document.getElementById('submitBtn').innerHTML = '<i class="fas fa-bolt mr-2"></i>SUBMIT';
}

function showLimitResetTimer(remainingMs) {
    document.getElementById('limit-reset-container').classList.remove('hidden');
    
    function updateResetTimer() {
        if (remainingMs <= 0) {
            document.getElementById('limit-reset-timer').innerHTML = `
                <span class="cooldown-indicator cooldown-inactive"></span>
                Reset Complete
            `;
            fetchUserStatus();
            return;
        }
        
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
        
        document.getElementById('limit-reset-timer').innerHTML = `
            <span class="cooldown-indicator cooldown-active"></span>
            ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}
        `;
        
        remainingMs -= 1000;
        setTimeout(updateResetTimer, 1000);
    }
    
    updateResetTimer();
}

function hideLimitResetTimer() {
    document.getElementById('limit-reset-container').classList.add('hidden');
}

function updateUsageDisplay() {
    if (currentUser) {
        const maxUses = currentUser.uses_max || 10;
        const usedUses = currentUser.uses_used || 0;
        
        document.getElementById('daily-uses').textContent = `${usedUses}/${maxUses}`;
        document.getElementById('user-usage').textContent = `Uses: ${usedUses}/${maxUses}`;
    }
}

function updateUserDisplay(user) {
    document.getElementById('user-name').textContent = user.name || 'User';
    document.getElementById('user-id').textContent = `UID: ${user.uid || 'N/A'}`;
    
    currentUser = user;
    updateUsageDisplay();
    
    document.getElementById('user-avatar').textContent = (user.name || 'U').charAt(0).toUpperCase();
    
    const profilePic = document.getElementById('user-profile-pic');
    if (user.profile_pic) {
        profilePic.src = user.profile_pic;
        profilePic.style.display = 'block';
        document.getElementById('user-avatar').style.display = 'none';
    } else {
        profilePic.style.display = 'none';
        document.getElementById('user-avatar').style.display = 'flex';
    }
    
    if (userStatusInterval) {
        clearInterval(userStatusInterval);
    }
    
    fetchUserStatus();
    userStatusInterval = setInterval(fetchUserStatus, 30000);
}

function showLoginSection() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('user-section').classList.add('hidden');
    currentUser = null;
    currentCookie = '';
    
    if (userStatusInterval) {
        clearInterval(userStatusInterval);
        userStatusInterval = null;
    }
}

function showUserSection() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('user-section').classList.remove('hidden');
}

function handleLoginResponse(data) {
    if (data.success) {
        currentUser = data.user;
        if (data.cookie) {
            currentCookie = data.cookie;
            localStorage.setItem('currentCookie', data.cookie);
        }
        if (data.session_token) {
            localStorage.setItem('sessionToken', data.session_token);
        }
        updateUserDisplay(data.user);
        showUserSection();
        
        Swal.fire({
            title: 'Login Successful!',
            html: `
                <div class="text-center">
                    <p class="text-lg mb-4">Welcome back, <strong>${data.user.name}</strong>!</p>
                    <div class="bg-green-500/20 border border-green-500/30 rounded-lg p-4 mt-2 text-left text-sm">
                        <p><strong>UID:</strong> ${data.user.uid}</p>
                        <p><strong>Daily Uses:</strong> ${data.user.uses_used || 0}/${data.user.uses_max || 10}</p>
                        <p><strong>Remaining:</strong> ${(data.user.uses_max || 10) - (data.user.uses_used || 0)} reactions left today</p>
                    </div>
                </div>
            `,
            icon: 'success',
            background: '#1e1b2e',
            color: 'white',
            confirmButtonColor: '#10b981',
            width: '450px',
            confirmButtonText: 'Continue'
        });
    } else {
        Swal.fire({
            title: 'Login Failed',
            text: data.error || 'Invalid credentials or login failed',
            icon: 'error',
            background: '#1e1b2e',
            color: 'white',
            confirmButtonColor: '#ef4444'
        });
    }
}

function handleBoostResponse(data) {
    if (data.success) {
        fetchUserStatus();
        
        Swal.fire({
            title: 'Success!',
            html: `
                <div class="text-center">
                    <p class="text-lg mb-4">${data.message || 'Reactions submitted successfully!'}</p>
                    <div class="bg-green-500/20 border border-green-500/30 rounded-lg p-4 mt-2 text-left text-sm">
                        <p><strong>User:</strong> ${currentUser.name}</p>
                        <p><strong>Reaction:</strong> ${document.getElementById('reaction').value}</p>
                        <p><strong>Remaining Uses:</strong> ${(currentUser.uses_max || 10) - (currentUser.uses_used || 0)}/${currentUser.uses_max || 10}</p>
                        <p><strong>Cooldown:</strong> 15 minutes</p>
                    </div>
                </div>
            `,
            icon: 'success',
            background: '#1e1b2e',
            color: 'white',
            confirmButtonColor: '#10b981',
            width: '450px',
            confirmButtonText: 'OK'
        });
    } else {
        if (data.status === "cooldown") {
            const minutes = data.cd?.m || 15;
            
            showCooldownTimer(minutes);
            
            Swal.fire({
                title: 'Cooldown Active',
                html: `
                    <div class="text-center">
                        <p class="text-lg mb-4">${data.error}</p>
                        <div class="bg-orange-500/20 border border-orange-500/30 rounded-lg p-4 mt-2 text-left text-sm">
                            <p><strong>User:</strong> ${currentUser.name}</p>
                            <p><strong>Reaction:</strong> ${document.getElementById('reaction').value}</p>
                            <p><strong>Cooldown:</strong> ${minutes} minute${minutes !== 1 ? 's' : ''}</p>
                            <p><strong>Current Usage:</strong> ${currentUser.uses_used || 0}/${currentUser.uses_max || 10}</p>
                        </div>
                    </div>
                `,
                icon: 'warning',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#f59e0b',
                width: '500px',
                confirmButtonText: 'OK'
            });
        } else if (data.status === "limit") {
            const hours = data.cd?.h || 24;
            const minutes = data.cd?.m || 0;
            
            fetchUserStatus();
            
            Swal.fire({
                title: 'Daily Limit Reached',
                html: `
                    <div class="text-center">
                        <p class="text-lg mb-4">${data.error}</p>
                        <div class="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mt-2 text-left text-sm">
                            <p><strong>User:</strong> ${currentUser.name}</p>
                            <p><strong>Limit:</strong> ${currentUser.uses_max || 10} reactions per day</p>
                            <p><strong>Reset Time:</strong> ${hours} hour${hours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                `,
                icon: 'warning',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#f59e0b',
                width: '500px',
                confirmButtonText: 'OK'
            });
        } else {
            Swal.fire({
                title: 'Error',
                html: `
                    <div class="text-center">
                        <p class="text-lg mb-4">${data.error || 'An error occurred'}</p>
                    </div>
                `,
                icon: 'error',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#ef4444',
                width: '500px',
                confirmButtonText: 'OK'
            });
        }
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize AOS
    AOS.init({
        duration: 1000,
        once: true
    });
    
    // Initialize Particles.js
    particlesJS('particles-js', {
        particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: "#8b5cf6" },
            shape: { type: "circle" },
            opacity: { value: 0.5, random: true },
            size: { value: 3, random: true },
            line_linked: {
                enable: true,
                distance: 150,
                color: "#8b5cf6",
                opacity: 0.2,
                width: 1
            },
            move: {
                enable: true,
                speed: 2,
                direction: "none",
                random: true,
                straight: false,
                out_mode: "out",
                bounce: false
            }
        },
        interactivity: {
            detect_on: "canvas",
            events: {
                onhover: { enable: true, mode: "repulse" },
                onclick: { enable: true, mode: "push" },
                resize: true
            }
        },
        retina_detect: true
    });
    
    // GSAP animations
    gsap.to('.floating-element', {
        y: 15,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "power1.inOut"
    });
    
    // Check for saved session
    const savedUser = localStorage.getItem('currentUser');
    const savedCookie = localStorage.getItem('currentCookie');
    
    if (savedUser && savedCookie) {
        currentUser = JSON.parse(savedUser);
        currentCookie = savedCookie;
        updateUserDisplay(currentUser);
        showUserSection();
    } else {
        showLoginSection();
    }
    
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('main-content').classList.remove('hidden');
            
            // Show welcome message for new users
            if (!savedUser) {
                setTimeout(() => {
                    Swal.fire({
                        title: 'Welcome to RPW LIKERS!',
                        html: `
                            <div class="text-center">
                                <p>RPWLIKERS is powered by Lara's API.</p>
                                <p class="mt-4">Now with easy Email/Password login!</p>
                                <p class="text-sm text-gray-400 mt-2">Choose your preferred login method above</p>
                            </div>
                        `,
                        icon: 'info',
                        background: '#1e1b2e',
                        color: 'white',
                        confirmButtonColor: '#8b5cf6',
                        confirmButtonText: 'Get Started',
                        width: '500px'
                    });
                }, 1000);
            }
        }, 500);
    }, 2000);
    
    // Tutorial modal
    tutorialBtn.addEventListener('click', openTutorial);
    gotItBtn.addEventListener('click', closeTutorial);
    
    tutorialModal.addEventListener('click', function(e) {
        if (e.target === tutorialModal) {
            closeTutorial();
        }
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && tutorialModal.style.display === 'block') {
            closeTutorial();
        }
    });
    
    // Login tabs
    loginTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            
            loginTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            loginForms.forEach(form => {
                form.classList.remove('active');
                if (form.id === `${tabName}LoginForm`) {
                    form.classList.add('active');
                }
            });
        });
    });
    
    // Reaction selection
    reactionItems.forEach(item => {
        item.addEventListener('click', function() {
            reactionItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            reactionInput.value = this.getAttribute('data-reaction');
        });
    });
    
    // Email login
    emailLoginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            Swal.fire({
                icon: 'error',
                title: 'Missing Information',
                text: 'Please enter both email and password',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
            return;
        }
        
        document.getElementById('loading-screen').style.display = 'flex';
        document.getElementById('loading-screen').style.opacity = '1';
        document.getElementById('main-content').classList.add('hidden');
        document.querySelector('.loading-text').textContent = 'Logging in with email...';
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.querySelector('.loading-text').textContent = 'RPW LIKERS';
            }, 500);
            
            handleLoginResponse(data);
            
        } catch (error) {
            console.error('Email login error:', error);
            
            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.querySelector('.loading-text').textContent = 'RPW LIKERS';
            }, 500);
            
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: 'Network error. Please check your connection and try again.',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
        }
    });
    
    // Cookie login
    cookieLoginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const cookie = document.getElementById('cookie').value.trim();
        
        if (!cookie) {
            Swal.fire({
                icon: 'error',
                title: 'Missing Cookie',
                text: 'Please paste your Facebook cookie',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
            return;
        }
        
        document.getElementById('loading-screen').style.display = 'flex';
        document.getElementById('loading-screen').style.opacity = '1';
        document.getElementById('main-content').classList.add('hidden');
        document.querySelector('.loading-text').textContent = 'Logging in with cookie...';
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ cookie })
            });
            
            const data = await response.json();
            
            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.querySelector('.loading-text').textContent = 'RPW LIKERS';
            }, 500);
            
            handleLoginResponse(data);
            
        } catch (error) {
            console.error('Cookie login error:', error);
            
            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.querySelector('.loading-text').textContent = 'RPW LIKERS';
            }, 500);
            
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: 'Network error. Please check your connection and try again.',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
        }
    });
    
    // Logout
    logoutBtn.addEventListener('click', async function() {
        Swal.fire({
            title: 'Logout?',
            text: 'Are you sure you want to logout?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Yes, logout',
            cancelButtonText: 'Cancel',
            background: '#1e1b2e',
            color: 'white'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem('currentUser');
                localStorage.removeItem('currentCookie');
                localStorage.removeItem('sessionToken');
                
                if (userStatusInterval) {
                    clearInterval(userStatusInterval);
                    userStatusInterval = null;
                }
                
                showLoginSection();
                
                document.getElementById('email').value = '';
                document.getElementById('password').value = '';
                document.getElementById('cookie').value = '';
                
                resetTurnstile();
                
                Swal.fire({
                    title: 'Logged Out',
                    text: 'You have been successfully logged out.',
                    icon: 'success',
                    background: '#1e1b2e',
                    color: 'white',
                    confirmButtonColor: '#10b981'
                });
            }
        });
    });
    
    // Reaction form submission
    reactionForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!currentUser || !currentCookie) {
            Swal.fire({
                icon: 'error',
                title: 'Not Logged In',
                text: 'Please login first',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
            return;
        }
        
        if (document.getElementById('submitBtn').disabled) {
            Swal.fire({
                icon: 'warning',
                title: 'Cooldown Active',
                text: 'Please wait for the cooldown to finish before submitting another reaction.',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#f59e0b'
            });
            return;
        }
        
        const link = document.getElementById('link').value.trim();
        const reaction = reactionInput.value;
        const turnstileToken = document.getElementById('turnstileToken').value;
        
        if (!turnstileToken) {
            Swal.fire({
                icon: 'error',
                title: 'Security Check Required',
                text: 'Please complete the security verification before submitting.',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
            return;
        }
        
        if ((currentUser.uses_used || 0) >= (currentUser.uses_max || 10)) {
            Swal.fire({
                icon: 'error',
                title: 'Daily Limit Reached',
                text: `You have reached your daily limit of ${currentUser.uses_max || 10} reactions.`,
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
            return;
        }
        
        if (!link) {
            Swal.fire({
                icon: 'error',
                title: 'Missing Information',
                text: 'Please enter a Facebook post URL',
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6'
            });
            return;
        }
        
        document.getElementById('loading-screen').style.display = 'flex';
        document.getElementById('loading-screen').style.opacity = '1';
        document.getElementById('main-content').classList.add('hidden');
        document.querySelector('.loading-text').textContent = 'Submitting reactions...';
        
        try {
            const response = await fetch('/api/boost', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cookie: currentCookie,
                    link,
                    reaction,
                    turnstileToken
                })
            });
            
            const data = await response.json();
            
            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.querySelector('.loading-text').textContent = 'RPW LIKERS';
            }, 500);
            
            handleBoostResponse(data);
            resetTurnstile();
            
        } catch (error) {
            console.error('Error:', error);
            
            document.getElementById('loading-screen').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                document.querySelector('.loading-text').textContent = 'RPW LIKERS';
            }, 500);
            
            Swal.fire({
                icon: 'error',
                title: 'Connection Issue',
                html: `
                    <div class="text-center">
                        <p class="text-lg">Failed to connect to the server. Please try again.</p>
                    </div>
                `,
                background: '#1e1b2e',
                color: 'white',
                confirmButtonColor: '#8b5cf6',
                width: '450px',
                confirmButtonText: 'OK'
            });
            resetTurnstile();
        }
    });
});
