import { describe, expect, it } from 'vitest';
import { fitWithin } from './image';

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
