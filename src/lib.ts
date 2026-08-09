/**
 * Library surface — the parsers and client, importable without starting a
 * server. `src/index.ts` is the stdio entry point and is not exported here.
 */
export { JobberClient, type CardPage, type JobberClientOptions } from './client.js';
export { HubRegistry, CLIENT_HUB_ORIGIN, type Hub } from './hubs.js';
export {
  decodeEntities,
  idFromUrl,
  looksChallenged,
  pageText,
  parseAppointments,
  parseCards,
  stripTags,
  type Appointment,
  type CardRecord,
} from './parse.js';
export { JobberFetchproxyTransport, type JobberBridge } from './transport-fetchproxy.js';
export type { JobberTransport } from './transport.js';
export { VERSION } from './version.js';
