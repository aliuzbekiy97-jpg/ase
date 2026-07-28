/**
 * pages/index.tsx — App entry point
 * Shows JoinScreen → transitions to GameCanvas after successful join
 */
import React, { useState, useCallback } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import JoinScreen from '../components/JoinScreen';

// GameCanvas must be dynamically imported (no SSR) because Phaser needs the browser
const GameCanvas = dynamic(() => import('../components/GameCanvas'), { ssr: false });

interface SessionData {
  name:         string;
  group:        number;
  gender:       'boy' | 'girl';
  color:        string;
  livekitToken: string | null;
  livekitUrl:   string | null;
}

export default function HomePage() {
  const [session, setSession] = useState<SessionData | null>(null);

  const handleJoin = useCallback(
    (
      name: string,
      group: number,
      gender: 'boy' | 'girl',
      livekitToken: string | null,
      livekitUrl: string | null
    ) => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash) % 360;
      const color = `hsl(${hue}, 65%, 58%)`;

      setSession({ name, group, gender, color, livekitToken, livekitUrl });
    },
    []
  );

  return (
    <>
      <Head>
        <title>Pixel Campus — Language Learning Virtual World</title>
        <meta
          name="description"
          content="A 3D virtual campus for language learners. Move your avatar around and talk to nearby students via proximity voice chat."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {session ? (
        <GameCanvas
          playerName={session.name}
          playerGroup={session.group}
          playerGender={session.gender}
          playerColor={session.color}
          livekitToken={session.livekitToken}
          livekitUrl={session.livekitUrl}
        />
      ) : (
        <JoinScreen onJoin={handleJoin} />
      )}
    </>
  );
}
