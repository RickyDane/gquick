const HTTP_SCHEMES = new Set(["http:", "https:"]);
const LOCALHOST = "localhost";
const ALLOWED_BARE_DOMAIN_TLDS = new Set([
  "app", "ai", "biz", "ca", "cloud", "co", "com", "dev", "edu", "gov", "io", "me", "net",
  "org", "tech", "uk", "us", "de",
]);

export interface NormalizedUrl {
  url: string;
  displayUrl: string;
}

export function normalizeUrlQuery(query: string): NormalizedUrl | null {
  const candidate = query.trim();
  if (!candidate || /\s/.test(candidate)) return null;

  const hasHttpScheme = /^https?:\/\//i.test(candidate);
  if (hasHttpScheme) {
    return parseAndNormalize(candidate, false);
  }

  // Reject other scheme-like values so launcher text such as `foo:bar` stays search.
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !looksLikeBareHostWithPort(candidate)) {
    return null;
  }

  if (!looksLikeBareUrl(candidate)) return null;

  const host = extractBareHost(candidate);
  const scheme = isLocalHost(host) || isIpv4Address(host) ? "http" : "https";
  return parseAndNormalize(`${scheme}://${candidate}`, true);
}

function parseAndNormalize(value: string, requirePortForLocalBareUrl: boolean): NormalizedUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!HTTP_SCHEMES.has(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase();
  const isHostValid = isLocalHost(host) || isIpv4Address(host) || isDomainName(host);
  if (!isHostValid) return null;

  if (requirePortForLocalBareUrl && (isLocalHost(host) || isIpv4Address(host)) && !parsed.port) {
    return null;
  }

  return {
    url: parsed.href,
    displayUrl: parsed.href.replace(/\/$/, ""),
  };
}

function looksLikeBareUrl(value: string): boolean {
  const host = extractBareHost(value).toLowerCase();
  if (looksLikeBareHostWithPort(value) && (isLocalHost(host) || isIpv4Address(host))) {
    return true;
  }

  if (!isDomainName(host)) return false;

  // Schemeless domains are intentionally conservative so dotted filenames
  // like README.md, main.rs, package.json, and Cargo.toml stay in file search.
  return isWwwDomain(host) || hasAllowedBareDomainTld(host);
}

function looksLikeBareHostWithPort(value: string): boolean {
  const hostAndPort = value.split(/[/?#]/, 1)[0];
  return /:\d{1,5}$/.test(hostAndPort);
}

function extractBareHost(value: string): string {
  const hostAndPort = value.split(/[/?#]/, 1)[0];
  const ipv6Match = hostAndPort.match(/^\[([^\]]+)](?::\d{1,5})?$/);
  if (ipv6Match) return ipv6Match[1];
  return hostAndPort.replace(/:\d{1,5}$/, "");
}

function isLocalHost(host: string): boolean {
  return host === LOCALHOST;
}

function isIpv4Address(host: string): boolean {
  const parts = host.split(".");
  return parts.length === 4 && parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255 && String(value) === part;
  });
}

function isDomainName(host: string): boolean {
  if (host.length > 253 || !host.includes(".")) return false;

  const labels = host.split(".");
  const topLevelDomain = labels[labels.length - 1];
  if (!topLevelDomain || !/^[a-z]{2,63}$/i.test(topLevelDomain)) return false;

  return labels.every(label => {
    if (label.length < 1 || label.length > 63) return false;
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label);
  });
}

function isWwwDomain(host: string): boolean {
  return host.startsWith("www.") && hasAllowedBareDomainTld(host);
}

function hasAllowedBareDomainTld(host: string): boolean {
  const labels = host.split(".");
  const topLevelDomain = labels[labels.length - 1]?.toLowerCase();
  return topLevelDomain ? ALLOWED_BARE_DOMAIN_TLDS.has(topLevelDomain) : false;
}
