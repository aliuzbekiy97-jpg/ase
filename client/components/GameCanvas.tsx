/**
 * components/GameCanvas.tsx — mounts Three.js 3D world + HUD overlay
 */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import {
  connectToLiveKit, disconnectLiveKit,
  toggleMicrophone, onLocalSpeaking,
} from '../lib/livekit';
import { type PlayerData } from '../lib/socket';
import { World3D } from '../scenes/World3D';

interface Props {
  playerName:   string;
  playerGroup:  number;
  playerGender: 'boy' | 'girl';
  playerColor:  string;
  livekitToken: string | null;
  livekitUrl:   string | null;
}

export default function GameCanvas({
  playerName, playerGroup, playerGender = 'boy', playerColor, livekitToken, livekitUrl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef     = useRef<World3D | null>(null);
  const leftTouchId  = useRef<number | null>(null);
  const rightTouchId = useRef<number | null>(null);

  const [micOn,        setMicOn]        = useState(true);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [playerCount,  setPlayerCount]  = useState(1);
  const [currentRoom,  setCurrentRoom]  = useState<string>('outdoor');
  const [roomTitle,    setRoomTitle]    = useState<string>('New York City Campus 🗽');
  const [thumbPos,      setThumbPos]      = useState({ x: 0, y: 0 });
  const [rightThumbPos, setRightThumbPos] = useState({ x: 0, y: 0 });

  // ── Boot Three.js World ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || worldRef.current) return;

    const world = new World3D(
      containerRef.current,
      playerName,
      playerGroup,
      playerGender,
      playerColor
    );
    worldRef.current = world;

    world.onRoomChange((roomId: string, title: string) => {
      setCurrentRoom(roomId);
      setRoomTitle(title);
    });

    // Track player count via socket
    const socket = getSocket();
    socket.on('playerJoined', () => setPlayerCount(n => n + 1));
    socket.on('playerLeft',   () => setPlayerCount(n => Math.max(1, n - 1)));
    socket.on('playersState', (p: PlayerData[]) => setPlayerCount(p.length));

    return () => {
      worldRef.current?.destroy();
      worldRef.current = null;
    };
  }, []);

  // ── LiveKit ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!livekitToken || !livekitUrl) return;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        await connectToLiveKit(livekitToken, livekitUrl);
        setVoiceEnabled(true);
        setMicOn(true);
        cleanup = onLocalSpeaking(speaking => {
          setIsSpeaking(speaking);
          worldRef.current?.setLocalSpeaking?.(speaking);
        });
      } catch { setVoiceEnabled(false); }
    })();

    return () => { cleanup?.(); disconnectLiveKit(); };
  }, [livekitToken, livekitUrl]);

  // ── Mic toggle ───────────────────────────────────────────────────────────────
  const handleMicToggle = useCallback(async () => {
    const next = await toggleMicrophone();
    setMicOn(next);
  }, []);

  const handleExitRoom = useCallback(() => {
    worldRef.current?.exitToOutdoor?.();
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'm' || e.key === 'M') handleMicToggle(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleMicToggle]);

  return (
    <div className="game-wrapper">
      {/* Three.js canvas mounts here */}
      <div ref={containerRef} className="phaser-container" />

      {/* HUD */}
      <div className="hud">
        {/* Top-left */}
        <div className="hud-topleft">
          <div className="hud-card player-info">
            <span className="avatar-dot" style={{ background: playerColor }} />
            <span className="player-name">{playerName}</span>
            <span className="group-badge">Group {playerGroup}</span>
          </div>
        </div>

        {/* Top-center room badge */}
        <div className="hud-topcenter">
          <div className="hud-card room-badge">
            <span className="room-icon">{currentRoom === 'outdoor' ? '🗽' : '🚪'}</span>
            <span className="room-title">{roomTitle}</span>
            {currentRoom !== 'outdoor' && (
              <button className="exit-room-btn" onClick={handleExitRoom} title="Exit to Street">
                🚪 Exit to Street
              </button>
            )}
          </div>
        </div>

        {/* Top-right */}
        <div className="hud-topright">
          <div className="hud-card online-count">
            <span className="online-dot" />
            {playerCount} online
          </div>
        </div>

        {/* Bottom: voice */}
        <div className="hud-bottom">
          {voiceEnabled ? (
            <div className="voice-controls">
              <button
                id="micToggleBtn"
                className={`mic-btn ${micOn ? 'mic-on' : 'mic-off'} ${isSpeaking ? 'speaking' : ''}`}
                onClick={handleMicToggle}
                title={micOn ? 'Mute (M)' : 'Unmute (M)'}
              >
                <span className="mic-icon">{micOn ? '🎙️' : '🔇'}</span>
                <span className="mic-label">{micOn ? 'Mute' : 'Unmuted'}</span>
              </button>
              <div className="voice-hint">
                {isSpeaking ? '🟢 Speaking...' : 'Move close to others to talk'}
              </div>
            </div>
          ) : (
            <div className="voice-disabled-notice">
              🔕 Voice disabled — add LiveKit credentials to enable
            </div>
          )}
        </div>

        {/* Mobile Dual Analog Joystick Controls */}
        {/* Left Joystick: Movement (Forward / Backward / Strafe) */}
        <div className="mobile-controls mobile-controls-left">
          <div
            className="joystick-base"
            onTouchStart={(e) => {
              const touch = e.targetTouches[0] || e.touches[0];
              if (!touch) return;
              leftTouchId.current = touch.identifier;
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = touch.clientX - centerX;
              const dy = touch.clientY - centerY;
              const dist = Math.hypot(dx, dy) || 1;
              const maxR = 36;
              const clampR = Math.min(dist, maxR);
              const nx = (dx / dist) * clampR;
              const ny = (dy / dist) * clampR;
              setThumbPos({ x: nx, y: ny });
              if (worldRef.current) {
                worldRef.current.touchVector = { x: nx / maxR, z: -ny / maxR };
              }
            }}
            onTouchMove={(e) => {
              if (leftTouchId.current === null) return;
              let touch: React.Touch | undefined;
              for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === leftTouchId.current) {
                  touch = e.touches[i];
                  break;
                }
              }
              if (!touch) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = touch.clientX - centerX;
              const dy = touch.clientY - centerY;
              const dist = Math.hypot(dx, dy) || 1;
              const maxR = 36;
              const clampR = Math.min(dist, maxR);
              const nx = (dx / dist) * clampR;
              const ny = (dy / dist) * clampR;
              setThumbPos({ x: nx, y: ny });
              if (worldRef.current) {
                worldRef.current.touchVector = { x: nx / maxR, z: -ny / maxR };
              }
            }}
            onTouchEnd={(e) => {
              for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === leftTouchId.current) {
                  leftTouchId.current = null;
                  setThumbPos({ x: 0, y: 0 });
                  if (worldRef.current) worldRef.current.touchVector = { x: 0, z: 0 };
                  break;
                }
              }
            }}
            onTouchCancel={() => {
              leftTouchId.current = null;
              setThumbPos({ x: 0, y: 0 });
              if (worldRef.current) worldRef.current.touchVector = { x: 0, z: 0 };
            }}
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const handleMouse = (me: MouseEvent) => {
                const dx = me.clientX - centerX;
                const dy = me.clientY - centerY;
                const dist = Math.hypot(dx, dy) || 1;
                const maxR = 36;
                const clampR = Math.min(dist, maxR);
                const nx = (dx / dist) * clampR;
                const ny = (dy / dist) * clampR;
                setThumbPos({ x: nx, y: ny });
                if (worldRef.current) {
                  worldRef.current.touchVector = { x: nx / maxR, z: -ny / maxR };
                }
              };
              const handleUp = () => {
                setThumbPos({ x: 0, y: 0 });
                if (worldRef.current) worldRef.current.touchVector = { x: 0, z: 0 };
                window.removeEventListener('mousemove', handleMouse);
                window.removeEventListener('mouseup', handleUp);
              };
              window.addEventListener('mousemove', handleMouse);
              window.addEventListener('mouseup', handleUp);
              handleMouse(e.nativeEvent);
            }}
          >
            <div
              className="joystick-thumb"
              style={{
                transform: `translate(${thumbPos.x}px, ${thumbPos.y}px)`,
                transition: thumbPos.x === 0 && thumbPos.y === 0 ? 'transform 0.15s ease-out' : 'none',
              }}
            />
          </div>
          <div className="joystick-label">MOVE</div>
        </div>

        {/* Right Joystick: Camera Rotation & Pitch */}
        <div className="mobile-controls mobile-controls-right">
          <div
            className="joystick-base"
            onTouchStart={(e) => {
              const touch = e.targetTouches[0] || e.touches[0];
              if (!touch) return;
              rightTouchId.current = touch.identifier;
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = touch.clientX - centerX;
              const dy = touch.clientY - centerY;
              const dist = Math.hypot(dx, dy) || 1;
              const maxR = 36;
              const clampR = Math.min(dist, maxR);
              const nx = (dx / dist) * clampR;
              const ny = (dy / dist) * clampR;
              setRightThumbPos({ x: nx, y: ny });
              if (worldRef.current) {
                worldRef.current.rightStick = { x: nx / maxR, y: ny / maxR };
              }
            }}
            onTouchMove={(e) => {
              if (rightTouchId.current === null) return;
              let touch: React.Touch | undefined;
              for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === rightTouchId.current) {
                  touch = e.touches[i];
                  break;
                }
              }
              if (!touch) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = touch.clientX - centerX;
              const dy = touch.clientY - centerY;
              const dist = Math.hypot(dx, dy) || 1;
              const maxR = 36;
              const clampR = Math.min(dist, maxR);
              const nx = (dx / dist) * clampR;
              const ny = (dy / dist) * clampR;
              setRightThumbPos({ x: nx, y: ny });
              if (worldRef.current) {
                worldRef.current.rightStick = { x: nx / maxR, y: ny / maxR };
              }
            }}
            onTouchEnd={(e) => {
              for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === rightTouchId.current) {
                  rightTouchId.current = null;
                  setRightThumbPos({ x: 0, y: 0 });
                  if (worldRef.current) worldRef.current.rightStick = { x: 0, y: 0 };
                  break;
                }
              }
            }}
            onTouchCancel={() => {
              rightTouchId.current = null;
              setRightThumbPos({ x: 0, y: 0 });
              if (worldRef.current) worldRef.current.rightStick = { x: 0, y: 0 };
            }}
            onMouseDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const handleMouse = (me: MouseEvent) => {
                const dx = me.clientX - centerX;
                const dy = me.clientY - centerY;
                const dist = Math.hypot(dx, dy) || 1;
                const maxR = 36;
                const clampR = Math.min(dist, maxR);
                const nx = (dx / dist) * clampR;
                const ny = (dy / dist) * clampR;
                setRightThumbPos({ x: nx, y: ny });
                if (worldRef.current) {
                  worldRef.current.rightStick = { x: nx / maxR, y: ny / maxR };
                }
              };
              const handleUp = () => {
                setRightThumbPos({ x: 0, y: 0 });
                if (worldRef.current) worldRef.current.rightStick = { x: 0, y: 0 };
                window.removeEventListener('mousemove', handleMouse);
                window.removeEventListener('mouseup', handleUp);
              };
              window.addEventListener('mousemove', handleMouse);
              window.addEventListener('mouseup', handleUp);
              handleMouse(e.nativeEvent);
            }}
          >
            <div
              className="joystick-thumb joystick-thumb-right"
              style={{
                transform: `translate(${rightThumbPos.x}px, ${rightThumbPos.y}px)`,
                transition: rightThumbPos.x === 0 && rightThumbPos.y === 0 ? 'transform 0.15s ease-out' : 'none',
              }}
            />
          </div>
          <div className="joystick-label">LOOK</div>
        </div>

        <div className="controls-hint">
          WASD / Left Stick to move &nbsp;|&nbsp; Right Stick / Drag to look &nbsp;|&nbsp; M to mute
        </div>
      </div>
    </div>
  );
}
