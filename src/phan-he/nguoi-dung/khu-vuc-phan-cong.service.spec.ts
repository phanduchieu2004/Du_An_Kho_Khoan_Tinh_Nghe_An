import { AssignedAreaService } from './khu-vuc-phan-cong.service.js';

describe('AssignedAreaService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a stored boundary instead of geocoding the area name again', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [105.7, 18.7],
          [105.9, 18.7],
          [105.9, 18.9],
          [105.7, 18.9],
          [105.7, 18.7],
        ],
      ],
    };

    await expect(
      new AssignedAreaService().resolveBounds(
        'Thành phố Vinh, Nghệ An',
        geometry,
      ),
    ).resolves.toEqual({
      south: 18.7,
      north: 18.9,
      west: 105.7,
      east: 105.9,
      geometry,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves the smallest assigned administrative area and prefers its boundary', async () => {
    const response = {
      ok: true,
      json: async () => [
        {
          class: 'place',
          boundingbox: ['18.6', '18.8', '105.6', '105.8'],
          geojson: null,
        },
        {
          class: 'boundary',
          boundingbox: ['18.7', '18.9', '105.7', '105.9'],
          geojson: {
            type: 'Polygon',
            coordinates: [
              [
                [105.7, 18.7],
                [105.9, 18.7],
                [105.9, 18.9],
                [105.7, 18.9],
                [105.7, 18.7],
              ],
            ],
          },
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const area = await new AssignedAreaService().resolveBounds(
      ', phường Vinh Tân, ,TP Vinh, Nghệ An',
    );

    expect(area).toEqual({
      south: 18.7,
      north: 18.9,
      west: 105.7,
      east: 105.9,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [105.7, 18.7],
            [105.9, 18.7],
            [105.9, 18.9],
            [105.7, 18.9],
            [105.7, 18.7],
          ],
        ],
      },
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('q')).toBe(
      'phường Vinh Tân, TP Vinh, Nghệ An, Việt Nam',
    );
    expect(requestUrl.searchParams.get('limit')).toBe('5');
  });

  it('resolves the ward from a project coordinate and requires its boundary to cover the pin', async () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [105.7, 18.7],
          [105.9, 18.7],
          [105.9, 18.9],
          [105.7, 18.9],
          [105.7, 18.7],
        ],
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: {
            suburb: 'Phường Vinh Tân',
            city_district: 'TP Vinh',
            state: 'Nghệ An',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            class: 'boundary',
            name: 'Phường Vinh Tân',
            extratags: { admin_level: '8' },
            boundingbox: ['18.1', '18.3', '105.1', '105.3'],
            geojson: {
              type: 'Polygon',
              coordinates: [
                [
                  [105.1, 18.1],
                  [105.3, 18.1],
                  [105.3, 18.3],
                  [105.1, 18.3],
                  [105.1, 18.1],
                ],
              ],
            },
          },
          {
            class: 'boundary',
            name: 'Phường Vinh Tân',
            extratags: { admin_level: '8' },
            boundingbox: ['18.7', '18.9', '105.7', '105.9'],
            geojson: geometry,
          },
        ],
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AssignedAreaService().resolveAreaAtPoint(
      18.8,
      105.8,
    );

    expect(result).toEqual({
      name: 'Phường Vinh Tân, TP Vinh, Nghệ An',
      bounds: {
        south: 18.7,
        north: 18.9,
        west: 105.7,
        east: 105.9,
        geometry,
      },
    });
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/reverse');
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('q')).toBe(
      'Phường Vinh Tân, TP Vinh, Nghệ An, Việt Nam',
    );
    expect(
      new URL(fetchMock.mock.calls[1][0]).searchParams.get('extratags'),
    ).toBe('1');
  });

  it('automatically swaps project coordinates supplied in longitude-latitude order', async () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [105.7, 18.7],
        [105.9, 18.7],
        [105.9, 18.9],
        [105.7, 18.9],
        [105.7, 18.7],
      ]],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: {
            suburb: 'Phường Vinh Tân',
            city: 'TP Vinh',
            state: 'Nghệ An',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          class: 'boundary',
          name: 'Phường Vinh Tân',
          extratags: { admin_level: '8' },
          boundingbox: ['18.7', '18.9', '105.7', '105.9'],
          geojson: geometry,
        }],
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AssignedAreaService().resolveAreaAtPoint(
      105.8,
      18.8,
    );

    expect(result.name).toBe('Phường Vinh Tân, TP Vinh, Nghệ An');
    const reverseUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(reverseUrl.searchParams.get('lat')).toBe('18.8');
    expect(reverseUrl.searchParams.get('lon')).toBe('105.8');
  });

  it('finds the containing administrative boundary directly from the point when reverse lookup has no ward', async () => {
    const geometry = [
      { lat: 18.7, lon: 105.7 },
      { lat: 18.7, lon: 105.9 },
      { lat: 18.9, lon: 105.9 },
      { lat: 18.9, lon: 105.7 },
      { lat: 18.7, lon: 105.7 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'relation',
              tags: {
                boundary: 'administrative',
                admin_level: '8',
                'name:vi': 'Phường Vinh Tân',
              },
              members: [{ role: 'outer', geometry }],
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AssignedAreaService().resolveAreaAtPoint(
      18.8,
      105.8,
    );

    expect(result.name).toBe('Phường Vinh Tân');
    expect(result.bounds.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [105.7, 18.7],
          [105.9, 18.7],
          [105.9, 18.9],
          [105.7, 18.9],
          [105.7, 18.7],
        ],
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://overpass-api.de/api/interpreter',
    );
    const overpassForm = new URLSearchParams(
      String(fetchMock.mock.calls[1][1].body),
    );
    expect(overpassForm.get('data')).toContain('is_in(18.8,105.8)');
  });

  it('retries another Overpass server when the primary map server is unavailable', async () => {
    const geometry = [
      { lat: 18.7, lon: 105.7 },
      { lat: 18.7, lon: 105.9 },
      { lat: 18.9, lon: 105.9 },
      { lat: 18.9, lon: 105.7 },
      { lat: 18.7, lon: 105.7 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ address: {} }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'relation',
              tags: {
                boundary: 'administrative',
                admin_level: '8',
                'name:vi': 'Phường Vinh Tân',
              },
              members: [{ role: 'outer', geometry }],
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AssignedAreaService().resolveAreaAtPoint(
      18.8,
      105.8,
    );

    expect(result.name).toBe('Phường Vinh Tân');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://overpass-api.de/api/interpreter',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://overpass.kumi.systems/api/interpreter',
    );
  });

  it('uses a named city boundary when the pinned location has no matching ward boundary', async () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [105.7, 18.7],
        [105.9, 18.7],
        [105.9, 18.9],
        [105.7, 18.9],
        [105.7, 18.7],
      ]],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: {
            suburb: 'Phường Vinh Tân',
            city: 'Thành phố Vinh',
            state: 'Nghệ An',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          class: 'boundary',
          type: 'administrative',
          name: 'Thành phố Vinh',
          boundingbox: ['18.7', '18.9', '105.7', '105.9'],
          geojson: geometry,
        }],
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AssignedAreaService().resolveAreaAtPoint(
      18.8,
      105.8,
    );

    expect(result.name).toBe('Thành phố Vinh, Nghệ An');
    expect(result.bounds.geometry).toEqual({
      type: 'Polygon',
      coordinates: [[
        [105.7, 18.7],
        [105.9, 18.7],
        [105.9, 18.9],
        [105.7, 18.9],
        [105.7, 18.7],
      ]],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get('q')).toBe(
      'Thành phố Vinh, Nghệ An, Việt Nam',
    );
  });

  it('falls back to the project address when reverse lookup is unavailable', async () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[
        [105.7, 18.7],
        [105.9, 18.7],
        [105.9, 18.9],
        [105.7, 18.9],
        [105.7, 18.7],
      ]],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          class: 'boundary',
          name: 'Phường Vinh Tân',
          extratags: { admin_level: '8' },
          boundingbox: ['18.7', '18.9', '105.7', '105.9'],
          geojson: geometry,
        }],
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AssignedAreaService().resolveAreaAtPoint(
      18.8,
      105.8,
      '03 Chung cư Cửa Tiền, phường Vinh Tân, TP Vinh, Nghệ An',
    );

    expect(result).toEqual({
      name: 'phường Vinh Tân, TP Vinh',
      bounds: {
        south: 18.7,
        north: 18.9,
        west: 105.7,
        east: 105.9,
        geometry,
      },
    });
    const fallbackUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(fallbackUrl.pathname).toBe('/search');
    expect(fallbackUrl.searchParams.get('q')).toBe(
      'phường Vinh Tân, TP Vinh, 03 Chung cư Cửa Tiền, Nghệ An, Việt Nam',
    );
  });
});
