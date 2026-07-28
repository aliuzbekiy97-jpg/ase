/**
 * Pixel Campus — Socket.io + Express Server
 * Handles: player presence, real-time position sync, LiveKit JWT generation
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ─── In-memory player state ──────────────────────────────────────────────────
// Map<socketId, PlayerData>
const users = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a deterministic HSL color from a username string */
function nameToColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 58%)`;
}

// ─── LiveKit Token Endpoint ───────────────────────────────────────────────────

app.get('/api/livekit-token', async (req, res) => {
  const { name, room = 'pixel-campus' } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'name query param is required' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  // Return null token gracefully when credentials are not set
  if (!apiKey || !apiSecret || !livekitUrl) {
    console.warn('[LiveKit] Credentials not configured — voice chat disabled');
    return res.json({ token: null, livekitUrl: null, voiceEnabled: false });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: name,
      ttl: '8h',
    });
    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    console.log(`[LiveKit] Token issued for "${name}" in room "${room}"`);
    res.json({ token, livekitUrl, voiceEnabled: true });
  } catch (err) {
    console.error('[LiveKit] Token generation failed:', err.message);
    res.status(500).json({ error: 'Failed to generate LiveKit token' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', players: users.size });
});

// ─── Socket.io Events ─────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  /**
   * join — new player enters the world
   * payload: { name, group, x, y }
   */
  socket.on('join', (data) => {
    const { name, group, gender, currentRoom, x, y } = data;

    const player = {
      id: socket.id,
      name: String(name).slice(0, 24),   // sanitize
      group: Number(group) || 1,
      gender: gender === 'girl' ? 'girl' : 'boy',
      currentRoom: currentRoom || 'outdoor',
      x: Number(x) || 0,
      y: Number(y) || 8,
      color: nameToColor(name),
      facing: 'down',
    };

    users.set(socket.id, player);
    console.log(`[Socket] Player joined: "${player.name}" (${player.currentRoom}) — total: ${users.size}`);

    // Send full world state to the new joiner
    socket.emit('playersState', Array.from(users.values()));

    // Notify everyone else about the new player
    socket.broadcast.emit('playerJoined', player);
  });

  /**
   * move — player position update (throttled by client to ~10/sec)
   * payload: { x, y, currentRoom, facing }
   */
  socket.on('move', (data) => {
    const player = users.get(socket.id);
    if (!player) return;

    player.x = Number(data.x);
    player.y = Number(data.y);
    if (data.currentRoom) player.currentRoom = data.currentRoom;
    player.facing = data.facing || 'down';

    // Broadcast delta to all OTHER clients
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      x: player.x,
      y: player.y,
      currentRoom: player.currentRoom,
      facing: player.facing,
    });
  });

  /**
   * disconnect — player leaves
   */
  socket.on('disconnect', (reason) => {
    const player = users.get(socket.id);
    if (player) {
      console.log(`[Socket] Player left: "${player.name}" (${reason}) — total: ${users.size - 1}`);
      users.delete(socket.id);
      io.emit('playerLeft', socket.id);
    }
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 Pixel Campus server ready on port ${PORT}`);
  console.log(`   Socket.io : ws://localhost:${PORT}`);
  console.log(`   Token API  : http://localhost:${PORT}/api/livekit-token`);
  console.log(`   Health     : http://localhost:${PORT}/health\n`);
});
