import type { Metadata } from "next";
import { Suspense } from "react";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import { StorefrontProvider } from "@/components/storefront-provider";
import { StorefrontLoadingShell, StorefrontShell } from "@/components/storefront-shell";
import { getCatalogProducts } from "@/lib/catalog";

import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Audio Commerce Live",
  description:
    "A classical ecommerce storefront with a persistent Gemini Live shopping band.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const products = await getCatalogProducts();

  return (
    <html lang="en" className={`${cormorant.variable} ${manrope.variable}`}>
      <body>
        <Suspense fallback={<StorefrontLoadingShell />}>
          <StorefrontProvider products={products}>
            <StorefrontShell>{children}</StorefrontShell>
          </StorefrontProvider>
        </Suspense>
      </body>
    </html>
  );
}
