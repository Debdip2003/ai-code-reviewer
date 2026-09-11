import React, { useState, useEffect, useMemo } from 'react';

export const PRODUCT_STATUS_LABELS = {
  active: 'In Stock',
  outOfStock: 'Sold Out',
  discontinued: 'Discontinued'
};

export const DEFAULT_PAGE_SETTINGS = {
  pageSize: 20,
  maxCardsPerRow: 4,
  refreshIntervalMs: 60000
};

export function formatPrice(cents, currency = 'USD') {
  if (typeof cents !== 'number' || cents < 0) return '$0.00';
  const dollars = (cents / 100).toFixed(2);
  return `${currency === 'USD' ? '$' : ''}${dollars}`;
}

export function calculateDiscount(originalPrice, discountPercent) {
  if (!originalPrice || !discountPercent) return originalPrice;
  return Math.round(originalPrice * (1 - discountPercent / 100));
}

export async function fetchProducts(categoryId) {
  const url = categoryId ? `/api/products?cat=${encodeURIComponent(categoryId)}` : '/api/products';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }
  return response.json();
}

export function useProducts(categoryId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProducts(categoryId)
      .then((data) => {
        if (active) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [categoryId]);

  return { products, loading, error };
}

export function ProductCard({ product, onAddToCart }) {
  const statusLabel = PRODUCT_STATUS_LABELS[product.status] || 'Unknown';
  const displayPrice = formatPrice(product.priceCents);

  return (
    <div className="product-card">
      <img src={product.imageUrl} alt={product.title} className="product-image" />
      <div className="product-info">
        <h3>{product.title}</h3>
        <p className="status-tag">{statusLabel}</p>
        <span className="price">{displayPrice}</span>
        <button onClick={() => onAddToCart(product.id)} className="add-button">
          Add to Cart
        </button>
      </div>
    </div>
  );
}

export default function ProductPage({ categoryId = 'electronics' }) {
  const { products, loading, error } = useProducts(categoryId);
  const [cart, setCart] = useState([]);

  const handleAddToCart = (productId) => {
    setCart((prev) => [...prev, productId]);
  };

  const totalItems = useMemo(() => cart.length, [cart]);

  if (loading) {
    return <div className="spinner">Loading products...</div>;
  }

  if (error) {
    return <div className="error-banner">Error: {error}</div>;
  }

  return (
    <div className="product-page-container">
      <header className="page-header">
        <h1>Product Catalog</h1>
        <div className="cart-badge">Cart: {totalItems} items</div>
      </header>
      <main className="product-grid">
        {products.map((item) => (
          <ProductCard key={item.id} product={item} onAddToCart={handleAddToCart} />
        ))}
      </main>
    </div>
  );
}
