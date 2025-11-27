import { createToastMessage } from './global.js';

$(document).ready(function() {
    // Initialize tooltips for stat cells that already have title attributes (set server-side)
    const tooltipElements = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    tooltipElements.forEach(el => {
        new bootstrap.Tooltip(el);
    });
});