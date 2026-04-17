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

    function truncName(name, max = 20) {
        return name && name.length > max ? name.slice(0, max) + '…' : (name || '');
    }

    function renderList() {
        const container = document.getElementById('habits-manage-list');
        container.innerHTML = '';

        // Render categories with edit/delete icons
        categories.forEach(cat => {
            const section = document.createElement('div');
            section.className = 'manage-category-section';
            section.dataset.categoryId = cat.id;

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

            const habitsContainer = document.createElement('div');
            habitsContainer.className = 'manage-habits-drop-zone';
            habitsContainer.dataset.categoryId = cat.id;

            const catHabits = habits.filter(h => h.category_id === cat.id);
            catHabits.forEach(h => habitsContainer.appendChild(renderHabitCard(h)));

            if (catHabits.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'manage-cat-empty';
                empty.textContent = 'No habits in this category';
                habitsContainer.appendChild(empty);
            }

            section.appendChild(habitsContainer);
            container.appendChild(section);
        });

        // Uncategorized habits — always show as a drop zone
        const uncatSection = document.createElement('div');
        uncatSection.className = 'manage-category-section';
        uncatSection.dataset.categoryId = 'none';

        const uncatHeader = document.createElement('div');
        uncatHeader.className = 'manage-category-header';
        uncatHeader.innerHTML = '<h3 class="manage-category-title">📌 Uncategorized</h3>';
        uncatSection.appendChild(uncatHeader);

        const uncatZone = document.createElement('div');
        uncatZone.className = 'manage-habits-drop-zone';
        uncatZone.dataset.categoryId = 'none';

        const uncategorized = habits.filter(h => !h.category_id || !h.category);
        uncategorized.forEach(h => uncatZone.appendChild(renderHabitCard(h)));

        if (uncategorized.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'manage-cat-empty';
            empty.textContent = 'Drop habits here to uncategorize';
            uncatZone.appendChild(empty);
        }

        uncatSection.appendChild(uncatZone);
        container.appendChild(uncatSection);

        if (habits.length === 0 && categories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎯</div>
                    <h3>No habits yet</h3>
                    <p>Tap + to create your first habit!</p>
                </div>
            `;
        }

        // Setup drag after rendering
        setupHabitDrag(container);
    }

    function renderHabitCard(habit) {
        const card = document.createElement('div');
        card.className = 'manage-habit-card' + (habit.is_archived ? ' archived' : '');
        card.dataset.habitId = habit.id;
        if (habit.is_archived) card.style.opacity = '0.5';

        card.innerHTML = `
            <div class="manage-drag-handle">⠿</div>
            <div class="manage-color-dot" style="background:${habit.color}"></div>
            <div class="manage-habit-info">
                <div class="manage-habit-name">${habit.icon || ''} ${escapeHtml(truncName(habit.name))}</div>
                <div class="manage-habit-details">
                    ${habit.default_duration_min}min default
                </div>
            </div>
            <div class="manage-habit-actions">
                <button class="btn-icon" data-action="edit" title="Edit">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon" data-action="delete" title="Delete" style="color:var(--accent-red);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        `;

        card.querySelector('[data-action="edit"]').addEventListener('click', () => showHabitForm(habit));
        card.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDeleteHabit(habit));

        return card;
    }

    // ─── Drag Habits Between Categories ────────────────────────────────────────

    function setupHabitDrag(container) {
        let dragCard = null;
        let placeholder = null;
        let startY = 0;
        let offsetY = 0;
        let longPressTimer = null;
        let isDragging = false;

        container.querySelectorAll('.manage-drag-handle').forEach(handle => {
            handle.addEventListener('touchstart', (e) => onDragStart(e, handle), { passive: true });
            handle.addEventListener('mousedown', (e) => onDragStart(e, handle));
        });

        function getY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }

        function onDragStart(e, handle) {
            const card = handle.closest('.manage-habit-card');
            if (!card) return;

            startY = getY(e);
            longPressTimer = setTimeout(() => {
                isDragging = true;
                dragCard = card;

                // Create placeholder
                placeholder = document.createElement('div');
                placeholder.className = 'manage-habit-placeholder';
                placeholder.style.height = card.offsetHeight + 'px';
                card.parentElement.insertBefore(placeholder, card);

                // Float the card
                const rect = card.getBoundingClientRect();
                offsetY = startY - rect.top;
                card.classList.add('manage-card-dragging');
                card.style.position = 'fixed';
                card.style.top = rect.top + 'px';
                card.style.left = rect.left + 'px';
                card.style.width = rect.width + 'px';
                card.style.zIndex = '1000';

                if (window.Telegram?.WebApp?.HapticFeedback) {
                    Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
            }, 250);
        }

        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('mousemove', onDragMove);

        function onDragMove(e) {
            if (!isDragging || !dragCard) {
                if (longPressTimer && Math.abs(getY(e) - startY) > 8) {
                    clearTimeout(longPressTimer);
                }
                return;
            }
            e.preventDefault();

            const y = getY(e);
            dragCard.style.top = (y - offsetY) + 'px';

            // Highlight the drop zone we're over
            const zones = container.querySelectorAll('.manage-habits-drop-zone');
            zones.forEach(zone => zone.classList.remove('drop-zone-active'));

            const target = getDropZoneAt(y, zones);
            if (target) {
                target.classList.add('drop-zone-active');
            }
        }

        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('mouseup', onDragEnd);

        function onDragEnd(e) {
            clearTimeout(longPressTimer);
            if (!isDragging || !dragCard) return;

            const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
            const zones = container.querySelectorAll('.manage-habits-drop-zone');
            const targetZone = getDropZoneAt(y, zones);

            // Clean up visuals
            dragCard.classList.remove('manage-card-dragging');
            dragCard.style.position = '';
            dragCard.style.top = '';
            dragCard.style.left = '';
            dragCard.style.width = '';
            dragCard.style.zIndex = '';
            zones.forEach(z => z.classList.remove('drop-zone-active'));

            if (placeholder && placeholder.parentElement) {
                placeholder.parentElement.removeChild(placeholder);
            }

            const habitId = parseInt(dragCard.dataset.habitId);

            if (targetZone) {
                const newCatId = targetZone.dataset.categoryId;
                const newCategoryId = newCatId === 'none' ? null : parseInt(newCatId);

                // Find current category of the habit
                const habit = habits.find(h => h.id === habitId);
                const currentCatId = habit ? habit.category_id : null;

                if (newCategoryId !== currentCatId) {
                    moveHabitToCategory(habitId, newCategoryId);
                }
            }

            isDragging = false;
            dragCard = null;
            placeholder = null;
        }

        function getDropZoneAt(y, zones) {
            for (const zone of zones) {
                const rect = zone.getBoundingClientRect();
                if (y >= rect.top && y <= rect.bottom) {
                    return zone;
                }
            }
            return null;
        }
    }

    async function moveHabitToCategory(habitId, categoryId) {
        try {
            await API.updateHabit(habitId, { category_id: categoryId });
            App.showToast(categoryId ? 'Habit moved!' : 'Habit uncategorized', 'success');
            await load();
        } catch (err) {
            console.error('Failed to move habit:', err);
            App.showToast('Failed to move habit', 'error');
        }
    }

    // ─── Delete Habit Confirmation ─────────────────────────────────────────────

    function confirmDeleteHabit(habit) {
        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">🗑 Delete habit?</h2>
            <p style="color:var(--text-secondary);margin-bottom:var(--space-lg);font-size:var(--font-size-sm);">
                "${escapeHtml(truncName(habit.name, 30))}" will be permanently deleted.
            </p>
            <div class="form-actions">
                <button class="btn-secondary" id="del-habit-cancel">Cancel</button>
                <button class="btn-primary btn-danger" id="del-habit-yes">Yes, delete</button>
            </div>
        `;

        App.showModal(html);

        document.getElementById('del-habit-cancel').addEventListener('click', () => App.hideModal());
        document.getElementById('del-habit-yes').addEventListener('click', async () => {
            try {
                await API.deleteHabit(habit.id);
                App.hideModal();
                App.showToast('Habit deleted', 'success');
                await load();
            } catch (err) {
                App.showToast('Failed to delete', 'error');
            }
        });
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
                <input type="text" class="form-input emoji-input" id="cat-icon-input"
                    value="${existingCat?.icon || ''}"
                    placeholder="Pick below or type" maxlength="4">
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
            const html = `
                <div class="modal-handle"></div>
                <h2 class="modal-title">🗑 Delete category?</h2>
                <p style="color:var(--text-secondary);margin-bottom:var(--space-lg);font-size:var(--font-size-sm);">
                    "${escapeHtml(cat.name)}" will be deleted.
                </p>
                <div class="form-actions">
                    <button class="btn-secondary" id="cat-del-cancel">Cancel</button>
                    <button class="btn-primary btn-danger" id="cat-del-yes">Yes, delete</button>
                </div>
            `;
            App.showModal(html);
            document.getElementById('cat-del-cancel').addEventListener('click', () => App.hideModal());
            document.getElementById('cat-del-yes').addEventListener('click', async () => {
                await API.deleteCategory(cat.id, false);
                App.hideModal();
                App.showToast('Category deleted', 'success');
                await load();
            });
            return;
        }

        const html = `
            <div class="modal-handle"></div>
            <h2 class="modal-title">⚠️ Delete "${escapeHtml(cat.name)}"?</h2>
            <p style="color:var(--text-secondary);margin-bottom:var(--space-lg);font-size:var(--font-size-sm);">
                This category has <strong>${catHabits.length}</strong> habit${catHabits.length > 1 ? 's' : ''}.
                Delete all habits from this category?
            </p>
            <div class="form-actions" style="flex-direction:column;gap:var(--space-sm);">
                <button class="btn-primary" id="cat-del-keep" style="width:100%;">No, keep habits (uncategorize)</button>
                <button class="btn-secondary btn-danger" id="cat-del-all" style="width:100%;">Yes, delete all habits too</button>
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
                <input type="text" class="form-input emoji-input" id="habit-icon-input"
                    value="${existingHabit?.icon || ''}"
                    placeholder="🏃 (optional)" maxlength="4">
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
                <div class="custom-dropdown" id="habit-category-dropdown">
                    <div class="custom-dropdown-selected" id="habit-cat-selected">
                        <span id="habit-cat-selected-text">None</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                    <div class="custom-dropdown-options hidden" id="habit-cat-options">
                        <div class="custom-dropdown-option selected" data-value="">None</div>
                        ${categories.map(c => `<div class="custom-dropdown-option" data-value="${c.id}">${c.icon || ''} ${escapeHtml(c.name)}</div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="form-actions">
                <button class="btn-secondary" id="habit-form-cancel">Cancel</button>
                <button class="btn-primary" id="habit-form-save">${isEdit ? 'Save' : 'Create'}</button>
            </div>
        `;

        App.showModal(html);

        // Custom category dropdown logic
        let selectedCategoryId = existingHabit?.category_id || null;

        // Set initial selected value
        if (selectedCategoryId) {
            const cat = categories.find(c => c.id === selectedCategoryId);
            if (cat) {
                document.getElementById('habit-cat-selected-text').textContent = `${cat.icon || ''} ${cat.name}`;
                document.querySelectorAll('.custom-dropdown-option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.value === String(selectedCategoryId));
                });
            }
        }

        document.getElementById('habit-cat-selected').addEventListener('click', () => {
            document.getElementById('habit-cat-options').classList.toggle('hidden');
        });

        document.querySelectorAll('#habit-cat-options .custom-dropdown-option').forEach(opt => {
            opt.addEventListener('click', () => {
                selectedCategoryId = opt.dataset.value ? parseInt(opt.dataset.value) : null;
                document.getElementById('habit-cat-selected-text').textContent = opt.textContent;
                document.getElementById('habit-cat-options').classList.add('hidden');
                document.querySelectorAll('#habit-cat-options .custom-dropdown-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });

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
                category_id: selectedCategoryId,
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
