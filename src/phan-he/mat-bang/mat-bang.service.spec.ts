import type { DataSource } from 'typeorm';

import {
  MatBangService,
  normalizeProjectAnchorPoint,
} from './mat-bang.service.js';

describe('MatBangService.findProjectAnchorPoints', () => {
  it('returns a point inside each surface for area lookup and its first coordinate for the map pin', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        cong_trinh_id: 21,
        latitude: 10.5,
        longitude: 101.5,
        first_latitude: 10.4,
        first_longitude: 101.4,
      },
    ]);
    const service = new MatBangService({ query } as unknown as DataSource);

    await expect(service.findProjectAnchorPoints([21, 34])).resolves.toEqual([
      {
        cong_trinh_id: 21,
        latitude: 10.5,
        longitude: 101.5,
        first_latitude: 10.4,
        first_longitude: 101.4,
      },
    ]);
    expect(query.mock.calls[0][0]).toContain('ST_PointOnSurface(ST_CollectionExtract(boundary, 3))');
    expect(query.mock.calls[0][0]).toContain('ST_PointN(');
    expect(query.mock.calls[0][0]).toContain('ST_ExteriorRing(');
    expect(query.mock.calls[0][0]).toContain(
      'ST_GeometryN(ST_CollectionExtract(boundary, 3), 1)',
    );
    expect(query.mock.calls[0][0]).toContain('ST_MakeValid(ranh_gioi)');
    expect(query.mock.calls[0][0]).toContain('ST_FlipCoordinates(boundary)');
    expect(query.mock.calls[0][0]).toContain('ST_Y(anchor)::double precision AS latitude');
    expect(query.mock.calls[0][0]).toContain('ST_X(anchor)::double precision AS longitude');
    expect(query.mock.calls[0][0]).toContain('AS first_latitude');
    expect(query.mock.calls[0][0]).toContain('AS first_longitude');
    expect(query.mock.calls[0][0]).toContain('normalized_anchors AS');
    expect(query.mock.calls[0][0]).toContain('latitude BETWEEN 101 AND 118');
    expect(query.mock.calls[0][0]).toContain('DISTINCT ON (cong_trinh_id)');
    expect(query.mock.calls[0][1]).toEqual([[21, 34]]);
  });

  it('normalizes a surface anchor stored as longitude then latitude', async () => {
    const query = vi.fn().mockResolvedValue([
      { cong_trinh_id: 21, latitude: 105.8, longitude: 18.8 },
    ]);
    const service = new MatBangService({ query } as unknown as DataSource);

    await expect(service.findProjectAnchorPoints([21])).resolves.toEqual([
      { cong_trinh_id: 21, latitude: 18.8, longitude: 105.8 },
    ]);
    expect(
      normalizeProjectAnchorPoint({
        cong_trinh_id: 21,
        latitude: 105.8,
        longitude: 18.8,
      }),
    ).toEqual({ cong_trinh_id: 21, latitude: 18.8, longitude: 105.8 });
  });

  it('does not query when no projects are selected', async () => {
    const query = vi.fn();
    const service = new MatBangService({ query } as unknown as DataSource);

    await expect(service.findProjectAnchorPoints([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('MatBangService.findLevelTwoWithin', () => {
  it('returns the portion of level-two features intersecting a level-one parent', async () => {
    const query = vi.fn().mockResolvedValueOnce([{
        id: 11,
        cong_trinh_id: 3,
        ten_mat_bang: 'Mặt bằng cấp 2',
        loai_mat_bang: 'Polygon',
        cap_mat_bang: '2',
        geometry: { type: 'MultiPolygon', coordinates: [] },
        ma_he_toa_do_nguon: 'WGS84',
        trang_thai: 'da_xac_minh',
      }]);
    const service = new MatBangService({ query } as unknown as DataSource);

    const result = await service.findLevelTwoWithin(10);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('ST_Intersects');
    expect(query.mock.calls[0][0]).toContain('ST_Intersection');
    expect(query.mock.calls[0][0]).toContain("REGEXP_REPLACE(TRIM(child.cap_mat_bang::text), '\\.0+$', '') = '2'");
    expect(query.mock.calls[0][0]).not.toContain(
      'child.cong_trinh_id = parent.cong_trinh_id',
    );
    expect(query.mock.calls[0][1]).toEqual([10, null, null]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'MultiPolygon' },
      properties: { id: 11, cong_trinh_id: 3, cap_mat_bang: '2' },
    });
  });


  it('returns an empty feature collection if the parent is not level one', async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    const service = new MatBangService({ query } as unknown as DataSource);

    await expect(service.findLevelTwoWithin(12)).resolves.toEqual({
      type: 'FeatureCollection',
      features: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
