"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useStorefront } from "@/components/storefront-provider";

import styles from "./page.module.css";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const { products, activeProduct, selectedSizes } = useStorefront();
  const productId = searchParams.get("productId");
  const checkoutProduct =
    activeProduct ??
    (productId ? products.find((product) => product.id === productId) : undefined) ??
    null;

  if (!checkoutProduct) {
    return (
      <div className={styles.emptyState}>
        <h1>Checkout</h1>
        <p>Choose a product before heading to checkout.</p>
        <Link href="/search">Back to search</Link>
      </div>
    );
  }

  const selectedSize =
    searchParams.get("size") ??
    selectedSizes[checkoutProduct.id] ??
    checkoutProduct.sizes.find((size) => size.available)?.label ??
    null;

  return (
    <div className={styles.page}>
      <section className={styles.summaryCard}>
        <p className={styles.eyebrow}>Checkout</p>
        <h1>Review your item</h1>
        <p className={styles.copy}>
          The live shopping session stops here so the handoff feels like a normal ecommerce
          checkout.
        </p>

        <article className={styles.lineItem}>
          <img
            src={checkoutProduct.image}
            alt={checkoutProduct.name}
            className={styles.image}
          />
          <div className={styles.lineBody}>
            <p className={styles.category}>{checkoutProduct.category}</p>
            <h2>{checkoutProduct.name}</h2>
            <p className={styles.meta}>{checkoutProduct.brand}</p>
            {selectedSize ? <p className={styles.meta}>Size {selectedSize}</p> : null}
            <strong>{formatCurrency(checkoutProduct.price)}</strong>
          </div>
        </article>
      </section>

      <aside className={styles.detailsCard}>
        <h2>Order total</h2>
        <div className={styles.row}>
          <span>Item</span>
          <strong>{formatCurrency(checkoutProduct.price)}</strong>
        </div>
        <div className={styles.row}>
          <span>Shipping</span>
          <strong>Calculated in final step</strong>
        </div>
        <div className={styles.row}>
          <span>Stock</span>
          <strong>{checkoutProduct.inventory} available</strong>
        </div>
        <button type="button" className={styles.primaryButton}>
          Place sample order
        </button>
      </aside>
    </div>
  );
}
