import {
  assignedAreaQueries,
  boundsFromAreaGeometry,
  isWithinAssignedArea,
  isWithinAssignedBounds,
  pointWithinAssignedArea,
} from './khu-vuc-phan-cong.util.js';

describe('assigned area utilities', () => {
  it('derives a bounding box while preserving a stored administrative boundary', () => {
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[
        [105.7, 18.7],
        [105.9, 18.7],
        [105.9, 18.9],
        [105.7, 18.9],
        [105.7, 18.7],
      ]],
    };

    expect(boundsFromAreaGeometry(geometry)).toEqual({
      south: 18.7,
      north: 18.9,
      west: 105.7,
      east: 105.9,
      geometry,
    });
    expect(boundsFromAreaGeometry(null)).toBeNull();
  });

  it('tries administrative areas from the most specific level to the province', () => {
    const queries = assignedAreaQueries(', phường Vinh Tân, ,TP Vinh, Nghệ An');
    expect(queries[0]).toBe('phường Vinh Tân, TP Vinh, Nghệ An, Việt Nam');
    expect(queries).toContain('TP Vinh, Nghệ An, Việt Nam');
    expect(queries).toContain('Nghệ An, Việt Nam');
    expect(queries).toContain('Vinh Tân, Vinh, Nghệ An, Việt Nam');
    expect(assignedAreaQueries('Nghệ An,TP Vinh,Phường Vinh Tân')[0]).toBe(
      'Phường Vinh Tân, TP Vinh, Nghệ An, Việt Nam',
    );
    expect(
      assignedAreaQueries('Nghệ An, TP Vinh, Phường Vinh Tân, Khối 5')[0],
    ).toBe('Khối 5, Phường Vinh Tân, TP Vinh, Nghệ An, Việt Nam');
  });

  it('checks coordinates against a resolved khu-vuc-phan-cong bounding box', () => {
    const bounds = { south: 18, north: 19, west: 104, east: 105 };

    expect(isWithinAssignedBounds(bounds, '18.5', '104.5')).toBe(true);
    expect(isWithinAssignedBounds(bounds, '17.9', '104.5')).toBe(false);
    expect(isWithinAssignedBounds(bounds, null, '104.5')).toBe(false);
  });

  it('checks coordinates against the assigned polygon and excludes its holes', () => {
    const area = {
      south: 0,
      north: 10,
      west: 0,
      east: 10,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          [
            [4, 4],
            [6, 4],
            [6, 6],
            [4, 6],
            [4, 4],
          ],
        ],
      },
    };

    expect(isWithinAssignedArea(area, 2, 2)).toBe(true);
    expect(isWithinAssignedArea(area, 5, 5)).toBe(false);
    expect(isWithinAssignedArea(area, 11, 5)).toBe(false);
  });

  it('chooses a fallback map center inside a concave assigned boundary', () => {
    const area = {
      south: 0,
      north: 4,
      west: 0,
      east: 4,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [0, 0],
          [4, 0],
          [4, 1],
          [1, 1],
          [1, 3],
          [4, 3],
          [4, 4],
          [0, 4],
          [0, 0],
        ]],
      },
    };

    const point = pointWithinAssignedArea(area);

    expect(point).not.toBeNull();
    expect(isWithinAssignedArea(area, point?.latitude, point?.longitude)).toBe(
      true,
    );
  });
});
