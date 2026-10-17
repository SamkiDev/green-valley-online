// Payment abstraction. Swap DemoProvider for Paystack/Payfast/Peach by implementing PaymentProvider.
// The server never receives or stores card numbers: real gateways use hosted pages/tokens.
export interface ChargeResult { providerRef: string; status: 'PAID' | 'FAILED' }
export interface PaymentProvider { name: string; charge(i: { orderId: string; amount: number; method: string }): Promise<ChargeResult> }
export const DemoProvider: PaymentProvider = {
  name: 'demo',
  async charge() { return { providerRef: 'PAY-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase(), status: 'PAID' }; },
};
export const provider: PaymentProvider = DemoProvider; // choose by process.env.PAYMENT_PROVIDER once real ones exist
