/**
 * PlanHabits — Charts Component
 * Lightweight Canvas-based charts (donut, horizontal bars, trend lines).
 */

const Charts = (() => {

    /**
     * Draw a donut chart showing completion rate.
     */
    function drawDonut(canvas, rate, color = '#6C5CE7', label = '') {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const size = 160;

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        ctx.scale(dpr, dpr);

        const cx = size / 2;
        const cy = size / 2;
        const radius = 60;
        const lineWidth = 14;

        // Background ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-glass-strong').trim() || 'rgba(255,255,255,0.1)';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Progress ring
        if (rate > 0) {
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (Math.PI * 2 * Math.min(rate, 1));

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Center text
        const textColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-primary').trim() || '#fff';

        ctx.fillStyle = textColor;
        ctx.font = '700 28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(rate * 100) + '%', cx, cy - 6);

        if (label) {
            ctx.fillStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--text-secondary').trim() || 'rgba(255,255,255,0.7)';
            ctx.font = '500 11px Inter, sans-serif';
            ctx.fillText(label, cx, cy + 16);
        }
    }

    /**
     * Draw horizontal bar chart for habit time stats.
     */
    function drawHorizontalBars(canvas, habits) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.parentElement ? canvas.parentElement.offsetWidth - 32 : 300;
        const barHeight = 24;
        const gap = 12;
        const labelWidth = 100;
        const height = habits.length * (barHeight + gap) + 20;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(dpr, dpr);

        const maxMinutes = Math.max(...habits.map(h => Math.max(h.total_planned, h.total_actual)), 1);
        const barMaxWidth = width - labelWidth - 60;

        const textColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-primary').trim() || '#fff';
        const textSecondary = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-tertiary').trim() || 'rgba(255,255,255,0.4)';

        habits.forEach((h, i) => {
            const y = i * (barHeight + gap) + 10;

            // Habit name
            ctx.fillStyle = textColor;
            ctx.font = '500 12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const icon = h.habit_icon || '';
            const displayName = (icon ? icon + ' ' : '') + truncate(h.habit_name, 12);
            ctx.fillText(displayName, 4, y + barHeight / 2);

            // Planned bar (background)
            const plannedW = (h.total_planned / maxMinutes) * barMaxWidth;
            ctx.fillStyle = hexToRgba(h.habit_color, 0.2);
            ctx.beginPath();
            ctx.roundRect(labelWidth, y, Math.max(plannedW, 4), barHeight, 4);
            ctx.fill();

            // Actual bar (foreground)
            const actualW = (h.total_actual / maxMinutes) * barMaxWidth;
            ctx.fillStyle = h.habit_color;
            ctx.beginPath();
            ctx.roundRect(labelWidth, y, Math.max(actualW, actualW > 0 ? 4 : 0), barHeight, 4);
            ctx.fill();

            // Time label
            ctx.fillStyle = textSecondary;
            ctx.font = '600 10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(
                formatMinutes(h.total_actual) + ' / ' + formatMinutes(h.total_planned),
                labelWidth + Math.max(plannedW, actualW) + 6,
                y + barHeight / 2
            );
        });
    }

    /**
     * Draw a trend line chart showing week-over-week completion rates.
     */
    function drawTrendLine(canvas, trends) {
        if (!trends || trends.length < 2) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.parentElement ? canvas.parentElement.offsetWidth - 32 : 300;
        const height = 140;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(dpr, dpr);

        const padding = { top: 10, right: 10, bottom: 30, left: 35 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const textColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-tertiary').trim() || 'rgba(255,255,255,0.4)';

        // Y-axis labels (0%, 50%, 100%)
        ctx.fillStyle = textColor;
        ctx.font = '500 10px Inter, sans-serif';
        ctx.textAlign = 'right';
        [0, 0.5, 1].forEach(v => {
            const y = padding.top + chartH * (1 - v);
            ctx.fillText(Math.round(v * 100) + '%', padding.left - 6, y + 3);

            // Grid line
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        });

        // Plot points
        const points = trends.map((t, i) => ({
            x: padding.left + (i / (trends.length - 1)) * chartW,
            y: padding.top + chartH * (1 - t.completion_rate),
            label: t.week_key.replace(/^\d{4}-/, ''),
            rate: t.completion_rate
        }));

        // X-axis labels
        ctx.textAlign = 'center';
        points.forEach(p => {
            ctx.fillStyle = textColor;
            ctx.fillText(p.label, p.x, height - 8);
        });

        // Draw gradient area
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        gradient.addColorStop(0, 'rgba(108, 92, 231, 0.3)');
        gradient.addColorStop(1, 'rgba(108, 92, 231, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + chartH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = '#6C5CE7';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw dots
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#6C5CE7';
            ctx.fill();
            ctx.strokeStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--bg-secondary').trim() || '#1A1A2E';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    // ─── Utilities ─────────────────────────────────────────────────────────

    function hexToRgba(hex, alpha) {
        if (!hex || hex[0] !== '#') return `rgba(108, 92, 231, ${alpha})`;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function formatMinutes(min) {
        if (!min || min <= 0) return '0m';
        const h = Math.floor(min / 60);
        const m = min % 60;
        if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
        return `${m}m`;
    }

    function truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.slice(0, max) + '…' : str;
    }

    return { drawDonut, drawHorizontalBars, drawTrendLine, formatMinutes, hexToRgba };
})();
