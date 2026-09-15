export function isNonPublicHost(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isNonPublicIpv4(ipv4);

  const ipv6 = parseIpv6(host);
  if (!ipv6) return false;
  const [first] = ipv6;
  if (ipv6.every((part) => part === 0) || ipv6.slice(0, 7).every((part) => part === 0) && ipv6[7] === 1) return true;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true;
  if (ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff) {
    return isNonPublicIpv4([ipv6[6] >> 8, ipv6[6] & 0xff, ipv6[7] >> 8, ipv6[7] & 0xff]);
  }
  return false;
}

function parseIpv4(host: string): number[] | null {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function isNonPublicIpv4([first, second]: number[]): boolean {
  return first === 0
    || first === 10
    || first === 127
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168
    || first === 100 && second >= 64 && second <= 127
    || first >= 224;
}

function parseIpv6(host: string): number[] | null {
  if (!host.includes(':') || !/^[0-9a-f:]+$/i.test(host) || host.indexOf('::') !== host.lastIndexOf('::')) return null;
  const halves = host.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (halves.length === 2 && left.length + right.length >= 8) return null;

  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array.from({ length: omitted }, () => '0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}
