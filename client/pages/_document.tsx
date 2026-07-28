/**
 * pages/_document.tsx
 * Custom Next.js Document — used to load Google Fonts properly
 * (next/head does not support <link rel="stylesheet"> for external fonts)
 */
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Pixel & UI fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0d1117" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
