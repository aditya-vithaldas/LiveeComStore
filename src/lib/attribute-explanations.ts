import type { StoreProduct } from "@/types/catalog";

const EXPLANATIONS: Array<[string, string]> = [
  [
    "oled",
    "OLED panels light each pixel independently, which helps deliver deeper blacks, strong contrast, and punchy colors.",
  ],
  [
    "retina",
    "Retina is Apple's name for a very high pixel-density display that looks especially sharp at normal viewing distance.",
  ],
  [
    "dual screen",
    "Dual-screen hardware adds a second display area so you can keep tools, timelines, or references open while you work.",
  ],
  [
    "5g",
    "5G is the latest mainstream mobile network generation, usually offering faster wireless data and lower latency than older LTE networks.",
  ],
  [
    "smart speaker",
    "A smart speaker combines speakers, microphones, and voice controls so you can ask for music, timers, and connected-home actions hands-free.",
  ],
  [
    "wireless earphones",
    "Wireless earphones pair over Bluetooth so you can listen without a cable running to your phone or laptop.",
  ],
  [
    "warranty",
    "Warranty coverage is the manufacturer's promise to repair or replace the product for qualifying issues during the listed time window.",
  ],
  [
    "return policy",
    "The return policy explains how long you have to send the product back and any conditions that apply.",
  ],
  [
    "shipping",
    "Shipping information tells you how quickly the order is expected to leave the warehouse and arrive.",
  ],
  [
    "minimum order",
    "Minimum order quantity is the fewest units the seller allows in a single purchase.",
  ],
  [
    "dimensions",
    "Dimensions describe the physical size of the product or package, usually width, height, and depth.",
  ],
  [
    "stock",
    "Stock is the currently available on-hand inventory for that product listing.",
  ],
  [
    "availability",
    "Availability tells you whether the item can be purchased right now or is temporarily unavailable.",
  ],
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function explainProductAttribute(
  product: StoreProduct | undefined,
  query: string,
) {
  const normalizedQuery = normalize(query);

  if (!product) {
    const dictionaryMatch = EXPLANATIONS.find(([key]) =>
      normalizedQuery.includes(key),
    );

    if (dictionaryMatch) {
      return dictionaryMatch[1];
    }

    return `I can explain "${query}" once a product is open or once the request points to a specific result.`;
  }

  if (
    normalizedQuery.includes("warranty") ||
    normalizedQuery.includes("guarantee")
  ) {
    return `${product.name} includes ${product.warranty}.`;
  }

  if (
    normalizedQuery.includes("shipping") ||
    normalizedQuery.includes("delivery")
  ) {
    return `${product.name} ships with ${product.shipping}.`;
  }

  if (
    normalizedQuery.includes("stock") ||
    normalizedQuery.includes("inventory") ||
    normalizedQuery.includes("availability") ||
    normalizedQuery.includes("available")
  ) {
    return `${product.name} currently has ${product.inventory} units in stock and is marked ${product.availability}.`;
  }

  if (
    normalizedQuery.includes("price") ||
    normalizedQuery.includes("cost")
  ) {
    return `${product.name} is currently listed at ${formatCurrency(product.price)}.`;
  }

  if (
    normalizedQuery.includes("size") ||
    normalizedQuery.includes("fit")
  ) {
    if (product.sizes.length === 0) {
      return `${product.name} does not have apparel-style size variants on this listing.`;
    }

    const availableSizes = product.sizes
      .filter((size) => size.available)
      .map((size) => size.label);

    return `${product.name} is currently available in ${availableSizes.join(", ")}.`;
  }

  const dictionaryMatch = EXPLANATIONS.find(([key]) =>
    normalizedQuery.includes(key),
  );

  if (dictionaryMatch) {
    return `${dictionaryMatch[1]} For ${product.name}, the listing also shows ${product.shipping.toLowerCase()} and ${product.warranty.toLowerCase()}.`;
  }

  const matchingAttribute = product.attributes.find((attribute) => {
    const label = normalize(attribute.label);
    const value = normalize(attribute.value);

    return label.includes(normalizedQuery) || value.includes(normalizedQuery);
  });

  if (matchingAttribute) {
    return `${matchingAttribute.label} on ${product.name} is listed as ${matchingAttribute.value}. It helps you compare fulfillment, sizing, or hardware details without leaving the product page.`;
  }

  if (normalize(product.name).includes(normalizedQuery)) {
    return `${product.name} is part of the ${product.category} collection from ${product.brand}, and the assistant can search around it or open nearby results by voice.`;
  }

  return `I could not find a direct match for "${query}" on ${product.name}, but I can still help with its warranty, shipping, stock, price, or any listed spec on this product page.`;
}
