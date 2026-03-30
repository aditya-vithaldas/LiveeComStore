"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { MerchCard } from "@/components/merch-card";
import { useStorefront } from "@/components/storefront-provider";
import { buildSearchHref } from "@/lib/catalog-route";

import styles from "./page.module.css";

export default function HomePage() {
  const { products } = useStorefront();

  const fashionProducts = products.filter((product) => product.division === "fashion");
  const electronicsProducts = products.filter(
    (product) => product.division === "electronics",
  );
  const featuredProducts = [...products.filter((product) => product.featured), ...products].slice(
    0,
    8,
  );

  const heroFashion = fashionProducts[0];
  const heroElectronics = electronicsProducts[0];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <Link
          href={buildSearchHref("", {
            division: "fashion",
            category: "all",
            brand: "all",
            availability: "all",
            minPrice: null,
            maxPrice: null,
            tags: [],
          })}
          className={styles.heroCard}
        >
          {heroFashion ? (
            <img src={heroFashion.image} alt={heroFashion.name} className={styles.heroImage} />
          ) : null}
          <div className={styles.heroContent}>
            <p>Fashion</p>
            <h1>New season</h1>
          </div>
        </Link>

        <div className={styles.heroStack}>
          <Link
            href={buildSearchHref("", {
              division: "electronics",
              category: "all",
              brand: "all",
              availability: "all",
              minPrice: null,
              maxPrice: null,
              tags: [],
            })}
            className={styles.sideCard}
          >
            {heroElectronics ? (
              <img
                src={heroElectronics.image}
                alt={heroElectronics.name}
                className={styles.sideImage}
              />
            ) : null}
            <div className={styles.sideContent}>
              <p>Electronics</p>
              <h2>Shop the latest</h2>
            </div>
          </Link>

          <Link href="/search" className={styles.textCard}>
            <p>Search</p>
            <h2>Browse the full catalogue</h2>
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Featured</h2>
          <Link href="/search">Shop all</Link>
        </div>
        <div className={styles.gridFour}>
          {featuredProducts.slice(0, 4).map((product) => (
            <MerchCard key={product.id} product={product} href={`/product/${product.id}`} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Fashion</h2>
          <Link
            href={buildSearchHref("", {
              division: "fashion",
              category: "all",
              brand: "all",
              availability: "all",
              minPrice: null,
              maxPrice: null,
              tags: [],
            })}
          >
            View all
          </Link>
        </div>
        <div className={styles.gridFour}>
          {fashionProducts.slice(0, 4).map((product) => (
            <MerchCard key={product.id} product={product} href={`/product/${product.id}`} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Electronics</h2>
          <Link
            href={buildSearchHref("", {
              division: "electronics",
              category: "all",
              brand: "all",
              availability: "all",
              minPrice: null,
              maxPrice: null,
              tags: [],
            })}
          >
            View all
          </Link>
        </div>
        <div className={styles.gridFour}>
          {electronicsProducts.slice(0, 4).map((product) => (
            <MerchCard key={product.id} product={product} href={`/product/${product.id}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
