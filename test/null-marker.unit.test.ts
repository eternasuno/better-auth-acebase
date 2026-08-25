import { describe, expect, it } from 'vitest';
import { fromNullMarker, NULL_MARKER, toNullMarker } from '../src/utils';

const SAMPLE_NUMBER = 3;

// The field-level mapping must remain idempotent because stacked Better Auth factories can
// transform where values more than once. JSON and arrays are serialized before it runs.
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

  it('only transforms field-level nulls and markers', () => {
    const lossless = [
      `${NULL_MARKER}x`,
      '',
      'plain',
      SAMPLE_NUMBER,
      [`${NULL_MARKER}x`, null],
      { a: { b: null }, marker: NULL_MARKER },
    ];
    for (const input of lossless) {
      expect(roundTrip(input)).toEqual(input);
    }

    expect(roundTrip(null)).toBeNull();
    expect(roundTrip(NULL_MARKER)).toBeNull();
  });
});
