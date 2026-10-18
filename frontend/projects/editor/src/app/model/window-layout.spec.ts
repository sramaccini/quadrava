import { CASCADE_STEP, MIN_HEIGHT, MIN_WIDTH, cascadeBounds, clampBounds, resizeBounds, tileBounds } from './window-layout';

describe('window layout', () => {
  const area = { width: 1000, height: 600 };

  it('keeps a window whole inside the area, not smaller than the minimum', () => {
    expect(clampBounds({ x: 900, y: -20, width: 400, height: 300 }, area)).toEqual({ x: 600, y: 0, width: 400, height: 300 });
    expect(clampBounds({ x: 10, y: 10, width: 50, height: 2000 }, area)).toEqual({ x: 10, y: 0, width: MIN_WIDTH, height: 600 });
    // Area not measured yet: only the minimum size and no negative positions.
    expect(clampBounds({ x: -5, y: 3000, width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 3000, width: MIN_WIDTH, height: MIN_HEIGHT });
  });

  it('cascades the windows a step apart, starting again when they would leave the area', () => {
    const first = cascadeBounds(0, area);
    const second = cascadeBounds(1, area);
    expect([second.x - first.x, second.y - first.y]).toEqual([CASCADE_STEP, CASCADE_STEP]);
    expect(first.width).toBeLessThan(area.width);
    const positions = Array.from({ length: 12 }, (_, i) => cascadeBounds(i, area));
    expect(positions.every((b) => b.x + b.width <= area.width && b.y + b.height <= area.height)).toBe(true);
    expect(positions.some((b, i) => i > 0 && b.x === 0)).toBe(true);
  });

  it('tiles the windows in a grid filling the area', () => {
    expect(tileBounds(2, area)).toEqual([
      { x: 0, y: 0, width: 500, height: 600 },
      { x: 500, y: 0, width: 500, height: 600 },
    ]);
    const three = tileBounds(3, area);
    expect(three.map((b) => [b.x, b.y, b.width, b.height])).toEqual([
      [0, 0, 500, 300],
      [500, 0, 500, 300],
      [0, 300, 1000, 300],
    ]);
  });

  it('resizes from an edge or a corner keeping the opposite edge still', () => {
    const start = { x: 100, y: 100, width: 500, height: 300 };
    expect(resizeBounds(start, 'se', 50, 40, area)).toEqual({ x: 100, y: 100, width: 550, height: 340 });
    expect(resizeBounds(start, 'nw', -50, -20, area)).toEqual({ x: 50, y: 80, width: 550, height: 320 });
    // Not below the minimum, not beyond the area.
    expect(resizeBounds(start, 'w', 400, 0, area)).toEqual({ x: 600 - MIN_WIDTH, y: 100, width: MIN_WIDTH, height: 300 });
    expect(resizeBounds(start, 'e', 900, 0, area).width).toBe(900);
  });
});
