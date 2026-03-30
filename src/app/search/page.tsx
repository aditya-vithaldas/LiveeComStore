"use client";

import { useState } from "react";

import { MerchCard } from "@/components/merch-card";
import { useStorefront } from "@/components/storefront-provider";

import styles from "./page.module.css";

function formatFiltersCount(values: {
  division: string;
  category: string;
  brand: string;
  availability: string;
  minPrice: number | null;
  maxPrice: number | null;
  tags: string[];
}) {
  let count = 0;

  if (values.division !== "all") count += 1;
  if (values.category !== "all") count += 1;
  if (values.brand !== "all") count += 1;
  if (values.availability !== "all") count += 1;
  if (values.minPrice !== null) count += 1;
  if (values.maxPrice !== null) count += 1;
  count += values.tags.length;

  return count;
}

export default function SearchPage() {
  const {
    products,
    searchTerm,
    filters,
    searchState,
    updateSearchRoute,
    clearFilters,
  } = useStorefront();

  const categories = Array.from(
    new Map(products.map((product) => [product.categorySlug, product.category])).entries(),
  ).sort((left, right) => left[1].localeCompare(right[1]));

  const brands = Array.from(new Set(products.map((product) => product.brand))).sort((left, right) =>
    left.localeCompare(right),
  );

  const popularTags = Array.from(new Set(products.flatMap((product) => product.tags)))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 10);

  return (
    <div className={styles.page}>
      <SearchSidebar
        key={`${searchTerm}-${JSON.stringify(filters)}`}
        initialSearchTerm={searchTerm}
        initialFilters={filters}
        categories={categories}
        brands={brands}
        popularTags={popularTags}
        onApply={updateSearchRoute}
        onClear={clearFilters}
      />

      <section className={styles.results}>
        <div className={styles.resultsHeader}>
          <div>
            <h2>{searchState.results.length} results</h2>
            <p>{searchTerm || "All products"}</p>
          </div>
        </div>

        <div className={styles.grid}>
          {searchState.results.map((product) => (
            <MerchCard key={product.id} product={product} href={`/product/${product.id}`} />
          ))}
        </div>

        {searchState.results.length === 0 ? (
          <p className={styles.empty}>No products match the current filters.</p>
        ) : null}
      </section>
    </div>
  );
}

function SearchSidebar({
  initialSearchTerm,
  initialFilters,
  categories,
  brands,
  popularTags,
  onApply,
  onClear,
}: {
  initialSearchTerm: string;
  initialFilters: ReturnType<typeof useStorefront>["filters"];
  categories: Array<[string, string]>;
  brands: string[];
  popularTags: string[];
  onApply: ReturnType<typeof useStorefront>["updateSearchRoute"];
  onClear: ReturnType<typeof useStorefront>["clearFilters"];
}) {
  const [draftSearch, setDraftSearch] = useState(initialSearchTerm);
  const [draftFilters, setDraftFilters] = useState(initialFilters);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h1>Search</h1>
        <span>{formatFiltersCount(draftFilters)} filters</span>
      </div>

      <label className={styles.field}>
        <span>Search</span>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="White t-shirts, laptops, speakers..."
        />
      </label>

      <label className={styles.field}>
        <span>Department</span>
        <select
          value={draftFilters.division}
          onChange={(event) =>
            setDraftFilters((current) => ({
              ...current,
              division: event.target.value as typeof current.division,
            }))
          }
        >
          <option value="all">All</option>
          <option value="fashion">Fashion</option>
          <option value="electronics">Electronics</option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Category</span>
        <select
          value={draftFilters.category}
          onChange={(event) =>
            setDraftFilters((current) => ({
              ...current,
              category: event.target.value,
            }))
          }
        >
          <option value="all">All</option>
          {categories.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Brand</span>
        <select
          value={draftFilters.brand}
          onChange={(event) =>
            setDraftFilters((current) => ({
              ...current,
              brand: event.target.value,
            }))
          }
        >
          <option value="all">All</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.priceRow}>
        <label className={styles.field}>
          <span>Min</span>
          <input
            type="number"
            value={draftFilters.minPrice ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                minPrice: event.target.value ? Number(event.target.value) : null,
              }))
            }
          />
        </label>
        <label className={styles.field}>
          <span>Max</span>
          <input
            type="number"
            value={draftFilters.maxPrice ?? ""}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                maxPrice: event.target.value ? Number(event.target.value) : null,
              }))
            }
          />
        </label>
      </div>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draftFilters.availability === "in-stock"}
          onChange={(event) =>
            setDraftFilters((current) => ({
              ...current,
              availability: event.target.checked ? "in-stock" : "all",
            }))
          }
        />
        <span>In stock only</span>
      </label>

      <div className={styles.tags}>
        {popularTags.map((tag) => {
          const active = draftFilters.tags.includes(tag);

          return (
            <button
              key={tag}
              type="button"
              className={`${styles.tag} ${active ? styles.tagActive : ""}`}
              onClick={() =>
                setDraftFilters((current) => ({
                  ...current,
                  tags: active
                    ? current.tags.filter((entry) => entry !== tag)
                    : [...current.tags, tag],
                }))
              }
            >
              {tag}
            </button>
          );
        })}
      </div>

      <div className={styles.sidebarActions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => onApply(draftSearch, draftFilters)}
        >
          Apply
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onClear}>
          Clear
        </button>
      </div>
    </aside>
  );
}
