import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  assignedAreaQueries,
  boundsFromAreaGeometry,
  type AreaGeometry,
  type AreaBounds,
} from './khu-vuc-phan-cong.util.js';

interface NominatimResult {
  boundingbox?: unknown;
  geojson?: unknown;
  class?: unknown;
  type?: unknown;
  name?: unknown;
  display_name?: unknown;
  address?: unknown;
  extratags?: unknown;
}

interface ReverseNominatimResult {
  address?: Record<string, unknown>;
  display_name?: unknown;
}

interface OverpassMember {
  role?: unknown;
  geometry?: unknown;
}

interface OverpassRelation {
  type?: unknown;
  tags?: unknown;
  members?: unknown;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];

@Injectable()
export class AssignedAreaService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; result: Promise<AreaBounds> }
  >();
  private lastLookupAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  async resolveAreaAtPoint(
    latitude: number,
    longitude: number,
    fallbackLocation?: string | null,
  ): Promise<{ name: string; bounds: AreaBounds }> {
    if (
      latitude >= 101 &&
      latitude <= 118 &&
      longitude >= 6 &&
      longitude <= 24
    ) {
      [latitude, longitude] = [longitude, latitude];
    }

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < 6 ||
      latitude > 24 ||
      longitude < 101 ||
      longitude > 118
    ) {
      throw new ServiceUnavailableException(
        'Tọa độ công trình không nằm trong phạm vi Việt Nam.',
      );
    }

    let directLookupAttempted = false;
    try {
      await this.waitForNominatimRequest();
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.search = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        format: 'jsonv2',
        zoom: '14',
        addressdetails: '1',
        'accept-language': 'vi',
      }).toString();
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'HoKhoanMap/1.0 (assigned work area lookup)',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Nominatim returned HTTP ${response.status}.`);
      }
      const reverseResult = (await response.json()) as ReverseNominatimResult;
      const address = reverseResult.address ?? {};
      const read = (...keys: string[]) => {
        for (const key of keys) {
          const value = address[key];
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return '';
      };
      const ward = read(
        'ward',
        'village',
        'suburb',
        'quarter',
        'neighbourhood',
      );
      const district = read('city_district', 'county', 'district');
      const city = read('city', 'town', 'municipality');
      const province = read('state');
      const levels = [
        {
          name: ward,
          context: [district, city, province],
          adminLevels: ['8', '9'],
        },
        {
          name: city || district,
          context: [province],
          adminLevels: ['6', '7'],
        },
        {
          name: province,
          context: [],
          adminLevels: ['4'],
        },
      ].filter((level) => level.name);

      for (const level of levels) {
        const areaName = [level.name, ...level.context]
          .filter((part, index, parts) => part && parts.indexOf(part) === index)
          .join(', ');
        const bounds = await this.lookupCachedBoundary(
          areaName,
          { latitude, longitude },
          level.adminLevels,
        );
        if (bounds) return { name: areaName, bounds };
      }

      if (fallbackLocation?.trim()) {
        const bounds = await this.lookupCachedBoundary(
          fallbackLocation,
          { latitude, longitude },
          ['4', '6', '7', '8', '9'],
        );
        if (bounds) {
          const administrativeParts = fallbackLocation
            .split(/[;,]+/)
            .map((part) => part.trim())
            .filter((part) =>
              /^(?:phường|phuong|xã|xa|thị trấn|thi tran|quận|quan|huyện|huyen|thành phố|thanh pho|tp\.?|thị xã|thi xa|tỉnh|tinh)(?:\s|$)/i.test(
                part,
              ),
            );
          return {
            name: administrativeParts.length > 0
              ? administrativeParts.join(', ')
              : fallbackLocation.trim(),
            bounds,
          };
        }
      }

      directLookupAttempted = true;
      return await this.lookupBoundaryAtPoint(latitude, longitude);
    } catch (error) {
      if (fallbackLocation?.trim()) {
        const bounds = await this.lookupCachedBoundary(
          fallbackLocation,
          { latitude, longitude },
          ['4', '6', '7', '8', '9'],
        );
        if (bounds) {
          const administrativeParts = fallbackLocation
            .split(/[;,]+/)
            .map((part) => part.trim())
            .filter((part) =>
              /^(?:phường|phuong|xã|xa|thị trấn|thi tran|quận|quan|huyện|huyen|thành phố|thanh pho|tp\.?|thị xã|thi xa|tỉnh|tinh)(?:\s|$)/i.test(
                part,
              ),
            );
          return {
            name: administrativeParts.length > 0
              ? administrativeParts.join(', ')
              : fallbackLocation.trim(),
            bounds,
          };
        }
      }

      if (!directLookupAttempted) {
        try {
          const boundary = await this.lookupBoundaryAtPoint(
            latitude,
            longitude,
          );
          return { name: boundary.name, bounds: boundary.bounds };
        } catch (boundaryError) {
          throw new ServiceUnavailableException(
            'Không thể xác định ranh giới hành chính từ tọa độ công trình. Hãy kiểm tra tọa độ mặt bằng và địa điểm công trình.',
            { cause: boundaryError },
          );
        }
      }
      throw new ServiceUnavailableException(
        'Không thể xác định ranh giới hành chính từ tọa độ công trình. Hãy kiểm tra tọa độ mặt bằng và địa điểm công trình.',
        { cause: error },
      );
    }
  }

  private async lookupCachedBoundary(
    area: string,
    point: { latitude: number; longitude: number },
    adminLevels: string[],
  ): Promise<AreaBounds | null> {
    const key = `${adminLevels.join(',')}:${area.toLocaleLowerCase('vi')}`;
    const cached = this.cache.get(key);
    const result =
      cached && cached.expiresAt > Date.now()
        ? cached.result
        : this.lookupBounds(area, point);
    if (!cached || cached.expiresAt <= Date.now()) {
      this.cache.set(key, {
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        result,
      });
    }
    try {
      return await result;
    } catch {
      this.cache.delete(key);
      return null;
    }
  }

  async resolveBounds(
    area: string,
    assignedGeometry?: AreaGeometry | null,
  ): Promise<AreaBounds> {
    const storedBounds = boundsFromAreaGeometry(assignedGeometry);
    if (storedBounds) return storedBounds;

    const key = area.trim().toLocaleLowerCase('vi');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const result = this.lookupBounds(area);
    this.cache.set(key, {
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      result,
    });
    try {
      return await result;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  private async lookupBounds(
    area: string,
    point?: { latitude: number; longitude: number },
  ): Promise<AreaBounds> {
    const queries = assignedAreaQueries(area);
    for (const query of queries) {
      try {
        await this.waitForNominatimRequest();
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.search = new URLSearchParams({
          q: query,
          format: 'jsonv2',
          limit: '5',
          addressdetails: '1',
          extratags: '1',
          polygon_geojson: '1',
          countrycodes: 'vn',
          'accept-language': 'vi',
        }).toString();
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'HoKhoanMap/1.0 (assigned work area lookup)',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          throw new Error(`Nominatim returned HTTP ${response.status}.`);
        }
        const results = (await response.json()) as NominatimResult[];
        const candidates = [...results].sort(
          (first, second) =>
            Number(this.isBoundaryResult(second)) -
            Number(this.isBoundaryResult(first)),
        );
        for (const candidate of candidates) {
          if (
            point &&
            (!this.isBoundaryResult(candidate) ||
              !this.matchesAdministrativeArea(candidate, area))
          ) {
            continue;
          }
          const boundingBox = candidate.boundingbox;
          if (!Array.isArray(boundingBox) || boundingBox.length !== 4) {
            continue;
          }
          const [south, north, west, east] = boundingBox.map(Number);
          if (
            ![south, north, west, east].every(Number.isFinite) ||
            south < -90 ||
            north > 90 ||
            west < -180 ||
            east > 180 ||
            south > north ||
            west > east
          ) {
            continue;
          }
          const geometry = this.parseGeometry(candidate.geojson);
          const bounds = { south, north, west, east, geometry };
          if (
            point &&
            (!geometry ||
              !this.isPointWithinBounds(
                bounds,
                point.latitude,
                point.longitude,
              ))
          ) {
            continue;
          }
          return bounds;
        }
      } catch (error) {
        throw new ServiceUnavailableException(
          `Không thể xác định khu vực được giao "${area}" qua dịch vụ bản đồ.`,
          { cause: error },
        );
      }
      if (point) break;
    }

    throw new ServiceUnavailableException(
      `Không tìm thấy khu vực được giao "${area}". Hãy kiểm tra tên phường, thành phố và tỉnh.`,
    );
  }

  private async lookupBoundaryAtPoint(
    latitude: number,
    longitude: number,
  ): Promise<{ name: string; bounds: AreaBounds }> {
    const query = `[out:json][timeout:15];is_in(${latitude},${longitude})->.areas;rel(pivot.areas)["boundary"="administrative"]["admin_level"~"^(4|6|7|8|9)$"];out geom;`;
    let lastError: unknown;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        await this.waitForNominatimRequest();
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'HoKhoanMap/1.0 (assigned work area lookup)',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          throw new Error(`Overpass returned HTTP ${response.status}.`);
        }
        const payload = (await response.json()) as { elements?: unknown };
        if (!Array.isArray(payload.elements)) {
          throw new Error('Dữ liệu ranh giới từ Overpass không hợp lệ.');
        }

        const candidates = payload.elements
          .filter((element): element is OverpassRelation => {
            if (typeof element !== 'object' || element === null) return false;
            const relation = element as OverpassRelation;
            if (
              relation.type !== 'relation' ||
              typeof relation.tags !== 'object' ||
              relation.tags === null ||
              !Array.isArray(relation.members)
            ) {
              return false;
            }
            const tags = relation.tags as Record<string, unknown>;
            return (
              tags.boundary === 'administrative' &&
              ['4', '6', '7', '8', '9'].includes(String(tags.admin_level)) &&
              typeof (tags['name:vi'] ?? tags.name ?? tags.official_name) ===
                'string'
            );
          })
          .map((relation) => {
            const tags = relation.tags as Record<string, unknown>;
            const geometry = this.geometryFromOverpassMembers(
              relation.members as OverpassMember[],
            );
            if (!geometry) return null;
            const bounds = boundsFromAreaGeometry(geometry);
            if (
              !bounds ||
              !this.isPointWithinBounds(bounds, latitude, longitude)
            ) {
              return null;
            }
            const name = String(
              tags['name:vi'] ?? tags.name ?? tags.official_name,
            ).trim();
            return {
              name,
              adminLevel: String(tags.admin_level),
              bounds,
              area: (bounds.north - bounds.south) * (bounds.east - bounds.west),
            };
          })
          .filter(
            (
              candidate,
            ): candidate is {
              name: string;
              adminLevel: string;
              bounds: AreaBounds;
              area: number;
            } => candidate !== null,
          )
          .sort((first, second) => first.area - second.area);

        const boundary = candidates[0];
        if (!boundary) {
          throw new Error(
            'Không tìm thấy ranh giới phường/xã bao quanh tọa độ mặt bằng.',
          );
        }
        const hierarchy = new Map(
          candidates
            .sort(
              (first, second) =>
                Number(second.adminLevel) - Number(first.adminLevel),
            )
            .map((candidate) => [candidate.adminLevel, candidate.name]),
        );
        const areaNames = [
          hierarchy.get('8') ?? hierarchy.get('9'),
          hierarchy.get('7') ?? hierarchy.get('6'),
          hierarchy.get('4'),
        ].filter((name, index, names) => name && names.indexOf(name) === index);
        return {
          name: areaNames.length > 0 ? areaNames.join(', ') : boundary.name,
          bounds: boundary.bounds,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      'Không lấy được ranh giới từ các máy chủ bản đồ dự phòng.',
      { cause: lastError },
    );
  }

  private geometryFromOverpassMembers(
    members: OverpassMember[],
  ): AreaGeometry | null {
    const collectRings = (role: string): number[][][] => {
      const segments = members
        .filter(
          (member) => member.role === role && Array.isArray(member.geometry),
        )
        .map((member) =>
          (member.geometry as Array<{ lat?: unknown; lon?: unknown }>)
            .map((point) => [Number(point.lon), Number(point.lat)])
            .filter(
              ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat),
            ),
        )
        .filter((segment) => segment.length >= 2);
      const rings: number[][][] = [];

      while (segments.length > 0) {
        const ring = segments.shift()!;
        let joined = true;
        while (joined && !this.samePosition(ring[0], ring[ring.length - 1])) {
          joined = false;
          for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            if (this.samePosition(ring[ring.length - 1], segment[0])) {
              ring.push(...segment.slice(1));
            } else if (
              this.samePosition(
                ring[ring.length - 1],
                segment[segment.length - 1],
              )
            ) {
              ring.push(...segment.slice(0, -1).reverse());
            } else {
              continue;
            }
            segments.splice(index, 1);
            joined = true;
            break;
          }
        }
        if (
          ring.length >= 4 &&
          this.samePosition(ring[0], ring[ring.length - 1])
        ) {
          rings.push(ring);
        }
      }
      return rings;
    };

    const outerRings = collectRings('outer');
    if (outerRings.length === 0) return null;
    const innerRings = collectRings('inner');
    const polygons = outerRings.map((outer) => [
      outer,
      ...innerRings.filter((inner) =>
        this.isPointInRing(inner[0][1], inner[0][0], outer),
      ),
    ]);
    return polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };
  }

  private samePosition(first: number[], second: number[]): boolean {
    return first[0] === second[0] && first[1] === second[1];
  }

  private isPointInRing(
    latitude: number,
    longitude: number,
    ring: number[][],
  ): boolean {
    let inside = false;
    for (
      let index = 0, previous = ring.length - 1;
      index < ring.length;
      previous = index, index += 1
    ) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[previous];
      if (
        y1 > latitude !== y2 > latitude &&
        longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private async waitForNominatimRequest(): Promise<void> {
    const request = this.requestQueue.then(async () => {
      const delay = Math.max(0, 1100 - (Date.now() - this.lastLookupAt));
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      this.lastLookupAt = Date.now();
    });
    this.requestQueue = request.catch(() => undefined);
    await request;
  }

  private isPointWithinBounds(
    bounds: AreaBounds,
    latitude: number,
    longitude: number,
  ): boolean {
    const geometry = bounds.geometry;
    if (!geometry) return false;
    const pointInRing = (
      ring: number[][],
      pointLatitude: number,
      pointLongitude: number,
    ) => {
      let inside = false;
      for (
        let index = 0, previous = ring.length - 1;
        index < ring.length;
        previous = index, index += 1
      ) {
        const [x1, y1] = ring[index];
        const [x2, y2] = ring[previous];
        if (
          y1 > pointLatitude !== y2 > pointLatitude &&
          pointLongitude < ((x2 - x1) * (pointLatitude - y1)) / (y2 - y1) + x1
        ) {
          inside = !inside;
        }
      }
      return inside;
    };
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates;
    return polygons.some(
      (polygon) =>
        pointInRing(polygon[0], latitude, longitude) &&
        !polygon
          .slice(1)
          .some((hole) => pointInRing(hole, latitude, longitude)),
    );
  }

  private isBoundaryResult(result: NominatimResult): boolean {
    return result.class === 'boundary' || result.type === 'administrative';
  }

  private matchesAdministrativeArea(
    result: NominatimResult,
    area: string,
  ): boolean {
    const administrativePrefix =
      /^(?:phường|phuong|xã|xa|thị trấn|thi tran|quận|quan|huyện|huyen|thành phố|thanh pho|tp\.?|thị xã|thi xa|tỉnh|tinh)\s+/i;
    const normalize = (value: unknown): string =>
      typeof value === 'string'
        ? value
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLocaleLowerCase('vi')
            .replace(administrativePrefix, '')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim()
        : '';
    const requestedNames = area
      .split(/[;,]+/)
      .map((part) => part.trim())
      .filter((part) =>
        /^(?:phường|phuong|xã|xa|thị trấn|thi tran|quận|quan|huyện|huyen|thành phố|thanh pho|tp\.?|thị xã|thi xa|tỉnh|tinh)(?:\s|$)/i.test(
          part,
        ),
      );
    if (requestedNames.length === 0) {
      requestedNames.push(area.split(/[;,]+/)[0]?.trim() ?? area.trim());
    }
    const targets = requestedNames.map(normalize).filter(Boolean);
    const candidateNames = [
      result.name,
      result.display_name,
      ...(typeof result.address === 'object' && result.address !== null
        ? Object.values(result.address as Record<string, unknown>)
        : []),
    ]
      .map(normalize)
      .filter(Boolean);
    return targets.some((target) =>
      candidateNames.some(
        (candidate) =>
          candidate === target || candidate.startsWith(`${target} `),
      ),
    );
  }

  private parseGeometry(value: unknown): AreaGeometry | null {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('type' in value) ||
      !('coordinates' in value)
    ) {
      return null;
    }
    const geometry = value as { type: unknown; coordinates: unknown };
    if (
      (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') ||
      !Array.isArray(geometry.coordinates)
    ) {
      return null;
    }
    return {
      type: geometry.type,
      coordinates: geometry.coordinates,
    };
  }
}
