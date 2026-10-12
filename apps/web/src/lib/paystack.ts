export type PaystackPopupOptions = {
  key: string;
  email: string;
  amount: number;
  ref: string;
  currency?: string;
  metadata?: Record<string, unknown>;
  callback?: (response: { reference: string; status?: string }) => void;
  onClose?: () => void;
};

type PaystackHandler = { openIframe: () => void };

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: PaystackPopupOptions) => PaystackHandler;
    };
  }
}

const SCRIPT_ID = 'paystack-inline-js';
const SCRIPT_SRC = 'https://js.paystack.co/v1/inline.js';

export function loadPaystackScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Paystack requires a browser'));
  if (window.PaystackPop) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Paystack')), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Paystack'));
    document.body.appendChild(script);
  });
}

export async function openPaystackCheckout(options: PaystackPopupOptions): Promise<void> {
  await loadPaystackScript();
  if (!window.PaystackPop) throw new Error('Paystack is unavailable');
  window.PaystackPop.setup(options).openIframe();
}
