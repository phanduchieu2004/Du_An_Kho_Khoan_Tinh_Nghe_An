import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  AreaBounds,
  AreaGeometry,
} from '../nguoi-dung/khu-vuc-phan-cong.util.js';

export interface ProjectAnchorPoint {
  cong_trinh_id: number;
  latitude: number;
  longitude: number;
  first_latitude?: number;
  first_longitude?: number;
}

export function normalizeProjectAnchorPoint(
  point: ProjectAnchorPoint,
): ProjectAnchorPoint {
  if (
    point.latitude >= 101 &&
    point.latitude <= 118 &&
    point.longitude >= 6 &&
    point.longitude <= 24
  ) {
    return {
      ...point,
      latitude: point.longitude,
      longitude: point.latitude,
    };
  }
  return point;
}

@Injectable()
export class MatBangService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findProjectAnchorPoints(
    projectIds: number[],
  ): Promise<ProjectAnchorPoint[]> {
    if (projectIds.length === 0) return [];
    const anchors = await this.dataSource.query(
      `WITH valid_boundaries AS (
         SELECT
           cong_trinh_id,
           id,
           CASE
             WHEN ST_XMin(Box3D(boundary)) BETWEEN 6 AND 24
               AND ST_XMax(Box3D(boundary)) BETWEEN 6 AND 24
               AND ST_YMin(Box3D(boundary)) BETWEEN 101 AND 118
               AND ST_YMax(Box3D(boundary)) BETWEEN 101 AND 118
             THEN ST_FlipCoordinates(boundary)
             ELSE boundary
           END AS boundary
         FROM (
           SELECT
             cong_trinh_id,
             id,
             ST_MakeValid(ranh_gioi) AS boundary
           FROM mat_bang
           WHERE cong_trinh_id = ANY($1::integer[])
             AND ranh_gioi IS NOT NULL
         ) source_boundaries
       ),
       valid_anchors AS (
         SELECT
           cong_trinh_id,
           id,
           ST_PointOnSurface(ST_CollectionExtract(boundary, 3)) AS anchor,
           ST_PointN(
             ST_ExteriorRing(
               ST_GeometryN(ST_CollectionExtract(boundary, 3), 1)
             ),
             1
           ) AS first_coordinate
         FROM valid_boundaries
       ),
       project_anchors AS (
         SELECT
           cong_trinh_id,
           id,
           ST_Y(anchor)::double precision AS latitude,
           ST_X(anchor)::double precision AS longitude,
           ST_Y(first_coordinate)::double precision AS first_latitude,
           ST_X(first_coordinate)::double precision AS first_longitude
         FROM valid_anchors
         WHERE NOT ST_IsEmpty(anchor)
           AND NOT ST_IsEmpty(first_coordinate)
       ),
       normalized_anchors AS (
         SELECT
           cong_trinh_id,
           id,
           CASE
             WHEN latitude BETWEEN 101 AND 118
               AND longitude BETWEEN 6 AND 24
             THEN longitude
             ELSE latitude
           END AS latitude,
           CASE
             WHEN latitude BETWEEN 101 AND 118
               AND longitude BETWEEN 6 AND 24
             THEN latitude
             ELSE longitude
           END AS longitude,
           CASE
             WHEN first_latitude BETWEEN 101 AND 118
               AND first_longitude BETWEEN 6 AND 24
             THEN first_longitude
             ELSE first_latitude
           END AS first_latitude,
           CASE
             WHEN first_latitude BETWEEN 101 AND 118
               AND first_longitude BETWEEN 6 AND 24
             THEN first_latitude
             ELSE first_longitude
           END AS first_longitude
         FROM project_anchors
       )
       SELECT DISTINCT ON (cong_trinh_id)
         cong_trinh_id,
         latitude,
         longitude,
         first_latitude,
         first_longitude
       FROM normalized_anchors
       WHERE latitude BETWEEN 6 AND 24
         AND longitude BETWEEN 101 AND 118
         AND first_latitude BETWEEN 6 AND 24
         AND first_longitude BETWEEN 101 AND 118
       ORDER BY cong_trinh_id, id`,
      [projectIds],
    ) as ProjectAnchorPoint[];
    return anchors.map(normalizeProjectAnchorPoint);
  }

  async findAll(
    congTrinhId?: number,
    allowedProjectIds?: number[],
    assignedGeometry?: AreaGeometry | null,
  ) {
    if (allowedProjectIds?.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const sql = `
      SELECT
        id,
        cong_trinh_id,
        ten_mat_bang,
        loai_mat_bang,
        cap_mat_bang,
        CASE
          WHEN $3::json IS NULL THEN ST_AsGeoJSON(ranh_gioi)::json
          ELSE ST_AsGeoJSON(
            ST_CollectionExtract(
              ST_MakeValid(
                ST_Intersection(
                  ST_MakeValid(ranh_gioi),
                  ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326))
                )
              ),
              3
            )
          )::json
        END AS geometry,
        ma_he_toa_do_nguon,
        trang_thai
      FROM mat_bang
      WHERE ($1::integer IS NULL OR cong_trinh_id = $1)
        AND ($2::integer[] IS NULL OR cong_trinh_id = ANY($2))
        AND (
          $3::json IS NULL OR
          ST_Intersects(
            ST_MakeValid(ranh_gioi),
            ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326))
          )
        )
      ORDER BY id
    `;

    const rows = await this.dataSource.query(sql, [
      congTrinhId ?? null,
      allowedProjectIds ?? null,
      assignedGeometry ? JSON.stringify(assignedGeometry) : null,
    ]);

    return {
      type: 'FeatureCollection',
      features: rows.map((row: any) => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id: row.id,
          cong_trinh_id: row.cong_trinh_id,
          ten_mat_bang: row.ten_mat_bang,
          loai_mat_bang: row.loai_mat_bang,
          cap_mat_bang: row.cap_mat_bang,
          ma_he_toa_do_nguon: row.ma_he_toa_do_nguon,
          trang_thai: row.trang_thai,
        },
      })),
    };
  }

  async findProjects(): Promise<Array<{
    id: number;
    ten_cong_trinh: string | null;
    dia_diem: string | null;
  }>> {
    return this.dataSource.query(`
      SELECT id, ten_cong_trinh, dia_diem
      FROM cong_trinh
      ORDER BY id
    `);
  }

  async findProjectIdsInBounds(bounds: AreaBounds): Promise<number[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT cong_trinh_id
       FROM (
         SELECT cong_trinh_id
         FROM ho_khoan
         WHERE CASE
           WHEN $5::json IS NULL THEN
             latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4
           ELSE ST_Covers(
             ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5::json), 4326)),
             ST_SetSRID(
               ST_MakePoint(longitude::double precision, latitude::double precision),
               4326
             )
           )
         END
         UNION
         SELECT cong_trinh_id
         FROM mat_bang
         WHERE CASE
           WHEN $5::json IS NULL THEN ST_Intersects(
             ranh_gioi,
             ST_MakeEnvelope($3, $1, $4, $2, 4326)
           )
           ELSE ST_Intersects(
             ST_MakeValid(ranh_gioi),
             ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5::json), 4326))
           )
         END
       ) assigned_projects
       WHERE cong_trinh_id IS NOT NULL`,
      [
        bounds.south,
        bounds.north,
        bounds.west,
        bounds.east,
        bounds.geometry ? JSON.stringify(bounds.geometry) : null,
      ],
    ) as Array<{ cong_trinh_id: number | string }>;
    return rows.map((row) => Number(row.cong_trinh_id));
  }

  async findLevelTwoWithin(
    parentId: number,
    allowedProjectIds?: number[],
    assignedGeometry?: AreaGeometry | null,
  ) {
    if (allowedProjectIds?.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const rows = await this.dataSource.query(
      `WITH parent AS (
         SELECT id, cong_trinh_id,
           CASE
             WHEN $3::json IS NULL THEN ranh_gioi
             ELSE ST_Intersection(
               ST_MakeValid(ranh_gioi),
               ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326))
             )
           END AS ranh_gioi
         FROM mat_bang
         WHERE id = $1
           AND ($2::integer[] IS NULL OR cong_trinh_id = ANY($2))
           AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = '1'
       ),
       intersections AS (
         SELECT
           child.id,
           child.cong_trinh_id,
           child.ten_mat_bang,
           child.loai_mat_bang,
           child.cap_mat_bang,
           ST_CollectionExtract(
             ST_MakeValid(
               ST_Intersection(
                 ST_MakeValid(child.ranh_gioi),
                 ST_MakeValid(parent.ranh_gioi)
               )
             ),
             3
           ) AS geometry,
           child.ma_he_toa_do_nguon,
           child.trang_thai
         FROM mat_bang child
         JOIN parent ON TRUE
         WHERE child.id <> parent.id
           AND ($2::integer[] IS NULL OR child.cong_trinh_id = ANY($2))
           AND (
             $3::json IS NULL OR
             ST_Intersects(
               ST_MakeValid(child.ranh_gioi),
               ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326))
             )
           )
           AND REGEXP_REPLACE(TRIM(child.cap_mat_bang::text), '\\.0+$', '') = '2'
           AND ST_Intersects(
             ST_MakeValid(child.ranh_gioi),
             ST_MakeValid(parent.ranh_gioi)
           )
       )
       SELECT
         id,
         cong_trinh_id,
         ten_mat_bang,
         loai_mat_bang,
         cap_mat_bang,
         ST_AsGeoJSON(ST_Multi(geometry))::json AS geometry,
         ma_he_toa_do_nguon,
         trang_thai
       FROM intersections
       WHERE NOT ST_IsEmpty(geometry)
       ORDER BY id`,
      [
        parentId,
        allowedProjectIds ?? null,
        assignedGeometry ? JSON.stringify(assignedGeometry) : null,
      ],
    ) as Array<{
      id: number;
      cong_trinh_id: number;
      ten_mat_bang: string;
      loai_mat_bang: string;
      cap_mat_bang: string;
      geometry: unknown;
      ma_he_toa_do_nguon: string;
      trang_thai: string;
    }>;

    return {
      type: 'FeatureCollection',
      features: rows.map((row) => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id: row.id,
          cong_trinh_id: row.cong_trinh_id,
          ten_mat_bang: row.ten_mat_bang,
          loai_mat_bang: row.loai_mat_bang,
          cap_mat_bang: row.cap_mat_bang,
          ma_he_toa_do_nguon: row.ma_he_toa_do_nguon,
          trang_thai: row.trang_thai,
        },
      })),
    };
  }

  async findAllRows() {
    return await this.dataSource.query(`
      SELECT
        id,
        cong_trinh_id,
        ten_mat_bang,
        loai_mat_bang,
        cap_mat_bang,
        ST_AsGeoJSON(ranh_gioi)::text AS ranh_gioi,
        ma_he_toa_do_nguon,
        trang_thai
      FROM mat_bang
      ORDER BY id DESC
    `) as Array<Record<string, unknown>>;
  }
}