import { describe, expect, it } from 'vitest';
import { fromNullMarker, NULL_MARKER, toNullMarker } from '../src/utils';

const SAMPLE_NUMBER = 3;

// Unit-level pin on the null-marker encoding. The mapping is intentionally NOT collision-free:
// it must be idempotent because better-auth's factory may apply customTransformInput to the
// same value more than once (stacked factories re-transform where clauses), and idempotence
// plus a total decode makes any escaping scheme impossible. Round trips therefore preserve
// every value EXCEPT strings exactly equal to the sentinel, which read back as null.
describe('null marker encoding', () => {
  const roundTrip = (value: unknown) => fromNullMarker(toNullMarker(value));

  it('is idempotent in both directions', () => {
    const inputs = [
      null,
      NULL_MARKER,
      `${NULL_MARKER}x`,
      '',
      'plain',
      SAMPLE_NUMBER,
      [NULL_MARKER, null],
      { a: { b: null }, c: NULL_MARKER, d: [{ e: null }] },
    ];
    for (const input of inputs) {
      expect(toNullMarker(toNullMarker(input))).toEqual(toNullMarker(input));
      expect(fromNullMarker(fromNullMarker(input))).toEqual(
        fromNullMarker(input)
      );
    }
  });

  it('round trips every value except the literal sentinel', () => {
    const lossless = [
      `${NULL_MARKER}x`,
      '',
      'plain',
      SAMPLE_NUMBER,
      [`${NULL_MARKER}x`, null],
      { a: { b: null } },
    ];
    for (const input of lossless) {
      expect(roundTrip(input)).toEqual(input);
    }

    expect(roundTrip(null)).toBeNull();
    expect(roundTrip(NULL_MARKER)).toBeNull();
  });
});
