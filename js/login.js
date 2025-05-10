// Constants
const VERIFICATION_TIME = 5 * 60 * 1000; // 5 minutes for verification
const RESTRICTED_USERNAMES = ['kick', 'admin', 'administrator', 'root', 'system']; // Restricted usernames
const KICK_CHANNEL_ID = '53955207'; // Kick.com kanal ID'si

// Authentication state
let users = []; // For storing registered users
let currentUser = null; // Currently logged in user
let verificationCode = ''; // Current verification code
let verificationTimer = null; // Timer for verification countdown
let verificationTimeLeft = 0; // Time left for verification
let isVerifying = false; // Flag to track if verification is in progress

// Şifre sıfırlama için ek değişkenler
let resetCode = '';
let resetUser = null;

// DOM elements
const authScreen = document.getElementById('authScreen');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const resetForm = document.getElementById('resetForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const registerUsername = document.getElementById('registerUsername');
const registerKickName = document.getElementById('registerKickName');
const registerPassword = document.getElementById('registerPassword');
const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const authTabs = document.querySelectorAll('.auth-tab');
const errorMessage = document.getElementById('errorMessage');
const notification = document.getElementById('notification');
const notificationTitle = document.getElementById('notificationTitle');
const notificationMessage = document.getElementById('notificationMessage');

// Verification elements
const verificationScreen = document.getElementById('verificationScreen');
const verificationCodeElement = document.getElementById('verificationCode');
const verificationTimerElement = document.getElementById('verificationTimer');
const kickChannelLink = document.getElementById('kickChannelLink');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const verifyBtn = document.getElementById('verifyBtn');
const cancelVerificationBtn = document.getElementById('cancelVerificationBtn');
const verificationStatus = document.getElementById('verificationStatus');

// Şifre sıfırlama elementleri
const resetCode_element = document.getElementById('resetCode');
const copyResetCodeBtn = document.getElementById('copyResetCodeBtn');
const verifyResetCodeBtn = document.getElementById('verifyResetCodeBtn');
const resetCodeSection = document.getElementById('resetCodeSection');
const resetPasswordSection = document.getElementById('resetPasswordSection');
const newPassword = document.getElementById('newPassword');
const confirmNewPassword = document.getElementById('confirmNewPassword');
const resetPasswordBtn = document.getElementById('resetPasswordBtn');

// Load users from localStorage
function loadUsers() {
  try {
    const savedUsers = localStorage.getItem('tetrisUsers');
    if (savedUsers) {
      users = JSON.parse(savedUsers);
    }
  } catch (error) {
    console.error("Error loading users from localStorage:", error);
    users = [];
  }
}

// Save users to localStorage
function saveUsers() {
  try {
    localStorage.setItem('tetrisUsers', JSON.stringify(users));
  } catch (error) {
    console.error("Error saving users to localStorage:", error);
  }
}

// Initialize users
loadUsers();

// Generate a unique ID for the user
function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Generate verification code
function generateVerificationCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'OZR-';
  
  // Generate 3 groups of 4 characters
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    if (i < 2) code += '-';
  }
  
  return code;
}

// Format time in minutes and seconds
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Show notification
function showNotification(type, title, message, duration = 5000) {
  notification.className = 'notification ' + type;
  notificationTitle.textContent = title;
  notificationMessage.textContent = message;
  notification.style.display = 'block';
  
  // Auto hide after duration
  setTimeout(hideNotification, duration);
}

// Hide notification
function hideNotification() {
  notification.style.display = 'none';
}

// Tab switching
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active class from all tabs and forms
    authTabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    
    // Add active class to clicked tab and corresponding form
    tab.classList.add('active');
    const formId = tab.getAttribute('data-tab') + 'Form';
    document.getElementById(formId).classList.add('active');
    
    // Clear error message
    errorMessage.style.display = 'none';
    
    // Eğer şifre sıfırlama sekmesine tıklandıysa
    if (tab.getAttribute('data-tab') === 'reset') {
      // Yeni bir sıfırlama kodu oluştur
      resetCode = generateVerificationCode();
      resetCode_element.textContent = resetCode;
      
      // Sıfırlama formunu sıfırla
      resetCodeSection.style.display = 'block';
      resetPasswordSection.style.display = 'none';
      resetUser = null;
    }
  });
});

