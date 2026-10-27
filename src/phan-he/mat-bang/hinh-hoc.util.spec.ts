import { BadRequestException } from '@nestjs/common';

import { parseBoundaryCoordinates } from './hinh-hoc.util.js';

describe('parseBoundaryCoordinates', () => {
  it('converts VN-2000 TM-3 coordinates with the datum shift to WGS84', () => {
    const geometry = parseBoundaryCoordinates(
      '596182.6531 2064426.6524,\n' +
      '596183.7268 2064447.4179,\n' +
      '596244.3462 2064444.2904,\n' +
      '596244.8364 2064453.7724,\n' +
      '596262.5464 2064422.5219,\n' +
      '596234.1110 2064452.7812',
    );

    expect(geometry.type).toBe('Polygon');
    expect(geometry.coordinates[0]).toHaveLength(7);
    const expectedCoordinates = [
      [105.663575518, 18.662209032],
      [105.663586699, 18.662396582],
      [105.664161112, 18.662365532],
      [105.664166217, 18.662451172],
      [105.664332563, 18.662168032],
      [105.664064511, 18.662442712],
    ];
    geometry.coordinates[0].slice(0, 6).forEach((point, index) => {
      expect(point[0]).toBeCloseTo(expectedCoordinates[index][0], 6);
      expect(point[1]).toBeCloseTo(expectedCoordinates[index][1], 6);
    });
    expect(
      geometry.coordinates[0].slice(0, 6).every(([longitude, latitude]) =>
        longitude >= 105.6634 && longitude <= 105.6645 &&
        latitude >= 18.662 && latitude <= 18.6626,
      ),
    ).toBe(true);
    expect(geometry.coordinates[0][0]).toEqual(
      geometry.coordinates[0][geometry.coordinates[0].length - 1],
    );
    expect(geometry.coordinates[0].flat().every(Number.isFinite)).toBe(true);
  });

  it('keeps existing WGS84 longitude and latitude coordinates unchanged', () => {
    const geometry = parseBoundaryCoordinates(
      '105.68012 18.67328, 105.68032 18.67328, 105.68035 18.67341',
    );

    expect(geometry.coordinates[0][0]).toEqual([105.68012, 18.67328]);
    expect(geometry.coordinates[0]).toHaveLength(4);
  });

  it('rejects coordinate pairs outside supported systems', () => {
    expect(() =>
      parseBoundaryCoordinates('950000 2064426, 950001 2064447, 950002 2064444'),
    ).toThrow(BadRequestException);
    expect(() =>
      parseBoundaryCoordinates('105 18, 596183 2064447, 596244 2064444'),
    ).toThrow(BadRequestException);
  });
});
