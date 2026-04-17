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
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                        Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    }
                } else {
                    card.classList.remove('done');
                }
            }

            const updateData = { status: newStatus };
            if (newStatus === 'done' && !entry.actual_minutes) {
                updateData.actual_minutes = entry.planned_minutes;
            }

            await API.updateEntry(entryId, updateData);
            await load(currentDate);

        } catch (err) {
            console.error('Failed to toggle entry:', err);
            App.showToast('Failed to update', 'error');
            await load(currentDate);
        }
    }

    async function updateEntryTime(entryId, minutes) {
        try {
            // 1. Update the DayEntry
            await API.updateEntry(entryId, {
                actual_minutes: minutes,
                planned_minutes: minutes
            });

            // 2. Also update corresponding WeekPlan so planner reflects the change
            const entry = currentEntries.find(e => e.id === entryId);
            if (entry) {
                // Update local data so timeline re-renders correctly
                entry.planned_minutes = minutes;
                entry.actual_minutes = minutes;

                const weekKey = getWeekKey(new Date(entry.entry_date));
                const dayOfWeek = new Date(entry.entry_date).getDay();
                const isoDow = dayOfWeek === 0 ? 7 : dayOfWeek;

                try {
                    const plans = await API.getPlans(weekKey);
                    const matchingPlan = plans.find(p =>
                        p.habit_id === entry.habit_id && p.day_of_week === isoDow
                    );
                    if (matchingPlan) {
                        await API.updatePlan(matchingPlan.id, { planned_minutes: minutes });
                    }
                } catch (planErr) {
                    console.warn('Could not sync plan:', planErr);
                }

                // 3. Update badge + re-render timeline immediately
                const card = document.querySelector(`.habit-card[data-entry-id="${entryId}"]`);
                if (card) {
                    const badge = card.querySelector('.habit-time-badge');
                    if (badge) badge.textContent = `⏱ ${minutes}min`;
                }

                const timelineContainer = document.getElementById('timeline-container');
                if (timelineContainer) {
                    Timeline.render(currentEntries, timelineContainer);
                }
            }

            App.showToast('Time saved!', 'success');
        } catch (err) {
            console.error('Failed to update time:', err);
            App.showToast('Failed to save time', 'error');
        }
    }

    async function updateWeeklyGoal() {
        try {
            const weekKey = getWeekKey(new Date(currentDate));
            const stats = await API.getWeeklyStats(weekKey);

            const rate = stats.overall_completion_rate || 0;
            const goal = stats.goal_percent || 100;
            const pct = Math.round(rate * 100);

            document.getElementById('goal-value').textContent = `${pct}% / ${goal}%`;
            document.getElementById('goal-fill').style.width = `${Math.min(pct, 100)}%`;

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

    function formatDate(d) {
        return d.toISOString().slice(0, 10);
    }

    function getWeekKey(d) {
        const date = new Date(d);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
        const week1 = new Date(date.getFullYear(), 0, 4);
        const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    }

    async function updateEntryTimeSlot(entryId, newTimeSlot) {
        try {
            // 1. Update the DayEntry time_slot
            await API.updateEntry(entryId, { time_slot: newTimeSlot });

            // 2. Sync to WeekPlan
            const entry = currentEntries.find(e => e.id === entryId);
            if (entry) {
                entry.time_slot = newTimeSlot;

                const weekKey = getWeekKey(new Date(entry.entry_date));
                const dayOfWeek = new Date(entry.entry_date).getDay();
                const isoDow = dayOfWeek === 0 ? 7 : dayOfWeek;

                try {
                    const plans = await API.getPlans(weekKey);
                    const matchingPlan = plans.find(p =>
                        p.habit_id === entry.habit_id && p.day_of_week === isoDow
                    );
                    if (matchingPlan) {
                        await API.updatePlan(matchingPlan.id, { time_slot: newTimeSlot });
                    }
                } catch (planErr) {
                    console.warn('Could not sync plan time:', planErr);
                }
            }

            App.showToast(`Moved to ${newTimeSlot}`, 'success');
            await load(currentDate);
        } catch (err) {
            console.error('Failed to update time slot:', err);
            App.showToast('Failed to move habit', 'error');
            await load(currentDate);
        }
    }

    return { load, toggleEntry, updateEntryTime, updateEntryTimeSlot, getCurrentDate, getWeekKey, formatDate };
})();
