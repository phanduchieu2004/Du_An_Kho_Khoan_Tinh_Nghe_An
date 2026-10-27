(function () {
    // Kiểm tra Leaflet đã được tải chưa
    if (typeof L === 'undefined') {
        console.error('Chưa tải thư viện Leaflet (L).');
        return;
    }

    // Dùng lại bản đồ đã khởi tạo trong index.ejs
    // Không gọi L.map('map') lần nữa để tránh lỗi trùng bản đồ.
    if (typeof map === 'undefined') {
        console.error(
            'Không tìm thấy biến map. Hãy đặt mat-bang.js sau script khởi tạo bản đồ trong index.ejs.'
        );
        return;
    }

    let matBangLayer = null;
    const hoKhoanLayer = L.layerGroup();
    const levelTwoLayers = new Map();
    const levelTwoButtons = new Map();
    const levelTwoStatuses = new Map();
    let activeHoKhoanMapId = null;
    let matBangDetailDialog = null;
    let matBangDetailTrigger = null;

    function getMatBangDetailDialog() {
        if (matBangDetailDialog) {
            return matBangDetailDialog;
        }

        const overlay = document.createElement('div');
        const dialog = document.createElement('section');
        const heading = document.createElement('div');
        const title = document.createElement('h2');
        const closeButton = document.createElement('button');
        const content = document.createElement('div');

        overlay.className = 'mat-bang-detail-overlay';
        overlay.hidden = true;
        dialog.className = 'mat-bang-detail-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'mat-bang-detail-title');
        heading.className = 'mat-bang-detail-heading';
        title.id = 'mat-bang-detail-title';
        title.className = 'mat-bang-detail-title';
        closeButton.type = 'button';
        closeButton.className = 'mat-bang-detail-close';
        closeButton.setAttribute('aria-label', 'Đóng chi tiết mặt bằng');
        closeButton.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<path d="m6 6 12 12M18 6 6 18"/></svg>';
        content.className = 'mat-bang-detail-content';

        closeButton.addEventListener('click', () => {
            overlay.hidden = true;
            matBangDetailTrigger?.focus();
        });
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                overlay.hidden = true;
                matBangDetailTrigger?.focus();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !overlay.hidden) {
                overlay.hidden = true;
                matBangDetailTrigger?.focus();
            }
        });

        heading.append(title, closeButton);
        dialog.append(heading, content);
        overlay.append(dialog);
        document.body.append(overlay);
        matBangDetailDialog = { overlay, title, content };
        return matBangDetailDialog;
    }

    function showMatBangDetails(properties, geometry, trigger) {
        const detailDialog = getMatBangDetailDialog();
        const heading = properties.ten_mat_bang || 'Chi tiết mặt bằng';
        const fields = [
            ['Mã mặt bằng', properties.id],
            ['Mã công trình', properties.cong_trinh_id],
            ['Tên mặt bằng', properties.ten_mat_bang],
            ['Loại mặt bằng', properties.loai_mat_bang],
            ['Cấp mặt bằng', properties.cap_mat_bang],
            ['Trạng thái', properties.trang_thai],
            ['Mã hệ tọa độ nguồn', properties.ma_he_toa_do_nguon]
        ];
        const list = document.createElement('dl');
        list.className = 'mat-bang-detail-list';
        fields.forEach(([label, value]) => {
            const term = document.createElement('dt');
            const description = document.createElement('dd');
            term.textContent = label;
            description.textContent =
                value === null || value === undefined || value === ''
                    ? 'Chưa có thông tin'
                    : String(value);
            list.append(term, description);
        });

        const coordinateHeading = document.createElement('h3');
        const coordinates = document.createElement('pre');
        coordinateHeading.className = 'mat-bang-detail-section-title';
        coordinateHeading.textContent = 'Tọa độ ranh giới (kinh độ, vĩ độ)';
        coordinates.className = 'mat-bang-detail-coordinates';
        coordinates.textContent = geometry?.coordinates
            ? JSON.stringify(geometry.coordinates, null, 2)
            : 'Chưa có dữ liệu ranh giới';

        detailDialog.title.textContent = heading;
        detailDialog.content.replaceChildren(list, coordinateHeading, coordinates);
        detailDialog.overlay.hidden = false;
        matBangDetailTrigger = trigger;
        detailDialog.overlay.querySelector('.mat-bang-detail-close').focus();
    }

    function showSearchLocationDetails(result, latitude, longitude, geometry, trigger) {
        const detailDialog = getMatBangDetailDialog();
        const address = result.address || {};
        const fields = [
            ['Tên địa điểm', result.name],
            ['Địa chỉ đầy đủ', result.display_name],
            ['Loại địa điểm', result.addresstype || result.type],
            ['Nhóm đối tượng', result.class],
            ['Tỉnh/thành phố', address.city || address.town || address.municipality || address.state],
            ['Quốc gia', address.country],
            ['Mã OpenStreetMap', result.osm_type && result.osm_id
                ? `${result.osm_type} ${result.osm_id}`
                : null],
            ['Vĩ độ', latitude],
            ['Kinh độ', longitude]
        ];
        const list = document.createElement('dl');
        list.className = 'mat-bang-detail-list';
        fields.forEach(([label, value]) => {
            const term = document.createElement('dt');
            const description = document.createElement('dd');
            term.textContent = label;
            description.textContent =
                value === null || value === undefined || value === ''
                    ? 'Chưa có thông tin'
                    : String(value);
            list.append(term, description);
        });

        const coordinateHeading = document.createElement('h3');
        const coordinates = document.createElement('pre');
        coordinateHeading.className = 'mat-bang-detail-section-title';
        coordinateHeading.textContent = geometry
            ? 'Tọa độ ranh giới đất liền (kinh độ, vĩ độ)'
            : 'Tọa độ địa điểm (kinh độ, vĩ độ)';
        coordinates.className = 'mat-bang-detail-coordinates';
        coordinates.textContent = geometry?.coordinates
            ? JSON.stringify(geometry.coordinates, null, 2)
            : JSON.stringify([longitude, latitude], null, 2);

        detailDialog.title.textContent =
            result.name || result.display_name?.split(',')[0] || 'Chi tiết địa điểm';
        detailDialog.content.replaceChildren(list, coordinateHeading, coordinates);
        detailDialog.overlay.hidden = false;
        matBangDetailTrigger = trigger;
        detailDialog.overlay.querySelector('.mat-bang-detail-close').focus();
    }

    window.showSearchLocationDetails = showSearchLocationDetails;

    function pointOnSegment(point, start, end) {
        const [x, y] = point;
        const [startX, startY] = start;
        const [endX, endY] = end;
        const cross =
            (x - startX) * (endY - startY) -
            (y - startY) * (endX - startX);
        const tolerance = 1e-10;

        return (
            Math.abs(cross) <= tolerance &&
            x >= Math.min(startX, endX) - tolerance &&
            x <= Math.max(startX, endX) + tolerance &&
            y >= Math.min(startY, endY) - tolerance &&
            y <= Math.max(startY, endY) + tolerance
        );
    }

    function pointInRing(point, ring) {
        if (!Array.isArray(ring) || ring.length < 4) {
            return false;
        }

        let inside = false;
        for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
            const start = ring[previous];
            const end = ring[index];
            if (
                !Array.isArray(start) ||
                !Array.isArray(end) ||
                !Number.isFinite(start[0]) ||
                !Number.isFinite(start[1]) ||
                !Number.isFinite(end[0]) ||
                !Number.isFinite(end[1])
            ) {
                return false;
            }

            if (pointOnSegment(point, start, end)) {
                return true;
            }

            const crossesRay =
                (end[1] > point[1]) !== (start[1] > point[1]) &&
                point[0] <
                    ((start[0] - end[0]) * (point[1] - end[1])) /
                        (start[1] - end[1]) +
                        end[0];
            if (crossesRay) {
                inside = !inside;
            }
        }

        return inside;
    }

    function pointInPolygon(point, polygon) {
        return (
            Array.isArray(polygon) &&
            polygon.length > 0 &&
            pointInRing(point, polygon[0]) &&
            !polygon.slice(1).some((hole) => pointInRing(point, hole))
        );
    }

    function pointInGeometry(longitude, latitude, geometry) {
        if (!geometry || !Array.isArray(geometry.coordinates)) {
            return false;
        }

        const point = [longitude, latitude];
        if (geometry.type === 'Polygon') {
            return pointInPolygon(point, geometry.coordinates);
        }
        if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.some((polygon) =>
                pointInPolygon(point, polygon)
            );
        }

        return false;
    }

    async function loadMatBang() {
        const response = await fetch('/mat-bang/api');

        if (!response.ok) {
            const result = await response.json().catch(() => null);
            throw new Error(
                result?.message || `API trả về lỗi HTTP ${response.status}`
            );
        }

        const geojson = await response.json();
        if (
            !geojson ||
            geojson.type !== 'FeatureCollection' ||
            !Array.isArray(geojson.features)
        ) {
            throw new Error('Dữ liệu GeoJSON không hợp lệ.');
        }
        matBangLayer = L.geoJSON(geojson, {
            filter: function (feature) {
                return Number(feature.properties?.cap_mat_bang) !== 2;
            },
            style: function (feature) {
                const isLevelTwo = Number(feature.properties?.cap_mat_bang) === 2;
                return {
                    color: isLevelTwo ? '#16834a' : '#ff0000',
                    weight: 3,
                    opacity: 1,
                    fillColor: isLevelTwo ? '#22c55e' : '#ff0000',
                    fillOpacity: isLevelTwo ? 0.45 : 0.3
                };
            },
            onEachFeature: function (feature, layer) {
                const properties = feature.properties || {};
                const popup = document.createElement('div');
                const heading = document.createElement('div');
                const title = document.createElement('strong');
                const details = document.createElement('div');
                const showHoKhoanButton = document.createElement('button');
                const showDetailsButton = document.createElement('button');
                const headingActions = document.createElement('div');
                const showLevelTwoButton = document.createElement('button');
                const levelTwoStatus = document.createElement('p');
                const status = document.createElement('p');

                title.textContent = properties.ten_mat_bang || 'Chưa có tên';
                heading.className = 'mat-bang-popup-heading';
                showHoKhoanButton.type = 'button';
                showHoKhoanButton.className = 'mat-bang-hole-button';
                showHoKhoanButton.title = 'Hiện/ẩn hố khoan trong mặt bằng này';
                showHoKhoanButton.setAttribute(
                    'aria-label',
                    'Hiện hoặc ẩn hố khoan trong mặt bằng này'
                );
                showHoKhoanButton.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                    '<path d="M12 3v13m-4-9h8m-6 9h4m-6 0h8M6 21h12"/>' +
                    '<path d="m9 7 3-4 3 4m-3 9 2 3-2 2-2-2 2-3Z"/>' +
                    '</svg>';
                showDetailsButton.type = 'button';
                showDetailsButton.className = 'mat-bang-detail-button';
                showDetailsButton.title = 'Xem chi tiết mặt bằng';
                showDetailsButton.setAttribute('aria-label', 'Xem chi tiết mặt bằng');
                showDetailsButton.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/>' +
                    '<circle cx="12" cy="12" r="3"/></svg>';
                headingActions.className = 'mat-bang-popup-actions';
                headingActions.append(showDetailsButton, showHoKhoanButton);
                showDetailsButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    showMatBangDetails(properties, feature.geometry, showDetailsButton);
                });
                status.className = 'mat-bang-hole-status';
                status.hidden = true;
                levelTwoStatus.className = 'mat-bang-hole-status';
                levelTwoStatus.hidden = true;
                details.textContent =
                    `Loại: ${properties.loai_mat_bang || 'Chưa xác định'} | ` +
                    `Cấp: ${properties.cap_mat_bang || 'Chưa xác định'} | ` +
                    `Trạng thái: ${properties.trang_thai || 'Chưa xác định'}`;
                heading.append(title, headingActions);
                popup.append(heading, details);
                if (Number(properties.cap_mat_bang) === 1) {
                    showLevelTwoButton.type = 'button';
                    showLevelTwoButton.className = 'mat-bang-level-button';
                    showLevelTwoButton.textContent = 'Hiện mặt bằng cấp 2';
                    showLevelTwoButton.setAttribute('aria-pressed', 'false');
                    levelTwoButtons.set(String(properties.id), showLevelTwoButton);
                    levelTwoStatuses.set(String(properties.id), levelTwoStatus);
                    popup.append(showLevelTwoButton, levelTwoStatus);
                }
                popup.append(status);
                layer.bindPopup(popup);

                if (Number(properties.cap_mat_bang) === 1) {
                    showLevelTwoButton.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const parentId = String(properties.id);
                        const existingLayer = levelTwoLayers.get(parentId);
                        if (existingLayer && map.hasLayer(existingLayer)) {
                            map.removeLayer(existingLayer);
                            levelTwoLayers.delete(parentId);
                            showLevelTwoButton.textContent = 'Hiện mặt bằng cấp 2';
                            showLevelTwoButton.setAttribute('aria-pressed', 'false');
                            levelTwoStatus.textContent = 'Đã ẩn mặt bằng cấp 2.';
                            levelTwoStatus.hidden = false;
                            return;
                        }

                        showLevelTwoButton.disabled = true;
                        levelTwoStatus.textContent = 'Đang tải mặt bằng cấp 2...';
                        levelTwoStatus.hidden = false;
                        try {
                            const response = await fetch(
                                `/mat-bang/api/cap-2?parent_id=${encodeURIComponent(parentId)}`
                            );
                            if (!response.ok) {
                                throw new Error(
                                    `API mặt bằng cấp 2 trả về HTTP ${response.status}`
                                );
                            }
                            const childData = await response.json();
                            if (
                                childData?.type !== 'FeatureCollection' ||
                                !Array.isArray(childData.features)
                            ) {
                                throw new Error('Dữ liệu mặt bằng cấp 2 không hợp lệ.');
                            }
                            if (childData.features.length === 0) {
                                levelTwoStatus.textContent =
                                    'Mặt bằng cấp 1 này chưa có mặt bằng cấp 2 nằm bên trong.';
                                return;
                            }

                            const childLayer = L.geoJSON(childData, {
                                style: {
                                    color: '#16834a',
                                    weight: 3,
                                    opacity: 1,
                                    fillColor: '#22c55e',
                                    fillOpacity: 0.45
                                },
                                onEachFeature: (childFeature, childFeatureLayer) => {
                                    const childPopup = document.createElement('div');
                                    const childHeading = document.createElement('div');
                                    const childTitle = document.createElement('strong');
                                    const childDetails = document.createElement('div');
                                    const childActions = document.createElement('div');
                                    const childShowDetailsButton = document.createElement('button');
                                    const childProperties = childFeature.properties || {};
                                    childHeading.className = 'mat-bang-popup-heading';
                                    childTitle.className = 'popup-title';
                                    childTitle.textContent =
                                        childProperties.ten_mat_bang || 'Mặt bằng cấp 2';
                                    childDetails.textContent =
                                        `Loại: ${childProperties.loai_mat_bang || 'Chưa xác định'} | Cấp: 2`;
                                    childActions.className = 'mat-bang-popup-actions';
                                    childShowDetailsButton.type = 'button';
                                    childShowDetailsButton.className = 'mat-bang-detail-button';
                                    childShowDetailsButton.title = 'Xem chi tiết mặt bằng';
                                    childShowDetailsButton.setAttribute(
                                        'aria-label',
                                        'Xem chi tiết mặt bằng cấp 2'
                                    );
                                    childShowDetailsButton.innerHTML =
                                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                                        'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                                        '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/>' +
                                        '<circle cx="12" cy="12" r="3"/></svg>';
                                    childShowDetailsButton.addEventListener('click', (event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        showMatBangDetails(
                                            childProperties,
                                            childFeature.geometry,
                                            childShowDetailsButton
                                        );
                                    });
                                    childActions.append(childShowDetailsButton);
                                    childHeading.append(childTitle, childActions);
                                    childPopup.append(childHeading, childDetails);
                                    childFeatureLayer.bindPopup(childPopup);
                                    childFeatureLayer.on('click', () => {
                                        childLayer.eachLayer((siblingLayer) => {
                                            siblingLayer.setStyle({
                                                color: '#16834a',
                                                weight: 3,
                                                opacity: 1,
                                                fillColor: '#22c55e',
                                                fillOpacity: 0.45
                                            });
                                        });
                                        childFeatureLayer.setStyle({
                                            color: '#065f46',
                                            weight: 5,
                                            opacity: 1,
                                            fillColor: '#16a34a',
                                            fillOpacity: 0.55
                                        });
                                        if (typeof childFeatureLayer.bringToFront === 'function') {
                                            childFeatureLayer.bringToFront();
                                        }
                                    });
                                }
                            });
                            childLayer.addTo(map);
                            levelTwoLayers.set(parentId, childLayer);
                            showLevelTwoButton.textContent = 'Ẩn mặt bằng cấp 2';
                            showLevelTwoButton.setAttribute('aria-pressed', 'true');
                            levelTwoStatus.textContent =
                                `Đang hiển thị ${childData.features.length} mặt bằng cấp 2 màu xanh.`;
                        } catch (error) {
                            console.error('Không tải được mặt bằng cấp 2:', error);
                            levelTwoStatus.textContent =
                                'Không tải được mặt bằng cấp 2. Vui lòng thử lại.';
                        } finally {
                            showLevelTwoButton.disabled = false;
                        }
                    });
                }

                showHoKhoanButton.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const projectId = Number(properties.cong_trinh_id);
                    if (!Number.isInteger(projectId) || projectId <= 0) {
                        status.textContent = 'Mặt bằng chưa liên kết công trình.';
                        status.hidden = false;
                        return;
                    }

                    const mapId = properties.id == null
                        ? null
                        : String(properties.id);
                    if (!mapId) {
                        status.textContent = 'Không xác định được mặt bằng này.';
                        status.hidden = false;
                        return;
                    }

                    if (typeof window.hideAllHoKhoan === 'function') {
                        window.hideAllHoKhoan();
                    }

                    if (
                        map.hasLayer(hoKhoanLayer) &&
                        activeHoKhoanMapId === mapId
                    ) {
                        hoKhoanLayer.clearLayers();
                        map.removeLayer(hoKhoanLayer);
                        activeHoKhoanMapId = null;
                        status.textContent = 'Đã ẩn các hố khoan.';
                        status.hidden = false;
                        return;
                    }

                    showHoKhoanButton.disabled = true;
                    status.textContent = 'Đang tải hố khoan...';
                    status.hidden = false;

                    try {
                        const response = await fetch(
                            `/ho-khoan/api?cong_trinh_id=${encodeURIComponent(projectId)}`
                        );
                        if (!response.ok) {
                            throw new Error(
                                `API hố khoan trả về HTTP ${response.status}`
                            );
                        }

                        const holes = await response.json();
                        if (!Array.isArray(holes)) {
                            throw new Error('Dữ liệu hố khoan không hợp lệ.');
                        }

                        hoKhoanLayer.clearLayers();
                        if (map.hasLayer(hoKhoanLayer)) {
                            map.removeLayer(hoKhoanLayer);
                        }
                        activeHoKhoanMapId = null;
                        const coordinates = [];

                        holes.forEach((hole) => {
                            if (
                                hole.latitude == null ||
                                hole.longitude == null ||
                                hole.latitude === '' ||
                                hole.longitude === ''
                            ) {
                                return;
                            }

                            const latitude = Number(hole.latitude);
                            const longitude = Number(hole.longitude);
                            if (
                                !Number.isFinite(latitude) ||
                                !Number.isFinite(longitude) ||
                                latitude < -90 || latitude > 90 ||
                                longitude < -180 || longitude > 180
                            ) {
                                return;
                            }
                            if (!pointInGeometry(longitude, latitude, feature.geometry)) {
                                return;
                            }

                            const marker = L.marker([latitude, longitude], {
                                icon: window.createBoreholeIcon()
                            });
                            const markerPopup = document.createElement('div');
                            const markerTitle = document.createElement('strong');
                            markerTitle.textContent =
                                hole.ma_ho_khoan || `Hố khoan ${hole.id}`;
                            markerPopup.append(markerTitle);
                            marker.bindPopup(markerPopup);
                            hoKhoanLayer.addLayer(marker);
                            coordinates.push([latitude, longitude]);
                        });

                        if (coordinates.length === 0) {
                            status.textContent =
                                'Mặt bằng này chưa có hố khoan với tọa độ nằm trong ranh giới.';
                            return;
                        }

                        hoKhoanLayer.addTo(map);
                        activeHoKhoanMapId = mapId;
                        map.fitBounds(L.latLngBounds(coordinates), {
                            padding: [50, 50],
                            maxZoom: 18
                        });
                        status.textContent =
                            `Đang hiển thị ${coordinates.length} hố khoan trong mặt bằng này.`;
                    } catch (error) {
                        console.error('Không tải được hố khoan:', error);
                        status.textContent = 'Không tải được hố khoan. Vui lòng thử lại.';
                    } finally {
                        showHoKhoanButton.disabled = false;
                    }
                });
            }
        });
    }

    async function toggleMatBang() {
        if (!matBangLayer) {
            await loadMatBang();
        }

        if (map.hasLayer(matBangLayer)) {
            map.removeLayer(matBangLayer);
            if (map.hasLayer(hoKhoanLayer)) {
                map.removeLayer(hoKhoanLayer);
            }
            levelTwoLayers.forEach((childLayer) => map.removeLayer(childLayer));
            levelTwoLayers.clear();
            levelTwoButtons.forEach((button) => {
                button.textContent = 'Hiện mặt bằng cấp 2';
                button.setAttribute('aria-pressed', 'false');
            });
            levelTwoStatuses.forEach((status) => {
                status.hidden = true;
                status.textContent = '';
            });
            hoKhoanLayer.clearLayers();
            activeHoKhoanMapId = null;
            return false;
        }

        matBangLayer.addTo(map);
        const bounds = matBangLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                padding: [30, 30],
                maxZoom: 18
            });
        }

        return true;
    }

    window.toggleMatBang = toggleMatBang;
})();