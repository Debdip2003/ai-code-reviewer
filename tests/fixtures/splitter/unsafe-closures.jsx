import React, { useState } from 'react';

export default function CheckoutPage() {
  const [cart, setCart] = useState(['item-1', 'item-2']);
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');

  // Unsafe helper capturing parent state variables
  function handleCheckout() {
    setLoading(true);
    const payload = {
      items: cart,
      code: couponCode
    };
    return fetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).finally(() => {
      setLoading(false);
    });
  }

  // Nested component capturing outer state
  function OrderSummary() {
    return (
      <div className="order-summary">
        <h4>Order Summary ({cart.length} items)</h4>
        <button onClick={handleCheckout} disabled={loading}>
          {loading ? 'Processing...' : 'Place Order'}
        </button>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <h2>Checkout</h2>
      <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
      <OrderSummary />
    </div>
  );
}
