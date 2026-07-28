# 🎓 Pixel Campus

A 2D pixel-art virtual world for language learning centers — students move avatars around and talk to nearby people via **proximity-based voice chat** (like Gather.town).

![Tech Stack](https://img.shields.io/badge/Next.js-14-black) ![Phaser](https://img.shields.io/badge/Phaser-3-purple) ![Socket.io](https://img.shields.io/badge/Socket.io-4-white) ![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC-green)

---

## ✨ Features

- 🗺️ **2D Pixel World** — 64×48 tile map with 1 central plaza + 6 coffee shop rooms (Groups 1–6)
- 🧑‍🤝‍🧑 **Real-time Multiplayer** — Socket.io syncs avatar positions at 10 updates/sec
- 🎙️ **Proximity Voice Chat** — LiveKit SFU audio fades in/out based on player distance
- 🎮 **Smooth Movement** — WASD / Arrow keys with wall collision
- 🏠 **Room Zones** — Walk into any coffee shop room freely
- 🟢 **Speaking Indicators** — Glowing ring around avatars when they speak

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- A free [LiveKit Cloud](https://cloud.livekit.io) account (for voice chat)

### 1. Clone & Set Up Environment

```bash
cd "pixel-campus"

# Copy env template
cp .env.example server/.env
cp .env.example client/.env.local
```

Edit both `.env` files with your credentials (see [Getting LiveKit Credentials](#-getting-livekit-credentials) below).

### 2. Start the Server

```bash
cd server
npm install
npm run dev
# → Server running on http://localhost:3001
```

### 3. Start the Client

```bash
cd client
npm install
npm run dev
# → App running on http://localhost:3000
```

### 4. Open in Browser

Visit `http://localhost:3000`, enter your name, pick a group, and **Enter Campus**!

Open a second tab to see multiplayer in action.

---

## 🔑 Getting LiveKit Credentials

1. Go to [cloud.livekit.io](https://cloud.livekit.io) and sign up (free)
2. Create a new project
3. Go to **Settings → API Keys**
4. Copy `API Key`, `API Secret`, and the **WebSocket URL** (starts with `wss://`)
5. Paste into your `.env` files:

```env
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_URL=wss://your-project-xxxx.livekit.cloud
```

> **Note**: The app works fully (movement, avatars, HUD) without LiveKit credentials. Voice chat is simply disabled until you add them.

---

## 📁 Project Structure

```
pixel-campus/
├── client/                      # Next.js 14 frontend
│   ├── components/
│   │   ├── JoinScreen.tsx       # Entry screen (name + group)
│   │   └── GameCanvas.tsx       # Phaser game mount + HUD overlay
│   ├── lib/
│   │   ├── socket.ts            # Socket.io singleton client
│   │   └── livekit.ts           # LiveKit room + proximity volume
│   ├── maps/
│   │   └── world.ts             # Tile map data + layout generator
│   ├── pages/
│   │   ├── index.tsx            # App entry point
│   │   ├── _app.tsx
│   │   └── api/
│   │       └── livekit-token.ts # Server-side JWT generation
│   ├── scenes/
│   │   └── MainScene.ts         # Phaser scene: map, avatars, movement
│   └── styles/
│       └── globals.css          # Premium dark pixel-art styling
├── server/
│   ├── index.js                 # Socket.io + Express + LiveKit endpoint
│   └── package.json
├── .env.example
└── README.md
```

---

## 🎮 Controls

| Key | Action |
|-----|--------|
| `W` / `↑` | Move up |
| `S` / `↓` | Move down |
| `A` / `←` | Move left |
| `D` / `→` | Move right |
| `M` | Mute / unmute microphone |

---

## 🔊 Proximity Voice Chat — How It Works

All users join a **single LiveKit room** named `pixel-campus`. Volume is controlled entirely client-side:

```
Distance ≤ 150px  →  Volume = 1.0 (full)
Distance 150–500px →  Volume linearly fades 1.0 → 0
Distance > 500px  →  Volume = 0 (silent)
```

LiveKit's SFU architecture means each client only sends **one upstream** audio track regardless of how many listeners — perfect for 90+ concurrent users.

---

## 🌐 Deployment

### Frontend → Vercel

```bash
cd client
npx vercel --prod
```

Set environment variables in Vercel Dashboard:
- `NEXT_PUBLIC_SERVER_URL` → your Railway/Render server URL
- `NEXT_PUBLIC_LIVEKIT_URL` → your LiveKit WSS URL
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`

### Backend → Railway

1. Push `server/` to GitHub
2. Create a new Railway project → Deploy from GitHub
3. Set environment variables in Railway dashboard
4. Railway auto-assigns a public URL — paste it as `NEXT_PUBLIC_SERVER_URL` in Vercel

### Backend → Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Root directory: `server`
3. Build command: `npm install`
4. Start command: `node index.js`
5. Add env vars in the Render dashboard

---

## 🗄️ Supabase (Optional)

The MVP uses in-memory state on the server. To persist sessions:

1. Create a project at [supabase.com](https://supabase.com)
2. Run this SQL in the Supabase SQL editor:

```sql
create table sessions (
  id         text primary key,
  name       text not null,
  "group"    int  not null,
  x          float not null default 0,
  y          float not null default 0,
  socket_id  text,
  color      text,
  created_at timestamptz default now()
);
```

3. Add `SUPABASE_URL` and `SUPABASE_KEY` to your server `.env`
4. Uncomment the Supabase write calls in `server/index.js`

---

## 🏗️ Architecture

```
Browser Tab A          Browser Tab B
     │                      │
     ▼                      ▼
Socket.io Client    Socket.io Client
     │                      │
     └─────────┐  ┌─────────┘
               ▼  ▼
         Socket.io Server
         (Express + Node.js)
               │
               ▼
         LiveKit Token
           Endpoint
               │
               ▼
         LiveKit Cloud SFU
         (WebRTC Audio Mixing)
```

---

## 📝 License

MIT — free to use, modify, and deploy.
