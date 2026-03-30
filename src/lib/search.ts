import type {
  ProductFilters,
  ProductSearchInput,
  ProductSearchResult,
  StoreDivision,
  StoreProduct,
} from "@/types/catalog";

export const defaultFilters: ProductFilters = {
  division: "all",
  category: "all",
  brand: "all",
  availability: "all",
  minPrice: null,
  maxPrice: null,
  tags: [],
};

const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "get",
  "i",
  "im",
  "in",
  "looking",
  "me",
  "need",
  "of",
  "please",
  "show",
  "some",
  "that",
  "the",
  "to",
  "want",
  "with",
]);

const SOFT_QUERY_TOKENS = new Set(["basic", "casual", "classic", "plain", "simple"]);

type QueryProfile = {
  tokens: string[];
  weightedTokens: string[];
  requiredDivision: StoreDivision | null;
  allowedCategorySlugs: Set<string> | null;
  preferredCategorySlugs: Set<string>;
  requiredTokenGroups: string[][];
  excludedTokens: Set<string>;
};

function canonicalizeNormalizedText(value: string) {
  return value
    .replace(/\bt shirts?\b/g, " tshirt ")
    .replace(/\btee shirts?\b/g, " tee ")
    .replace(/\bbutton down\b/g, " buttondown ")
    .replace(/\bcollar less\b/g, " collarless ")
    .replace(/\brunning shoes?\b/g, " sneaker ")
    .replace(/\bsmart phones?\b/g, " smartphone ");
}

function normalizeText(value: string) {
  return canonicalizeNormalizedText(
    value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim(),
  );
}

function normalizeToken(token: string) {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[\s,/]+/)
    .map((token) => normalizeToken(token.trim()))
    .filter((token) => token.length > 1);
}

function buildStructuredHaystack(product: StoreProduct) {
  return {
    name: normalizeText(product.name),
    category: normalizeText(product.category),
    categorySlug: normalizeText(product.categorySlug),
    brand: normalizeText(product.brand),
    tags: normalizeText(product.tags.join(" ")),
    attributes: normalizeText(
      product.attributes
        .map((attribute) => `${attribute.label} ${attribute.value}`)
        .join(" "),
    ),
  };
}

function matchesFilters(product: StoreProduct, filters: ProductFilters) {
  if (filters.division !== "all" && product.division !== filters.division) {
    return false;
  }

  if (filters.category !== "all" && product.categorySlug !== filters.category) {
    return false;
  }

  if (filters.brand !== "all" && product.brand !== filters.brand) {
    return false;
  }

  if (filters.availability === "in-stock" && product.inventory <= 0) {
    return false;
  }

  if (filters.minPrice !== null && product.price < filters.minPrice) {
    return false;
  }

  if (filters.maxPrice !== null && product.price > filters.maxPrice) {
    return false;
  }

  if (filters.tags.length > 0) {
    const haystack = normalizeText(
      [
        product.name,
        product.category,
        product.brand,
        ...product.tags,
        ...product.attributes.map((attribute) => `${attribute.label} ${attribute.value}`),
      ].join(" "),
    );

    return filters.tags.every((tag) => haystack.includes(normalizeText(tag)));
  }

  return true;
}

