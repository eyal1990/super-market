import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'סל זול — השוואת מחירי סופרמרקטים', description: 'השוו מחירים בסניפים הקרובים, בנו סל קניות וחסכו בקנייה השבועית.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="he" dir="rtl"><body>{children}</body></html>; }
