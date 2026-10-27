// secp256k1 point arithmetic over BigInt. Affine coordinates: slower than
// Jacobian, but a key derivation only needs a few hundred point operations and
// the shorter code is easier to audit.

export const CURVE_P = 2n ** 256n - 2n ** 32n - 977n;
export const CURVE_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export const G = {
  x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
};

export const fieldMod = (a, m = CURVE_P) => ((a % m) + m) % m;

export function fieldInverse(a, m = CURVE_P) {
  if (fieldMod(a, m) === 0n) throw new Error('zero has no modular inverse');
  let [r0, r1] = [fieldMod(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return fieldMod(s0, m);
}

function powMod(base, exp, m) {
  let result = 1n;
  let b = fieldMod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

export function pointDouble(p) {
  if (p === null) return null;
  if (p.y === 0n) return null;
  const lambda = fieldMod(3n * p.x * p.x * fieldInverse(2n * p.y));
  const x = fieldMod(lambda * lambda - 2n * p.x);
  return { x, y: fieldMod(lambda * (p.x - x) - p.y) };
}

export function pointAdd(p, q) {
  if (p === null) return q;
  if (q === null) return p;
  if (p.x === q.x) return p.y === q.y ? pointDouble(p) : null;
  const lambda = fieldMod((q.y - p.y) * fieldInverse(q.x - p.x));
  const x = fieldMod(lambda * lambda - p.x - q.x);
  return { x, y: fieldMod(lambda * (p.x - x) - p.y) };
}

export function pointMultiply(k, point = G) {
  let scalar = fieldMod(k, CURVE_N);
  if (scalar === 0n) throw new Error('scalar must not be zero mod n');
  let result = null;
  let addend = point;
  while (scalar > 0n) {
    if (scalar & 1n) result = pointAdd(result, addend);
    addend = pointDouble(addend);
    scalar >>= 1n;
  }
  return result;
}

export function isOnCurve(p) {
  if (p === null) return false;
  return fieldMod(p.y * p.y - p.x * p.x * p.x - 7n) === 0n;
}

export function serializePoint(point, compressed = true) {
  const x = point.x.toString(16).padStart(64, '0');
  if (!compressed) return `04${x}${point.y.toString(16).padStart(64, '0')}`;
  return `${point.y % 2n === 0n ? '02' : '03'}${x}`;
}

// BIP340 lift_x: recover the point with an even y from an x-only key.
export function liftX(x) {
  if (x <= 0n || x >= CURVE_P) throw new Error('x is outside the field');
  const ySq = fieldMod(x * x * x + 7n);
  const y = powMod(ySq, (CURVE_P + 1n) / 4n, CURVE_P);
  if (fieldMod(y * y) !== ySq) throw new Error('x is not on the curve');
  return { x, y: y % 2n === 0n ? y : CURVE_P - y };
}
