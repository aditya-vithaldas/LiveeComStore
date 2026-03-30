import type { ProductFilters } from "@/types/catalog";

type SearchRouteState = {
  searchTerm: string;
  filters: ProductFilters;
};

type SearchParamsLike = {
  get(name: string): string | null;
};

function parseNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSearchRouteState(
  searchParams: SearchParamsLike,
): SearchRouteState {
  const division = searchParams.get("division");
  const availability = searchParams.get("availability");
  const tags = searchParams.get("tags");

  return {
    searchTerm: searchParams.get("q")?.trim() ?? "",
    filters: {
      division:
        division === "fashion" ||
        division === "electronics" ||
        division === "all"
          ? division
          : "all",
      category: searchParams.get("category") ?? "all",
      brand: searchParams.get("brand") ?? "all",
      availability:
        availability === "in-stock" || availability === "all"
          ? availability
          : "all",
      minPrice: parseNumber(searchParams.get("minPrice")),
      maxPrice: parseNumber(searchParams.get("maxPrice")),
      tags: tags
        ? tags
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
    },
  };
}

export function buildSearchHref(searchTerm: string, filters: ProductFilters) {
  const params = new URLSearchParams();

  if (searchTerm.trim()) {
    params.set("q", searchTerm.trim());
  }

  if (filters.division !== "all") {
    params.set("division", filters.division);
  }

  if (filters.category !== "all") {
    params.set("category", filters.category);
  }

  if (filters.brand !== "all") {
    params.set("brand", filters.brand);
  }

  if (filters.availability !== "all") {
    params.set("availability", filters.availability);
  }

  if (filters.minPrice !== null) {
    params.set("minPrice", String(filters.minPrice));
  }

  if (filters.maxPrice !== null) {
    params.set("maxPrice", String(filters.maxPrice));
  }

  if (filters.tags.length > 0) {
    params.set("tags", filters.tags.join(","));
  }

  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}
