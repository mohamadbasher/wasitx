import { sha256 } from "@noble/hashes/sha2";
import { keccak_256 } from "@noble/hashes/sha3";
import type { NetworkCode } from "../enums";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** TRON base58check address: 0x41 prefix, 21-byte payload, 4-byte double-SHA256 checksum. */
export function isValidTronAddress(addr: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;
  const raw = base58Decode(addr);
  if (!raw || raw.length !== 25 || raw[0] !== 0x41) return false;
  const payload = raw.slice(0, 21);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return checksum.every((b, i) => b === raw[21 + i]);
}

/** Ethereum address; mixed-case input must satisfy the EIP-55 checksum. */
export function isValidEthereumAddress(addr: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return false;
  const body = addr.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  return toChecksumAddress(addr) === addr;
}

export function toChecksumAddress(addr: string): string {
  const lower = addr.slice(2).toLowerCase();
  const hash = Array.from(keccak_256(new TextEncoder().encode(lower)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let out = "0x";
  for (let i = 0; i < 40; i++) out += parseInt(hash[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i];
  return out;
}

export function isValidAddressForNetwork(network: NetworkCode, addr: string): boolean {
  switch (network) {
    case "TRON_TRC20":
      return isValidTronAddress(addr);
    case "ETHEREUM_ERC20":
      return isValidEthereumAddress(addr);
  }
}

/** Detects the network an address belongs to — used to warn about wrong-network withdrawals. */
export function detectAddressNetwork(addr: string): NetworkCode | null {
  if (isValidTronAddress(addr)) return "TRON_TRC20";
  if (isValidEthereumAddress(addr)) return "ETHEREUM_ERC20";
  return null;
}
