export const REQUEST_TIMEOUT_MS = 5000;

export type ApiStatus = 'UP' | 'SLOW' | 'DOWN' | 'ERROR' | 'UNKNOWN' | 'PAUSED';

export const MAX_REQUEST_BODY_LENGTH = 10_000;
export const MAX_EXPECTED_BODY_LENGTH = 1_000;

export const USER_AGENT = 'ApiHealthCheckup/1.0 (+https://apihub.kapitanat.pl)';
// fetch() throws if a body is sent with these methods
export const METHODS_WITHOUT_REQUEST_BODY = ['GET', 'HEAD'];
// HEAD responses never contain a body, so there is nothing to match against
export const METHODS_WITHOUT_RESPONSE_BODY = ['HEAD'];
