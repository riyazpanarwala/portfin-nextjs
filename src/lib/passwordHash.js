import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("base64url");

  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;

  const [algorithm, iterationsText, salt, expectedHash] = passwordHash.split("$");
  const iterations = Number(iterationsText);

  if (
    algorithm !== ALGORITHM ||
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    !salt ||
    !expectedHash
  ) {
    return false;
  }

  const actual = Buffer.from(
    pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString("base64url"),
  );
  const expected = Buffer.from(expectedHash);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
