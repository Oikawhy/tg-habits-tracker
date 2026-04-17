/**
 * PlanHabits — Statistics Screen
 * Weekly stats, per-habit breakdown, streaks, heatmap, and trend charts.
 */

const StatsScreen = (() => {
    let currentWeek = '';

    async function load(weekKey = null) {
        currentWeek = weekKey || TodayScreen.getWeekKey(new Date());
        document.getElementById('stats-week-label').textContent = currentWeek;

        const container = document.getElementById('stats-content');
        container.innerHTML = '<div style="text-align:center;padding:var(--space-2xl);color:var(--text-tertiary);">Loading stats...</div>';

        try {
            const [stats, streaks, heatmap, trends] = await Promise.all([
                API.getWeeklyStats(currentWeek),
                API.getStreaks(),
                API.getHeatmap(null, 3),
                API.getTrends(8)
            ]);

            renderStats(container, stats, streaks, heatmap, trends);
        } catch (err) {
            console.error('Failed to load stats:', err);
            container.innerHTML = '<div style="text-align:center;padding:var(--space-2xl);color:var(--accent-red);">Failed to load statistics</div>';
        }
    }

    function renderStats(container, stats, streaks, heatmap, trends) {
        container.innerHTML = '';

        // 1. Overview Card
        const overviewCard = createCard('📊 Overview');
        const overviewContent = document.createElement('div');
        overviewContent.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-md);';

        // Donut chart
        const donutWrap = document.createElement('div');
        donutWrap.style.cssText = 'flex:0 0 auto;display:flex;justify-content:center;';
        const donutCanvas = document.createElement('canvas');
        donutWrap.appendChild(donutCanvas);
        overviewContent.appendChild(donutWrap);

        // Stats numbers
        const numbersWrap = document.createElement('div');
        numbersWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;justify-content:center;gap:var(--space-sm);min-width:140px;';
        numbersWrap.innerHTML = `
            <div>
                <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">Completed</div>
                <div style="font-size:var(--font-size-lg);font-weight:800;">${stats.total_habits_done} / ${stats.total_habits_planned}</div>
            </div>
            <div>
                <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">Time Spent</div>
                <div style="font-size:var(--font-size-lg);font-weight:800;">${Charts.formatMinutes(stats.total_actual_minutes)}</div>
            </div>
            <div>
                <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">Goal ${stats.goal_met ? '✅' : '❌'}</div>
                <div style="font-size:var(--font-size-base);font-weight:600;">${Math.round(stats.overall_completion_rate * 100)}% / ${stats.goal_percent}%</div>
            </div>
            ${stats.best_day ? `
            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">
                📅 Best: <strong style="color:var(--accent-green);">${stats.best_day}</strong>
                · Worst: <strong style="color:var(--accent-red);">${stats.worst_day}</strong>
            </div>` : ''}
        `;
        overviewContent.appendChild(numbersWrap);
        overviewCard.appendChild(overviewContent);
        container.appendChild(overviewCard);

        // Draw donut after DOM insertion
        requestAnimationFrame(() => {
            Charts.drawDonut(donutCanvas, stats.overall_completion_rate, '#6C5CE7', 'Completion');
        });

        // 2. Per-Habit Breakdown
        if (stats.habit_stats && stats.habit_stats.length > 0) {
            const breakdownCard = createCard('📋 Per-Habit Breakdown');

            const chartWrap = document.createElement('div');
            chartWrap.className = 'stats-chart-container';
            const barCanvas = document.createElement('canvas');
            chartWrap.appendChild(barCanvas);
            breakdownCard.appendChild(chartWrap);

            // Also add individual rows
            stats.habit_stats.forEach(hs => {
                const row = document.createElement('div');
                row.className = 'stats-habit-row';
                const pct = Math.round(hs.completion_rate * 100);
                const statusEmoji = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌';

                row.innerHTML = `
                    <div class="stats-habit-color" style="background:${hs.habit_color}"></div>
                    <div class="stats-habit-name">${hs.habit_icon || ''} ${hs.habit_name}</div>
                    <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);">${hs.done_count}/${hs.done_count + hs.undone_count + hs.skipped_count}</div>
                    <div class="stats-habit-value">${statusEmoji} ${pct}%</div>
                `;
                breakdownCard.appendChild(row);
            });

            container.appendChild(breakdownCard);

            requestAnimationFrame(() => {
                Charts.drawHorizontalBars(barCanvas, stats.habit_stats);
            });
        }

        // 3. Streaks
        if (streaks && streaks.length > 0) {
            const streakCard = createCard('🔥 Streaks');

            const activeStreaks = streaks.filter(s => s.current_streak > 0);
            const sortedStreaks = [...streaks].sort((a, b) => b.current_streak - a.current_streak);

            if (activeStreaks.length === 0) {
                streakCard.innerHTML += '<p style="color:var(--text-tertiary);font-size:var(--font-size-sm);text-align:center;padding:var(--space-md);">No active streaks. Complete a habit to start one!</p>';
            }

            sortedStreaks.forEach(s => {
                const row = document.createElement('div');
                row.className = 'streak-row';
                row.innerHTML = `
                    <div class="streak-fire">${s.current_streak > 0 ? '🔥' : '💤'}</div>
                    <div class="streak-info">
                        <div class="streak-name" style="color:${s.habit_color};">${s.habit_icon || ''} ${s.habit_name}</div>
                        <div class="streak-detail">Best: ${s.best_streak} days ${s.freeze_available ? '🛡️' : ''}</div>
                    </div>
                    <div class="streak-count">${s.current_streak}</div>
                `;
                streakCard.appendChild(row);
            });

            container.appendChild(streakCard);
        }

        // 4. Trend Graph
        if (trends && trends.length >= 2) {
            const trendCard = createCard('📈 Weekly Trend');
            const trendWrap = document.createElement('div');
            trendWrap.className = 'stats-chart-container';
            const trendCanvas = document.createElement('canvas');
            trendWrap.appendChild(trendCanvas);
            trendCard.appendChild(trendWrap);
            container.appendChild(trendCard);

            requestAnimationFrame(() => {
                Charts.drawTrendLine(trendCanvas, trends);
            });
        }

        // 5. Heatmap
        const heatmapCard = createCard('📅 Activity Heatmap');
        const heatmapContainer = document.createElement('div');
        heatmapCard.appendChild(heatmapContainer);
        container.appendChild(heatmapCard);

        requestAnimationFrame(() => {
            Heatmap.render(heatmapContainer, heatmap);
        });
    }

    function createCard(title) {
        const card = document.createElement('div');
        card.className = 'stats-card';
        const titleEl = document.createElement('div');
        titleEl.className = 'stats-card-title';
        titleEl.textContent = title;
        card.appendChild(titleEl);
        return card;
    }

    function navigateWeek(delta) {
        const [year, weekNum] = currentWeek.split('-W').map(Number);
        let newWeek = weekNum + delta;
        let newYear = year;
        if (newWeek > 52) { newWeek = 1; newYear++; }
        if (newWeek < 1) { newWeek = 52; newYear--; }
        load(`${newYear}-W${String(newWeek).padStart(2, '0')}`);
    }

    function init() {
        document.getElementById('stats-prev').addEventListener('click', () => navigateWeek(-1));
        document.getElementById('stats-next').addEventListener('click', () => navigateWeek(1));
    }

    return { load, init };
})();
