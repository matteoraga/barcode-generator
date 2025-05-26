import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Barcode Generator',
  description: 'Generate single and batch barcodes with customizable options',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}