import { settings, setTooltipTheme } from './global.js';

$(document).ready(function() {
    // Initialize tooltips for stat cells with valid percentages
    const tooltipElements = document.querySelectorAll('[data-tooltip-pct]');
    tooltipElements.forEach(el => {
        const pct = el.getAttribute('data-tooltip-pct');
        if (pct && pct.trim() !== '') {
            el.setAttribute('data-bs-toggle', 'tooltip');
            el.setAttribute('data-bs-placement', 'right');
            el.setAttribute('title', `${pct}%`);
            new bootstrap.Tooltip(el);
        }
    });

    setTooltipTheme(settings.isBackgroundLight);
});