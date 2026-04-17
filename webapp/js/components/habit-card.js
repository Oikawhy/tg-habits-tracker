/**
 * PlanHabits — Habit Card Component
 * Renders a single habit entry card for the day view.
 */

const HabitCard = (() => {

    function render(entry, streaks = []) {
        const habit = entry.habit || {};
        const color = habit.color || '#6C5CE7';
        const name = habit.name || 'Habit';
        const icon = habit.icon || '';
        const isDone = entry.status === 'done';
        const category = habit.category;

        // Find streak for this habit
        const streak = streaks.find(s => s.habit_id === habit.id);
        const streakCount = streak ? streak.current_streak : 0;

        const card = document.createElement('div');
        card.className = 'habit-card' + (isDone ? ' done' : '');
        card.style.setProperty('--habit-color', color);
        card.dataset.entryId = entry.id;

        card.innerHTML = `
            <button class="habit-checkbox" aria-label="Toggle ${name}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </button>
            <div class="habit-info">
                <div class="habit-name">${icon ? icon + ' ' : ''}${escapeHtml(name)}</div>
                <div class="habit-meta">
                    <span class="habit-time-badge">⏱ ${entry.planned_minutes || 30}min</span>
                    ${category ? `<span class="habit-category-badge">${category.icon || ''} ${escapeHtml(category.name)}</span>` : ''}
                    ${streakCount > 0 ? `<span class="habit-streak">🔥 ${streakCount}</span>` : ''}
                    ${entry.time_slot ? `<span class="habit-time-badge">🕐 ${entry.time_slot}</span>` : ''}
                </div>
            </div>
            <div class="habit-actions">
                <input type="number" class="habit-time-input"
                    value="${entry.actual_minutes || ''}"
                    placeholder="${entry.planned_minutes || 30}"
                    min="0" max="480"
                    aria-label="Actual minutes">
                <span class="habit-time-unit">min</span>
            </div>
        `;

        // Toggle done/undone
        const checkbox = card.querySelector('.habit-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const newStatus = isDone ? 'undone' : 'done';
            TodayScreen.toggleEntry(entry.id, newStatus);
        });

        // Actual minutes input — save on input (debounced), blur, or Enter
        const timeInput = card.querySelector('.habit-time-input');
        let debounceTimer = null;
        let lastSavedValue = entry.actual_minutes || '';

        function saveTime() {
            clearTimeout(debounceTimer);
            const mins = parseInt(timeInput.value) || 0;
            if (String(mins) !== String(lastSavedValue)) {
                lastSavedValue = mins;
                TodayScreen.updateEntryTime(entry.id, mins);
            }
        }

        timeInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(saveTime, 600);
        });

        timeInput.addEventListener('blur', saveTime);

        timeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                timeInput.blur();
            }
        });

        timeInput.addEventListener('click', (e) => e.stopPropagation());

        return card;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { render };
})();
