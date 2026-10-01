/** New IFC GlobalIds (22 characters of IFC's base-64 alphabet), for elements created by copying. */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
export function newGlobalId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(22);
  // the first character carries only 2 bits in IFC's encoding of a 128-bit GUID
  return ALPHABET[bytes[0] % 4] + Array.from(bytes.slice(1), (b) => ALPHABET[b % 64]).join('');
}
