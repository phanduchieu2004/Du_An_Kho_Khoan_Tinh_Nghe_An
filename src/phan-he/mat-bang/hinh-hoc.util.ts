import { BadRequestException } from '@nestjs/common';

const semiMajorAxis = 6378137;
const flattening = 1 / 298.257223563;
const scaleFactor = 0.9999;
const centralMeridian = (104 + 45 / 60) * Math.PI / 180;
const falseEasting = 500000;
const eccentricitySquared = flattening * (2 - flattening);
const secondEccentricitySquared =
  eccentricitySquared / (1 - eccentricitySquared);
// VN-2000 datum transformation parameters to WGS84 (translation, arc-seconds, ppm).
const vn2000ToWgs84 = {
  translation: [-191.90441429, -39.30318279, -111.45032835],
  rotation: [-0.00928836, 0.01975479, -0.00427372],
  scale: 0.252906278,
};
const seriesConstant =
  (1 - Math.sqrt(1 - eccentricitySquared)) /
  (1 + Math.sqrt(1 - eccentricitySquared));

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

function parsePair(parts: string[]): number[] {
  if (parts.length !== 2 || parts.some((part) => !part.trim())) {
    throw new BadRequestException(
      'Mỗi tọa độ cần có đủ hai giá trị kinh độ/vĩ độ hoặc X/Y.',
    );
  }
  const pair = parts.map(Number);
  if (pair.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new BadRequestException('Tọa độ ranh giới phải là số hợp lệ.');
  }
  return pair;
}

function toCoordinatePairs(value: string): number[][] {
  const input = value.trim();
  if (!input) {
    throw new BadRequestException('Vui lòng nhập tọa độ ranh giới mặt bằng.');
  }

  if (input.includes(';')) {
    return input.split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => parsePair(part.split(/[\s,]+/).filter(Boolean)));
  }

  const commaSeparatedParts = input.split(',').map((part) => part.trim()).filter(Boolean);
  const pairs = commaSeparatedParts.map((part) => part.split(/\s+/).filter(Boolean));
  if (pairs.every((pair) => pair.length === 2)) {
    return pairs.map(parsePair);
  }

  const values = input.split(/[,\s]+/).filter(Boolean);
  if (values.length % 2 !== 0) {
    throw new BadRequestException('Tọa độ ranh giới đang thiếu giá trị X/Y hoặc kinh độ/vĩ độ.');
  }
  return Array.from(
    { length: values.length / 2 },
    (_, index) => parsePair(values.slice(index * 2, index * 2 + 2)),
  );
}