// Login functionality
loginBtn.addEventListener('click', () => {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  
  if (!username || !password) {
    errorMessage.textContent = 'Kullanıcı adı ve şifre gereklidir!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Find user
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    errorMessage.textContent = 'Geçersiz kullanıcı adı veya şifre!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Check if user is verified
  if (!user.verified) {
    // Start verification process
    startVerification(user);
    return;
  }
  
  // Login successful
  currentUser = user;
  
  // Store user info in localStorage for game page
  localStorage.setItem('tetrisCurrentUser', JSON.stringify({
    id: user.id,
    username: user.username,
    kickName: user.kickName,
    verified: user.verified
  }));
  
  // Redirect to game page
  window.location.href = 'game.html';
});

// Register functionality
registerBtn.addEventListener('click', () => {
  const username = registerUsername.value.trim();
  const kickName = registerKickName.value.trim();
  const password = registerPassword.value;
  const passwordConfirm = registerPasswordConfirm.value;
  
  // Validate inputs
  if (!username) {
    errorMessage.textContent = 'Kullanıcı adı boş olamaz!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (!kickName) {
    errorMessage.textContent = 'Kick adı boş olamaz!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (!password) {
    errorMessage.textContent = 'Şifre boş olamaz!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (password !== passwordConfirm) {
    errorMessage.textContent = 'Şifreler eşleşmiyor!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (password.length < 6) {
    errorMessage.textContent = 'Şifre en az 6 karakter olmalıdır!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Check for restricted usernames
  if (RESTRICTED_USERNAMES.includes(username.toLowerCase()) || RESTRICTED_USERNAMES.includes(kickName.toLowerCase())) {
    errorMessage.textContent = 'Bu kullanıcı adı veya kick adı kullanılamaz!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Check for valid characters
  if (!/^[a-zA-Z0-9_]+$/.test(username) || !/^[a-zA-Z0-9_]+$/.test(kickName)) {
    errorMessage.textContent = 'Kullanıcı adı ve kick adı sadece harf, rakam ve alt çizgi içerebilir!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Check if username already exists
  if (users.some(u => u.username === username)) {
    errorMessage.textContent = 'Bu kullanıcı adı zaten kullanılıyor!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Check if kick username already exists
  if (users.some(u => u.kickName.toLowerCase() === kickName.toLowerCase())) {
    errorMessage.textContent = 'Bu Kick kullanıcı adı zaten kullanılıyor!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Create new user
  const newUser = {
    id: generateUniqueId(),
    username: username,
    kickName: kickName,
    password: password,
    verified: false,
    registeredAt: Date.now()
  };
  
  // Add user to users array
  users.push(newUser);
  
  // Save users to localStorage
  saveUsers();
  
  // Start verification process
  startVerification(newUser);
});

// Start verification process
function startVerification(user) {
  // Generate verification code
  verificationCode = generateVerificationCode();
  
  // Set current user
  currentUser = user;
  
  // Update verification screen
  verificationCodeElement.textContent = verificationCode;
  
  // Hide auth screen and show verification screen
  authScreen.style.display = 'none';
  verificationScreen.style.display = 'flex';
  
  // Start verification timer
  verificationTimeLeft = VERIFICATION_TIME;
  updateVerificationTimer();
  
  verificationTimer = setInterval(() => {
    verificationTimeLeft -= 1000;
    updateVerificationTimer();
    
    if (verificationTimeLeft <= 0) {
      // Time's up
      clearInterval(verificationTimer);
      verificationStatus.textContent = 'Doğrulama süresi doldu! Lütfen tekrar deneyin.';
      verificationStatus.className = 'verification-status error';
      verificationStatus.style.display = 'block';
      
      // Disable verify button
      verifyBtn.disabled = true;
    }
  }, 1000);
  
  // Show notification
  showNotification('info', 'Doğrulama Gerekli', 'Kick.com sohbetine doğrulama kodunu göndermeniz gerekiyor. Lütfen talimatları takip edin.');
}

// Update verification timer
function updateVerificationTimer() {
  const minutes = Math.floor(verificationTimeLeft / 60000);
  const seconds = Math.floor((verificationTimeLeft % 60000) / 1000);
  verificationTimerElement.textContent = `Kalan süre: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Add warning classes
  if (verificationTimeLeft < 60000) {
    verificationTimerElement.className = 'verification-timer danger';
  } else if (verificationTimeLeft < 120000) {
    verificationTimerElement.className = 'verification-timer warning';
  } else {
    verificationTimerElement.className = 'verification-timer';
  }
}

// Copy verification code to clipboard
copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(verificationCode).then(() => {
    showNotification('success', 'Kopyalandı', 'Doğrulama kodu panoya kopyalandı.');
  }).catch(err => {
    console.error('Clipboard write failed:', err);
    showNotification('error', 'Hata', 'Kod kopyalanamadı. Lütfen manuel olarak kopyalayın.');
  });
});

// Cancel verification
cancelVerificationBtn.addEventListener('click', () => {
  // Clear verification timer
  clearInterval(verificationTimer);
  
  // Hide verification screen and show auth screen
  verificationScreen.style.display = 'none';
  authScreen.style.display = 'flex';
  
  // Reset verification status
  verificationStatus.style.display = 'none';
  verifyBtn.disabled = false;
});

// Verify button click
verifyBtn.addEventListener('click', () => {
  if (isVerifying) return;
  
  isVerifying = true;
  verificationStatus.textContent = 'Doğrulanıyor...';
  verificationStatus.className = 'verification-status pending';
  verificationStatus.style.display = 'block';
  
  // Fetch messages from the Kick.com API
  firebaseClient.fetchKickMessages(KICK_CHANNEL_ID)
    .then(data => {
      // Check if the verification code is in any of the messages
      let isVerified = false;
      
      if (data && data.data && data.data.messages && Array.isArray(data.data.messages)) {
        // Look through messages for our verification code, sent by the correct user
        const currentTime = new Date();
        const fiveMinutesAgo = new Date(currentTime.getTime() - (5 * 60 * 1000)); // 5 minutes ago
        
        for (const message of data.data.messages) {
          // Skip messages older than 5 minutes
          const messageTime = new Date(message.created_at);
          if (messageTime < fiveMinutesAgo) continue;
          
          // Check if content matches our verification code
          if (message.content === verificationCode) {
            // Check if the sender is the expected user (case insensitive)
            if (message.sender && message.sender.username.toLowerCase() === currentUser.kickName.toLowerCase()) {
              isVerified = true;
              break;
            }
          }
        }
      }
      
      if (isVerified) {
        // Verification successful
        verificationStatus.textContent = 'Doğrulama başarılı! Oyuna yönlendiriliyorsunuz...';
        verificationStatus.className = 'verification-status success';

        // Update user
        currentUser.verified = true;
        
        // Find user in users array and update
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex >= 0) {
          users[userIndex].verified = true;
          saveUsers();
        }
        
        // Store user info in localStorage for game page
        localStorage.setItem('tetrisCurrentUser', JSON.stringify({
          id: currentUser.id,
          username: currentUser.username,
          kickName: currentUser.kickName,
          verified: true
        }));
        
        // Proceed to game after a short delay
        setTimeout(() => {
          // Redirect to game page
          window.location.href = 'game.html';
        }, 2000);
      } else {
        // Verification failed
        verificationStatus.textContent = 'Doğrulama başarısız! Lütfen kodu sohbete gönderdiğinizden emin olun ve tekrar deneyin.';
        verificationStatus.className = 'verification-status error';
        isVerifying = false;
      }
    })
    .catch(error => {
      console.error('Verification error:', error);
      verificationStatus.textContent = 'Doğrulama sırasında bir hata oluştu. Lütfen tekrar deneyin.';
      verificationStatus.className = 'verification-status error';
      isVerifying = false;
    });
});

// Şifre sıfırlama kodunu kopyala
copyResetCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(resetCode).then(() => {
    showNotification('success', 'Kopyalandı', 'Sıfırlama kodu panoya kopyalandı.');
  }).catch(err => {
    console.error('Clipboard write failed:', err);
    showNotification('error', 'Hata', 'Kod kopyalanamadı. Lütfen manuel olarak kopyalayın.');
  });
});

// Sıfırlama kodunu doğrula
verifyResetCodeBtn.addEventListener('click', () => {
  if (isVerifying) return;
  
  isVerifying = true;
  errorMessage.textContent = 'Doğrulanıyor...';
  errorMessage.style.display = 'block';
  
  // Fetch messages from the Kick.com API
  firebaseClient.fetchKickMessages(KICK_CHANNEL_ID)
    .then(data => {
      // Mesajlarda sıfırlama kodunu ara
      let foundUser = null;
      
      if (data && data.data && data.data.messages && Array.isArray(data.data.messages)) {
        // Son 5 dakika içindeki mesajları kontrol et
        const currentTime = new Date();
        const fiveMinutesAgo = new Date(currentTime.getTime() - (5 * 60 * 1000));
        
        for (const message of data.data.messages) {
          // 5 dakikadan eski mesajları atla
          const messageTime = new Date(message.created_at);
          if (messageTime < fiveMinutesAgo) continue;
          
          // İçerik sıfırlama koduna eşleşiyor mu?
          if (message.content === resetCode) {
            // Gönderen kullanıcı adını al
            const senderUsername = message.sender.username.toLowerCase();
            
            // Bu kullanıcı adına sahip bir kullanıcı var mı?
            const matchedUser = users.find(u => u.kickName.toLowerCase() === senderUsername);
            
            if (matchedUser) {
              foundUser = matchedUser;
              break;
            }
          }
        }
      }
      
      if (foundUser) {
        // Kullanıcı bulundu, şifre sıfırlama formunu göster
        resetUser = foundUser;
        resetCodeSection.style.display = 'none';
        resetPasswordSection.style.display = 'block';
        errorMessage.style.display = 'none';
        showNotification('success', 'Doğrulama Başarılı', `${foundUser.username} kullanıcısı için şifre sıfırlama işlemi başlatıldı.`);
      } else {
        // Kullanıcı bulunamadı
        errorMessage.textContent = 'Doğrulama başarısız! Kodu sohbete gönderen kullanıcı sistemde kayıtlı değil veya kod bulunamadı.';
        errorMessage.style.display = 'block';
      }
      
      isVerifying = false;
    })
    .catch(error => {
      console.error('Verification error:', error);
      errorMessage.textContent = 'Doğrulama sırasında bir hata oluştu. Lütfen tekrar deneyin.';
      errorMessage.style.display = 'block';
      isVerifying = false;
    });
});

// Şifreyi sıfırla
resetPasswordBtn.addEventListener('click', () => {
  const password = newPassword.value;
  const confirmPassword = confirmNewPassword.value;
  
  // Şifreleri kontrol et
  if (!password) {
    errorMessage.textContent = 'Şifre boş olamaz!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (password !== confirmPassword) {
    errorMessage.textContent = 'Şifreler eşleşmiyor!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (password.length < 6) {
    errorMessage.textContent = 'Şifre en az 6 karakter olmalıdır!';
    errorMessage.style.display = 'block';
    return;
  }
  
  if (!resetUser) {
    errorMessage.textContent = 'Geçersiz işlem! Lütfen tekrar deneyin.';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Kullanıcının şifresini güncelle
  const userIndex = users.findIndex(u => u.id === resetUser.id);
  if (userIndex >= 0) {
    users[userIndex].password = password;
    saveUsers();
    
    // Başarılı bildirim göster
    showNotification('success', 'Şifre Sıfırlandı', 'Şifreniz başarıyla sıfırlandı. Şimdi giriş yapabilirsiniz.');
    
    // Giriş sekmesine geç
    authTabs.forEach(tab => {
      if (tab.getAttribute('data-tab') === 'login') {
        tab.click();
      }
    });
  } else {
    errorMessage.textContent = 'Kullanıcı bulunamadı!';
    errorMessage.style.display = 'block';
  }
});

// Check if user is already logged in
window.addEventListener('load', () => {
  const savedUser = localStorage.getItem('tetrisCurrentUser');
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      if (user && user.verified) {
        // User is already logged in, redirect to game
        window.location.href = 'game.html';
      }
    } catch (error) {
      console.error("Error parsing saved user:", error);
      localStorage.removeItem('tetrisCurrentUser');
    }
  }
});