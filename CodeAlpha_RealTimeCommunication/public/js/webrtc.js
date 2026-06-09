const roomId = new URLSearchParams(location.search).get('id');
const socket = io(window.SOCKET_URL || undefined, { withCredentials: true });
const peers = {};
const iceQueues = {};
let localStream = null;
let screenStream = null;
let cameraVideoTrack = null;
let username = '';
let micEnabled = true;
let camEnabled = true;

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

async function flushIceQueue(socketId) {
  const pc = peers[socketId];
  const queue = iceQueues[socketId];
  if (!pc || !queue?.length) return;
  while (queue.length) await pc.addIceCandidate(queue.shift());
  delete iceQueues[socketId];
}

async function init() {
  const me = await apiFetch('/api/me').then(r => r.json());
  if (!me.user) { location.href = '/login.html'; return; }
  username = me.user.username;
  document.getElementById('room-id-display').textContent = roomId;
  document.getElementById('local-label').textContent = `${username} (You)`;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    cameraVideoTrack = localStream.getVideoTracks()[0] || null;
    document.getElementById('local-video').srcObject = localStream;
  } catch (e) {
    alert('Camera/microphone access required for video calls.');
  }

  if (!roomId) { alert('Room ID is required.'); location.href = '/'; return; }

  socket.emit('join-room', { roomId, username });
  setupSocketHandlers();
  setupWhiteboard();
}

function setupSocketHandlers() {
  socket.on('room-users', (users) => users.forEach(u => createPeerConnection(u.socketId, true)));
  socket.on('user-joined', ({ socketId, username: uname }) => {
    addChatMessage('System', `${uname} joined the room`);
    createPeerConnection(socketId, false);
  });
  socket.on('user-left', ({ username: uname }) => addChatMessage('System', `${uname} left the room`));
  socket.on('offer', async ({ from, offer }) => {
    if (!peers[from]) createPeerConnection(from, false);
    await peers[from].setRemoteDescription(offer);
    await flushIceQueue(from);
    const answer = await peers[from].createAnswer();
    await peers[from].setLocalDescription(answer);
    socket.emit('answer', { to: from, answer });
  });
  socket.on('answer', async ({ from, answer }) => {
    if (peers[from]) {
      await peers[from].setRemoteDescription(answer);
      await flushIceQueue(from);
    }
  });
  socket.on('ice-candidate', async ({ from, candidate }) => {
    const pc = peers[from];
    if (!pc || !pc.remoteDescription) {
      if (!iceQueues[from]) iceQueues[from] = [];
      iceQueues[from].push(candidate);
      return;
    }
    await pc.addIceCandidate(candidate);
  });
  socket.on('chat-message', ({ username: uname, message, time, encrypted }) => {
    addChatMessage(uname, message, time, encrypted);
  });
  socket.on('whiteboard-draw', drawOnCanvas);
  socket.on('whiteboard-state', (strokes) => strokes.forEach(drawOnCanvas));
  socket.on('whiteboard-clear', () => {
    const canvas = document.getElementById('whiteboard');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  });
  socket.on('file-shared', (file) => addSharedFile(file));
}

function createPeerConnection(socketId, initiator) {
  const pc = new RTCPeerConnection(config);
  peers[socketId] = pc;

  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
  };

  pc.ontrack = (e) => {
    let wrapper = document.getElementById(`video-${socketId}`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'video-wrapper';
      wrapper.id = `video-${socketId}`;
      const video = document.createElement('video');
      video.id = `vid-${socketId}`;
      video.autoplay = true;
      video.playsInline = true;
      const label = document.createElement('span');
      label.className = 'video-label';
      label.textContent = 'Participant';
      wrapper.appendChild(video);
      wrapper.appendChild(label);
      document.getElementById('videos').appendChild(wrapper);
    }
    const video = wrapper.querySelector('video');
    if (video.srcObject !== e.streams[0]) video.srcObject = e.streams[0];
  };

  if (initiator) {
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      socket.emit('offer', { to: socketId, offer });
    });
  }
}

async function replaceVideoTrack(track) {
  Object.values(peers).forEach(pc => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(track);
  });
}

async function stopScreenShare() {
  if (!screenStream) return;
  screenStream.getTracks().forEach(t => t.stop());
  screenStream = null;
  if (cameraVideoTrack) await replaceVideoTrack(cameraVideoTrack);
  document.getElementById('screen-btn').textContent = '🖥️ Share Screen';
  addChatMessage('System', `${username} stopped screen sharing`);
}

