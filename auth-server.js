const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 8888;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// setup file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

console.log('[SERVER] Starting...');

app.use(cors());
app.use(express.json());

let users = {};
let documents = {};
const usersFile = 'users.json';
const documentsFile = 'documents.json';

// load user data
if (fs.existsSync(usersFile)) {
  try {
    users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    console.log('[SERVER] Loaded users:', Object.keys(users));
  } catch (e) {
    console.error('[SERVER] Error loading users:', e.message);
  }
}

if (fs.existsSync(documentsFile)) {
  try {
    documents = JSON.parse(fs.readFileSync(documentsFile, 'utf8'));
    console.log('[SERVER] Loaded documents:', Object.keys(documents).length);
  } catch (e) {
    console.error('[SERVER] Error loading documents:', e.message);
  }
}

function saveUsers() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function saveDocuments() {
  fs.writeFileSync(documentsFile, JSON.stringify(documents, null, 2));
}

// check if user has valid token
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization header' });
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Invalid authorization format' });
  }
  
  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token: ' + err.message });
  }
}

// calculate hash of file
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// IMPORTANT: routes before static files
app.post('/register', async (req, res) => {
  console.log('[API] POST /register');
  try {
    const { username, password } = req.body;
    if (users[username]) return res.status(400).json({ message: 'User exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = { password: hashedPassword };
    saveUsers();
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('[API] Register error:', err);
    res.status(500).json({ message: err.message });
  }
});

app.post('/login', async (req, res) => {
  console.log('[API] POST /login body:', req.body);
  try {
    const { username, password } = req.body;
    
    // test account
    if (username === 'admin' && password === 'admin123') {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
      console.log('[API] Admin login successful');
      return res.json({ token });
    }

    // check user exists
    const user = users[username];
    if (!user) {
      console.log('[API] User not found:', username);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Verify password with bcrypt
    try {
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.log('[API] Invalid password for user:', username);
        return res.status(401).json({ message: 'Invalid username or password' });
      }
    } catch (bcryptErr) {
      console.log('[API] Password hash invalid for user:', username, bcryptErr.message);
      // Fallback: try plain text comparison for users with plain text passwords
      if (user.password === password) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
        console.log('[API] User login successful (plain text):', username);
        return res.json({ token });
      }
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
    console.log('[API] User login successful:', username);
    res.json({ token });
  } catch (err) {
    console.error('[API] Login error:', err);
    res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

app.post('/logout', (req, res) => {
  console.log('[API] POST /logout');
  res.json({ message: 'Logged out' });
});

app.post('/upload', verifyToken, upload.single('document'), (req, res) => {
  console.log('[API] POST /upload by user:', req.user.username);
  
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = calculateHash(fileBuffer);
    
    const documentId = `${Date.now()}-${req.user.username}`;
    const documentRecord = {
      id: documentId,
      filename: req.file.originalname,
      uploadedBy: req.user.username,
      uploadedAt: new Date().toISOString(),
      filePath: req.file.path,
      fileSize: req.file.size,
      hash: fileHash,
      verified: false,
      verifications: []
    };

    documents[documentId] = documentRecord;
    saveDocuments();

    console.log('[API] Document uploaded successfully:', documentId, 'Hash:', fileHash);
    res.json({
      message: 'Document uploaded successfully!',
      documentId,
      hash: fileHash,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('[API] Upload error:', error.message);
    res.status(500).json({ message: 'Upload failed: ' + error.message });
  }
});

app.post('/verify', verifyToken, upload.single('document'), (req, res) => {
  console.log('[API] POST /verify by user:', req.user.username);
  
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded for verification' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const fileHash = calculateHash(fileBuffer);
    
    // Check if this hash exists in our documents
    let isVerified = false;
    let matchedDocument = null;

    for (const docId in documents) {
      if (documents[docId].hash === fileHash) {
        isVerified = true;
        matchedDocument = documents[docId];
        
        // Record this verification
        documents[docId].verifications.push({
          verifiedBy: req.user.username,
          verifiedAt: new Date().toISOString(),
          verified: true
        });
        saveDocuments();
        break;
      }
    }

    // Clean up uploaded temp file
    fs.unlinkSync(req.file.path);

    if (isVerified) {
      console.log('[API] Document verified successfully:', matchedDocument.id);
      res.json({
        message: '✓ Document is AUTHENTIC and verified!',
        verified: true,
        originalFilename: matchedDocument.filename,
        uploadedBy: matchedDocument.uploadedBy,
        uploadedAt: matchedDocument.uploadedAt,
        fileSize: matchedDocument.fileSize,
        hash: fileHash,
        documentId: matchedDocument.id
      });
    } else {
      console.log('[API] Document verification failed - hash mismatch');
      res.status(400).json({
        message: '✗ Document verification FAILED - No matching authentic document found',
        verified: false,
        hash: fileHash,
        reason: 'This document does not match any uploaded authentic documents'
      });
    }
  } catch (error) {
    console.error('[API] Verification error:', error.message);
    res.status(500).json({ message: 'Verification failed: ' + error.message });
  }
});

app.get('/documents', verifyToken, (req, res) => {
  console.log('[API] GET /documents by user:', req.user.username);
  try {
    const userDocs = Object.values(documents).filter(d => d.uploadedBy === req.user.username);
    res.json({ 
      documents: userDocs,
      total: userDocs.length 
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch documents: ' + error.message });
  }
});


app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// STATIC FILES - AFTER ALL API ROUTES
console.log('[SERVER] Setting up static file serving...');
app.use(express.static(path.join(__dirname, '.')));

// START SERVER
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('[SERVER] ✓ Running on port ' + PORT);
});

server.on('error', (err) => {
  console.error('[SERVER] ERROR:', err);
  process.exit(1);
});
