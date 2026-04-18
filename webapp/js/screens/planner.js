/**
 * PlanHabits — Week Planner Screen
 * Cards grid (3/row) to assign habits to days with per-day time slots.
 */

const PlannerScreen = (() => {
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let currentWeek = '';
    let plans = [];
    let habits = [];

    // Auto-format text input as HH:MM
    function setupTimeInput(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('input', () => {
            let v = input.value.replace(/[^0-9]/g, '');
            if (v.length > 4) v = v.slice(0, 4);
            if (v.length >= 3) {
                v = v.slice(0, 2) + ':' + v.slice(2);
            }
            input.value = v;
        });
        input.addEventListener('blur', () => {
            const val = input.value.trim();
            if (!val) return;
            const parts = val.split(':');
            if (parts.length === 2) {
                let h = parseInt(parts[0]) || 0;
                let m = parseInt(parts[1]) || 0;
                h = Math.min(Math.max(h, 0), 23);
                m = Math.min(Math.max(m, 0), 59);
                input.value = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            } else {
                input.value = '';
            }
        });
    }

    async function load(weekKey = null) {
        currentWeek = weekKey || TodayScreen.getWeekKey(new Date());
        document.getElementById('planner-week-label').textContent = currentWeek;

        try {
            [plans, habits] = await Promise.all([
                API.getPlans(currentWeek),
                API.getHabits()
            ]);
            renderGrid();
        } catch (err) {
            console.error('Failed to load planner:', err);
            App.showToast('Failed to load planner', 'error');
        }
    }

    function renderGrid() {
        const container = document.getElementById('planner-grid');
        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'planner-cards-grid';

        for (let day = 1; day <= 7; day++) {
            const card = document.createElement('div');
            card.className = 'planner-day-card';

            // Header
            const header = document.createElement('div');
            header.className = 'planner-day-header';
            header.innerHTML = `
                <span class="planner-day-name">${DAY_FULL[day - 1]}</span>
                <span class="planner-day-short">${DAY_NAMES[day - 1]}</span>
            `;
            card.appendChild(header);

            // Plans for THIS day — each plan is its own row with its own time/duration
            const dayPlans = plans.filter(p => p.day_of_week === day);
            const body = document.createElement('div');
            body.className = 'planner-day-body';

            if (dayPlans.length === 0) {
                body.innerHTML = '<div class="planner-day-empty">No goals</div>';
            }

            dayPlans.forEach(plan => {
                const habit = plan.habit || {};
                const chip = document.createElement('div');
                chip.className = 'planner-habit-chip';
                chip.style.setProperty('--chip-color', habit.color || '#6C5CE7');

                chip.innerHTML = `
                    <div class="chip-color-bar" style="background:${habit.color || '#6C5CE7'}"></div>
                    <div class="chip-info">
                        <div class="chip-name">${escapeHtml(habit.icon || '')} ${escapeHtml((habit.name || '').slice(0, 16))}</div>
                        <div class="chip-meta">${plan.planned_minutes}min${plan.time_slot ? ' · ' + escapeHtml(plan.time_slot) : ''}</div>
                    </div>
                    <button class="chip-remove" title="Remove">×</button>
                `;

                // Edit on click
                chip.querySelector('.chip-info').addEventListener('click', () => showEditPlanModal(plan, day));

                // Remove button
                chip.querySelector('.chip-remove').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removePlan(plan);
                });

                body.appendChild(chip);
            });

            card.appendChild(body);

            // Add button at bottom of each card
            const addBtn = document.createElement('button');
            addBtn.className = 'planner-day-add';
            addBtn.innerHTML = '+ Add goal';
            addBtn.addEventListener('click', () => showAddToDayModal(day));
            card.appendChild(addBtn);

            grid.appendChild(card);
        }

        container.appendChild(grid);
    }

    function showAddToDayModal(day) {
        const availableHabits = habits.filter(h => !h.is_archived);

        if (availableHabits.length === 0) {
            App.showToast('Create goals first!', 'error');
            return;
        }

        let selectedHabitId = availableHabits[0].id;
        let selectedMinutes = availableHabits[0].default_duration_min;

        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">Add to ${DAY_FULL[day - 1]}</h2>

            <div class="form-group">
                <label class="form-label">Habit</label>
                <select class="form-input form-select" id="plan-habit-select">
                    ${availableHabits.map(h => `<option value="${h.id}" data-duration="${h.default_duration_min}">${h.icon || ''} ${escapeHtml(h.name)}</option>`).join('')}
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">Duration (min)</label>
                <div class="form-slider">
                    <input type="range" id="plan-duration" min="5" max="240" step="5" value="${selectedMinutes}">
                    <span class="slider-value" id="plan-duration-value">${selectedMinutes}m</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Time Slot (optional)</label>
                <input type="text" class="form-input time-text-input" id="plan-time-slot" value="" placeholder="HH:MM" maxlength="5" inputmode="numeric">
            </div>

            <div class="form-actions">
                <button class="btn-secondary" id="plan-cancel">Cancel</button>
                <button class="btn-primary" id="plan-save">Add</button>
            </div>
        `;

        App.showModal(html);

        setupTimeInput('plan-time-slot');

        document.getElementById('plan-habit-select').addEventListener('change', (e) => {
            selectedHabitId = parseInt(e.target.value);
            const opt = e.target.selectedOptions[0];
            const dur = parseInt(opt.dataset.duration) || 30;
            document.getElementById('plan-duration').value = dur;
            document.getElementById('plan-duration-value').textContent = dur + 'm';
        });

        document.getElementById('plan-duration').addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            const h = Math.floor(v / 60);
            const m = v % 60;
            document.getElementById('plan-duration-value').textContent = h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
        });

        document.getElementById('plan-cancel').addEventListener('click', () => App.hideModal());

        document.getElementById('plan-save').addEventListener('click', async () => {
            const habitId = parseInt(document.getElementById('plan-habit-select').value);
            const minutes = parseInt(document.getElementById('plan-duration').value);
            const timeSlot = document.getElementById('plan-time-slot').value || null;

            try {
                // Each day gets its own plan row — no shared state
                await API.createPlan({
                    habit_id: habitId,
                    week_key: currentWeek,
                    day_of_week: day,
                    planned_minutes: minutes,
                    time_slot: timeSlot
                });
                App.hideModal();
                App.showToast('Added to plan!', 'success');
                await load(currentWeek);
            } catch (err) {
                console.error('Plan save error:', err);
                App.showToast('Failed to add plan', 'error');
            }
        });
    }

    function showEditPlanModal(plan, day) {
        const habit = plan.habit || {};
        let minutes = plan.planned_minutes;
        let timeSlot = plan.time_slot || '';

        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">${escapeHtml(habit.icon || '')} ${escapeHtml(habit.name || 'Habit')}</h2>
            <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-md);">
                ${DAY_FULL[day - 1]} · Week ${currentWeek}
            </p>

            <div class="form-group">
                <label class="form-label">Duration (min)</label>
                <div class="form-slider">
                    <input type="range" id="edit-plan-duration" min="5" max="240" step="5" value="${minutes}">
                    <span class="slider-value" id="edit-plan-duration-value">${minutes}m</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Time Slot</label>
                <input type="text" class="form-input time-text-input" id="edit-plan-time" value="${timeSlot}" placeholder="HH:MM" maxlength="5" inputmode="numeric">
            </div>

            <div class="form-actions">
                <button class="btn-secondary btn-danger" id="edit-plan-remove">Remove</button>
                <button class="btn-secondary" id="edit-plan-cancel">Cancel</button>
                <button class="btn-primary" id="edit-plan-save">Save</button>
            </div>
        `;

        App.showModal(html);

        setupTimeInput('edit-plan-time');

        document.getElementById('edit-plan-duration').addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            const h = Math.floor(v / 60);
            const m = v % 60;
            document.getElementById('edit-plan-duration-value').textContent = h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
        });

        document.getElementById('edit-plan-remove').addEventListener('click', async () => {
            await removePlan(plan);
            App.hideModal();
        });

        document.getElementById('edit-plan-cancel').addEventListener('click', () => App.hideModal());

        document.getElementById('edit-plan-save').addEventListener('click', async () => {
            const newMinutes = parseInt(document.getElementById('edit-plan-duration').value);
            const newTime = document.getElementById('edit-plan-time').value || null;

            try {
                await API.updatePlan(plan.id, {
                    planned_minutes: newMinutes,
                    time_slot: newTime
                });
                App.hideModal();
                App.showToast('Updated!', 'success');
                await load(currentWeek);
            } catch (err) {
                console.error('Plan update error:', err);
                App.showToast('Failed to update', 'error');
            }
        });
    }

    async function removePlan(plan) {
        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">🗑 Remove from plan?</h2>
            <p style="color:var(--text-secondary);margin-bottom:var(--space-lg);font-size:var(--font-size-sm);">
                This habit will be removed from this day's plan.
            </p>
            <div class="form-actions">
                <button class="btn-secondary" id="del-plan-cancel">Cancel</button>
                <button class="btn-primary btn-danger" id="del-plan-yes">Remove</button>
            </div>
        `;
        App.showModal(html);
        document.getElementById('del-plan-cancel').addEventListener('click', () => App.hideModal());
        document.getElementById('del-plan-yes').addEventListener('click', async () => {
            try {
                await API.deletePlan(plan.id);
                API.invalidatePlanCache(currentWeek);
                App.hideModal();
                App.showToast('Removed', 'success');
                await load(currentWeek);
            } catch (err) {
                App.showToast('Failed to remove', 'error');
            }
        });
    }

    async function copyFromLastWeek() {
        const [year, weekNum] = currentWeek.split('-W').map(Number);
        let prevWeek;
        if (weekNum <= 1) {
            prevWeek = `${year - 1}-W52`;
        } else {
            prevWeek = `${year}-W${String(weekNum - 1).padStart(2, '0')}`;
        }

        try {
            await API.copyPlans(prevWeek, currentWeek);
            App.showToast('Copied from last week!', 'success');
            await load(currentWeek);
        } catch (err) {
            App.showToast('Failed to copy', 'error');
        }
    }

    function navigateWeek(delta) {
        const [year, weekNum] = currentWeek.split('-W').map(Number);
        let newWeek = weekNum + delta;
        let newYear = year;
        if (newWeek > 52) { newWeek = 1; newYear++; }
        if (newWeek < 1) { newWeek = 52; newYear--; }
        load(`${newYear}-W${String(newWeek).padStart(2, '0')}`);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function init() {
        document.getElementById('planner-prev').addEventListener('click', () => navigateWeek(-1));
        document.getElementById('planner-next').addEventListener('click', () => navigateWeek(1));
        document.getElementById('planner-copy').addEventListener('click', copyFromLastWeek);
    }

    return { load, init, navigateWeek };
})();
