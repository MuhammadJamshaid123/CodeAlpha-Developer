# CodeAlpha_RealTimeCommunication

**Task 4: Real-Time Communication App** — CodeAlpha Full Stack Development Internship

## Features

- Multi-user video calling (WebRTC)
- Screen sharing via `getDisplayMedia`
- File sharing with server upload
- Collaborative whiteboard (real-time via Socket.io)
- AES-256 data encryption (crypto-js) for file metadata
- User authentication (bcrypt password hashing)

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript, WebRTC
- **Backend:** Express.js + Socket.io
- **Libraries:** WebRTC, Socket.io, crypto-js, multer
- **Database:** SQLite

## Setup

```bash
npm install
npm start
```

Open [http://localhost:3004](http://localhost:3004)

## Usage

1. Register/login
2. Create a room or join with a room ID
3. Allow camera/microphone access
4. Share screen, files, and draw on the whiteboard

> **Note:** WebRTC works best on localhost or HTTPS. For production, deploy behind HTTPS.
