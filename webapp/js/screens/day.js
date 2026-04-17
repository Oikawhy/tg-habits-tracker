/**
 * PlanHabits — Day Screen (same component as Today, for navigating other days)
 * This module is a thin wrapper — TodayScreen handles all day rendering.
 * The day picker component is managed by App.
 */

const DayScreen = (() => {

    async function load(dateStr) {
        await TodayScreen.load(dateStr);
    }

    return { load };
})();
