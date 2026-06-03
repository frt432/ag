(function () {
    'use strict';

    // Проверка настроек
    function isTriggerOn(key, def) {
        var v = Lampa.Storage.get(key, def);
        return (v === true || v === 'true' || v === '1' || v === 1);
    }
    function isColoredRatingsPosterOn() {
        return isTriggerOn('colored_ratings_poster', true);
    }
    
    // Цвета текста оценок
    function getRatingColor(value, isPercent) {
        if (isTriggerOn('rating_colored_windows', false)) return '#fff';
        if (!isColoredRatingsPosterOn()) return '#fff';
        var v = parseFloat(String(value).replace('%', '').replace(',', '.'));
        if (isNaN(v) || v <= 0) return '#fff';
        
        var red = isPercent ? 40 : 3;
        var orange = isPercent ? 60 : 6;
        var blue = isPercent ? 80 : 8;

        if (v <= red) return '#ff4d4d';
        if (v < orange) return '#ff9933';
        if (v < blue) return '#66a3ff';
        return '#66ff66';
    }

    // Цвета фона плашек (если включены цветные окна)
    function getRatingBackgroundColor(value, isPercent) {
        if (!isTriggerOn('rating_colored_windows', false)) return 'rgba(0,0,0,0.7)';
        var alpha = 1 - (parseFloat(Lampa.Storage.get('rating_window_opacity', '0')) / 100);
        var v = parseFloat(String(value).replace('%', '').replace(',', '.'));
        if (isNaN(v) || v <= 0) return 'rgba(0,0,0,' + alpha + ')';
        
        var red = isPercent ? 40 : 3;
        var orange = isPercent ? 60 : 6;
        var blue = isPercent ? 80 : 8;

        if (v <= red) return 'rgba(180,0,0,' + alpha + ')';
        if (v < orange) return 'rgba(200,120,0,' + alpha + ')';
        if (v < blue) return 'rgba(70,130,180,' + alpha + ')';
        return 'rgba(80,180,0,' + alpha + ')';
    }

    function formatRating(value) {
        var n = parseFloat(value);
        if (isNaN(n)) return '0.0';
        if (n === 10) return '10';
        return n.toFixed(1);
    }

    // Запрос рейтингов IMDb и Томатов через универсальный fetch
    function getExtendedRatings(item, callback) {
        var imdbId = item.imdb_id || (item.external_ids && item.external_ids.imdb_id);
        
        if (!imdbId) {
            // Если у TMDB карточки нет IMDb ID, пробуем достучаться до external_ids
            var type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
            var extUrl = 'https://api.themoviedb.org/3/' + type + '/' + item.id + '/external_ids?api_key=4ef0d7355d9ffb5151e98d0b4d11e305';
            
            fetch(extUrl)
                .then(function(r) { return r.json(); })
                .then(function(resIds) {
                    if (resIds && resIds.imdb_id) {
                        fetchOmdb(resIds.imdb_id, callback);
                    } else {
                        callback({ imdb: item.vote_average || 0, rt_critics: 0, rt_fans: 0 });
                    }
                })
                .catch(function() {
                    callback({ imdb: item.vote_average || 0, rt_critics: 0, rt_fans: 0 });
                });
        } else {
            fetchOmdb(imdbId, callback);
        }
    }

    function fetchOmdb(imdbId, callback) {
        var omdbUrl = 'https://img.mdblist.com/api/?apikey=9g8g7g6g5g4g3g2g1g&imdb=' + imdbId;
        fetch(omdbUrl)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var rt_c = 0, rt_f = 0;
                var imdb_v = parseFloat(data.imdb_rating || 0);
                
                if (data.ratings && Array.isArray(data.ratings)) {
                    data.ratings.forEach(function (r) {
                        if (r.source === 'Rotten Tomatoes') rt_c = parseInt(r.value) || 0;
                        if (r.source === 'Rotten Tomatoes Audience') rt_f = parseInt(r.value) || 0;
                    });
                }
                callback({ imdb: imdb_v, rt_critics: rt_c, rt_fans: rt_f });
            })
            .catch(function() {
                callback({ imdb: 0, rt_critics: 0, rt_fans: 0 });
            });
    }

    // Позиционирование плашек по настройкам Лампы
    function getPositionStyle() {
        var pos = Lampa.Storage.get('rating_position', 'bottom');
        var ox = parseFloat(Lampa.Storage.get('rating_offset_x', '0')) || 0;
        var oy = parseFloat(Lampa.Storage.get('rating_offset_y', '0')) || 0;
        var rightVal = (0.3 - ox) + 'em';
        if (pos === 'bottom') return 'right:' + rightVal + ';bottom:' + (0.3 - oy) + 'em;top:auto;left:auto;';
        return 'right:' + rightVal + ';top:' + (0.3 + oy) + 'em;bottom:auto;left:auto;';
    }

    // Отрендерить плашки на постере (Раздельный режим)
    function renderSeparateRatings(card, data) {
        var parent = card.querySelector('.card__view') || card;
        parent.style.position = 'relative';

        // Удаляем старые плашки, если они были
        var oldWrap = parent.querySelector('.custom-rate-wrap');
        if (oldWrap) oldWrap.remove();

        var wrapper = document.createElement('div');
        wrapper.className = 'custom-rate-wrap';
        wrapper.style.cssText = 'position:absolute;z-index:10;display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:bold;font-family:sans-serif;' + getPositionStyle();

        var tmdbR = data.vote_average ? data.vote_average.toFixed(1) : '0.0';

        getExtendedRatings(data, function(res) {
            var scores = [
                { label: 'IMDb', val: res.imdb, isPct: false, str: formatRating(res.imdb) },
                { label: 'TMDB', val: parseFloat(tmdbR), isPct: false, str: formatRating(tmdbR) },
                { label: '🍅', val: res.rt_critics, isPct: true, str: res.rt_critics + '%' },
                { label: '🍿', val: res.rt_fans, isPct: true, str: res.rt_fans + '%' }
            ];

            scores.forEach(function(item) {
                if (item.val > 0) {
                    var el = document.createElement('div');
                    el.style.cssText = 'padding:3px 5px;border-radius:4px;color:#fff;text-shadow:1px 1px 1px #000;white-space:nowrap;';
                    el.style.background = getRatingBackgroundColor(item.val, item.isPct);
                    
                    if (item.isPct) {
                        el.innerHTML = '<span style="color:' + getRatingColor(item.val, true) + '">' + item.label + ' ' + item.str + '</span>';
                    } else {
                        el.innerHTML = '<span style="color:' + getRatingColor(item.val, false) + '">' + item.str + '</span> <small style="font-size:0.7em;opacity:0.8;">' + item.label + '</small>';
                    }
                    wrapper.appendChild(el);
                }
            });

            if (wrapper.children.length > 0) {
                parent.appendChild(wrapper);
            }
        });
    }

    // Слушатель Лампы на появление карточек на экране
    Lampa.Listener.follow('card', function (e) {
        if (e.type === 'visible' && e.data && e.data.id) {
            // Даем Лампе время отрисовать постер, затем вешаем оценки
            setTimeout(function() {
                renderSeparateRatings(e.element, e.data);
            }, 100);
        }
    });

})();
