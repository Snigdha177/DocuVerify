const API_BASE = 'http://localhost:8888';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('token');
}

// Helper function for retrying failed requests
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (retries > 0) {
      console.warn(`retrying...`, error.message);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    } else {
      throw error;
    }
  }
}

// Check if server is running
async function isServerRunning() {
  try {
    const response = await fetch(`${API_BASE}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

function checkLoginStatus() {
  const token = getToken();
  const loginLink = document.getElementById('login-link');
  const logoutLink = document.getElementById('logout-link');
  if (token) {
    if (loginLink) loginLink.style.display = 'none';
    if (logoutLink) logoutLink.style.display = 'inline';
  } else {
    if (loginLink) loginLink.style.display = 'inline';
    if (logoutLink) logoutLink.style.display = 'none';
  }
}

async function register() {
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const msg = document.getElementById('regMsg');

  if (!username || !password) {
    msg.textContent = 'Please enter both username and password.';
    msg.style.color = 'red';
    return;
  }

  if (password.length < 6) {
    msg.textContent = 'Password must be at least 6 characters long.';
    msg.style.color = 'red';
    return;
  }

  msg.textContent = 'Registering...';
  msg.style.color = 'blue';

  try {
    const response = await fetchWithRetry(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      msg.textContent = 'Account created! Now you can login.';
      msg.style.color = 'green';
      // Clear form after successful registration
      document.getElementById('regUsername').value = '';
      document.getElementById('regPassword').value = '';
    } else {
      msg.textContent = data.message || 'Registration failed.';
      msg.style.color = 'red';
    }
  } catch (error) {
    console.error('error:', error);
    msg.textContent = 'Server not responding. Make sure it\'s running.';
    msg.style.color = 'red';
  }
}

async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const msg = document.getElementById('loginMsg');

  if (!username || !password) {
    msg.textContent = 'Please enter both username and password.';
    msg.style.color = 'red';
    return;
  }

  msg.textContent = 'Signing in...';
  msg.style.color = 'blue';

  try {
    // Check if server is available before attempting login
    const serverRunning = await isServerRunning();
    if (!serverRunning) {
      msg.textContent = 'Server is down. Check if it\'s running.';
      msg.style.color = 'red';
      return;
    }

    const response = await fetchWithRetry(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.token) {
      setToken(data.token);
      msg.textContent = 'Login successful!';
      msg.style.color = 'green';
      checkLoginStatus();
      setTimeout(() => window.location.href = 'index.html', 1000);
    } else {
      msg.textContent = data.message || 'Wrong username or password';
      msg.style.color = 'red';
    }
  } catch (error) {
    console.error('login failed:', error);
    msg.textContent = 'Connection error';
    msg.style.color = 'red';
  }
}

function logout() {
  removeToken();
  checkLoginStatus();
  window.location.href = 'index.html';
}

async function saveDocument() {
  const token = getToken();
  if (!token) {
    alert('Please login first.');
    window.location.href = 'login.html';
    return;
  }
  const fileInput = document.getElementById('uploadFile');
  const msg = document.getElementById('uploadMsg');
  if (!fileInput.files[0]) {
    msg.textContent = 'Please select a file.';
    msg.style.color = 'red';
    return;
  }
  const formData = new FormData();
  formData.append('document', fileInput.files[0]);
  
  msg.textContent = 'Uploading...';
  msg.style.color = 'blue';

  try {
    const response = await fetchWithRetry(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok) {
      msg.textContent = '✓ ' + data.message + ' Hash: ' + data.hash.substring(0, 16) + '...';
      msg.style.color = 'green';
      fileInput.value = '';
    } else {
      msg.textContent = '✗ Upload failed: ' + data.message;
      msg.style.color = 'red';
    }
  } catch (error) {
    console.error('error:', error);
    msg.textContent = 'Upload failed';
    msg.style.color = 'red';
  }
}

async function verifyDocument() {
  const token = getToken();
  if (!token) {
    alert('Please login first.');
    window.location.href = 'login.html';
    return;
  }
  const fileInput = document.getElementById('verifyFile');
  const msg = document.getElementById('verifyMsg');
  if (!fileInput.files[0]) {
    msg.textContent = 'Please select a file to verify.';
    msg.style.color = 'red';
    return;
  }
  const formData = new FormData();
  formData.append('document', fileInput.files[0]);
  
  msg.textContent = 'Checking...';
  msg.style.color = 'blue';

  try {
    console.log('Token:', token.substring(0, 20) + '...');
    const response = await fetchWithRetry(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    console.log('Verify response:', data);
    
    if (response.ok && data.verified) {
      msg.innerHTML = '<strong style="color: green;">✓ ' + data.message + '</strong><br>Original: ' + data.originalFilename + '<br>Uploaded by: ' + data.uploadedBy;
      msg.style.color = 'green';
      fileInput.value = '';
    } else {
      msg.innerHTML = '<strong style="color: red;">' + data.message + '</strong>';
      msg.style.color = 'red';
    }
  } catch (error) {
    console.error('error:', error);
    msg.textContent = 'Verification failed';
    msg.style.color = 'red';
  }
}

// Check login status when page loads
document.addEventListener('DOMContentLoaded', () => {
  checkLoginStatus();
});