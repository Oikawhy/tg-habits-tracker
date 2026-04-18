/**
 * PlanHabits — Today Screen
 * Displays today's habits with timeline, cards, and done/undone toggling.
 */

const TodayScreen = (() => {
    let currentEntries = [];
    let currentStreaks = [];
    let currentDate = null;
    let lastDashboard = null; // Cached for week strip + goal updates

    async function load(dateStr = null) {
        currentDate = dateStr || formatDate(new Date());
        const container = document.getElementById('habits-list');
        const timelineContainer = document.getElementById('timeline-container');
        const emptyState = document.getElementById('empty-state');
        const goalBar = document.getElementById('weekly-goal-bar');

        try {
            // Single aggregated API call — replaces sync + entries + streaks + weeklyStats
            const dashboard = await API.getDashboard(currentDate);
            lastDashboard = dashboard;

            currentEntries = dashboard.entries;
            currentStreaks = dashboard.streaks;

            if (currentEntries.length === 0) {
                container.innerHTML = '';
                timelineContainer.innerHTML = '';
                emptyState.classList.remove('hidden');
                goalBar.style.display = 'none';
                const goalFill = document.getElementById('goal-fill');
                const goalValue = document.getElementById('goal-value');
                if (goalFill) goalFill.style.width = '0%';
                if (goalValue) goalValue.textContent = '0% / 100%';
                // Still update week strip from dashboard data
                if (typeof App !== 'undefined' && App.updateWeekStrip) {
                    App.updateWeekStrip(dashboard.week_strip);
                }
                return;
            }

            emptyState.classList.add('hidden');
            goalBar.style.display = 'block';

            // Render timeline
            Timeline.render(currentEntries, timelineContainer);

            // Render habit cards
            container.innerHTML = '';
            currentEntries.forEach(entry => {
                const card = HabitCard.render(entry, currentStreaks);
                container.appendChild(card);
            });

            // Update weekly goal from dashboard data (no extra API call)
            updateGoalBarFromDashboard(dashboard.weekly_goal);

            // Update week strip dots from dashboard data (no 7 separate API calls)
            if (typeof App !== 'undefined' && App.updateWeekStrip) {
                App.updateWeekStrip(dashboard.week_strip);
            }

        } catch (err) {
            console.error('Failed to load today:', err);
            App.showToast('Failed to load habits', 'error');
        }
    }

    async function toggleEntry(entryId, newStatus) {
        try {
            const entry = currentEntries.find(e => e.id === entryId);
            if (!entry) return;

            // 1. Optimistic UI update
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

            // 2. Update local state immediately
            entry.status = newStatus;
            if (newStatus === 'done' && !entry.actual_minutes) {
                entry.actual_minutes = entry.planned_minutes;
            }

            // 3. Update goal bar from local data (instant)
            updateGoalBarLocally();

            // 4. Re-render timeline with updated local data
            const timelineContainer = document.getElementById('timeline-container');
            if (timelineContainer) {
                Timeline.render(currentEntries, timelineContainer);
            }

            // 5. Fire API call in background — no await load()
            const updateData = { status: newStatus };
            if (newStatus === 'done' && !entry.actual_minutes) {
                updateData.actual_minutes = entry.planned_minutes;
            }

            API.updateEntry(entryId, updateData).catch(err => {
                console.error('Failed to save toggle, reverting:', err);
                App.showToast('Failed to update', 'error');
                // Revert on failure
                load(currentDate);
            });

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
                    // Match on habit_id + day + time_slot to handle duplicate habits
                    const matchingPlan = plans.find(p =>
                        p.habit_id === entry.habit_id && p.day_of_week === isoDow &&
                        (p.time_slot || null) === (entry.time_slot || null)
                    ) || plans.find(p =>
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

    function updateGoalBarFromDashboard(goalData) {
        try {
            const rate = goalData.completion_rate || 0;
            const goal = goalData.goal_percent || 100;
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
            console.error('Failed to update goal bar:', err);
        }
    }

    function updateGoalBarLocally() {
        if (!currentEntries.length) return;
        const done = currentEntries.filter(e => e.status === 'done').length;
        const total = currentEntries.length;
        const pct = Math.round(done / total * 100);
        const goal = 100;

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
                    const plans = await API.getPlanssCached(weekKey);
                    // Match on OLD time_slot to find the correct plan for duplicate habits
                    const oldTimeSlot = entry.time_slot;
                    const matchingPlan = plans.find(p =>
                        p.habit_id === entry.habit_id && p.day_of_week === isoDow &&
                        (p.time_slot || null) === (oldTimeSlot || null)
                    ) || plans.find(p =>
                        p.habit_id === entry.habit_id && p.day_of_week === isoDow
                    );
                    if (matchingPlan) {
                        await API.updatePlan(matchingPlan.id, { time_slot: newTimeSlot });
                        API.invalidatePlanCache(weekKey);
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
