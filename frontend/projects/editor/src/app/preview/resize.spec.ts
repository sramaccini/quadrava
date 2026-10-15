import { resizeValue } from './resize';

describe('resizing in the preview', () => {
  it('grid: nearest whole columns, between 1 and the columns of the grid', () => {
    expect(resizeValue({ property: 'span', startWidth: 300, width: 610, columns: 3, gridWidth: 900 })).toBe(2);
    expect(resizeValue({ property: 'span', startWidth: 300, width: 2000, columns: 3, gridWidth: 900 })).toBe(3);
    expect(resizeValue({ property: 'span', startWidth: 300, width: 20, columns: 3, gridWidth: 900 })).toBe(1);
    expect(resizeValue({ property: 'span', startWidth: 0, width: 0, columns: 3, gridWidth: 0 })).toBe(1);
  });

  it('box: share in proportion to the width, between 1 and 12', () => {
    expect(resizeValue({ property: 'grow', startWidth: 200, width: 400, current: 1 })).toBe(2);
    expect(resizeValue({ property: 'grow', startWidth: 200, width: 300, current: 2 })).toBe(3);
    expect(resizeValue({ property: 'grow', startWidth: 200, width: 10, current: 2 })).toBe(1);
    expect(resizeValue({ property: 'grow', startWidth: 100, width: 5000 })).toBe(12);
    expect(resizeValue({ property: 'grow', startWidth: 0, width: 50, current: 3 })).toBe(3);
  });
});
