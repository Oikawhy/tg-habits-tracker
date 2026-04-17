/**
 * PlanHabits — Today Screen
 * Displays today's habits with timeline, cards, and done/undone toggling.
 */

const TodayScreen = (() => {
    let currentEntries = [];
    let currentStreaks = [];
    let currentDate = null;

    async function load(dateStr = null) {
        currentDate = dateStr || formatDate(new Date());
        const container = document.getElementById('habits-list');
        const timelineContainer = document.getElementById('timeline-container');
        const emptyState = document.getElementById('empty-state');
        const goalBar = document.getElementById('weekly-goal-bar');

        try {
            // Fetch entries and streaks in parallel
            const [entries, streaks] = await Promise.all([
                API.getEntries(currentDate),
                API.getStreaks().catch(() => [])
            ]);

            currentEntries = entries;
            currentStreaks = streaks;

            if (entries.length === 0) {
                container.innerHTML = '';
                timelineContainer.innerHTML = '';
                emptyState.classList.remove('hidden');
                goalBar.style.display = 'none';
                return;
            }

            emptyState.classList.add('hidden');
            goalBar.style.display = 'block';

            // Render timeline
            Timeline.render(entries, timelineContainer);

            // Render habit cards
            container.innerHTML = '';
            entries.forEach(entry => {
                const card = HabitCard.render(entry, streaks);
                container.appendChild(card);
            });

            // Update weekly goal
            await updateWeeklyGoal();

        } catch (err) {
            console.error('Failed to load today:', err);
            App.showToast('Failed to load habits', 'error');
        }
    }

    async function toggleEntry(entryId, newStatus) {
        try {
            const entry = currentEntries.find(e => e.id === entryId);
            if (!entry) return;

            // Optimistic UI update
            const card = document.querySelector(`.habit-card[data-entry-id="${entryId}"]`);
            if (card) {
                if (newStatus === 'done') {
                    card.classList.add('done');
                    // Haptic feedback if available
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    }
                } else {
                    card.classList.remove('done');
                }
            }

            // Update via API
            const updateData = { status: newStatus };
            if (newStatus === 'done' && !entry.actual_minutes) {
                updateData.actual_minutes = entry.planned_minutes;
            }

            await API.updateEntry(entryId, updateData);

            // Reload to get updated streaks and timeline
            await load(currentDate);

        } catch (err) {
            console.error('Failed to toggle entry:', err);
            App.showToast('Failed to update', 'error');
            await load(currentDate);
        }
    }

    async function updateEntryTime(entryId, minutes) {
        try {
            await API.updateEntry(entryId, {
                actual_minutes: minutes,
                planned_minutes: minutes
            });
        } catch (err) {
            console.error('Failed to update time:', err);
        }
    }

    async function updateWeeklyGoal() {
        try {
            const weekKey = getWeekKey(new Date(currentDate));
            const stats = await API.getWeeklyStats(weekKey);

            const rate = stats.overall_completion_rate || 0;
            const goal = stats.goal_percent || 80;
            const pct = Math.round(rate * 100);

            document.getElementById('goal-value').textContent = `${pct}% / ${goal}%`;
            document.getElementById('goal-fill').style.width = `${Math.min(pct, 100)}%`;

            // Change color based on progress
            const fill = document.getElementById('goal-fill');
            if (pct >= goal) {
                fill.style.background = 'linear-gradient(90deg, var(--accent-green), #55EFC4)';
            } else if (pct >= goal * 0.5) {
                fill.style.background = 'linear-gradient(90deg, var(--accent-orange), var(--accent-orange))';
            } else {
                fill.style.background = 'linear-gradient(90deg, var(--primary), var(--primary-light))';
            }
        } catch (err) {
            console.error('Failed to load weekly goal:', err);
        }
    }

    function getCurrentDate() {
        return currentDate;
    }

    // ─── Date Utilities ────────────────────────────────────────────────────

    function formatDate(d) {
        return d.toISOString().slice(0, 10);
    }

    function getWeekKey(d) {
        // ISO week number calculation
        const date = new Date(d);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
        const week1 = new Date(date.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    }

    return { load, toggleEntry, updateEntryTime, getCurrentDate, getWeekKey, formatDate };
})();
