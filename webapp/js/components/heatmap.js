/**
 * PlanHabits — Heatmap Component
 * GitHub-style contribution grid showing habit completion intensity.
 */

const Heatmap = (() => {

    function render(container, data, color = '#6C5CE7') {
        container.innerHTML = '';

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);font-size:var(--font-size-sm);padding:var(--space-md);">No data yet. Start tracking habits!</p>';
            return;
        }

        // Build a date → entry lookup
        const lookup = {};
        data.forEach(d => { lookup[d.date] = d; });

        // Generate grid for last 90 days (or as available)
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 89);

        // Create month labels
        const monthLabels = document.createElement('div');
        monthLabels.style.cssText = 'display:flex;gap:3px;padding:0 0 4px;font-size:10px;color:var(--text-tertiary);margin-left:20px;';

        const months = {};
        for (let i = 0; i < 90; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const monthKey = d.getMonth();
            if (!(monthKey in months)) {
                months[monthKey] = d.toLocaleDateString('en', { month: 'short' });
            }
        }

        Object.values(months).forEach(m => {
            const span = document.createElement('span');
            span.textContent = m;
            span.style.cssText = 'flex:1;';
            monthLabels.appendChild(span);
        });

        container.appendChild(monthLabels);

        // Weekday labels
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;gap:0;';

        const dayLabels = document.createElement('div');
        dayLabels.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-right:4px;font-size:9px;color:var(--text-tertiary);padding-top:1px;';
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(l => {
            const s = document.createElement('span');
            s.textContent = l;
            s.style.cssText = 'height:14px;display:flex;align-items:center;';
            dayLabels.appendChild(s);
        });
        wrapper.appendChild(dayLabels);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'heatmap-grid';
        grid.style.cssText = 'display:grid;grid-template-rows:repeat(7,14px);grid-auto-flow:column;gap:3px;';

        // Find start: go back to the Monday of startDate's week
        const gridStart = new Date(startDate);
        const startDay = gridStart.getDay() || 7; // Mon=1, Sun=7
        gridStart.setDate(gridStart.getDate() - (startDay - 1));

        for (let d = new Date(gridStart); d <= today; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().slice(0, 10);
            const entry = lookup[dateStr];

            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.title = `${dateStr}: ${entry ? entry.count + '/' + entry.total : 'no data'}`;

            if (entry && entry.intensity > 0) {
                const opacity = 0.2 + (entry.intensity * 0.8);
                cell.style.background = hexToRgba(color, opacity);
            }

            grid.appendChild(cell);
        }

        wrapper.appendChild(grid);
        container.appendChild(wrapper);

        // Legend
        const legend = document.createElement('div');
        legend.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:8px;font-size:10px;color:var(--text-tertiary);justify-content:flex-end;';
        legend.innerHTML = 'Less ';
        [0.1, 0.3, 0.5, 0.7, 1.0].forEach(level => {
            const box = document.createElement('div');
            box.style.cssText = `width:12px;height:12px;border-radius:2px;background:${hexToRgba(color, 0.2 + level * 0.8)};`;
            legend.appendChild(box);
        });
        legend.innerHTML += ' More';
        container.appendChild(legend);
    }

    function hexToRgba(hex, alpha) {
        if (!hex || hex[0] !== '#') return `rgba(108, 92, 231, ${alpha})`;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return { render };
})();
