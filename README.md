# Document Verification System

A web application for uploading and verifying documents using SHA-256 hashing.

## Features

- User login & registration
- Upload documents with automatic hashing  
- Verify if documents are authentic
- Server auto-restart on crash

## How to Run

```
npm install
npm start
```

Server runs on http://localhost:8888

## Test Login

- Username: admin
- Password: admin123

## How It Works

1. Create account or login
2. Upload a document - system calculates hash
3. Upload same document again to verify
4. Shows AUTHENTIC if hash matches

## Project Structure

- auth-server.js - Backend
- js/app.js - Frontend
- HTML files - Pages
- uploads/ - Uploaded files
