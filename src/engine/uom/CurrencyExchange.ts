export class CurrencyExchange {
  private rates: Record<string, number> = {};
  private baseCurrency = "USD";
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private fallbackRates: Record<string, number> = {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151.5,
    AUD: 1.53, CAD: 1.37, CHF: 0.88, CNY: 7.24,
    SEK: 10.45, NOK: 10.72, DKK: 6.86, NZD: 1.66,
    KRW: 1325, SGD: 1.34, HKD: 7.82, INR: 83.5,
    BRL: 5.05, ZAR: 18.3, MXN: 17.15, RUB: 91.5,
    TRY: 30.2, SAR: 3.75, AED: 3.67, ILS: 3.68,
    PLN: 4.01, CZK: 22.8, HUF: 356, THB: 35.8,
    IDR: 15700, MYR: 4.72, PHP: 56.2, CLP: 935,
    COP: 3900, ARS: 830, NGN: 1480, EGP: 30.9,
    PKR: 278, BDT: 109.5, VND: 24500, KES: 155,
    MAD: 10.1, QAR: 3.64, KWD: 0.31, OMR: 0.38,
    BHD: 0.38, JOD: 0.71,
  };

  constructor() {
    this.rates = { ...this.fallbackRates };
  }

  getRate(from: string, to: string): number {
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();
    if (fromUpper === toUpper) return 1;
    const fromRate = this.rates[fromUpper];
    const toRate = this.rates[toUpper];
    if (fromRate === undefined || toRate === undefined) return 1;
    return toRate / fromRate;
  }

  convert(value: number, from: string, to: string): number {
    return value * this.getRate(from, to);
  }

  isCurrency(unit: string): boolean {
    return unit.toUpperCase() in this.fallbackRates;
  }

  startPolling(): void {
    this.pollNow();
    this.pollingInterval = setInterval(() => this.pollNow(), 30 * 60 * 1000);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollNow(): Promise<void> {
    try {
      const resp = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.rates) {
        this.rates = { ...this.fallbackRates, ...data.rates };
      }
    } catch {
      this.rates = { ...this.fallbackRates };
    }
  }
}

export const sharedCurrencyExchange = new CurrencyExchange();
