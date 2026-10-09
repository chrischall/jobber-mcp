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

/**
 * A failure in the bridge itself (extension down, pairing pending, timeout),
 * as opposed to an HTTP answer from the hub. Kept typed so the healthcheck can
 * blame the bridge layer: the bridge's `status()` is a snapshot that does not
 * throw when the extension is missing, so the hub fetch is where a dead bridge
 * actually shows up.
 */
export class JobberBridgeError extends Error {
  constructor(
    /** `bridgeErrorInfo(err).type` from `@chrischall/mcp-utils/fetchproxy`. */
    readonly kind: string,
    message: string,
    /** The bridge's own remediation, when it has one. */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'JobberBridgeError';
  }
}
