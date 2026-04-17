/**
 * PlanHabits — Color Picker Component
 */

const ColorPicker = (() => {
    const PRESET_COLORS = [
        '#6C5CE7', '#A29BFE', '#0984E3', '#74B9FF',
        '#00CEC9', '#00B894', '#55EFC4', '#FDCB6E',
        '#E17055', '#FF6B6B', '#FD79A8', '#E84393',
        '#636E72', '#2D3436', '#DFE6E9', '#B2BEC3',
        '#D63031', '#E74C3C', '#F39C12', '#27AE60',
        '#2980B9', '#8E44AD', '#1ABC9C', '#F1C40F',
    ];

    function render(selectedColor = '#6C5CE7', onChange = null) {
        const container = document.createElement('div');
        container.className = 'color-picker-grid';

        PRESET_COLORS.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch' + (color === selectedColor ? ' selected' : '');
            swatch.style.background = color;
            swatch.setAttribute('data-color', color);
            swatch.setAttribute('aria-label', `Color ${color}`);

            swatch.addEventListener('click', () => {
                container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                if (onChange) onChange(color);
            });

            container.appendChild(swatch);
        });

        return container;
    }

    function getSelected(container) {
        const selected = container.querySelector('.color-swatch.selected');
        return selected ? selected.dataset.color : '#6C5CE7';
    }

    return { render, getSelected, PRESET_COLORS };
})();