function convertVn2000Tm3ToWgs84(easting: number, northing: number): number[] {
  const eccentricityFourth = eccentricitySquared ** 2;
  const eccentricitySixth = eccentricitySquared ** 3;
  const meridionalArc = northing / scaleFactor;
  const mu = meridionalArc / (
    semiMajorAxis * (
      1 -
      eccentricitySquared / 4 -
      3 * eccentricityFourth / 64 -
      5 * eccentricitySixth / 256
    )
  );
  const e1 = seriesConstant;
  const footpointLatitude =
    mu +
    (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
    (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3 / 96) * Math.sin(6 * mu) +
    (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const sinLatitude = Math.sin(footpointLatitude);
  const cosLatitude = Math.cos(footpointLatitude);
  const tanLatitude = Math.tan(footpointLatitude);
  const radiusPrimeVertical =
    semiMajorAxis /
    Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
  const radiusMeridian =
    semiMajorAxis * (1 - eccentricitySquared) /
    (1 - eccentricitySquared * sinLatitude ** 2) ** 1.5;
  const tangentSquared = tanLatitude ** 2;
  const curvature = secondEccentricitySquared * cosLatitude ** 2;
  const d = (easting - falseEasting) /
    (radiusPrimeVertical * scaleFactor);

  const latitude =
    footpointLatitude -
    (radiusPrimeVertical * tanLatitude / radiusMeridian) *
      (
        d ** 2 / 2 -
        (5 + 3 * tangentSquared + 10 * curvature -
          4 * curvature ** 2 - 9 * secondEccentricitySquared) *
          d ** 4 / 24 +
        (61 + 90 * tangentSquared + 298 * curvature +
          45 * tangentSquared ** 2 - 252 * secondEccentricitySquared -
          3 * curvature ** 2) *
          d ** 6 / 720
      );
  const longitude =
    centralMeridian +
    (
      d -
      (1 + 2 * tangentSquared + curvature) * d ** 3 / 6 +
      (5 - 2 * curvature + 28 * tangentSquared -
        3 * curvature ** 2 + 8 * secondEccentricitySquared +
        24 * tangentSquared ** 2) *
        d ** 5 / 120
    ) / cosLatitude;

  const sourceSinLatitude = Math.sin(latitude);
  const sourceCosLatitude = Math.cos(latitude);
  const sourceSinLongitude = Math.sin(longitude);
  const sourceCosLongitude = Math.cos(longitude);
  const primeVerticalRadius =
    semiMajorAxis /
    Math.sqrt(1 - eccentricitySquared * sourceSinLatitude ** 2);
  const x =
    primeVerticalRadius * sourceCosLatitude * sourceCosLongitude;
  const y =
    primeVerticalRadius * sourceCosLatitude * sourceSinLongitude;
  const z =
    primeVerticalRadius * (1 - eccentricitySquared) * sourceSinLatitude;

  const [tx, ty, tz] = vn2000ToWgs84.translation;
  const arcSecondsToRadians = Math.PI / (180 * 3600);
  const [rxArcSeconds, ryArcSeconds, rzArcSeconds] =
    vn2000ToWgs84.rotation;
  const rx = rxArcSeconds * arcSecondsToRadians;
  const ry = ryArcSeconds * arcSecondsToRadians;
  const rz = rzArcSeconds * arcSecondsToRadians;
  const scale = 1 + vn2000ToWgs84.scale * 1e-6;

  const wgs84X = tx + scale * x - rz * y + ry * z;
  const wgs84Y = ty + rz * x + scale * y - rx * z;
  const wgs84Z = tz - ry * x + rx * y + scale * z;
  const wgs84Longitude = Math.atan2(wgs84Y, wgs84X);
  const horizontalRadius = Math.hypot(wgs84X, wgs84Y);
  let wgs84Latitude = Math.atan2(
    wgs84Z,
    horizontalRadius * (1 - eccentricitySquared),
  );

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const radius =
      semiMajorAxis /
      Math.sqrt(
        1 - eccentricitySquared * Math.sin(wgs84Latitude) ** 2,
      );
    wgs84Latitude = Math.atan2(
      wgs84Z + eccentricitySquared * radius * Math.sin(wgs84Latitude),
      horizontalRadius,
    );
  }

  return [
    wgs84Longitude * 180 / Math.PI,
    wgs84Latitude * 180 / Math.PI,
  ];
}

export function parseBoundaryCoordinates(value: string): PolygonGeometry {
  const pairs = toCoordinatePairs(value);
  const distinctPairs = new Set(pairs.map((pair) => pair.join(',')));
  if (pairs.length < 3 || distinctPairs.size < 3) {
    throw new BadRequestException(
      'Ranh giới cần có ít nhất ba cặp tọa độ khác nhau.',
    );
  }

  const isGeographic = pairs.every(([longitude, latitude]) =>
    longitude >= -180 && longitude <= 180 &&
    latitude >= -90 && latitude <= 90,
  );
  const isVn2000Tm3 = pairs.every(([easting, northing]) =>
    easting >= 100000 && easting <= 900000 &&
    northing >= 0 && northing <= 3000000,
  );
  if (!isGeographic && !isVn2000Tm3) {
    throw new BadRequestException(
      'Tọa độ phải là kinh độ/vĩ độ WGS84 hoặc X/Y VN-2000 TM-3 (kinh tuyến trục 104°45′).',
    );
  }

  const points = isGeographic
    ? pairs
    : pairs.map(([easting, northing]) =>
      convertVn2000Tm3ToWgs84(easting, northing),
    );
  if (points.some(([longitude, latitude]) =>
    !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
    longitude < -180 || longitude > 180 ||
    latitude < -90 || latitude > 90,
  )) {
    throw new BadRequestException('Tọa độ sau khi chuyển đổi nằm ngoài phạm vi WGS84.');
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
    points.push([...firstPoint]);
  }

  return { type: 'Polygon', coordinates: [points] };
}
