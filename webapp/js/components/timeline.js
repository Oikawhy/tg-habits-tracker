/**
 * PlanHabits — Timeline Component
 * Renders a vertical color-coded time block view with drag-to-move support.
 */

const Timeline = (() => {
    const START_HOUR = 0;
    const END_HOUR = 23;
    const HOUR_HEIGHT = 60; // px per hour

    let dragState = null;

    function render(entries, container) {
        container.innerHTML = '';

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

            const minutesUntilMidnight = (24 - slotH) * 60 - slotM;
            const displayDuration = Math.min(duration, minutesUntilMidnight);
            const overflowMinutes = duration - displayDuration;

            if (slotH > END_HOUR) return;

            const block = document.createElement('div');
            block.className = 'timeline-block ' + (entry.status || 'undone');

            const height = (displayDuration / 60) * HOUR_HEIGHT;
            block.style.height = Math.max(height, 44) + 'px';
            block.style.background = entry.status === 'done'
                ? color
                : hexToRgba(color, 0.3);
            block.style.borderColor = color;
            block.dataset.entryId = entry.id;

            const overflowNote = overflowMinutes > 0 ? ` (+${overflowMinutes}min next day)` : '';

            block.innerHTML = `
                <div class="block-header">
                    <span class="block-name">${icon} ${name}</span>
                    <span class="block-time">${entry.time_slot} · ${duration}min${overflowNote}</span>
                </div>
                <div class="block-drag-handle">⠿</div>
            `;

            // Drag handlers
            setupBlockDrag(block, entry, timeline);

            const track = timeline.querySelector(`.timeline-track[data-hour="${slotH}"]`);
            if (track) {
                const actualTop = ((slotM / 60) * HOUR_HEIGHT);
                block.style.top = actualTop + 'px';
                track.appendChild(block);
            }
        });

        timeline.style.height = ((END_HOUR - START_HOUR + 1) * HOUR_HEIGHT) + 'px';
        container.appendChild(timeline);
    }

    function setupBlockDrag(block, entry, timeline) {
        let startY = 0;
        let startTop = 0;
        let isDragging = false;
        let moved = false;
        let longPressTimer = null;

        function getY(e) {
            return e.touches ? e.touches[0].clientY : e.clientY;
        }

        function onStart(e) {
            // Long press to start drag (300ms)
            startY = getY(e);
            longPressTimer = setTimeout(() => {
                isDragging = true;
                moved = false;

                // Calculate block's absolute position within timeline
                const trackEl = block.parentElement;
                const trackHour = parseInt(trackEl.dataset.hour);
                const blockTop = parseFloat(block.style.top) || 0;
                startTop = trackHour * HOUR_HEIGHT + blockTop;

                block.classList.add('dragging');
                block.style.zIndex = '100';

                // Move block to timeline level for free movement
                const absTop = startTop;
                block.style.position = 'absolute';
                block.style.top = absTop + 'px';
                block.style.left = trackEl.offsetLeft + 'px';
                block.style.width = trackEl.offsetWidth + 'px';
                timeline.appendChild(block);

                if (window.Telegram?.WebApp?.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
            }, 300);
        }

        function onMove(e) {
            if (!isDragging) {
                // If moved before long press, cancel
                if (Math.abs(getY(e) - startY) > 10) {
                    clearTimeout(longPressTimer);
                }
                return;
            }
            e.preventDefault();
            moved = true;

            const deltaY = getY(e) - startY;
            let newTop = startTop + deltaY;

            // Snap to 5-minute increments
            const snapPx = (5 / 60) * HOUR_HEIGHT;
            newTop = Math.round(newTop / snapPx) * snapPx;

            // Clamp within timeline
            newTop = Math.max(0, Math.min(newTop, (END_HOUR + 1) * HOUR_HEIGHT - 30));

            block.style.top = newTop + 'px';

            // Update time display as user drags
            const totalMinutes = Math.round((newTop / HOUR_HEIGHT) * 60);
            const newH = Math.floor(totalMinutes / 60);
            const newM = totalMinutes % 60;
            const timeStr = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
            const timeLabel = block.querySelector('.block-time');
            if (timeLabel) {
                timeLabel.textContent = `${timeStr} · ${entry.planned_minutes}min`;
            }
        }

        function onEnd(e) {
            clearTimeout(longPressTimer);
            if (!isDragging) {
                // It was a tap, not a drag — toggle done/undone
                if (!moved) {
                    TodayScreen.toggleEntry(entry.id, entry.status === 'done' ? 'undone' : 'done');
                }
                return;
            }
            isDragging = false;
            block.classList.remove('dragging');
            block.style.zIndex = '';

            // Calculate final time from position
            const finalTop = parseFloat(block.style.top) || 0;
            const totalMinutes = Math.round((finalTop / HOUR_HEIGHT) * 60);
            const newH = Math.min(Math.floor(totalMinutes / 60), 23);
            const newM = Math.min(totalMinutes % 60, 59);
            const newTimeSlot = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;

            if (newTimeSlot !== entry.time_slot) {
                // Save new time
                TodayScreen.updateEntryTimeSlot(entry.id, newTimeSlot);
            } else {
                // Re-render to reset position
                const container = timeline.parentElement;
                if (container) {
                    TodayScreen.load(TodayScreen.getCurrentDate());
                }
            }
        }

        block.addEventListener('touchstart', onStart, { passive: true });
        block.addEventListener('touchmove', onMove, { passive: false });
        block.addEventListener('touchend', onEnd);
        block.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return { render, hexToRgba };
})();
