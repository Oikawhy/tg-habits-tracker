/**
 * PlanHabits — Timeline Component
 * Renders a vertical color-coded time block view of the day's habits.
 */

const Timeline = (() => {
    const START_HOUR = 0;
    const END_HOUR = 23;
    const HOUR_HEIGHT = 60; // px per hour

    function render(entries, container) {
        container.innerHTML = '';

        // Filter entries with time slots
        const scheduled = entries.filter(e => e.time_slot);

        if (scheduled.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:var(--space-lg);font-size:var(--font-size-sm);">No time slots assigned. Add times in the Week Planner.</p>';
            return;
        }

        const timeline = document.createElement('div');
        timeline.className = 'timeline';

        // Create hour rows
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            const row = document.createElement('div');
            row.className = 'timeline-hour';
            row.dataset.hour = h;

            const label = document.createElement('div');
            label.className = 'timeline-label';
            label.textContent = `${h.toString().padStart(2, '0')}:00`;

            const track = document.createElement('div');
            track.className = 'timeline-track';
            track.dataset.hour = h;

            row.appendChild(label);
            row.appendChild(track);
            timeline.appendChild(row);
        }

        // Place habit blocks
        scheduled.forEach(entry => {
            const habit = entry.habit || {};
            const color = habit.color || '#6C5CE7';
            const name = habit.name || 'Habit';
            const icon = habit.icon || '';

            const [slotH, slotM] = (entry.time_slot || '09:00').split(':').map(Number);
            const duration = entry.planned_minutes || 30;

            // Calculate total minutes from start of slot to end of day
            const minutesUntilMidnight = (24 - slotH) * 60 - slotM;
            // Cap the displayed duration at midnight
            const displayDuration = Math.min(duration, minutesUntilMidnight);
            const overflowMinutes = duration - displayDuration;

            if (slotH > END_HOUR) return;

            const block = document.createElement('div');
            block.className = 'timeline-block ' + (entry.status || 'undone');

            const height = (displayDuration / 60) * HOUR_HEIGHT;
            block.style.height = Math.max(height, 24) + 'px';
            block.style.background = entry.status === 'done'
                ? color
                : hexToRgba(color, 0.3);
            block.style.borderColor = color;
            block.dataset.entryId = entry.id;

            const overflowNote = overflowMinutes > 0 ? ` (+${overflowMinutes}min next day)` : '';
            block.innerHTML = `
                <div class="block-name">${icon} ${name}</div>
                <div class="block-time">${entry.time_slot} · ${duration}min${overflowNote}</div>
            `;

            block.addEventListener('click', () => {
                TodayScreen.toggleEntry(entry.id, entry.status === 'done' ? 'undone' : 'done');
            });

            // Find the right track
            const track = timeline.querySelector(`.timeline-track[data-hour="${slotH}"]`);
            if (track) {
                const actualTop = ((slotM / 60) * HOUR_HEIGHT);
                block.style.top = actualTop + 'px';
                track.appendChild(block);
            }
        });

        // Set timeline height
        timeline.style.height = ((END_HOUR - START_HOUR + 1) * HOUR_HEIGHT) + 'px';
        container.appendChild(timeline);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return { render, hexToRgba };
})();
