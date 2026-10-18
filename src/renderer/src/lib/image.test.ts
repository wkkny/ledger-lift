import { describe, expect, it } from 'vitest';
import { fitWithin, turnedSize, wrapTurns } from './image';

describe('fitWithin', () => {
  it('shrinks a portrait phone photo so its long side is the limit', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('shrinks a landscape photo by its width', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('keeps very thin images at least one pixel wide', () => {
    expect(fitWithin(10000, 2, 1600).height).toBe(1);
  });
});

describe('turnedSize', () => {
  it('swaps width and height for a quarter or three-quarter turn', () => {
    expect(turnedSize(1600, 1200, 1)).toEqual({ width: 1200, height: 1600 });
    expect(turnedSize(1600, 1200, 3)).toEqual({ width: 1200, height: 1600 });
  });

  it('keeps the size for no turn or a half turn', () => {
    expect(turnedSize(1600, 1200, 0)).toEqual({ width: 1600, height: 1200 });
    expect(turnedSize(1600, 1200, 2)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('wrapTurns', () => {
  it('counts full circles and left turns as the same page position', () => {
    expect([0, 1, 2, 3, 4, 5].map(wrapTurns)).toEqual([0, 1, 2, 3, 0, 1]);
    expect([-1, -2, -4, -5].map(wrapTurns)).toEqual([3, 2, 0, 3]);
  });
});
