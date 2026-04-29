import './globals.css';
import { PortfolioProvider } from '@/context/PortfolioContext';

export const metadata = {
  title: 'PortFin — Personal Portfolio Dashboard',
  description: 'Track your Indian equity and mutual fund portfolio with real-time analytics, goal planning, and tax insights.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <PortfolioProvider>
          {children}
        </PortfolioProvider>
      </body>
    </html>
  );
}
