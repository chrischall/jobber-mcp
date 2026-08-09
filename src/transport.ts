/**
 * How a Client Hub page is fetched.
 *
 * One method, because there is exactly one operation: GET a hub page and hand
 * back its HTML. Keeping it an interface lets every tool and the client be
 * tested without a browser, a bridge, or a network.
 */
export interface JobberTransport {
  /** GET an absolute Client Hub URL, returning the response body. */
  get(url: string): Promise<{ status: number; body: string }>;
  /** Bridge diagnostics for the healthcheck tool. */
  status(): Promise<Record<string, unknown>>;
}
