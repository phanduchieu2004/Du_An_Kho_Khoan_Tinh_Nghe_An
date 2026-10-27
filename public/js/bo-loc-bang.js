(() => {
  const initializeTableFilters = () => {
    const main = document.querySelector('main');
    if (!main || main.querySelector('[data-table-filter-toolbar]')) return;

    const tables = [...main.querySelectorAll(
      'table:not(.permission-table):not(.hole-scan-table):not([data-no-table-filter])',
    )].filter(
      (table) =>
        !table.closest('dialog') &&
        table.tBodies.length > 0 &&
        [...table.tBodies].some((body) => body.rows.length > 0),
    );
    if (tables.length === 0) return;

    const toolbar = document.createElement('section');
    toolbar.className = 'table-filter-toolbar';
    toolbar.dataset.tableFilterToolbar = 'true';
    toolbar.setAttribute('aria-label', 'Lọc dữ liệu bảng');
    toolbar.innerHTML = `
      <label class="table-filter-search">
        <span>Tìm kiếm</span>
        <input type="search" data-filter-search placeholder="Nhập nội dung cần tìm..." autocomplete="off">
      </label>
      <label class="table-filter-period">
        <span>Lọc theo</span>
        <select data-filter-period>
          <option value="day">Ngày</option>
          <option value="month">Tháng</option>
          <option value="year">Năm</option>
        </select>
      </label>
      <label class="table-filter-date" data-filter-date-label>
        <span data-filter-date-caption>Chọn ngày</span>
        <input type="date" data-filter-date>
        <input type="month" data-filter-month hidden>
        <input type="number" data-filter-year min="1900" max="2200" step="1" placeholder="Năm" hidden>
      </label>
      <button type="button" class="table-filter-reset" data-filter-reset>Xóa bộ lọc</button>
      <span class="table-filter-count" data-filter-count aria-live="polite"></span>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .table-filter-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 10px;
        margin: 0 0 14px;
        padding: 12px;
        border: 1px solid #dce5e1;
        border-radius: 9px;
        background: #f8faf9;
      }
      .table-filter-toolbar label {
        display: grid;
        gap: 4px;
        margin: 0;
        color: #52645e;
        font-size: 12px;
        font-weight: 600;
      }
      .table-filter-toolbar input,
      .table-filter-toolbar select {
        min-height: 36px;
        padding: 6px 9px;
        border: 1px solid #cfdad5;
        border-radius: 6px;
        background: #fff;
        color: #1f302d;
        font: inherit;
        font-size: 13px;
      }
      .table-filter-search { flex: 1 1 240px; }
      .table-filter-period { flex: 0 1 120px; }
      .table-filter-date { flex: 0 1 170px; }
      .table-filter-reset {
        min-height: 36px;
        padding: 6px 12px;
        border: 1px solid #b8c8c1;
        border-radius: 6px;
        background: #fff;
        color: #344b44;
        font-size: 13px;
      }
      .table-filter-reset:hover { background: #edf3f0; }
      .table-filter-count {
        padding: 0 2px 8px;
        color: #667772;
        font-size: 12px;
      }
      @media (max-width: 600px) {
        .table-filter-search { flex-basis: 100%; }
        .table-filter-period, .table-filter-date { flex: 1 1 130px; }
      }
    `;
    document.head.append(style);

    const heading = main.querySelector('h1');
    const headingContainer =
      heading?.closest('.page-heading') || heading?.parentElement;
    if (headingContainer?.parentElement === main) {
      headingContainer.insertAdjacentElement('afterend', toolbar);
    } else {
      const firstTableFrame =
        tables[0].closest('.table-frame') || tables[0];
      firstTableFrame.parentElement?.insertBefore(toolbar, firstTableFrame);
    }

    const searchInput = toolbar.querySelector('[data-filter-search]');
    const periodSelect = toolbar.querySelector('[data-filter-period]');
    const dateInput = toolbar.querySelector('[data-filter-date]');
    const monthInput = toolbar.querySelector('[data-filter-month]');
    const yearInput = toolbar.querySelector('[data-filter-year]');
    const dateCaption = toolbar.querySelector('[data-filter-date-caption]');
    const count = toolbar.querySelector('[data-filter-count]');
    const dateControls = {
      day: dateInput,
      month: monthInput,
      year: yearInput,
    };

    const normalize = (value) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLocaleLowerCase('vi')
        .trim();

    const rowDates = (text) => {
      const dates = [];
      const datePattern = /(^|[^\d])(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?!\d)/g;
      const isoPattern = /(^|[^\d])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;
      for (const match of text.matchAll(datePattern)) {
        const yearValue = Number(match[4]);
        const year = yearValue < 100 ? 2000 + yearValue : yearValue;
        const date = new Date(Date.UTC(year, Number(match[3]) - 1, Number(match[2])));
        if (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === Number(match[3]) - 1 &&
          date.getUTCDate() === Number(match[2])
        ) dates.push(date);
      }
      for (const match of text.matchAll(isoPattern)) {
        const year = Number(match[2]);
        const month = Number(match[3]) - 1;
        const day = Number(match[4]);
        const date = new Date(Date.UTC(year, month, day));
        if (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month &&
          date.getUTCDate() === day
        ) dates.push(date);
      }
      return dates;
    };

    const applyFilters = () => {
      const query = normalize(searchInput.value);
      const period = periodSelect.value;
      const selectedValue = dateControls[period].value;
      let visibleRows = 0;
      let totalRows = 0;

      for (const table of tables) {
        for (const body of table.tBodies) {
          for (const row of body.rows) {
            if (row.querySelector('.empty')) {
              row.hidden = Boolean(query || selectedValue);
              continue;
            }
            totalRows += 1;
            const text = row.innerText || row.textContent || '';
            const matchesText = !query || normalize(text).includes(query);
            const dates = selectedValue ? rowDates(text) : [];
            const matchesDate =
              !selectedValue ||
              dates.some((date) => {
                if (period === 'year') {
                  return date.getUTCFullYear() === Number(selectedValue);
                }
                const [year, month, day] = selectedValue
                  .split('-')
                  .map(Number);
                if (date.getUTCFullYear() !== year) return false;
                if (period === 'month') return date.getUTCMonth() + 1 === month;
                return (
                  date.getUTCMonth() + 1 === month &&
                  date.getUTCDate() === day
                );
              });
            row.hidden = !(matchesText && matchesDate);
            if (!row.hidden) visibleRows += 1;
          }
        }
      }
      count.textContent = `Hiển thị ${visibleRows}/${totalRows} dòng`;
    };

    const updateDateControl = () => {
      const period = periodSelect.value;
      for (const [name, input] of Object.entries(dateControls)) {
        input.hidden = name !== period;
        if (name !== period) input.value = '';
      }
      dateCaption.textContent =
        period === 'day' ? 'Chọn ngày' : period === 'month' ? 'Chọn tháng' : 'Chọn năm';
      applyFilters();
    };

    searchInput.addEventListener('input', applyFilters);
    periodSelect.addEventListener('change', updateDateControl);
    for (const input of Object.values(dateControls)) {
      input.addEventListener('input', applyFilters);
      input.addEventListener('change', applyFilters);
    }
    toolbar
      .querySelector('[data-filter-reset]')
      .addEventListener('click', () => {
        searchInput.value = '';
        for (const input of Object.values(dateControls)) input.value = '';
        periodSelect.value = 'day';
        updateDateControl();
      });

    updateDateControl();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTableFilters, {
      once: true,
    });
  } else {
    initializeTableFilters();
  }
})();
