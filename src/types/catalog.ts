export type StoreDivision = "fashion" | "electronics";

export type AvailabilityFilter = "all" | "in-stock";

export interface ProductAttribute {
  label: string;
  value: string;
}

export interface ProductSizeOption {
  label: string;
  inventory: number;
  available: boolean;
}

export interface StoreProduct {
  id: string;
  sourceId: number | string;
  name: string;
  brand: string;
  division: StoreDivision;
  category: string;
  categorySlug: string;
  price: number;
  inventory: number;
  rating: number;
  description: string;
  image: string;
  images: string[];
  sizes: ProductSizeOption[];
  tags: string[];
  attributes: ProductAttribute[];
  availability: string;
  shipping: string;
  warranty: string;
  featured: boolean;
}

export interface ProductFilters {
  division: StoreDivision | "all";
  category: string;
  brand: string;
  availability: AvailabilityFilter;
  minPrice: number | null;
  maxPrice: number | null;
  tags: string[];
}

export interface ProductSearchInput {
  searchTerm: string;
  filters: ProductFilters;
}

export interface ProductSearchResult {
  normalizedSearchTerm: string;
  filters: ProductFilters;
  summary: string;
  results: StoreProduct[];
}

export interface VoiceSearchInsight {
  query: string;
  filters: ProductFilters;
  scope: "catalog" | "current-results";
  resultCount: number;
}
