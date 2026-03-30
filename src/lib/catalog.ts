import { cache } from "react";

import type {
  ProductAttribute,
  ProductSizeOption,
  StoreDivision,
  StoreProduct,
} from "@/types/catalog";

type DummyCategoryRequest = {
  slug: string;
  limit: number;
  division: StoreDivision;
};

type DummyProduct = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  rating: number;
  stock: number;
  tags?: string[];
  brand?: string;
  sku?: string;
  weight?: number;
  dimensions?: {
    width?: number;
    height?: number;
    depth?: number;
  };
  warrantyInformation?: string;
  shippingInformation?: string;
  availabilityStatus?: string;
  returnPolicy?: string;
  minimumOrderQuantity?: number;
  images?: string[];
  thumbnail?: string;
};

type DummyCategoryResponse = {
  products: DummyProduct[];
};

const CATALOG_REQUESTS: DummyCategoryRequest[] = [
  { slug: "mens-shirts", limit: 5, division: "fashion" },
  { slug: "mens-shoes", limit: 5, division: "fashion" },
  { slug: "tops", limit: 5, division: "fashion" },
  { slug: "womens-dresses", limit: 5, division: "fashion" },
  { slug: "womens-bags", limit: 5, division: "fashion" },
  { slug: "laptops", limit: 5, division: "electronics" },
  { slug: "smartphones", limit: 5, division: "electronics" },
  { slug: "tablets", limit: 5, division: "electronics" },
  { slug: "mobile-accessories", limit: 10, division: "electronics" },
];

const FALLBACK_FASHION_BLUEPRINTS = [
  {
    category: "Tops",
    slug: "tops",
    baseName: "Studio Tee",
    brand: "North Thread",
    priceBase: 34,
    tags: ["t-shirt", "cotton", "casual"],
    attributes: [
      ["Material", "Organic cotton jersey"],
      ["Fit", "Relaxed fit"],
      ["Care", "Machine wash cold"],
    ],
  },
  {
    category: "Mens Shirts",
    slug: "mens-shirts",
    baseName: "Weekend Shirt",
    brand: "Harbor Supply",
    priceBase: 46,
    tags: ["shirt", "button-down", "smart casual"],
    attributes: [
      ["Material", "Brushed oxford"],
      ["Collar", "Classic spread collar"],
      ["Care", "Low-iron finish"],
    ],
  },
  {
    category: "Mens Shoes",
    slug: "mens-shoes",
    baseName: "Stride Runner",
    brand: "Kite Works",
    priceBase: 88,
    tags: ["shoes", "running", "lightweight"],
    attributes: [
      ["Upper", "Breathable knit"],
      ["Sole", "High-rebound foam"],
      ["Use case", "All-day city wear"],
    ],
  },
  {
    category: "Womens Dresses",
    slug: "womens-dresses",
    baseName: "Contour Dress",
    brand: "Aster Lane",
    priceBase: 74,
    tags: ["dress", "occasion", "soft-touch"],
    attributes: [
      ["Fabric", "Stretch crepe"],
      ["Length", "Midi"],
      ["Silhouette", "Tailored fit"],
    ],
  },
  {
    category: "Womens Bags",
    slug: "womens-bags",
    baseName: "Transit Tote",
    brand: "Morrow Goods",
    priceBase: 92,
    tags: ["bag", "everyday carry", "travel"],
    attributes: [
      ["Material", "Pebbled vegan leather"],
      ["Capacity", "Fits 13-inch laptop"],
      ["Closure", "Top zip"],
    ],
  },
] as const;

const FALLBACK_ELECTRONICS_BLUEPRINTS = [
  {
    category: "Laptops",
    slug: "laptops",
    baseName: "NovaBook 14",
    brand: "Nova",
    priceBase: 1299,
    tags: ["laptop", "productivity", "creator"],
    attributes: [
      ["Display", "14-inch OLED"],
      ["Memory", "16GB unified memory"],
      ["Storage", "512GB SSD"],
    ],
  },
  {
    category: "Smartphones",
    slug: "smartphones",
    baseName: "Pulse Phone",
    brand: "Pulse",
    priceBase: 899,
    tags: ["smartphone", "camera", "5g"],
    attributes: [
      ["Camera", "50MP main sensor"],
      ["Battery", "All-day battery"],
      ["Connectivity", "5G + Wi-Fi 6"],
    ],
  },
  {
    category: "Tablets",
    slug: "tablets",
    baseName: "Canvas Tab",
    brand: "Atelier Tech",
    priceBase: 649,
    tags: ["tablet", "streaming", "pen-ready"],
    attributes: [
      ["Display", "11-inch IPS display"],
      ["Battery", "10-hour mixed use"],
      ["Audio", "Quad speaker array"],
    ],
  },
  {
    category: "Mobile Accessories",
    slug: "mobile-accessories",
    baseName: "Orbit Buds",
    brand: "Orbit",
    priceBase: 129,
    tags: ["wireless earphones", "anc", "portable"],
    attributes: [
      ["Noise control", "Hybrid noise cancellation"],
      ["Battery", "24-hour case battery"],
      ["Resistance", "Sweat resistant"],
    ],
  },
  {
    category: "Mobile Accessories",
    slug: "mobile-accessories",
    baseName: "Echo Dock",
    brand: "Foundry Audio",
    priceBase: 199,
    tags: ["smart speaker", "voice control", "room audio"],
    attributes: [
      ["Driver setup", "Dual full-range drivers"],
      ["Assistant", "Far-field microphones"],
      ["Connectivity", "Bluetooth and Wi-Fi"],
    ],
  },
] as const;

