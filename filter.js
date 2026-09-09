(function () {
    'use strict';

    var customYears = [
        '2027',
        '2026-2027',
        '2025-2027',
        '2024-2027',
        '2023-2027'
    ];

    var customRatings = [
        '5',
        '5.5',
        '6',
        '6.5',
        '7',
        '7.5',
        '8',
        '8.5',
        '9'
    ];

    Lampa.Listener.follow('app', function (e) {
        if (e.type !== 'ready') return;

        var originalRender = Lampa.Filter.prototype.render;

        Lampa.Filter.prototype.render = function () {

            // Меняем значения ДО оригинального рендера
            if (this.arrays) {

                if (Array.isArray(this.arrays.years)) {
                    this.arrays.years = customYears.slice();
                }

                if (Array.isArray(this.arrays.rating)) {
                    this.arrays.rating = customRatings.slice();
                }

                // На случай, если в этой версии Lampa рейтинг называется vote_average
                if (Array.isArray(this.arrays.vote_average)) {
                    this.arrays.vote_average = customRatings.slice();
                }
            }

            return originalRender.apply(this, arguments);
        };

        console.log('[Custom Filters] loaded');
    });
})();
