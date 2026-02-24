/**
 * Convert Fahrenheit to Celsius, rounded to 1 decimal place.
 */
export function toCelsius(f: number): number {
  return Math.round((f - 32) * (5 / 9) * 10) / 10;
}

/**
 * Format temperature for display: "33.94°F / 1.1°C"
 */
export function formatTempFandC(f: number): string {
  return `${f}°F / ${toCelsius(f)}°C`;
}