function titleize(value: string) {
  return value
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function formatDimensions(dimensions?: DummyProduct["dimensions"]) {
  if (!dimensions) {
    return "Standard pack dimensions";
  }

  const parts = [dimensions.width, dimensions.height, dimensions.depth]
    .filter((value): value is number => typeof value === "number")
    .map((value) => `${value.toFixed(1)} cm`);

  return parts.length > 0 ? parts.join(" x ") : "Standard pack dimensions";
}

function buildSizeLabels(division: StoreDivision, categorySlug: string) {
  if (division !== "fashion") {
    return [];
  }

  if (categorySlug === "mens-shoes") {
    return ["US 8", "US 9", "US 10", "US 11", "US 12"];
  }

  if (categorySlug === "womens-dresses") {
    return ["XS", "S", "M", "L"];
  }

  if (categorySlug === "mens-shirts" || categorySlug === "tops") {
    return ["XS", "S", "M", "L", "XL"];
  }

  return [];
}

function buildSizeOptions(
  division: StoreDivision,
  categorySlug: string,
  inventory: number,
): ProductSizeOption[] {
  const labels = buildSizeLabels(division, categorySlug);

  if (labels.length === 0) {
    return [];
  }

  const buckets = labels.map(() => 0);

  for (let index = 0; index < inventory; index += 1) {
    buckets[index % labels.length] += 1;
  }

  return labels.map((label, index) => ({
    label,
    inventory: buckets[index],
    available: buckets[index] > 0,
  }));
}

function buildAttributes(
  product: DummyProduct,
  division: StoreDivision,
  sizes: ProductSizeOption[],
): ProductAttribute[] {
  return [
    { label: "Category", value: titleize(product.category) },
    { label: "Brand", value: product.brand ?? "Independent Label" },
    ...(sizes.length > 0
      ? [
          {
            label: "Sizes",
            value: sizes
              .filter((size) => size.available)
              .map((size) => size.label)
              .join(", "),
          },
        ]
      : []),
    { label: "SKU", value: product.sku ?? `SKU-${product.id}` },
    {
      label: "Availability",
      value:
        product.availabilityStatus ??
        (product.stock > 0 ? "In Stock" : "Backordered"),
    },
    {
      label: "Shipping",
      value: product.shippingInformation ?? "Ships in 3-5 business days",
    },
    {
      label: "Warranty",
      value: product.warrantyInformation ?? "1 year warranty",
    },
    {
      label: "Return policy",
      value: product.returnPolicy ?? "30 days return policy",
    },
    {
      label: "Minimum order",
      value: `${product.minimumOrderQuantity ?? 1} unit${
        (product.minimumOrderQuantity ?? 1) > 1 ? "s" : ""
      }`,
    },
    {
      label: "Weight",
      value: `${product.weight ?? 1} oz`,
    },
    {
      label: "Dimensions",
      value: formatDimensions(product.dimensions),
    },
  ];
}

function normalizeProduct(product: DummyProduct, division: StoreDivision): StoreProduct {
  const imageList = [
    ...(product.images ?? []),
    ...(product.thumbnail ? [product.thumbnail] : []),
  ].filter(Boolean);
  const sizes = buildSizeOptions(division, product.category, product.stock);

  return {
    id: `${division}-${product.id}`,
    sourceId: product.id,
    name: product.title,
    brand: product.brand ?? "Independent Label",
    division,
    category: titleize(product.category),
    categorySlug: product.category,
    price: product.price,
    inventory: product.stock,
    rating: product.rating,
    description: product.description,
    image: imageList[0] ?? `https://picsum.photos/seed/${product.id}/900/900`,
    images: imageList.length > 0 ? imageList : [`https://picsum.photos/seed/${product.id}/900/900`],
    sizes,
    tags: [...new Set([...(product.tags ?? []), titleize(product.category)])],
    attributes: buildAttributes(product, division, sizes),
    availability:
      product.availabilityStatus ?? (product.stock > 0 ? "In Stock" : "Backordered"),
    shipping: product.shippingInformation ?? "Ships in 3-5 business days",
    warranty: product.warrantyInformation ?? "1 year warranty",
    featured: product.rating >= 4.5 || product.price >= 999 || product.stock <= 15,
  };
}

async function fetchCategoryProducts(
  request: DummyCategoryRequest,
): Promise<StoreProduct[]> {
  const response = await fetch(
    `https://dummyjson.com/products/category/${request.slug}?limit=${request.limit}`,
    {
      next: { revalidate: 3600 },
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to fetch catalog category ${request.slug}`);
  }

  const payload = (await response.json()) as DummyCategoryResponse;

  return payload.products.map((product) =>
    normalizeProduct(product, request.division),
  );
}

function buildFallbackProducts(): StoreProduct[] {
  const fashionProducts = FALLBACK_FASHION_BLUEPRINTS.flatMap(
    (blueprint, categoryIndex) =>
      Array.from({ length: 5 }, (_, variantIndex) => {
        const variant = variantIndex + 1;
        const price = blueprint.priceBase + variantIndex * 8;
        const inventory = 12 + categoryIndex * 5 + variantIndex * 3;
        const sizes = buildSizeOptions("fashion", blueprint.slug, inventory);

        return {
          id: `fashion-fallback-${categoryIndex}-${variant}`,
          sourceId: `fashion-fallback-${categoryIndex}-${variant}`,
          name: `${blueprint.baseName} ${variant}`,
          brand: blueprint.brand,
          division: "fashion" as const,
          category: blueprint.category,
          categorySlug: blueprint.slug,
          price,
          inventory,
          rating: Number((4 + variantIndex * 0.13).toFixed(2)),
          description: `${blueprint.baseName} ${variant} is a polished fallback sample for voice-first fashion discovery, curated with searchable attributes and responsive imagery.`,
          image: `https://picsum.photos/seed/fashion-${categoryIndex}-${variant}/900/900`,
          images: [`https://picsum.photos/seed/fashion-${categoryIndex}-${variant}/900/900`],
          sizes,
          tags: [...blueprint.tags],
          attributes: [
            ...(sizes.length > 0
              ? [
                  {
                    label: "Sizes",
                    value: sizes
                      .filter((size) => size.available)
                      .map((size) => size.label)
                      .join(", "),
                  },
                ]
              : []),
            ...blueprint.attributes.map(([label, value]) => ({ label, value })),
          ],
          availability: inventory > 0 ? "In Stock" : "Backordered",
          shipping: variantIndex % 2 === 0 ? "Ships in 2-3 business days" : "Ships overnight",
          warranty: "1 year warranty",
          featured: variantIndex === 0,
        };
      }),
  );

  const electronicsProducts = FALLBACK_ELECTRONICS_BLUEPRINTS.flatMap(
    (blueprint, categoryIndex) =>
      Array.from({ length: 5 }, (_, variantIndex) => {
        const variant = variantIndex + 1;
        const price = blueprint.priceBase + variantIndex * 40;
        const inventory = 9 + categoryIndex * 4 + variantIndex * 2;
        const sizes = buildSizeOptions("electronics", blueprint.slug, inventory);

        return {
          id: `electronics-fallback-${categoryIndex}-${variant}`,
          sourceId: `electronics-fallback-${categoryIndex}-${variant}`,
          name: `${blueprint.baseName} ${variant}`,
          brand: blueprint.brand,
          division: "electronics" as const,
          category: blueprint.category,
          categorySlug: blueprint.slug,
          price,
          inventory,
          rating: Number((4.1 + variantIndex * 0.11).toFixed(2)),
          description: `${blueprint.baseName} ${variant} is a fallback electronics sample with tool-friendly specs so the Gemini Live assistant can search, filter, and explain it reliably.`,
          image: `https://picsum.photos/seed/electronics-${categoryIndex}-${variant}/900/900`,
          images: [`https://picsum.photos/seed/electronics-${categoryIndex}-${variant}/900/900`],
          sizes,
          tags: [...blueprint.tags],
          attributes: blueprint.attributes.map(([label, value]) => ({ label, value })),
          availability: inventory > 0 ? "In Stock" : "Backordered",
          shipping: variantIndex % 2 === 0 ? "Ships in 1 week" : "Ships in 3-5 business days",
          warranty: "2 year warranty",
          featured: variantIndex === 0,
        };
      }),
  );

  return [...fashionProducts, ...electronicsProducts];
}

export const getCatalogProducts = cache(async (): Promise<StoreProduct[]> => {
  try {
    const groups = await Promise.all(
      CATALOG_REQUESTS.map((request) => fetchCategoryProducts(request)),
    );

    return groups.flat().slice(0, 50);
  } catch {
    return buildFallbackProducts();
  }
});
