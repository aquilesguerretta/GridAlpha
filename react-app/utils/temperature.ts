/**
 * Convert Fahrenheit to Celsius, rounded to 1 decimal place.
 */
export function toCelsius(f: number): number {
  return Math.round((f - 32) * (5 / 9) * 10) / 10;
}

/**
 * Format temperature for display: "34°F / 1°C" (whole numbers only).
 */
export function formatTempFandC(f: number): string {
  return `${Math.round(f)}°F / ${Math.round((f - 32) * 5 / 9)}°C`;
}
