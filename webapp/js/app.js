/**
 * PlanHabits — Main Application
 * SPA router, Telegram integration, state management, and initialization.
 */

const App = (() => {
    let userId = null;
    let currentScreen = 'today';
    let selectedDate = null;
    let quotes = [];
    let telegramTheme = 'dark';

    const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // ─── Initialization ────────────────────────────────────────────────────

    async function init() {
        // 1. Initialize Telegram WebApp
        initTelegram();

        // 2. Get user ID from Telegram initData (source of truth)
        userId = getUserId();
        if (!userId) {
            // Dev fallback — hardcoded test ID, NOT from URL params
            console.warn('No Telegram user — using dev user ID');
            userId = 12345;
        }

        // 3. Register user
        try {
            const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
            await API.registerUser({
                id: userId,
                first_name: tgUser?.first_name || 'Test',
                last_name: tgUser?.last_name || 'User',
                username: tgUser?.username || 'testuser'
            });
        } catch (err) {
            console.warn('User registration failed:', err);
        }

        // 4. Load quotes
        try {
            const resp = await fetch('/assets/quotes.json');
            quotes = await resp.json();
        } catch (e) {
            quotes = [{ text: "The secret of getting ahead is getting started.", author: "Mark Twain" }];
        }
        showDailyQuote();

        // 5. Initialize screens
        HabitsScreen.init();
        PlannerScreen.init();
        StatsScreen.init();
        setupThemeToggle();

        // 6. Setup navigation
        setupNavigation();
        setupDayPicker();

        // 7. Load today
        selectedDate = formatDate(new Date());
        await TodayScreen.load(selectedDate);

        // 8. Hide loading, show app
        const loading = document.getElementById('loading-screen');
        loading.classList.add('fade-out');
        setTimeout(() => {
            loading.style.display = 'none';
            document.getElementById('app').style.display = 'flex';
        }, 400);

        // 9. Update header
        updateHeader();
    }

    // ─── Telegram Integration ──────────────────────────────────────────────

    function initTelegram() {
        if (!window.Telegram?.WebApp) return;

        const tg = Telegram.WebApp;
        tg.ready();
        tg.expand();

        // Apply Telegram theme
        applyTheme(tg.themeParams);

        // Listen for theme changes
        tg.onEvent('themeChanged', () => {
            applyTheme(tg.themeParams);
        });

        // Back button
        tg.BackButton.onClick(() => {
            if (currentScreen !== 'today') {
                navigate('today');
            }
        });
    }

    function applyTheme(params) {
        if (!params) return;

        const isDark = params.bg_color
            ? isColorDark(params.bg_color)
            : true;

        // Store Telegram's theme preference (can be overridden by user)
        telegramTheme = isDark ? 'dark' : 'light';

        // Only apply if user hasn't manually chosen a theme
        try {
            if (localStorage.getItem('ph-theme')) return;
        } catch(e) {}

        document.documentElement.setAttribute('data-theme', telegramTheme);

        // Override CSS vars with Telegram colors
        const root = document.documentElement.style;
        if (params.bg_color) root.setProperty('--bg-primary', params.bg_color);
        if (params.secondary_bg_color) root.setProperty('--bg-secondary', params.secondary_bg_color);
        if (params.text_color) root.setProperty('--text-primary', params.text_color);
        if (params.hint_color) root.setProperty('--text-secondary', params.hint_color);
        if (params.button_color) root.setProperty('--primary', params.button_color);
    }

    function clearInlineTheme() {
        const root = document.documentElement.style;
        root.removeProperty('--bg-primary');
        root.removeProperty('--bg-secondary');
        root.removeProperty('--text-primary');
        root.removeProperty('--text-secondary');
        root.removeProperty('--primary');
        root.removeProperty('color-scheme');
    }

    function isColorDark(hex) {
        if (!hex) return true;
        hex = hex.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
    }

    function getUserId() {
        if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            return Telegram.WebApp.initDataUnsafe.user.id;
        }
        return null;
    }

    // ─── Theme Toggle ────────────────────────────────────────────────────────────

    function setupThemeToggle() {
        const btn = document.getElementById('btn-settings');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'light' ? 'dark' : 'light';

            // IMPORTANT: Clear all inline CSS var overrides from Telegram/applyTheme
            // so [data-theme="light"] CSS selectors can take effect
            clearInlineTheme();

            document.documentElement.setAttribute('data-theme', next);

            // Save preference
            try { localStorage.setItem('ph-theme', next); } catch(e) {}

            App.showToast(`${next === 'dark' ? '🌙' : '☀️'} ${next.charAt(0).toUpperCase() + next.slice(1)} mode`, 'success');

            // Re-render current screen so canvas charts redraw with new theme colors
            if (currentScreen === 'stats') StatsScreen.reRender();
            else if (currentScreen === 'today') TodayScreen.load(selectedDate);
        });

        // Restore saved theme
        try {
            const saved = localStorage.getItem('ph-theme');
            if (saved) {
                clearInlineTheme();
                document.documentElement.setAttribute('data-theme', saved);
            }
        } catch(e) {}
    }

    // ─── Navigation ────────────────────────────────────────────────────────

    function setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const screen = btn.dataset.screen;
                navigate(screen);
            });
        });
    }

    function navigate(screen) {
        if (screen === currentScreen) return;

        currentScreen = screen;

        // Update nav buttons
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.screen === screen);
        });

        // Show/hide screens
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const targetScreen = document.getElementById(`screen-${screen}`);
        if (targetScreen) targetScreen.classList.add('active');

        // Show/hide screen-specific elements
        const dayPicker = document.getElementById('day-picker');
        const quoteBanner = document.getElementById('quote-banner');
        const goalBar = document.getElementById('weekly-goal-bar');

        dayPicker.style.display = (screen === 'today') ? 'block' : 'none';
        quoteBanner.style.display = (screen === 'today') ? 'block' : 'none';
        // Goal bar hidden by default — TodayScreen.load() shows it when entries exist
        if (goalBar && screen !== 'today') goalBar.style.display = 'none';

        // Show FAB only on Habits screen — set immediately to prevent position jump
        const fabContainer = document.getElementById('fab-container');
        if (fabContainer) fabContainer.style.display = (screen === 'habits') ? 'flex' : 'none';

        // Telegram back button
        if (window.Telegram?.WebApp?.BackButton) {
            if (screen !== 'today') {
                Telegram.WebApp.BackButton.show();
            } else {
                Telegram.WebApp.BackButton.hide();
            }
        }

        // Load screen data
        switch (screen) {
            case 'today':
                TodayScreen.load(selectedDate);
                break;
            case 'habits':
                HabitsScreen.load();
                break;
            case 'planner':
                PlannerScreen.load();
                break;
            case 'stats':
                StatsScreen.load();
                break;
        }

        updateHeader();
    }

    // ─── Day Picker ────────────────────────────────────────────────────────

    function setupDayPicker() {
        renderDayPicker();
    }

    async function renderDayPicker() {
        const strip = document.getElementById('day-picker-strip');
        strip.innerHTML = '';

        const today = new Date();
        // Get Monday of current week
        const currentDay = today.getDay() || 7; // Mon=1, Sun=7
        const monday = new Date(today);
        monday.setDate(today.getDate() - (currentDay - 1));

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const dateStr = formatDate(d);
            const isToday = dateStr === formatDate(today);
            const isActive = dateStr === selectedDate;

            const chip = document.createElement('button');
            chip.className = 'day-chip' +
                (isActive ? ' active' : '') +
                (isToday ? ' today' : '');
            chip.dataset.date = dateStr;

            chip.innerHTML = `
                <span class="day-chip-name">${DAY_NAMES_SHORT[i]}</span>
                <span class="day-chip-date">${d.getDate()}</span>
                <div class="day-chip-dots" id="dots-${dateStr}"></div>
            `;

            chip.addEventListener('click', () => selectDate(dateStr));
            strip.appendChild(chip);

            // Load dots (habit colors for this day) async
            loadDayDots(dateStr);
        }
    }

    async function loadDayDots(dateStr) {
        try {
            const entries = await API.getEntries(dateStr);
            const dotsContainer = document.getElementById(`dots-${dateStr}`);
            if (!dotsContainer) return;

            dotsContainer.innerHTML = '';
            const shownEntries = entries.slice(0, 4); // Max 4 dots
            shownEntries.forEach(entry => {
                const dot = document.createElement('div');
                dot.className = 'day-chip-dot';
                const color = entry.habit?.color || '#6C5CE7';
                dot.style.background = entry.status === 'done' ? color : 'var(--text-tertiary)';
                dotsContainer.appendChild(dot);
            });

            // Show completion % if there are entries
            if (entries.length > 0) {
                const done = entries.filter(e => e.status === 'done').length;
                const chip = dotsContainer.closest('.day-chip');
                if (chip && !chip.querySelector('.day-chip-progress')) {
                    const progress = document.createElement('span');
                    progress.className = 'day-chip-progress';
                    progress.textContent = `${Math.round(done / entries.length * 100)}%`;
                    chip.appendChild(progress);
                }
            }
        } catch (e) {
            // Silently ignore
        }
    }

    function selectDate(dateStr) {
        selectedDate = dateStr;

        // Update day picker UI
        document.querySelectorAll('.day-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.date === dateStr);
        });

        // Load the selected day
        TodayScreen.load(dateStr);
        updateHeader();
    }

    // ─── Header ────────────────────────────────────────────────────────────

    function updateHeader() {
        const title = document.getElementById('header-title');
        const subtitle = document.getElementById('header-subtitle');
        const backBtn = document.getElementById('btn-back');

        const screenTitles = {
            today: 'Today',
            habits: 'My Goals',
            planner: 'Week Planner',
            stats: 'Statistics'
        };

        title.textContent = screenTitles[currentScreen] || 'PlanHabits';

        if (currentScreen === 'today' && selectedDate) {
            const d = new Date(selectedDate + 'T00:00:00');
            const today = formatDate(new Date());
            if (selectedDate === today) {
                title.textContent = 'Today';
            } else {
                title.textContent = DAY_NAMES_FULL[d.getDay() === 0 ? 6 : d.getDay() - 1];
            }
            subtitle.textContent = d.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });
        } else {
            subtitle.textContent = '';
        }

        // Show back button when not on today
        if (currentScreen !== 'today') {
            backBtn.classList.remove('hidden');
            backBtn.onclick = () => navigate('today');
        } else {
            backBtn.classList.add('hidden');
        }
    }

    // ─── Quote ─────────────────────────────────────────────────────────────

    function showDailyQuote() {
        if (!quotes.length) return;
        // Use day of year as index
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now - start) / 86400000);
        const quote = quotes[dayOfYear % quotes.length];

        const el = document.getElementById('quote-text');
        if (el && quote) {
            el.textContent = `"${quote.text}" — ${quote.author}`;
        }
    }

    // ─── Modal ─────────────────────────────────────────────────────────────

    function showModal(html) {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        content.innerHTML = html;
        overlay.classList.remove('hidden');

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) hideModal();
        };
    }

    function hideModal() {
        const overlay = document.getElementById('modal-overlay');
        overlay.classList.add('hidden');
    }

    // ─── Toast ─────────────────────────────────────────────────────────────

    function showToast(message, type = 'info') {
        // Remove existing toast
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 2500);
    }

    // ─── Utilities ─────────────────────────────────────────────────────────

    function formatDate(d) {
        return d.toISOString().slice(0, 10);
    }

    // ─── Public API ────────────────────────────────────────────────────────

    return {
        get userId() { return userId; },
        init,
        navigate,
        showModal,
        hideModal,
        showToast,
        selectDate,
        formatDate,
        navigate,
    };
})();

// ─── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(err => {
        console.error('App initialization failed:', err);
        document.getElementById('loading-screen').innerHTML = `
            <div style="text-align:center;padding:40px;color:#FF6B6B;">
                <h2>⚠️ Failed to load</h2>
                <p style="margin-top:8px;color:rgba(255,255,255,0.6);">${err.message}</p>
                <button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;background:#6C5CE7;color:white;border:none;border-radius:12px;font-weight:600;cursor:pointer;">Retry</button>
            </div>
        `;
    });
});
