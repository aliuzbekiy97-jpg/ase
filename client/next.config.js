/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',       // Static HTML export for Netlify/Vercel/GitHub Pages
  images: { unoptimized: true },
  reactStrictMode: false, // Phaser breaks under React Strict Mode's double-mount
  turbopack: {},          // Use Turbopack (Next.js 16 default)
};

module.exports = nextConfig;
