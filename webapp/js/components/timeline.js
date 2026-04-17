/**
 * PlanHabits — Timeline Component
 * Renders a vertical color-coded time block view with drag-to-move support.
 * Uses a single global drag controller to avoid duplicate event listeners.
 */

const Timeline = (() => {
    const START_HOUR = 0;
    const END_HOUR = 23;
    const HOUR_HEIGHT = 60; // px per hour

    // Single global drag state — prevents duplicate listeners
    let drag = null;
    let globalListenersAttached = false;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function render(entries, container) {
        container.innerHTML = '';
        drag = null; // reset drag on re-render

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
            block.dataset.habitId = entry.habit_id;

            const overflowNote = overflowMinutes > 0 ? ` (+${overflowMinutes}min next day)` : '';

            block.innerHTML = `
                <div class="block-header">
                    <span class="block-name">${escapeHtml(icon)} ${escapeHtml(name)}</span>
                    <span class="block-time">${escapeHtml(entry.time_slot)} · ${duration}min${overflowNote}</span>
                </div>
                <div class="block-drag-handle">⠿</div>
            `;

            // Only attach per-block touchstart — NO document-level listeners per block
            const dragHandle = block.querySelector('.block-drag-handle');
            dragHandle.addEventListener('touchstart', (e) => startDrag(e, block, entry, timeline), { passive: false });
            dragHandle.addEventListener('mousedown', (e) => startDrag(e, block, entry, timeline));

            // Tap to toggle — only on the main block area, not drag handle
            block.addEventListener('click', (e) => {
                // Don't toggle if we just finished a drag
                if (block.dataset.justDragged === 'true') {
                    block.dataset.justDragged = 'false';
                    return;
                }
                // Don't toggle if clicking the drag handle
                if (e.target.closest('.block-drag-handle')) return;

                TodayScreen.toggleEntry(entry.id, entry.status === 'done' ? 'undone' : 'done');
            });

            const track = timeline.querySelector(`.timeline-track[data-hour="${slotH}"]`);
            if (track) {
                const actualTop = ((slotM / 60) * HOUR_HEIGHT);
                block.style.top = actualTop + 'px';
                track.appendChild(block);
            }
        });

        timeline.style.height = ((END_HOUR - START_HOUR + 1) * HOUR_HEIGHT) + 'px';
        container.appendChild(timeline);

        // Attach global listeners ONCE
        if (!globalListenersAttached) {
            document.addEventListener('touchmove', onGlobalMove, { passive: false });
            document.addEventListener('touchend', onGlobalEnd);
            document.addEventListener('mousemove', onGlobalMove);
            document.addEventListener('mouseup', onGlobalEnd);
            globalListenersAttached = true;
        }
    }

    function startDrag(e, block, entry, timeline) {
        e.preventDefault();
        e.stopPropagation();

        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const timelineRect = timeline.getBoundingClientRect();

        // Calculate block's absolute position within timeline
        const trackEl = block.parentElement;
        const trackHour = parseInt(trackEl.dataset.hour);
        const blockTop = parseFloat(block.style.top) || 0;
        const absoluteTop = trackHour * HOUR_HEIGHT + blockTop;

        drag = {
            block,
            entry,
            timeline,
            startY: y,
            startAbsoluteTop: absoluteTop,
            timelineTop: timelineRect.top + window.scrollY,
            moved: false
        };

        block.classList.add('dragging');

        if (window.Telegram?.WebApp?.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
    }

    function onGlobalMove(e) {
        if (!drag) return;
        e.preventDefault();

        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = y - drag.startY;

        if (Math.abs(deltaY) > 3) drag.moved = true;
        if (!drag.moved) return;

        let newTop = drag.startAbsoluteTop + deltaY;

        // Snap to 5-minute increments
        const snapPx = (5 / 60) * HOUR_HEIGHT;
        newTop = Math.round(newTop / snapPx) * snapPx;

        // Clamp within timeline
        newTop = Math.max(0, Math.min(newTop, (END_HOUR + 1) * HOUR_HEIGHT - 30));

        // Move block: re-parent to correct track hour
        const newHour = Math.floor(newTop / HOUR_HEIGHT);
        const withinHourTop = newTop - newHour * HOUR_HEIGHT;

        const targetTrack = drag.timeline.querySelector(`.timeline-track[data-hour="${newHour}"]`);
        if (targetTrack && drag.block.parentElement !== targetTrack) {
            targetTrack.appendChild(drag.block);
        }
        drag.block.style.top = withinHourTop + 'px';

        // Update time display live
        const totalMinutes = Math.round((newTop / HOUR_HEIGHT) * 60);
        const newH = Math.floor(totalMinutes / 60);
        const newM = totalMinutes % 60;
        const timeStr = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
        const timeLabel = drag.block.querySelector('.block-time');
        if (timeLabel) {
            timeLabel.textContent = `${timeStr} · ${drag.entry.planned_minutes || 30}min`;
        }

        // Store new top for end calculation
        drag.currentAbsoluteTop = newTop;
    }

    function onGlobalEnd() {
        if (!drag) return;

        const { block, entry, moved } = drag;
        block.classList.remove('dragging');

        if (moved && drag.currentAbsoluteTop !== undefined) {
            block.dataset.justDragged = 'true';

            const totalMinutes = Math.round((drag.currentAbsoluteTop / HOUR_HEIGHT) * 60);
            const newH = Math.min(Math.floor(totalMinutes / 60), 23);
            const newM = Math.min(totalMinutes % 60, 59);
            const newTimeSlot = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;

            if (newTimeSlot !== entry.time_slot) {
                drag = null; // Clear before async
                TodayScreen.updateEntryTimeSlot(entry.id, newTimeSlot);
                return;
            }
        }

        drag = null;
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return { render, hexToRgba };
})();
