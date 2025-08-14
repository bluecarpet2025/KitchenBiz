export function costPerBaseUnit(lastPrice: number, packToBase: number) {
  if (!packToBase || packToBase <= 0) return 0;
  return lastPrice / packToBase;
}
