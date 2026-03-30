/* eslint-disable @next/next/no-img-element */
"use client";

import { useStorefront } from "@/components/storefront-provider";
import type { StoreProduct } from "@/types/catalog";

import styles from "./merch-card.module.css";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function MerchCard({ product }: { product: StoreProduct; href?: string }) {
  const { openProduct } = useStorefront();

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => openProduct(product.id)}
      aria-label={`Open ${product.name}`}
    >
      <img src={product.image} alt={product.name} className={styles.image} />
      <div className={styles.body}>
        <p className={styles.category}>{product.category}</p>
        <h3>{product.name}</h3>
        <div className={styles.meta}>
          <span>{formatCurrency(product.price)}</span>
          <span>{product.inventory} in stock</span>
        </div>
      </div>
    </button>
  );
}
