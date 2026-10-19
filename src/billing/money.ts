/**
 * Money is integer cents everywhere in billing. Postgres `numeric` values arrive as strings and are
 * parsed digit by digit; nothing here multiplies or adds a floating-point dollar amount. Convert to
 * a decimal string only at the edge (the 837P, a numeric column, the screen).
 */

/** An integer number of cents. */
export type Cents = number;

const DECIMAL = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "6.85" → 685. Throws on anything that is not a plain decimal with at most two places. */
export function toCents(value: string | number): Cents {
  const s = typeof value === "number" ? numberText(value) : value.trim();
  const m = DECIMAL.exec(s);
  if (!m) throw new Error(`Not a money amount: ${JSON.stringify(value)}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Money amount out of range");
  return m[1] ? -cents : cents;
}

/** Numbers are accepted only when they already are whole cents, e.g. a literal 54.8 in a test. */
function numberText(n: number): string {
  if (!Number.isFinite(n)) throw new Error("Not a money amount");
  const s = String(n);
  if (/e/i.test(s) || !DECIMAL.test(s)) throw new Error(`Not a whole number of cents: ${n}`);
  return s;
}

/** units × rate, both integers, so the product is exact. */
export function lineCents(units: number, rate: Cents): Cents {
  if (!Number.isInteger(units) || !Number.isInteger(rate)) throw new Error("Units and rate must be integers");
  const c = units * rate;
  if (!Number.isSafeInteger(c)) throw new Error("Line amount out of range");
  return c;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let t = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error("Cents must be integers");
    t += v;
  }
  return t;
}

/** 5480 → "54.80"; -5 → "-0.05". For the 837P and numeric columns. */
export function centsToDecimal(c: Cents): string {
  if (!Number.isInteger(c)) throw new Error("Cents must be integers");
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** For display only: the dollar value as a number to hand to `fmtMoney`. */
export const centsToDollars = (c: Cents) => c / 100;
