"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import { MerchCard } from "@/components/merch-card";
import { useStorefront } from "@/components/storefront-provider";

import styles from "./page.module.css";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function ProductPage() {
  const {
    activeProduct,
    products,
    attributeExplanation,
    selectedSizes,
    selectProductSize,
    addToBag,
    beginCheckout,
    clearAttributeExplanation,
  } = useStorefront();

  if (!activeProduct) {
    return (
      <div className={styles.emptyPage}>
        <h1>Product not found</h1>
        <Link href="/search">Back to search</Link>
      </div>
    );
  }

  const relatedProducts = products
    .filter(
      (product) =>
        product.id !== activeProduct.id &&
        (product.categorySlug === activeProduct.categorySlug ||
          product.division === activeProduct.division),
    )
    .slice(0, 4);

  const explanationForProduct =
    attributeExplanation?.productId === activeProduct.id
      ? attributeExplanation
      : null;
  const selectedSize =
    selectedSizes[activeProduct.id] ??
    activeProduct.sizes.find((size) => size.available)?.label ??
    null;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/search">Search</Link>
        <span>/</span>
        <span>{activeProduct.name}</span>
      </div>

      <section className={styles.product}>
        <div className={styles.gallery}>
          <img
            src={activeProduct.image}
            alt={activeProduct.name}
            className={styles.mainImage}
          />
          <div className={styles.thumbRow}>
            {activeProduct.images.slice(0, 4).map((image, index) => (
              <img
                key={`${activeProduct.id}-${index}`}
                src={image}
                alt={`${activeProduct.name} ${index + 1}`}
                className={styles.thumb}
              />
            ))}
          </div>
        </div>

        <div className={styles.details}>
          <p className={styles.brand}>{activeProduct.brand}</p>
          <h1>{activeProduct.name}</h1>
          <p className={styles.price}>{formatCurrency(activeProduct.price)}</p>
          <p className={styles.stock}>{activeProduct.inventory} in stock</p>
          <p className={styles.description}>{activeProduct.description}</p>

          {activeProduct.sizes.length > 0 ? (
            <div className={styles.sizeSection}>
              <div className={styles.sectionLabelRow}>
                <span className={styles.sectionLabel}>Size</span>
                <strong>{selectedSize ?? "Choose a size"}</strong>
              </div>
              <div className={styles.sizeGrid}>
                {activeProduct.sizes.map((size) => (
                  <button
                    key={size.label}
                    type="button"
                    className={`${styles.sizeChip} ${
                      selectedSize === size.label ? styles.sizeChipActive : ""
                    }`}
                    onClick={() => selectProductSize(activeProduct.id, size.label)}
                    disabled={!size.available}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => addToBag(activeProduct.id)}
            >
              Add to bag
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => beginCheckout(activeProduct.id)}
            >
              Buy now
            </button>
          </div>

          <div className={styles.specs}>
            {activeProduct.attributes.slice(0, 8).map((attribute) => (
              <div key={attribute.label} className={styles.specRow}>
                <span>{attribute.label}</span>
                <strong>{attribute.value}</strong>
              </div>
            ))}
          </div>

          {explanationForProduct ? (
            <div className={styles.explanation}>
              <div className={styles.explanationHeader}>
                <h2>{explanationForProduct.title}</h2>
                <button type="button" onClick={clearAttributeExplanation}>
                  Close
                </button>
              </div>
              <p>{explanationForProduct.body}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>You may also like</h2>
        </div>
        <div className={styles.grid}>
          {relatedProducts.map((product) => (
            <MerchCard key={product.id} product={product} href={`/product/${product.id}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
