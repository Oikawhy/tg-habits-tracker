/**
 * PlanHabits — Habits Management Screen
 * CRUD for habits and categories with toggle-based FAB.
 */

const HabitsScreen = (() => {
    let habits = [];
    let categories = [];
    let menuOpen = false;

    const EMOJI_PRESETS = ['📚', '🏃', '💪', '🧘', '🎵', '🎨', '💻', '🍎', '💧', '😴', '🧹', '📝', '🌱', '🎯', '🧠', '❤️', '☀️', '🌙', '🏋️', '🚴'];

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

        // Render categories with edit/delete icons
        categories.forEach(cat => {
            const section = document.createElement('div');
            section.className = 'manage-category-section';

            const catHeader = document.createElement('div');
            catHeader.className = 'manage-category-header';
            catHeader.innerHTML = `
                <h3 class="manage-category-title">${cat.icon || '📁'} ${escapeHtml(cat.name)}</h3>
                <div class="manage-category-actions">
                    <button class="btn-icon btn-cat-edit" title="Edit category">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-cat-delete" title="Delete category" style="color:var(--accent-red);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            `;

            catHeader.querySelector('.btn-cat-edit').addEventListener('click', () => showCategoryForm(cat));
            catHeader.querySelector('.btn-cat-delete').addEventListener('click', () => confirmDeleteCategory(cat));

            section.appendChild(catHeader);

            const catHabits = habits.filter(h => h.category_id === cat.id);
            catHabits.forEach(h => section.appendChild(renderHabitCard(h)));

            if (catHabits.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'manage-cat-empty';
                empty.textContent = 'No habits in this category';
                section.appendChild(empty);
            }

            container.appendChild(section);
        });

        // Uncategorized habits
        const uncategorized = habits.filter(h => !h.category_id || !h.category);
        if (uncategorized.length > 0) {
            const section = document.createElement('div');
            section.className = 'manage-category-section';

            const catHeader = document.createElement('div');
            catHeader.className = 'manage-category-header';
            catHeader.innerHTML = '<h3 class="manage-category-title">📌 Uncategorized</h3>';
            section.appendChild(catHeader);

            uncategorized.forEach(h => section.appendChild(renderHabitCard(h)));
            container.appendChild(section);
        }

        if (habits.length === 0 && categories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <h3>No habits yet</h3>
                    <p>Tap + to create your first habit!</p>
                </div>
            `;
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

        card.querySelector('[data-action="edit"]').addEventListener('click', () => showHabitForm(habit));
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

    // ─── Toggle FAB Menu ───────────────────────────────────────────────────────

    function toggleMenu() {
        menuOpen = !menuOpen;
        const fabBtn = document.getElementById('btn-add-habit');
        const dropdown = document.getElementById('fab-dropdown');

        if (menuOpen) {
            fabBtn.classList.add('fab-active');
            dropdown.classList.remove('hidden');
        } else {
            fabBtn.classList.remove('fab-active');
            dropdown.classList.add('hidden');
        }
    }

    // ─── Category Form ─────────────────────────────────────────────────────────

    function showCategoryForm(existingCat = null) {
        const isEdit = !!existingCat;

        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">${isEdit ? '✏️ Edit Category' : '📁 New Category'}</h2>

            <div class="form-group">
                <label class="form-label">Category Name</label>
                <input type="text" class="form-input" id="cat-name-input"
                    value="${isEdit ? escapeHtml(existingCat.name) : ''}"
                    placeholder="e.g. Health, Work, Learning" maxlength="100" autofocus>
            </div>

            <div class="form-group">
                <label class="form-label">Icon (emoji)</label>
                <input type="text" class="form-input" id="cat-icon-input"
                    value="${existingCat?.icon || ''}"
                    placeholder="Pick below or type" maxlength="4"
                    style="width:140px;font-size:24px;text-align:center;">
                <div class="emoji-presets" id="cat-emoji-presets">
                    ${EMOJI_PRESETS.map(e => `<button class="emoji-preset-btn" data-emoji="${e}">${e}</button>`).join('')}
                </div>
            </div>

            <div class="form-actions">
                <button class="btn-secondary" id="cat-form-cancel">Cancel</button>
                <button class="btn-primary" id="cat-form-save">${isEdit ? 'Save' : 'Create'}</button>
            </div>
        `;

        App.showModal(html);

        // Emoji preset clicks
        document.querySelectorAll('.emoji-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('cat-icon-input').value = btn.dataset.emoji;
            });
        });

        document.getElementById('cat-form-cancel').addEventListener('click', () => App.hideModal());

        document.getElementById('cat-form-save').addEventListener('click', async () => {
            const name = document.getElementById('cat-name-input').value.trim();
            if (!name) {
                App.showToast('Please enter a category name', 'error');
                return;
            }

            const data = {
                name,
                icon: document.getElementById('cat-icon-input').value.trim() || null
            };

            try {
                if (isEdit) {
                    await API.updateCategory(existingCat.id, data);
                    App.showToast('Category updated!', 'success');
                } else {
                    await API.createCategory(data);
                    App.showToast('Category created!', 'success');
                }
                App.hideModal();
                await load();
            } catch (err) {
                App.showToast('Failed to save category', 'error');
            }
        });
    }

    // ─── Delete Category Confirmation ──────────────────────────────────────────

    async function confirmDeleteCategory(cat) {
        const catHabits = habits.filter(h => h.category_id === cat.id);

        if (catHabits.length === 0) {
            // No habits — just delete
            if (confirm(`Delete category "${cat.name}"?`)) {
                await API.deleteCategory(cat.id, false);
                App.showToast('Category deleted', 'success');
                await load();
            }
            return;
        }

        // Has habits — ask what to do
        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">⚠️ Delete "${escapeHtml(cat.name)}"?</h2>
            <p style="color:var(--text-secondary);margin-bottom:var(--space-lg);font-size:var(--font-size-sm);">
                This category has <strong>${catHabits.length}</strong> habit${catHabits.length > 1 ? 's' : ''}.
                What should happen to them?
            </p>
            <div class="form-actions" style="flex-direction:column;gap:var(--space-sm);">
                <button class="btn-primary" id="cat-del-keep" style="width:100%;">Keep habits (uncategorize)</button>
                <button class="btn-secondary btn-danger" id="cat-del-all" style="width:100%;">Delete all habits too</button>
                <button class="btn-secondary" id="cat-del-cancel" style="width:100%;">Cancel</button>
            </div>
        `;

        App.showModal(html);

        document.getElementById('cat-del-keep').addEventListener('click', async () => {
            await API.deleteCategory(cat.id, false);
            App.hideModal();
            App.showToast('Category deleted, habits kept', 'success');
            await load();
        });

        document.getElementById('cat-del-all').addEventListener('click', async () => {
            await API.deleteCategory(cat.id, true);
            App.hideModal();
            App.showToast('Category and habits deleted', 'success');
            await load();
        });

        document.getElementById('cat-del-cancel').addEventListener('click', () => App.hideModal());
    }

    // ─── Habit Form ────────────────────────────────────────────────────────────

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
                    placeholder="Pick below or type" maxlength="4"
                    style="width:140px;font-size:24px;text-align:center;">
                <div class="emoji-presets" id="habit-emoji-presets">
                    ${EMOJI_PRESETS.map(e => `<button class="emoji-preset-btn" data-emoji="${e}">${e}</button>`).join('')}
                </div>
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
            </div>

            <div class="form-actions">
                <button class="btn-secondary" id="habit-form-cancel">Cancel</button>
                <button class="btn-primary" id="habit-form-save">${isEdit ? 'Save' : 'Create'}</button>
            </div>
        `;

        App.showModal(html);

        // Emoji preset clicks
        document.querySelectorAll('#habit-emoji-presets .emoji-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('habit-icon-input').value = btn.dataset.emoji;
            });
        });

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

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // ─── Init ──────────────────────────────────────────────────────────────────

    function init() {
        document.getElementById('btn-add-habit').addEventListener('click', toggleMenu);
        document.getElementById('fab-add-category').addEventListener('click', () => {
            toggleMenu();
            showCategoryForm();
        });
        document.getElementById('fab-add-habit').addEventListener('click', () => {
            toggleMenu();
            showHabitForm();
        });
    }

    return { load, init, showHabitForm };
})();
