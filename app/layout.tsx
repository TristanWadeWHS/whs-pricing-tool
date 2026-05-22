import './styles.css';

export const metadata = {
  title: 'WHS Pricing Tool',
  description: 'Internal pricing tool for Wade Home Services'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
