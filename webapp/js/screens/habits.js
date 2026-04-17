/**
 * PlanHabits — Habits Management Screen
 * CRUD for habits and categories.
 */

const HabitsScreen = (() => {
    let habits = [];
    let categories = [];

    async function load() {
        try {
            [habits, categories] = await Promise.all([
                API.getHabits(true),
                API.getCategories()
            ]);
            renderList();
        } catch (err) {
            console.error('Failed to load habits:', err);
            App.showToast('Failed to load habits', 'error');
        }
    }

    function renderList() {
        const container = document.getElementById('habits-manage-list');
        container.innerHTML = '';

        if (habits.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <h3>No habits yet</h3>
                    <p>Create your first habit to start tracking!</p>
                </div>
            `;
            return;
        }

        // Group by category
        const grouped = {};
        const uncategorized = [];

        habits.forEach(h => {
            if (h.category_id && h.category) {
                const catName = h.category.name;
                if (!grouped[catName]) grouped[catName] = { category: h.category, habits: [] };
                grouped[catName].habits.push(h);
            } else {
                uncategorized.push(h);
            }
        });

        // Render categorized habits
        Object.entries(grouped).forEach(([catName, group]) => {
            const section = document.createElement('div');
            section.innerHTML = `<h3 style="font-size:var(--font-size-sm);color:var(--text-secondary);font-weight:700;padding:var(--space-sm) 0;text-transform:uppercase;letter-spacing:0.5px;">${group.category.icon || '📁'} ${escapeHtml(catName)}</h3>`;
            group.habits.forEach(h => section.appendChild(renderHabitCard(h)));
            container.appendChild(section);
        });

        // Render uncategorized
        if (uncategorized.length > 0) {
            if (Object.keys(grouped).length > 0) {
                const label = document.createElement('h3');
                label.style.cssText = 'font-size:var(--font-size-sm);color:var(--text-secondary);font-weight:700;padding:var(--space-sm) 0;text-transform:uppercase;letter-spacing:0.5px;';
                label.textContent = '📌 Uncategorized';
                container.appendChild(label);
            }
            uncategorized.forEach(h => container.appendChild(renderHabitCard(h)));
        }
    }

    function renderHabitCard(habit) {
        const card = document.createElement('div');
        card.className = 'manage-habit-card' + (habit.is_archived ? ' archived' : '');
        if (habit.is_archived) card.style.opacity = '0.5';

        card.innerHTML = `
            <div class="manage-color-dot" style="background:${habit.color}"></div>
            <div class="manage-habit-info">
                <div class="manage-habit-name">${habit.icon || ''} ${escapeHtml(habit.name)}</div>
                <div class="manage-habit-details">
                    ${habit.default_duration_min}min default
                    ${habit.is_archived ? ' · 🗃 Archived' : ''}
                </div>
            </div>
            <div class="manage-habit-actions">
                <button class="btn-icon" data-action="edit" title="Edit">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                ${!habit.is_archived ? `
                <button class="btn-icon" data-action="archive" title="Archive" style="color:var(--accent-red);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
                ` : ''}
            </div>
        `;

        // Edit button
        card.querySelector('[data-action="edit"]').addEventListener('click', () => showHabitForm(habit));

        // Archive button
        const archiveBtn = card.querySelector('[data-action="archive"]');
        if (archiveBtn) {
            archiveBtn.addEventListener('click', async () => {
                if (confirm(`Archive "${habit.name}"? It will be hidden from planning.`)) {
                    await API.archiveHabit(habit.id);
                    App.showToast(`${habit.name} archived`, 'success');
                    await load();
                }
            });
        }

        return card;
    }

    function showHabitForm(existingHabit = null) {
        const isEdit = !!existingHabit;
        let selectedColor = existingHabit?.color || '#6C5CE7';
        let selectedDuration = existingHabit?.default_duration_min || 30;

        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">${isEdit ? '✏️ Edit Habit' : '➕ New Habit'}</h2>

            <div class="form-group">
                <label class="form-label">Habit Name</label>
                <input type="text" class="form-input" id="habit-name-input"
                    value="${isEdit ? escapeHtml(existingHabit.name) : ''}"
                    placeholder="e.g. Morning Run" maxlength="200" autofocus>
            </div>

            <div class="form-group">
                <label class="form-label">Icon (emoji)</label>
                <input type="text" class="form-input" id="habit-icon-input"
                    value="${existingHabit?.icon || ''}"
                    placeholder="🏃 (optional)" maxlength="4"
                    style="width:100px;">
            </div>

            <div class="form-group">
                <label class="form-label">Color</label>
                <div id="habit-color-picker"></div>
            </div>

            <div class="form-group">
                <label class="form-label">Default Duration</label>
                <div class="form-slider">
                    <input type="range" id="habit-duration-slider" min="5" max="240" step="5" value="${selectedDuration}">
                    <span class="slider-value" id="habit-duration-value">${selectedDuration}m</span>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Category</label>
                <select class="form-input form-select" id="habit-category-select">
                    <option value="">None</option>
                    ${categories.map(c => `<option value="${c.id}" ${existingHabit?.category_id === c.id ? 'selected' : ''}>${c.icon || ''} ${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <button class="btn-small" style="margin-top:var(--space-xs);" id="btn-new-category">+ New Category</button>
            </div>

            <div class="form-actions">
                <button class="btn-secondary" id="habit-form-cancel">Cancel</button>
                <button class="btn-primary" id="habit-form-save">${isEdit ? 'Save' : 'Create'}</button>
            </div>
        `;

        App.showModal(html);

        // Render color picker
        const pickerContainer = document.getElementById('habit-color-picker');
        const picker = ColorPicker.render(selectedColor, (color) => { selectedColor = color; });
        pickerContainer.appendChild(picker);

        // Duration slider
        const slider = document.getElementById('habit-duration-slider');
        const label = document.getElementById('habit-duration-value');
        slider.addEventListener('input', () => {
            selectedDuration = parseInt(slider.value);
            const h = Math.floor(selectedDuration / 60);
            const m = selectedDuration % 60;
            label.textContent = h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
        });

        // New category button
        document.getElementById('btn-new-category').addEventListener('click', () => {
            showCategoryForm();
        });

        // Cancel
        document.getElementById('habit-form-cancel').addEventListener('click', () => App.hideModal());

        // Save
        document.getElementById('habit-form-save').addEventListener('click', async () => {
            const name = document.getElementById('habit-name-input').value.trim();
            if (!name) {
                App.showToast('Please enter a habit name', 'error');
                return;
            }

            const data = {
                name,
                color: selectedColor,
                icon: document.getElementById('habit-icon-input').value.trim() || null,
                default_duration_min: selectedDuration,
                category_id: parseInt(document.getElementById('habit-category-select').value) || null,
            };

            try {
                if (isEdit) {
                    await API.updateHabit(existingHabit.id, data);
                    App.showToast('Habit updated!', 'success');
                } else {
                    await API.createHabit(data);
                    App.showToast('Habit created!', 'success');
                }
                App.hideModal();
                await load();
            } catch (err) {
                App.showToast('Failed to save habit', 'error');
            }
        });
    }

    function showCategoryForm() {
        const name = prompt('Category name:');
        if (!name) return;
        const icon = prompt('Category icon (emoji, optional):') || '';

        API.createCategory({ name: name.trim(), icon: icon.trim() || null })
            .then(async () => {
                categories = await API.getCategories();
                // Refresh the select
                const select = document.getElementById('habit-category-select');
                if (select) {
                    const options = `<option value="">None</option>` +
                        categories.map(c => `<option value="${c.id}">${c.icon || ''} ${escapeHtml(c.name)}</option>`).join('');
                    select.innerHTML = options;
                }
                App.showToast('Category created!', 'success');
            })
            .catch(() => App.showToast('Failed to create category', 'error'));
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Bind FAB button
    function init() {
        document.getElementById('btn-add-habit').addEventListener('click', () => showHabitForm());
    }

    return { load, init, showHabitForm };
})();
