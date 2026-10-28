import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Plotmeld',
    short_name: 'Plotmeld',
    start_url: '/',
    display: 'standalone',
    background_color: '#F8F1E6',
    theme_color: '#F8F1E6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
