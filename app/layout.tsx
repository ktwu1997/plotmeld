import './globals.css';
import './game-card.css';
import { Barlow_Condensed, DM_Mono, Literata } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-display', display: 'swap' });
const body = Literata({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-body', display: 'swap' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });
export const metadata: Metadata = { title: 'Plotmeld · Find your next game', description: 'Find your next game with one film or TV title, one book and Qloo audience evidence.' };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}><body>{children}</body></html>; }