function buildQueryProfile(searchTerm: string): QueryProfile {
  const normalizedQuery = normalizeText(searchTerm);
  const rawTokens = tokenize(searchTerm);
  const tokens = rawTokens.filter((token) => !QUERY_STOP_WORDS.has(token));
  const profile: QueryProfile = {
    tokens,
    weightedTokens: tokens.filter((token) => !SOFT_QUERY_TOKENS.has(token)),
    requiredDivision: null,
    allowedCategorySlugs: null,
    preferredCategorySlugs: new Set<string>(),
    requiredTokenGroups: [],
    excludedTokens: new Set<string>(),
  };

  const hasToken = (...candidates: string[]) =>
    candidates.some((candidate) => tokens.includes(candidate));
  const queryIncludes = (...phrases: string[]) =>
    phrases.some((phrase) => normalizedQuery.includes(phrase));

  const applyDivision = (division: StoreDivision) => {
    profile.requiredDivision = division;
  };

  const mergeAllowedCategories = (categories: string[]) => {
    const next = new Set(categories);
    profile.allowedCategorySlugs = profile.allowedCategorySlugs
      ? new Set(
          [...profile.allowedCategorySlugs].filter((entry) => next.has(entry)),
        )
      : next;
  };

  const addPreferredCategories = (categories: string[]) => {
    for (const category of categories) {
      profile.preferredCategorySlugs.add(category);
    }
  };

  if (hasToken("tshirt", "tee") || queryIncludes("tshirt", "tee shirt")) {
    applyDivision("fashion");
    mergeAllowedCategories(["tops", "mens-shirts"]);
    addPreferredCategories(["tops"]);
    profile.requiredTokenGroups.push(["tshirt", "tee", "shirt"]);
  } else if (hasToken("shirt")) {
    applyDivision("fashion");
    mergeAllowedCategories(["tops", "mens-shirts"]);
    addPreferredCategories(["mens-shirts", "tops"]);
    profile.requiredTokenGroups.push(["shirt", "tee", "tshirt"]);
  } else if (hasToken("top")) {
    applyDivision("fashion");
    mergeAllowedCategories(["tops"]);
    addPreferredCategories(["tops"]);
    profile.requiredTokenGroups.push(["top"]);
  }

  if (hasToken("collar", "collared") || queryIncludes("buttondown", "button down")) {
    applyDivision("fashion");
    mergeAllowedCategories(["mens-shirts"]);
    addPreferredCategories(["mens-shirts"]);
  }

  if (
    queryIncludes("without collar", "no collar") ||
    hasToken("collarless")
  ) {
    applyDivision("fashion");
    mergeAllowedCategories(["tops"]);
    addPreferredCategories(["tops"]);
    profile.excludedTokens.add("collar");
  }

  if (hasToken("shoe", "sneaker", "trainer")) {
    applyDivision("fashion");
    mergeAllowedCategories(["mens-shoes"]);
    addPreferredCategories(["mens-shoes"]);
    profile.requiredTokenGroups.push(["shoe", "sneaker", "trainer"]);
  }

  if (hasToken("dress")) {
    applyDivision("fashion");
    mergeAllowedCategories(["womens-dresses"]);
    addPreferredCategories(["womens-dresses"]);
    profile.requiredTokenGroups.push(["dress"]);
  }

  if (hasToken("bag", "tote", "handbag")) {
    applyDivision("fashion");
    mergeAllowedCategories(["womens-bags"]);
    addPreferredCategories(["womens-bags"]);
    profile.requiredTokenGroups.push(["bag", "tote", "handbag"]);
  }

  if (hasToken("laptop")) {
    applyDivision("electronics");
    mergeAllowedCategories(["laptops"]);
    addPreferredCategories(["laptops"]);
    profile.requiredTokenGroups.push(["laptop"]);
  }

  if (hasToken("smartphone", "phone", "iphone", "android")) {
    applyDivision("electronics");
    mergeAllowedCategories(["smartphones"]);
    addPreferredCategories(["smartphones"]);
    profile.requiredTokenGroups.push(["smartphone", "phone"]);
  }

  if (hasToken("tablet", "ipad")) {
    applyDivision("electronics");
    mergeAllowedCategories(["tablets"]);
    addPreferredCategories(["tablets"]);
    profile.requiredTokenGroups.push(["tablet", "ipad"]);
  }

  if (hasToken("earbud", "earphone", "headphone", "speaker", "charger", "case")) {
    applyDivision("electronics");
    mergeAllowedCategories(["mobile-accessories"]);
    addPreferredCategories(["mobile-accessories"]);
  }

  return profile;
}

