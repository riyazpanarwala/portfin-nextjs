import './globals.css';
import { PortfolioProvider } from '@/context/PortfolioContext';
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
  metadataBase: new URL('https://portfin-riyaz.panarwala.in'),
  title: {
    default: 'PortFin by Panarwala - Personal Portfolio Dashboard',
    template: '%s | PortFin by Panarwala',
  },
  description: 'PortFin by Panarwala — Track your Indian equity and mutual fund portfolio with real-time analytics, goal planning, tax insights, and AI recommendations.',
  keywords: [
    'Panarwala',
    'PortFin',
    'Panarwala PortFin',
    'portfolio tracker',
    'Indian stock market',
    'NSE',
    'BSE',
    'mutual funds',
    'SIP tracker',
    'XIRR calculator',
    'tax loss harvesting',
    'financial goals',
    'portfolio analytics',
  ],
  authors: [{ name: 'Panarwala', url: 'https://www.panarwala.in' }],
  creator: 'Panarwala',
  publisher: 'Panarwala',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'PortFin by Panarwala - Personal Portfolio Dashboard',
    description: 'PortFin by Panarwala — Track your Indian equity and mutual fund portfolio with real-time analytics, goal planning, and tax insights.',
    url: 'https://portfin-riyaz.panarwala.in',
    siteName: 'PortFin by Panarwala',
    locale: 'en_IN',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PortFin by Panarwala Portfolio Dashboard Banner',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PortFin by Panarwala - Personal Portfolio Dashboard',
    description: 'PortFin by Panarwala — Track your Indian equity and mutual fund portfolio with real-time analytics, goal planning, and tax insights.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0f19',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'PortFin by Panarwala',
  url: 'https://portfin-riyaz.panarwala.in',
  description: 'PortFin by Panarwala — Track your Indian equity and mutual fund portfolio with real-time analytics, goal planning, tax insights, and AI recommendations.',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'All',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'INR',
  },
  author: {
    '@type': 'Organization',
    name: 'Panarwala',
    url: 'https://panarwala.in',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Panarwala',
    url: 'https://panarwala.in',
  },
  brand: {
    '@type': 'Brand',
    name: 'Panarwala',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <AuthProvider>
          <PortfolioProvider>
            {children}
          </PortfolioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
