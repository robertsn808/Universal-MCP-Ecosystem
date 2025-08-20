import axios, { AxiosInstance } from "axios";

export type UPPItem = { sku: string; name?: string; qty: number; priceCents: number };

export class UPPClient {
  private http: AxiosInstance;
  constructor(opts?: { baseURL?: string; apiKey?: string }) {
    this.http = axios.create({
      baseURL: opts?.baseURL || process.env.UPP_API_BASE,
      headers: { Authorization: `Bearer ${opts?.apiKey || process.env.UPP_API_KEY}` },
    });
  }

  async createInvoice(params: {
    customerEmail: string;
    items: UPPItem[];
    memo?: string;
  }): Promise<{ id: string; payLink: string }>
  {
    const res = await this.http.post("/invoices", params);
    return res.data;
  }

  async createCheckout(params: { items: UPPItem[]; customerEmail?: string }): Promise<{ url: string }>
  {
    const res = await this.http.post("/checkout", params);
    return res.data;
  }
}

