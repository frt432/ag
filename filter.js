(function () {
    'use strict';

    // Твои кастомные года
    var customYears = [
        '2027',
        '2026-2027',
        '2025-2027',
        '2024-2027',
        '2023-2027'
    ];

    // Твои кастомные рейтинги (с шагом 0.5)
    var customRatings = [
        '5', '5.5', '6', '6.5', 
        '7', '7.5', '8', '8.5', '9'
    ];

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            // Подменяем метод рендера фильтров, чтобы внедрить свои значения
            var originalFilterRender = Lampa.Filter.prototype.render;
            
            Lampa.Filter.prototype.render = function () {
                var renderResult = originalFilterRender.apply(this, arguments);
                
                // Находим массивы с годами и рейтингами в текущем инстансе фильтра и заменяем их
                if (this.arrays) {
                    if (this.arrays.years) {
                        this.arrays.years = customYears;
                    }
                    if (this.arrays.rating) {
                        // В Lampa рейтинг обычно передается как vote_average
                        this.arrays.rating = customRatings; 
                    }
                }
                return renderResult;
            };
            
            console.log('Lampa Custom Filters Plugin loaded!');
        }
    });
})();