function scoreProduct(product: StoreProduct, searchTerm: string) {
  if (!searchTerm) {
    return {
      score: product.rating * 20 + Math.min(product.inventory, 25),
      matchedTokens: 0,
    };
  }

  const profile = buildQueryProfile(searchTerm);
  const tokens = profile.weightedTokens.length > 0 ? profile.weightedTokens : profile.tokens;
  const normalizedQuery = normalizeText(searchTerm);
  const haystack = buildStructuredHaystack(product);
  const structuredFields = [
    haystack.name,
    haystack.category,
    haystack.categorySlug,
    haystack.brand,
    haystack.tags,
    haystack.attributes,
  ];
  const structuredText = structuredFields.join(" ");

  if (profile.requiredDivision && product.division !== profile.requiredDivision) {
    return { score: 0, matchedTokens: 0 };
  }

  if (
    profile.allowedCategorySlugs &&
    !profile.allowedCategorySlugs.has(product.categorySlug)
  ) {
    return { score: 0, matchedTokens: 0 };
  }

  for (const excludedToken of profile.excludedTokens) {
    if (structuredText.includes(excludedToken)) {
      return { score: 0, matchedTokens: 0 };
    }
  }

  let score = 0;
  let matchedTokens = 0;

  if (haystack.name.includes(normalizedQuery)) {
    score += 54;
  }

  if (haystack.attributes.includes(normalizedQuery)) {
    score += 34;
  }

  if (haystack.tags.includes(normalizedQuery)) {
    score += 24;
  }

  if (haystack.category.includes(normalizedQuery)) {
    score += 18;
  }

  if (haystack.categorySlug.includes(normalizedQuery)) {
    score += 20;
  }

  if (haystack.brand.includes(normalizedQuery)) {
    score += 14;
  }

  if (profile.preferredCategorySlugs.has(product.categorySlug)) {
    score += 42;
    matchedTokens += 1;
  }

  if (profile.requiredDivision === product.division) {
    score += 12;
  }

  if (profile.excludedTokens.size > 0) {
    score += 10;
    matchedTokens += 1;
  }

  for (const group of profile.requiredTokenGroups) {
    if (!group.some((token) => structuredText.includes(token))) {
      return { score: 0, matchedTokens: 0 };
    }
  }

  for (const token of tokens) {
    let tokenMatched = false;

    if (haystack.name.includes(token)) {
      score += 20;
      tokenMatched = true;
    }

    if (haystack.attributes.includes(token)) {
      score += 16;
      tokenMatched = true;
    }

    if (haystack.tags.includes(token)) {
      score += 13;
      tokenMatched = true;
    }

    if (haystack.category.includes(token)) {
      score += 10;
      tokenMatched = true;
    }

    if (haystack.categorySlug.includes(token)) {
      score += 12;
      tokenMatched = true;
    }

    if (haystack.brand.includes(token)) {
      score += 8;
      tokenMatched = true;
    }

    if (tokenMatched) {
      matchedTokens += 1;
    }
  }

  return {
    score:
      score + matchedTokens * 12 + product.rating * 2 + Math.min(product.inventory, 10) / 10,
    matchedTokens,
  };
}

function formatSummary(searchTerm: string, resultCount: number) {
  if (!searchTerm && resultCount > 0) {
    return `${resultCount} products ready to explore.`;
  }

  if (resultCount === 0) {
    return `No products matched "${searchTerm}".`;
  }

  if (resultCount === 1) {
    return `1 product matched "${searchTerm}".`;
  }

  return `${resultCount} products matched "${searchTerm}".`;
}

export function searchProducts(
  products: StoreProduct[],
  input: ProductSearchInput,
  baseProducts: StoreProduct[] = products,
): ProductSearchResult {
  const normalizedSearchTerm = input.searchTerm.trim();
  const filteredProducts = baseProducts.filter((product) =>
    matchesFilters(product, input.filters),
  );

  const rankedProducts = normalizedSearchTerm
    ? filteredProducts
        .map((product) => ({
          product,
          match: scoreProduct(product, normalizedSearchTerm),
        }))
        .filter(({ match }) => match.matchedTokens > 0)
        .sort((left, right) => {
          if (right.match.matchedTokens !== left.match.matchedTokens) {
            return right.match.matchedTokens - left.match.matchedTokens;
          }

          if (right.match.score !== left.match.score) {
            return right.match.score - left.match.score;
          }

          return left.product.price - right.product.price;
        })
        .map(({ product }) => product)
    : [...filteredProducts].sort((left, right) => {
        const rightScore = scoreProduct(right, normalizedSearchTerm);
        const leftScore = scoreProduct(left, normalizedSearchTerm);

        if (rightScore.score !== leftScore.score) {
          return rightScore.score - leftScore.score;
        }

        return left.price - right.price;
      });

  return {
    normalizedSearchTerm,
    filters: input.filters,
    results: rankedProducts,
    summary: formatSummary(normalizedSearchTerm, rankedProducts.length),
  };
}

export function buildSelectOptions(products: StoreProduct[]) {
  const categories = Array.from(
    new Map(products.map((product) => [product.categorySlug, product.category])).entries(),
  )
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));

  const brands = Array.from(new Set(products.map((product) => product.brand)))
    .sort((left, right) => left.localeCompare(right))
    .map((brand) => ({ value: brand, label: brand }));

  const tags = Array.from(new Set(products.flatMap((product) => product.tags)))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 16);

  return { categories, brands, tags };
}
