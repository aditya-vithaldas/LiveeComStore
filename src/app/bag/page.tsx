"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { useStorefront } from "@/components/storefront-provider";

import styles from "./page.module.css";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function BagPage() {
  const { bagItems, products, removeFromBag, beginCheckout } = useStorefront();

  const items = bagItems
    .map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return product ? { ...item, product } : null;
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        productId: string;
        quantity: number;
        sizeLabel: string | null;
        product: (typeof products)[number];
      } => item !== null,
    );

  const subtotal = items.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );

  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h1>Your bag is empty</h1>
        <Link href="/search">Continue shopping</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.itemsPanel}>
        <div className={styles.header}>
          <h1>Bag</h1>
          <p>A sample bag is preloaded so the flow feels like a real store.</p>
        </div>

        <div className={styles.itemList}>
          {items.map((item) => (
            <article key={item.id} className={styles.itemRow}>
              <img
                src={item.product.image}
                alt={item.product.name}
                className={styles.itemImage}
              />
              <div className={styles.itemBody}>
                <div>
                  <p className={styles.itemCategory}>{item.product.category}</p>
                  <h2>{item.product.name}</h2>
                </div>
                <p className={styles.itemMeta}>
                  Qty {item.quantity}
                  {item.sizeLabel ? ` · Size ${item.sizeLabel}` : ""}
                </p>
                <div className={styles.itemActions}>
                  <strong>{formatCurrency(item.product.price * item.quantity)}</strong>
                  <button type="button" onClick={() => removeFromBag(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className={styles.summaryPanel}>
        <h2>Summary</h2>
        <div className={styles.summaryRow}>
          <span>Subtotal</span>
          <strong>{formatCurrency(subtotal)}</strong>
        </div>
        <div className={styles.summaryRow}>
          <span>Shipping</span>
          <strong>Calculated at checkout</strong>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => beginCheckout(items[0].product.id)}
        >
          Checkout first item
        </button>
      </aside>
    </div>
  );
}
