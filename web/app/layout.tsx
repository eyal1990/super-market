import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'סל זול — השוואת מחירי סופרמרקטים',
  description: 'השוו מחירים בסניפים הקרובים, בנו סל קניות וחסכו בקנייה השבועית.',
  openGraph: { title: 'סל זול — השוואת מחירי סופרמרקטים', description: 'קונים חכם, משלמים פחות.', type: 'website' },
  twitter: { card: 'summary', title: 'סל זול — השוואת מחירי סופרמרקטים', description: 'קונים חכם, משלמים פחות.' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
