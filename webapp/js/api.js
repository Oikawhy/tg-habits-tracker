/**
 * PlanHabits — API Client
 * Fetch wrapper for all backend API calls.
 * Sends Telegram initData header for authentication.
 */

const API = (() => {
    const BASE = '/api';

    async function request(method, path, body = null, params = {}) {
        const url = new URL(BASE + path, window.location.origin);

        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined) url.searchParams.set(k, v);
        });

        const headers = { 'Content-Type': 'application/json' };

        // Send Telegram initData for authentication (signed by Telegram)
        const initData = window.Telegram?.WebApp?.initData;
        if (initData) {
            headers['X-Telegram-InitData'] = initData;
        } else {
            // Dev fallback — only works when BOT_TOKEN is unset on server
            if (App && App.userId) {
                url.searchParams.set('user_id', App.userId);
            }
        }

        const options = { method, headers };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }

        try {
            const resp = await fetch(url.toString(), options);
            if (resp.status === 204) return null;
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${resp.status}`);
            }
            return await resp.json();
        } catch (err) {
            console.error(`API ${method} ${path}:`, err);
            throw err;
        }
    }

    return {
        // Users
        registerUser: (data) => request('POST', '/users', data),
        updateUser: (userId, data) => request('PUT', `/users/${userId}`, data),

        // Habits
        getHabits: (includeArchived = false) =>
            request('GET', '/habits', null, { include_archived: includeArchived }),
        getHabit: (id) => request('GET', `/habits/${id}`),
        createHabit: (data) => request('POST', '/habits', data),
        updateHabit: (id, data) => request('PUT', `/habits/${id}`, data),
        deleteHabit: (id) => request('DELETE', `/habits/${id}`),

        // Categories
        getCategories: () => request('GET', '/categories'),
        createCategory: (data) => request('POST', '/categories', data),
        updateCategory: (id, data) => request('PUT', `/categories/${id}`, data),
        deleteCategory: (id, deleteHabits = false) => request('DELETE', `/categories/${id}`, null, { delete_habits: deleteHabits }),

        // Week Plans
        getPlans: (week) => request('GET', '/plans', null, { week }),
        createPlan: (data) => request('POST', '/plans', data),
        updatePlan: (id, data) => request('PUT', `/plans/${id}`, data),
        deletePlan: (id) => request('DELETE', `/plans/${id}`),
        copyPlans: (fromWeek, toWeek) =>
            request('POST', '/plans/copy', null, { from_week: fromWeek, to_week: toWeek }),

        // Day Entries
        getEntries: (date) => request('GET', '/entries', null, { date }),
        syncEntries: (date) => request('POST', '/entries/sync', null, { date }),
        updateEntry: (id, data) => request('PUT', `/entries/${id}`, data),
        generateEntries: (date) => request('POST', '/entries/generate', null, { date }),
        useFreeze: (habitId, week) =>
            request('POST', '/entries/freeze', null, { habit_id: habitId, week }),

        // Statistics
        getWeeklyStats: (week) => request('GET', '/stats/weekly', null, { week }),
        getStreaks: () => request('GET', '/stats/streaks'),
        getHeatmap: (habitId = null, months = 3) =>
            request('GET', '/stats/heatmap', null, { habit_id: habitId, months }),
        getTrends: (weeks = 8) => request('GET', '/stats/trends', null, { weeks }),

        // Dashboard (aggregated endpoint — replaces sync + entries + streaks + weekly + day dots)
        getDashboard: (date) => request('GET', '/dashboard', null, { date }),
    };
})();
