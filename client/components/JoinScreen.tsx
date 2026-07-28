/**
 * components/JoinScreen.tsx
 * Entry screen — collect username + group, fetch LiveKit token, then enter the world
 */
import React, { useState, useEffect, useCallback } from 'react';

interface JoinScreenProps {
  onJoin: (
    name: string,
    group: number,
    gender: 'boy' | 'girl',
    livekitToken: string | null,
    livekitUrl: string | null
  ) => void;
}

export default function JoinScreen({ onJoin }: JoinScreenProps) {
  const [name,           setName]           = useState('');
  const [group,          setGroup]          = useState(1);
  const [gender,         setGender]         = useState<'boy' | 'girl'>('boy');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  const handleInstallPWA = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    }
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter your name'); return; }

    setLoading(true);
    setError('');

    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'https://ase-aomc.onrender.com';
      const res = await fetch(
        `${serverUrl}/api/livekit-token?name=${encodeURIComponent(trimmed)}&room=pixel-campus`
      ).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        onJoin(trimmed, group, gender, data.token ?? null, data.livekitUrl ?? null);
      } else {
        // Server offline / localhost fallback — allow entering world anyway!
        onJoin(trimmed, group, gender, null, null);
      }
    } catch (err: any) {
      // Fallback: enter world directly
      onJoin(trimmed, group, gender, null, null);
    }
  }, [name, group, gender, onJoin]);

  return (
    <div className="join-screen">
      <div className="join-card">
        {/* Logo / Header */}
        <div className="join-logo">
          <div className="logo-pixel">🎓</div>
          <h1 className="logo-title">Pixel Campus</h1>
          <p className="logo-sub">Language Learning Virtual World</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="join-form">
          <div className="form-group">
            <label htmlFor="playerName" className="form-label">Your Name</label>
            <input
              id="playerName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={24}
              className="form-input"
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="groupSelect" className="form-label">Select Group</label>
            <select
              id="groupSelect"
              value={group}
              onChange={(e) => setGroup(Number(e.target.value))}
              className="form-select"
            >
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>Group {g}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Personaj jinsi (Gender)</label>
            <div className="gender-selector">
              <button
                type="button"
                className={`gender-btn ${gender === 'boy' ? 'active' : ''}`}
                onClick={() => setGender('boy')}
              >
                👦 O'g'il bola
              </button>
              <button
                type="button"
                className={`gender-btn ${gender === 'girl' ? 'active' : ''}`}
                onClick={() => setGender('girl')}
              >
                👧 Qiz bola
              </button>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <button
            id="joinBtn"
            type="submit"
            className="join-btn"
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" />
                Connecting...
              </span>
            ) : (
              'Enter Campus →'
            )}
          </button>
        </form>

        {/* Info & PWA Install */}
        <div className="join-info">
          <div className="info-item">🎮 WASD / Joysticks to move</div>
          <div className="info-item">🎙️ Proximity Voice Chat activated</div>
          <div className="info-item">⚡ 60 FPS Mobile Optimized</div>
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallPWA}
              style={{
                marginTop: '10px',
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              📱 Telefonga App Qilib O'rnatish (Install App)
            </button>
          )}
        </div>
      </div>

      {/* Animated background pixels */}
      <div className="bg-pixels" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className={`bg-pixel bg-pixel-${i % 5}`} />
        ))}
      </div>
    </div>
  );
}
