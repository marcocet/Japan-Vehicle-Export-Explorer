const JPY_TO_USD = 1 / 150;
const GBP_TO_USD = 1.27;
const EUR_TO_USD = 1.08;

export function priceToUsd(amount: number, currency: string): number {
  switch (currency.toUpperCase()) {
    case "USD":
      return Math.round(amount);
    case "JPY":
      return Math.round(amount * JPY_TO_USD);
    case "GBP":
      return Math.round(amount * GBP_TO_USD);
    case "EUR":
      return Math.round(amount * EUR_TO_USD);
    default:
      return Math.round(amount);
  }
}

export function mileageToKm(amount: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case "km":
      return Math.round(amount);
    case "mi":
    case "miles":
      return Math.round(amount * 1.60934);
    default:
      return Math.round(amount);
  }
}

/** Parses strings like "¥850,000", "$5,400", "12,000 km", "8,500 mi" into a number. */
export function parseNumeric(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  return cleaned ? parseFloat(cleaned) : NaN;
}
