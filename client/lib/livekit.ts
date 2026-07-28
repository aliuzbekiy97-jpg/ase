/**
 * lib/livekit.ts — LiveKit room management & proximity volume control
 *
 * All users join a single LiveKit room "pixel-campus".
 * Volume is controlled purely client-side via setVolume() based on pixel distance.
 */
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteAudioTrack,
  ParticipantEvent,
  Track,
  ConnectionState,
} from 'livekit-client';

// ─── Proximity Constants ──────────────────────────────────────────────────────
/** Distance (3D units) at which audio is full volume — right next to each other */
export const PROXIMITY_FULL = 1.5;
/** Distance (3D units) beyond which audio is completely silent — ~3 steps away */
export const PROXIMITY_MAX  = 4;

// ─── Module State ─────────────────────────────────────────────────────────────
let _room: Room | null = null;

/**
 * Cache of last-applied volume per participant identity.
 * Prevents calling setVolume() every frame when there's no meaningful change.
 */
const _volumeCache = new Map<string, number>();

/** Minimum volume delta before we actually call setVolume() */
const VOLUME_EPSILON = 0.02;

// ─── Connection ───────────────────────────────────────────────────────────────

/**
 * Connect to the LiveKit room with the provided JWT token.
 * Returns the connected Room instance.
 */
export async function connectToLiveKit(token: string, url: string): Promise<Room> {
  if (_room && _room.state === ConnectionState.Connected) {
    return _room;
  }

  _room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // ── Auto-attach remote audio tracks when subscribed ──────────────────────
  // Without this, browsers block playback due to autoplay policy
  _room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind === Track.Kind.Audio) {
      const elements = track.attach();
      const audioEl = Array.isArray(elements) ? elements[0] : elements;
      if (audioEl) {
        audioEl.autoplay = true;
        audioEl.setAttribute('data-lk', participant.identity);
        document.body.appendChild(audioEl);
        console.log(`[LiveKit] Audio attached for: ${participant.identity}`);
      }
    }
  });

  // ── Clean up audio elements when unsubscribed ─────────────────────────────
  _room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach(el => el.remove());
      _volumeCache.delete(participant.identity);
      console.log(`[LiveKit] Audio detached for: ${participant.identity}`);
    }
  });

  // Clean volume cache when participants leave
  _room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    _volumeCache.delete(participant.identity);
  });

  await _room.connect(url, token);
  console.log(`[LiveKit] Connected to room: ${_room.name}`);

  // Publish local microphone track
  await _room.localParticipant.setMicrophoneEnabled(true);
  console.log('[LiveKit] Microphone enabled');

  return _room;
}

/** Get the current Room instance (may be null if not connected) */
export function getRoom(): Room | null {
  return _room;
}

// ─── Proximity Volume ─────────────────────────────────────────────────────────

/**
 * Adjust the playback volume of a remote participant's audio tracks
 * based on their Euclidean distance from the local player.
 * 
 * Uses a volume cache to avoid redundant setVolume() calls each frame.
 * Only applies changes when volume delta exceeds VOLUME_EPSILON.
 *
 * @param participantIdentity  LiveKit identity == player name
 * @param distance             distance in world units
 */
export function setProximityVolume(participantIdentity: string, distance: number): void {
  if (!_room) return;

  const volume = distanceToVolume(distance);

  // Skip if volume hasn't changed meaningfully (avoids calling setVolume 60x/sec)
  const cached = _volumeCache.get(participantIdentity);
  if (cached !== undefined && Math.abs(cached - volume) < VOLUME_EPSILON) return;

  const participant = _room.getParticipantByIdentity(participantIdentity);
  if (!participant || !(participant instanceof RemoteParticipant)) return;

  _volumeCache.set(participantIdentity, volume);

  for (const pub of participant.audioTrackPublications.values()) {
    if (pub.track && pub.track instanceof RemoteAudioTrack) {
      (pub.track as RemoteAudioTrack).setVolume(volume);
    }
  }
}

/** Linear distance → [0, 1] volume mapping */
export function distanceToVolume(distance: number): number {
  if (distance <= PROXIMITY_FULL) return 1.0;
  if (distance >= PROXIMITY_MAX)  return 0.0;
  return 1.0 - (distance - PROXIMITY_FULL) / (PROXIMITY_MAX - PROXIMITY_FULL);
}

// ─── Microphone Toggle ────────────────────────────────────────────────────────

/**
 * Toggle the local microphone on/off.
 * @returns new enabled state (true = mic is ON)
 */
export async function toggleMicrophone(): Promise<boolean> {
  if (!_room) return false;
  const isEnabled = _room.localParticipant.isMicrophoneEnabled;
  await _room.localParticipant.setMicrophoneEnabled(!isEnabled);
  return !isEnabled;
}

/** Returns whether the local mic is currently enabled */
export function isMicEnabled(): boolean {
  return _room?.localParticipant.isMicrophoneEnabled ?? false;
}

// ─── Speaking Indicator ───────────────────────────────────────────────────────

/**
 * Subscribe to speaking-state changes for a remote participant.
 * @returns cleanup function to unsubscribe
 */
export function onParticipantSpeaking(
  identity: string,
  cb: (speaking: boolean) => void
): () => void {
  if (!_room) return () => {};

  const participant = _room.getParticipantByIdentity(identity);
  if (!participant) return () => {};

  participant.on(ParticipantEvent.IsSpeakingChanged, cb);
  return () => participant.off(ParticipantEvent.IsSpeakingChanged, cb);
}

/**
 * Subscribe to the local participant's speaking state changes.
 * @returns cleanup function
 */
export function onLocalSpeaking(cb: (speaking: boolean) => void): () => void {
  if (!_room) return () => {};
  _room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, cb);
  return () => _room?.localParticipant.off(ParticipantEvent.IsSpeakingChanged, cb);
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectLiveKit(): Promise<void> {
  if (_room) {
    try {
      await _room.localParticipant.setMicrophoneEnabled(false);
      await _room.disconnect();
    } catch (_) { /* ignore */ }
    _room = null;
    _volumeCache.clear();
    console.log('[LiveKit] Disconnected');
  }
}
