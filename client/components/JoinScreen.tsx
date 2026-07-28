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

  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const handleInstallPWA = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    } else {
      setShowInstallGuide(true);
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
          <button
            type="button"
            onClick={handleInstallPWA}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            📱 Telefonga App Qilib O'rnatish (Install App)
          </button>
        </div>
      </div>

      {/* Modal Guide for PWA installation */}
      {showInstallGuide && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowInstallGuide(false)}
        >
          <div
            style={{
              background: '#161b22',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📱</div>
            <h3 style={{ color: '#ffffff', fontSize: '18px', marginBottom: '8px' }}>
              Telefonga App Qilib O'rnatish
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px', lineHeight: '1.4' }}>
              O'yin 60 FPS tezlikda, brauzer ortiqcha menyularisiz to'liq ekranda va silliq ishlashi uchun o'rnatib oling:
            </p>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.05)', padding: '12px 14px', borderRadius: '10px', marginBottom: '10px', fontSize: '13px' }}>
              <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>🤖 Android (Google Chrome):</div>
              O'ng tepadagi <strong>3 nuqta (⋮)</strong> ni bosing ➔ <strong>"Приложениеni o'rnatish"</strong> (yoki <i>Add to Home screen</i>).
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.05)', padding: '12px 14px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
              <div style={{ color: '#3b82f6', fontWeight: 600, marginBottom: '4px' }}>🍏 iPhone (Safari):</div>
              Pastdagi <strong>Ulashish (📤 Share)</strong> tugmasini bosing ➔ <strong>"На экран «Домой»"</strong> ni tanlang.
            </div>

            <button
              onClick={() => setShowInstallGuide(false)}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Tushunarli 👍
            </button>
          </div>
        </div>
      )}

      {/* Animated background pixels */}
      <div className="bg-pixels" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className={`bg-pixel bg-pixel-${i % 5}`} />
        ))}
      </div>
    </div>
  );
}
