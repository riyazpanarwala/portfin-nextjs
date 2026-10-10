import { pbkdf2, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from 'node:util';

const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const deriveKey = promisify(pbkdf2);
// Unknown accounts still perform the same asynchronous verification work.
export const DUMMY_PASSWORD_HASH = `${ALGORITHM}$${ITERATIONS}$portfin-dummy-password$${Buffer.alloc(KEY_LENGTH).toString('base64url')}`;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("base64url");

  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;

  const parts = passwordHash.split('$');
  if (parts.length !== 4) return false;
  const [algorithm, iterationsText, salt, expectedHash] = parts;
  const iterations = Number(iterationsText);

  if (
    algorithm !== ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    iterations > 1000000 ||
    !salt || salt.length > 128 ||
    !/^[A-Za-z0-9_-]{43}$/.test(expectedHash || '')
  ) {
    return false;
  }

  const actual = await deriveKey(password, salt, iterations, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(expectedHash, 'base64url');

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
