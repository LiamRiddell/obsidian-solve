export const BindingPower = {
  Lowest: 0,
  Assignment: 10,
  Conditional: 20,
  Sum: 30,
  Product: 40,
  Exponent: 50,
  Prefix: 60,
  Postfix: 70,
  Call: 80,
} as const;

export function setBindingPower(name: string, power: number): void {
  (BindingPower as Record<string, number>)[name] = power;
}

export function getBindingPower(name: string): number {
  return (BindingPower as Record<string, number>)[name] ?? 0;
}
