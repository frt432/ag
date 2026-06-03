(function () {
    'use strict';

    Lampa.Platform.tv();

    function isTriggerOn(key, def) {
        var v = Lampa.Storage.get(key, def);
        return (v === true || v === 'true' || v === '1' || v === 1);
    }
    function isColoredRatingsPosterOn() {
        return isTriggerOn('colored_ratings_poster', true);
    }
    function getRatingColor(value, isPercent) {
        if (isTriggerOn('rating_colored_windows', false)) return '#fff';
        if (!isColoredRatingsPosterOn()) return '#fff';
        var v = parseFloat(String(value).replace('%', '').replace(',', '.'));
        if (isNaN(v) || v <= 0) return '#fff';
        
        var red = isPercent ? 40 : 3;
        var orange = isPercent ? 60 : 6;
        var blue = isPercent ? 80 : 8;

        if (v <= red) return 'red';
        if (v < orange) return 'orange';
        if (v < blue) return 'cornflowerblue';
        return 'lawngreen';
    }

    function getRatingBackgroundColor(value, isPercent) {
        if (!isTriggerOn('rating_colored_windows', false)) return '';
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

    var CACHE_TTL = 24 * 60 * 60 * 1000;
    function loadPersistentCache(source) {
        var stored = null;
        try { stored = Lampa.Storage.get('rating_cache_' + source, null); } catch (e) {}
        return stored && typeof stored === 'object' ? stored : {};
    }

    var _savePending = {};
    function debouncedSave(source, cache) {
        if (_savePending[source]) return;
        _savePending[source] = true;
        setTimeout(function () {
            _savePending[source] = false;
            try { Lampa.Storage.set('rating_cache_' + source, cache); } catch (e) {}
        }, 2000);
    }

    var ratingCache = {
        caches: {},
        get: function (source, key) {
            var cache = this.caches[source] || (this.caches[source] = loadPersistentCache(source));
            var data = cache[key];
            if (!data) return null;
            if (Date.now() - data.timestamp > CACHE_TTL) {
                delete cache[key];
                debouncedSave(source, cache);
                return null;
            }
            return data;
        },
        set: function (source, key, value) {
            var cache = this.caches[source] || (this.caches[source] = loadPersistentCache(source));
            value.timestamp = Date.now();
            cache[key] = value;
            debouncedSave(source, cache);
            return value;
        }
    };

    function getExtendedRatings(item, callback) {
        var cached = ratingCache.get('ext_rating', item.id);
        if (cached) { callback(cached); return; }

        var imdbId = item.imdb_id || (item.external_ids && item.external_ids.imdb_id);
        if (!imdbId) { 
            var imdb_fallback = item.imdb_rating || item.ratingImdb || 0;
            callback({ imdb: imdb_fallback, rt_critics: 0, rt_fans: 0 });
            return; 
        }

        var url = 'https://api.themoviedb.org/3/' + (item.media_type || (item.first_air_date ? 'tv' : 'movie')) + '/' + item.id + '/external_ids?api_key=4ef0d7355d9ffb5151e98d0b4d11e305';
        
        var reqIds = new Lampa.Reguest();
        reqIds.silent(url, function(resIds) {
            var realImdb = resIds.imdb_id || imdbId;
            if (!realImdb) { callback({ imdb: 0, rt_critics: 0, rt_fans: 0 }); return; }

            var omdbUrl = 'https://img.mdblist.com/api/?apikey=9g8g7g6g5g4g3g2g1g&imdb=' + realImdb; 
            var reqOmdb = new Lampa.Reguest();
            reqOmdb.timeout(6000);
            reqOmdb.silent(omdbUrl, function (data) {
                var rt_c = 0, rt_f = 0, imdb_v = parseFloat(data.imdb_rating || item.imdb_rating || item.ratingImdb || 0);
                if (data.ratings && Array.isArray(data.ratings)) {
                    data.ratings.forEach(function (r) {
                        if (r.source === 'Rotten Tomatoes') rt_c = parseInt(r.value) || 0;
                        if (r.source === 'Rotten Tomatoes Audience') rt_f = parseInt(r.value) || 0;
                    });
                }
                var finalRes = ratingCache.set('ext_rating', item.id, { imdb: imdb_v, rt_critics: rt_c, rt_fans: rt_f });
                reqOmdb.clear();
                callback(finalRes);
            }, function () {
                reqOmdb.clear();
                callback({ imdb: item.imdb_rating || item.ratingImdb || 0, rt_critics: 0, rt_fans: 0 });
            });
        }, function() {
            reqIds.clear();
            callback({ imdb: item.imdb_rating || item.ratingImdb || 0, rt_critics: 0, rt_fans: 0 });
        });
    }

    function getTMDBRating(data) {
        var ratingKey = data.id;
        var cached = ratingCache.get('tmdb_rating', ratingKey);
        if (cached) return cached.vote_average.toFixed(1);
        var rating = data.vote_average ? data.vote_average.toFixed(1) : '0.0';
        ratingCache.set('tmdb_rating', ratingKey, { vote_average: parseFloat(rating) });
        return rating;
    }

    function getRatingPositionCSS() {
        var pos = Lampa.Storage.get('rating_position', 'bottom');
        var ox = parseFloat(Lampa.Storage.get('rating_offset_x', '0')) || 0;
        var oy = parseFloat(Lampa.Storage.get('rating_offset_y', '0')) || 0;
        var rightVal = (0.3 - ox) + 'em';
        if (pos === 'bottom') return 'right:' + rightVal + '!important;bottom:' + (0.3 - oy) + 'em!important;top:auto!important;left:auto!important;';
        return 'right:' + rightVal + '!important;top:' + (0.3 + oy) + 'em!important;bottom:auto!important;left:auto!important;';
    }

    function getRatingParent(card) {
        var parent = card.querySelector && card.querySelector('.card__view');
        if (!parent) parent = card;
        parent.setAttribute('data-rate-anchor', '1');
        parent.style.position = 'relative';
        return parent;
    }

    // Режим МИКС (в одну строку/блок)
    function createRatingLineElement(card) {
        var line = document.createElement('div');
        line.className = 'card__vote card__vote--' + Lampa.Storage.get('rating_position', 'bottom') + ' card__vote-line';
        line.style.cssText = 'line-height:1;font-family:"SegoeUI",sans-serif;position:absolute;z-index:1;' + getRatingPositionCSS() + 'background:rgba(0,0,0,0.7);color:#fff;padding:0.2em 0.4em;border-radius:0.35em;display:none;flex-direction:column;align-items:flex-end;gap:2px;';
        line.innerHTML = '<div class="card__rate-item rate--imdb" style="display:none"><div>0.0</div></div>' +
                         '<div class="card__rate-item rate--tmdb" style="display:none"><div>0.0</div></div>' +
                         '<div class="card__rate-item rate--rtc" style="display:none"><div>0%</div></div>' +
                         '<div class="card__rate-item rate--rtf" style="display:none"><div>0%</div></div>';
        getRatingParent(card).appendChild(line);
        return line;
    }

    function updateCardRatingLine(ratingLine, data) {
        if (!ratingLine || ratingLine.dataset.movieId !== data.id.toString()) return;

        var tmdbR = getTMDBRating(data);
        var tmdbItem = ratingLine.querySelector('.rate--tmdb');
        if (tmdbItem && tmdbR !== '0.0') {
            var div = tmdbItem.querySelector('div');
            div.textContent = 'TMDB: ' + formatRating(tmdbR);
            div.style.color = getRatingColor(tmdbR, false);
            tmdbItem.style.display = 'block';
        }

        getExtendedRatings(data, function (res) {
            var imdbItem = ratingLine.querySelector('.rate--imdb');
            if (imdbItem && res.imdb > 0) {
                var div = imdbItem.querySelector('div');
                div.textContent = 'IMDb: ' + formatRating(res.imdb);
                div.style.color = getRatingColor(res.imdb, false);
                imdbItem.style.display = 'block';
            }

            var rtcItem = ratingLine.querySelector('.rate--rtc');
            if (rtcItem && res.rt_critics > 0) {
                var div = rtcItem.querySelector('div');
                div.textContent = '🍅 ' + res.rt_critics + '%';
                div.style.color = getRatingColor(res.rt_critics, true);
                rtcItem.style.display = 'block';
            }

            var rtfItem = ratingLine.querySelector('.rate--rtf');
            if (rtfItem && res.rt_fans > 0) {
                var div = rtfItem.querySelector('div');
                div.textContent = '🍿 ' + res.rt_fans + '%';
                div.style.color = getRatingColor(res.rt_fans, true);
                rtfItem.style.display = 'block';
            }

            var firstBgRating = res.imdb > 0 ? String(res.imdb) : (tmdbR !== '0.0' ? tmdbR : '0');
            ratingLine.style.background = getRatingBackgroundColor(firstBgRating, false) || 'rgba(0,0,0,0.7)';
            ratingLine.style.display = 'flex';
        });
    }

    // Режим РАЗДЕЛЬНО (плашки друг под другом)
    function createRatingSeparateElements(card) {
        var wrapper = document.createElement('div');
        wrapper.className = 'card__vote card__vote--' + Lampa.Storage.get('rating_position', 'bottom') + ' card__vote-separate-wrap';
        wrapper.style.cssText = 'position:absolute;z-index:1;display:flex;flex-direction:column;gap:2px;' + getRatingPositionCSS();
        
        var keys = ['imdb', 'tmdb', 'rtc', 'rtf'];
        keys.forEach(function(key) {
            var el = document.createElement('div');
            el.className = 'card__vote card__vote--separate rate--' + key;
            el.style.cssText = 'line-height:1;font-family:"SegoeUI",sans-serif;padding:0.2em 0.4em;border-radius:0.35em;display:none;font-weight:bold;';
            wrapper.appendChild(el);
        });

        getRatingParent(card).appendChild(wrapper);
    }

    function updateCardRatingSeparate(card, data) {
        var idStr = data.id.toString();
        var tmdbEl = card.querySelector('.card__vote-separate-wrap .rate--tmdb');
        var imdbEl = card.querySelector('.card__vote-separate-wrap .rate--imdb');
        var rtcEl = card.querySelector('.card__vote-separate-wrap .rate--rtc');
        var rtfEl = card.querySelector('.card__vote-separate-wrap .rate--rtf');

        var tmdbR = getTMDBRating(data);
        if (tmdbEl && tmdbR !== '0.0') {
            tmdbEl.innerHTML = '<span style="color:' + getRatingColor(tmdbR, false) + '">' + formatRating(tmdbR) + '</span> <small style="font-size:0.6em;opacity:0.7;">TMDB</small>';
            tmdbEl.style.background = getRatingBackgroundColor(tmdbR, false) || 'rgba(0,0,0,0.7)';
            tmdbEl.style.display = 'block';
        }

        if (imdbEl) imdbEl.dataset.movieId = idStr;
        getExtendedRatings(data, function (res) {
            if (imdbEl && imdbEl.dataset.movieId === idStr && res.imdb > 0) {
                imdbEl.innerHTML = '<span style="color:' + getRatingColor(res.imdb, false) + '">' + formatRating(res.imdb) + '</span> <small style="font-size:0.6em;opacity:0.7;">IMDb</small>';
                imdbEl.style.background = getRatingBackgroundColor(res.imdb, false) || 'rgba(0,0,0,0.7)';
                imdbEl.style.display = 'block';
            }
            if (rtcEl && imdbEl && imdbEl.dataset.movieId === idStr && res.rt_critics > 0) {
                rtcEl.innerHTML = '<span style="color:' + getRatingColor(res.rt_critics, true) + '">🍅 ' + res.rt_critics + '%</span>';
                rtcEl.style.background = getRatingBackgroundColor(res.rt_critics, true) || 'rgba(0,0,0,0.7)';
                rtcEl.style.display = 'block';
            }
            if (rtfEl && imdbEl && imdbEl.dataset.movieId === idStr && res.rt_fans > 0) {
                rtfEl.innerHTML = '<span style="color:' + getRatingColor(res.rt_fans, true) + '">🍿 ' + res.rt_fans + '%</span>';
                rtfEl.style.background = getRatingBackgroundColor(res.rt_fans, true) || 'rgba(0,0,0,0.7)';
                rtfEl.style.display = 'block';
            }
        });
    }

    Lampa.Listener.follow('card', function (e) {
        if (e.type === 'create') {
            var displayMode = Lampa.Storage.get('rating_display_mode', 'separate');
            if (displayMode === 'separate') {
                createRatingSeparateElements(e.element);
            } else {
                createRatingLineElement(e.element);
            }
        }
        if (e.type === 'visible') {
            var displayMode = Lampa.Storage.get('rating_display_mode', 'separate');
            var line = e.element.querySelector('.card__vote-line');
            if (displayMode === 'separate') {
                if (line) line.style.display = 'none';
                updateCardRatingSeparate(e.element, e.data);
            } else {
                var wrap = e.element.querySelector('.card__vote-separate-wrap');
                if (wrap) wrap.style.display = 'none';
                if (!line) line = createRatingLineElement(e.element);
                line.dataset.movieId = e.data.id.toString();
                updateCardRatingLine(line, e.data);
            }
        }
    });
})();
