export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

export function calculateTotal(items) {
  const sum = items.reduce((acc, item) => acc + item.price, 0);
  return formatCurrency(sum);
}