async function shareScreen() {
  try {
    if (screenStream) { await stopScreenShare(); return; }
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    await replaceVideoTrack(screenTrack);
    document.getElementById('screen-btn').textContent = '🛑 Stop Share';
    screenTrack.onended = () => stopScreenShare();
    addChatMessage('System', `${username} started screen sharing`);
  } catch (e) {
    console.error('Screen share failed:', e);
  }
}

function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  document.getElementById('mic-btn').textContent = micEnabled ? '🎤 Mute' : '🔇 Unmute';
}

function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  document.getElementById('cam-btn').textContent = camEnabled ? '📷 Cam Off' : '📷 Cam On';
}

async function shareFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  socket.emit('file-shared', { roomId, file: { url: data.url, filename: data.filename, encrypted: data.encrypted } });
  addSharedFile({ ...data, sharedBy: username });
  addChatMessage('System', `${username} shared file: ${data.filename}`);
}

function addSharedFile(file) {
  const el = document.getElementById('shared-files');
  const div = document.createElement('div');
  div.className = 'shared-file';
  const encrypted = file.encrypted ? ' 🔒' : '';
  div.innerHTML = `<a href="${file.url}" target="_blank" download>📎 ${file.filename}${encrypted}</a> <small>by ${file.sharedBy || 'you'}</small>`;
  el.appendChild(div);
}

function sendChat(e) {
  e.preventDefault();
  const input = document.getElementById('chat-text');
  socket.emit('chat-message', { roomId, message: input.value });
  input.value = '';
}

function addChatMessage(uname, message, time, encrypted) {
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const lock = encrypted ? ' 🔒' : '';
  div.innerHTML = `<strong>${uname}</strong>: ${message}${lock} <small>${time ? new Date(time).toLocaleTimeString() : ''}</small>`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

let wbTool = 'draw';

function setWbTool(tool) {
  wbTool = tool;
  document.getElementById('wb-draw-btn').classList.toggle('active', tool === 'draw');
  document.getElementById('wb-text-btn').classList.toggle('active', tool === 'text');
  document.getElementById('whiteboard').classList.toggle('text-mode', tool === 'text');
}

function setupWhiteboard() {
  const canvas = document.getElementById('whiteboard');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  let drawing = false;
  let lastX = 0, lastY = 0;

  function emitDraw(data) {
    drawOnCanvas(data);
    socket.emit('whiteboard-draw', { roomId, data });
  }

  function drawStroke(x1, y1, x2, y2) {
    emitDraw({
      type: 'stroke',
      x1, y1, x2, y2,
      color: document.getElementById('wb-color').value,
      size: document.getElementById('wb-size').value
    });
  }

  function placeText(x, y) {
    const text = prompt('Enter text for whiteboard:');
    if (!text?.trim()) return;
    emitDraw({
      type: 'text',
      x, y,
      text: text.trim(),
      color: document.getElementById('wb-color').value,
      size: Math.max(14, document.getElementById('wb-size').value * 4)
    });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  canvas.addEventListener('mousedown', (e) => {
    if (wbTool === 'text') { placeText(e.offsetX, e.offsetY); return; }
    drawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!drawing || wbTool !== 'draw') return;
    drawStroke(lastX, lastY, e.offsetX, e.offsetY);
    [lastX, lastY] = [e.offsetX, e.offsetY];
  });
  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('mouseleave', () => drawing = false);

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const [x, y] = getPos(e);
    if (wbTool === 'text') { placeText(x, y); return; }
    drawing = true;
    [lastX, lastY] = [x, y];
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!drawing || wbTool !== 'draw') return;
    const [x, y] = getPos(e);
    drawStroke(lastX, lastY, x, y);
    [lastX, lastY] = [x, y];
  });
  canvas.addEventListener('touchend', () => drawing = false);

  window.drawOnCanvas = function(data) {
    if (data.type === 'text') {
      ctx.font = `${data.size}px sans-serif`;
      ctx.fillStyle = data.color;
      ctx.fillText(data.text, data.x, data.y);
      return;
    }
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(data.x1, data.y1);
    ctx.lineTo(data.x2, data.y2);
    ctx.stroke();
  };
}

function clearWhiteboard() {
  const canvas = document.getElementById('whiteboard');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('whiteboard-clear', { roomId });
}

function leaveRoom() {
  Object.values(peers).forEach(pc => pc.close());
  if (screenStream) screenStream.getTracks().forEach(t => t.stop());
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  socket.disconnect();
  location.href = '/';
}

init();
