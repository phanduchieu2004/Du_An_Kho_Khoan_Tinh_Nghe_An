export interface AreaBounds {
  south: number;
  north: number;
  west: number;
  east: number;
  geometry?: AreaGeometry | null;
}

export type AreaGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export function boundsFromAreaGeometry(
  geometry: AreaGeometry | null | undefined,
): AreaBounds | null {
  if (
    !geometry ||
    (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
  ) {
    return null;
  }
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let positions = 0;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && value.every((part) => typeof part === 'number')) {
      const [longitude, latitude] = value;
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw new Error('Tọa độ ranh giới khu vực không hợp lệ.');
      }
      west = Math.min(west, longitude);
      east = Math.max(east, longitude);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
      positions += 1;
      return;
    }
    value.forEach(visit);
  };
  visit(geometry.coordinates);
  if (positions < 4 || west === east || south === north) return null;
  return { south, north, west, east, geometry };
}

export function assignedAreaQueries(assignedArea: string): string[] {
  const parts = assignedArea
    .split(/[,;\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const specificity = (part: string) => {
    if (
      /^(?:số|so|tổ|to|khối|khoi|xóm|xom|thôn|thon|ấp|ap|bản|ban|làng|lang|khu phố|khu pho|khu dân cư|khu dan cu|đường|duong|phố|pho|ngõ|ngo|hẻm|hem)(?:\s|$)/i.test(
        part,
      )
    ) {
      return 4;
    }
    if (/^(?:phường|phuong|xã|xa|thị trấn|thi tran)(?:\s|$)/i.test(part)) {
      return 3;
    }
    if (
      /^(?:thành phố|thanh pho|tp\.?|thị xã|thi xa|quận|quan|huyện|huyen)(?:\s|$)/i.test(
        part,
      )
    ) {
      return 2;
    }
    if (/^(?:tỉnh|tinh)(?:\s|$)/i.test(part)) return 1;
    return 0;
  };
  const specificFirst = [...parts].sort(
    (first, second) => specificity(second) - specificity(first),
  );
  const queries: string[] = [];
  for (let index = 0; index < specificFirst.length; index += 1) {
    const levels = specificFirst.slice(index);
    queries.push(levels.join(', '));
    const withoutAdministrativePrefix = levels.map((level) =>
      level.replace(
        /^(?:số|so|tổ|to|khối|khoi|xóm|xom|thôn|thon|ấp|ap|bản|ban|làng|lang|khu phố|khu pho|khu dân cư|khu dan cu|đường|duong|phố|pho|ngõ|ngo|hẻm|hem|phường|phuong|xã|xa|thị trấn|thi tran|thành phố|thanh pho|tp\.?|thị xã|thi xa|quận|quan|huyện|huyen|tỉnh|tinh)\s+/i,
        '',
      ),
    );
    if (withoutAdministrativePrefix.join(', ') !== levels.join(', ')) {
      queries.push(withoutAdministrativePrefix.join(', '));
    }
  }
  return [...new Set(queries.map((query) => `${query}, Việt Nam`))];
}

export function isWithinAssignedBounds(
  bounds: AreaBounds,
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): boolean {
  if (latitude == null || longitude == null) {
    return false;
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= bounds.south &&
    lat <= bounds.north &&
    lon >= bounds.west &&
    lon <= bounds.east
  );
}

function isPointInRing(
  longitude: number,
  latitude: number,
  ring: unknown,
): boolean {
  if (!Array.isArray(ring)) return false;
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const current = ring[index];
    const prior = ring[previous];
    if (!Array.isArray(current) || !Array.isArray(prior)) continue;
    const [x1, y1] = current.map(Number);
    const [x2, y2] = prior.map(Number);
    const intersects =
      y1 > latitude !== y2 > latitude &&
      longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isWithinAssignedArea(
  area: AreaBounds,
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): boolean {
  if (!isWithinAssignedBounds(area, latitude, longitude)) {
    return false;
  }
  if (!area.geometry) {
    return true;
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  const polygons =
    area.geometry.type === 'Polygon'
      ? [area.geometry.coordinates]
      : area.geometry.coordinates;
  if (!Array.isArray(polygons)) return false;
  return polygons.some((polygon) => {
    if (!Array.isArray(polygon) || !isPointInRing(lon, lat, polygon[0])) {
      return false;
    }
    return !polygon.slice(1).some((hole) => isPointInRing(lon, lat, hole));
  });
}

export function pointWithinAssignedArea(
  area: AreaBounds,
): { latitude: number; longitude: number } | null {
  const center = {
    latitude: (area.south + area.north) / 2,
    longitude: (area.west + area.east) / 2,
  };
  if (isWithinAssignedArea(area, center.latitude, center.longitude)) {
    return center;
  }

  const intervals = 100;
  for (let latitudeIndex = 1; latitudeIndex < intervals; latitudeIndex += 1) {
    const latitude =
      area.south + ((area.north - area.south) * latitudeIndex) / intervals;
    for (
      let longitudeIndex = 1;
      longitudeIndex < intervals;
      longitudeIndex += 1
    ) {
      const longitude =
        area.west + ((area.east - area.west) * longitudeIndex) / intervals;
      if (isWithinAssignedArea(area, latitude, longitude)) {
        return { latitude, longitude };
      }
    }
  }
  return null;
}
