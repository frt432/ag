(function () {
    'use strict';

    Lampa.Platform.tv();

    var ANIMATED_REACTIONS_BASE_URL = 'https://amikdn.github.io/img';
    var SVG_REACTIONS_BASE_URL = 'https://cubnotrip.top/img/reactions';

    function isTriggerOn(key, def) {
        var v = Lampa.Storage.get(key, def);
        return (v === true || v === 'true' || v === '1' || v === 1);
    }
    function isColoredRatingsPosterOn() {
        return isTriggerOn('colored_ratings_poster', true);
    }
    function setColoredRatingsPoster(on) {
        Lampa.Storage.set('colored_ratings_poster', on ? 'true' : 'false');
    }
    function getRatingColor(value) {
        if (isTriggerOn('rating_colored_windows', false)) return '#fff';
        if (!isColoredRatingsPosterOn()) return '#fff';
        var v = parseFloat(String(value).replace(',', '.'));
        if (isNaN(v) || v <= 0) return '#fff';
        if (v <= 3) return 'red';
        if (v < 6) return 'orange';
        if (v < 8) return 'cornflowerblue';
        return 'lawngreen';
    }

    function getRatingBackgroundColor(value) {
        if (!isTriggerOn('rating_colored_windows', false)) return '';
        var alpha = getRatingBackgroundAlpha();
        var v = parseFloat(String(value).replace(',', '.'));
        if (isNaN(v) || v <= 0) return 'rgba(0,0,0,' + alpha + ')';
        if (v <= 3) return 'rgba(180,0,0,' + alpha + ')';
        if (v < 6) return 'rgba(200,120,0,' + alpha + ')';
        if (v < 8) return 'rgba(70,130,180,' + alpha + ')';
        return 'rgba(80,180,0,' + alpha + ')';
    }

    function formatRating(value) {
        var n = parseFloat(value);
        if (isNaN(n)) return '0.0';
        if (n === 10) return '10';
        return n.toFixed(1);
    }

    var CACHE_TTL = 24 * 60 * 60 * 1000;
    function getPersistentCacheKey(source) {
        return 'rating_cache_' + source;
    }
    function loadPersistentCache(source) {
        var stored = null;
        try {
            stored = Lampa.Storage.get(getPersistentCacheKey(source), null);
        } catch (e) {}
        if (stored && typeof stored === 'object') return stored;
        try {
            stored = Lampa.Storage.cache(source, 500, {});
        } catch (e2) {
            stored = null;
        }
        return stored && typeof stored === 'object' ? stored : {};
    }

    var _savePending = {};
    function debouncedSave(source, cache) {
        if (_savePending[source]) return;
        _savePending[source] = true;
        setTimeout(function () {
            _savePending[source] = false;
            try { Lampa.Storage.set(getPersistentCacheKey(source), cache); } catch (e) {}
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
            var isEmpty = ((!value.vote_average || value.vote_average === 0) && (!value.imdb || value.imdb === 0));
            if (isEmpty) value._empty = true;
            cache[key] = value;
            debouncedSave(source, cache);
            return value;
        }
    };

    var taskQueue = [];
    var isProcessing = false;
    var taskInterval = 350;
    var taskBatchSize = 1;
    var requestPool = [];
    function getRequest() {
        return requestPool.pop() || new Lampa.Reguest();
    }

    function releaseRequest(request) {
        request.clear();
        if (requestPool.length < 5) requestPool.push(request);
    }

    function processQueue() {
        if (isProcessing || !taskQueue.length) return;
        isProcessing = true;
        var batch = taskQueue.splice(0, taskBatchSize);
        for (var i = 0; i < batch.length; i++) { batch[i].execute(); }
        setTimeout(function () {
            isProcessing = false;
            processQueue();
        }, taskInterval);
    }

    function addToQueue(task) {
        if (taskQueue.length > 20) taskQueue.splice(10);
        taskQueue.push({ execute: task });
        processQueue();
    }

    function getTMDBRating(data) {
        var ratingKey = data.id;
        var cached = ratingCache.get('tmdb_rating', ratingKey);
        if (cached) return cached.vote_average.toFixed(1);
        var rating = data.vote_average ? data.vote_average.toFixed(1) : '0.0';
        ratingCache.set('tmdb_rating', ratingKey, { vote_average: parseFloat(rating) });
        return rating;
    }

    function getRatingOffsetX() {
        var v = parseFloat(Lampa.Storage.get('rating_offset_x', '0'));
        return isNaN(v) ? 0 : v;
    }
    function getRatingOffsetY() {
        var v = parseFloat(Lampa.Storage.get('rating_offset_y', '0'));
        return isNaN(v) ? 0 : v;
    }
    function getRatingBackgroundAlpha() {
        var v = parseFloat(Lampa.Storage.get('rating_window_opacity', '0'));
        if (isNaN(v)) return 1;
        v = Math.max(0, Math.min(100, v));
        return 1 - (v / 100);
    }
    function getRatingPositionCSS(verticalOffsetEm) {
        var pos = Lampa.Storage.get('rating_position', 'bottom');
        var ox = getRatingOffsetX();
        var oy = getRatingOffsetY();
        var vo = (verticalOffsetEm == null || isNaN(verticalOffsetEm)) ? 0 : verticalOffsetEm;
        var rightVal = (0.3 - ox) + 'em';
        if (pos === 'bottom') {
            return 'right:' + rightVal + '!important;bottom:' + (0.3 - oy + vo) + 'em!important;top:auto!important;left:auto!important;';
        }
        return 'right:' + rightVal + '!important;top:' + (0.3 + oy + vo) + 'em!important;bottom:auto!important;left:auto!important;';
    }

    function voteClass(extra) {
        var pos = Lampa.Storage.get('rating_position', 'bottom');
        return 'card__vote card__vote--' + pos + (extra ? ' ' + extra : '');
    }

    function getRatingParent(card) {
        var parent = card.querySelector && card.querySelector('.card__view');
        if (!parent) parent = card;
        parent.setAttribute('data-rate-anchor', '1');
        parent.style.position = 'relative';
        return parent;
    }

    function createRatingElement(card, verticalOffsetEm) {
        var ratingElement = document.createElement('div');
        ratingElement.className = voteClass();
        var posCSS = getRatingPositionCSS(verticalOffsetEm);
        var bgAlpha = getRatingBackgroundAlpha();
        ratingElement.style.cssText = 'line-height:1;font-family:"SegoeUI",sans-serif;cursor:pointer;box-sizing:border-box;outline:none;user-select:none;position:absolute;z-index:1;' + posCSS + 'background:rgba(0,0,0,' + bgAlpha + ');color:#fff;padding:0.2em 0.4em;border-radius:0.35em;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;';
        var parent = getRatingParent(card);
        parent.appendChild(ratingElement);
        return ratingElement;
    }

    function createRatingInnerBlock() {
        var el = document.createElement('div');
        el.className = voteClass();
        var bgAlpha = getRatingBackgroundAlpha();
        el.style.cssText = 'line-height:1;font-family:"SegoeUI",sans-serif;cursor:pointer;box-sizing:border-box;outline:none;user-select:none;background:rgba(0,0,0,' + bgAlpha + ');color:#fff;padding:0.2em 0.4em;border-radius:0.35em;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;';
        return el;
    }

    function createRatingLineElement(card) {
        var line = document.createElement('div');
        line.className = voteClass('card__vote-line');
        var posCSS = getRatingPositionCSS();
        var bgAlpha = getRatingBackgroundAlpha();
        line.style.cssText = 'line-height:1;font-family:"SegoeUI",sans-serif;cursor:pointer;box-sizing:border-box;outline:none;user-select:none;position:absolute;z-index:1;' + posCSS + 'background:rgba(0,0,0,' + bgAlpha + ');color:#fff;padding:0.2em 0.4em;border-radius:0.35em;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:flex-end;align-items:flex-end;';
        line.innerHTML = '<div class="card__rate-item rate--tmdb" style="display:none"><div>0.0</div><span class="source--name"></span></div><div class="card__rate-item rate--imdb" style="display:none"><div>0.0</div><span class="source--name"></span></div>';
        var parent = getRatingParent(card);
        parent.appendChild(line);
        return line;
    }

    function isRatingSourceVisible(source) {
        var key = 'rating_show_' + source;
        var v = Lampa.Storage.get(key, '1');
        if (v === false || v === 'false' || v === 0 || v === '0' || v === '' || v === null || v === undefined) return false;
        return true;
    }

    function updateCardRatingLine(ratingLine, data) {
        if (!ratingLine || !ratingLine.parentNode) return;
        var idStr = data.id.toString();
        if (ratingLine.dataset.movieId !== idStr) return;

        try {
            var tmdbItem = ratingLine.querySelector('.rate--tmdb');
            if (tmdbItem) {
                var tmdbRating = getTMDBRating(data);
                var tmdbDiv = tmdbItem.querySelector('div');
                if (tmdbDiv) {
                    tmdbDiv.textContent = formatRating(tmdbRating);
                    tmdbDiv.style.color = getRatingColor(tmdbRating);
                }
                var show = (tmdbRating !== '0.0') && isRatingSourceVisible('tmdb');
                tmdbItem.style.display = show ? '' : 'none';
            }

            var imdbVal = data.imdb_rating || data.ratingImdb || 0;
            var imdbItem = ratingLine.querySelector('.rate--imdb');
            if (imdbItem) {
                var imdbDiv = imdbItem.querySelector('div');
                var imdbText = imdbVal ? formatRating(imdbVal) : '0.0';
                if (imdbDiv) {
                    imdbDiv.textContent = imdbText;
                    imdbDiv.style.color = getRatingColor(imdbText);
                }
                var show = (imdbVal > 0) && isRatingSourceVisible('imdb');
                imdbItem.style.display = show ? '' : 'none';
            }
        } catch (e) {}

        var firstRating = (getTMDBRating(data) !== '0.0' && isRatingSourceVisible('tmdb')) ? getTMDBRating(data) : '0';
        var lineBg = getRatingBackgroundColor(firstRating);
        ratingLine.style.background = lineBg || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
        var anyVisible = (ratingLine.querySelector('.rate--tmdb').style.display !== 'none') || (ratingLine.querySelector('.rate--imdb').style.display !== 'none');
        ratingLine.style.display = anyVisible ? '' : 'none';
    }

    function fillSingleRatingElement(el, data, rateSource) {
        if (!el || !data || !rateSource) return;
        var idStr = data.id.toString();
        if (el.dataset.movieId !== idStr) return;
        el.classList.add('card__vote--separate');
        
        if (rateSource === 'tmdb') {
            var rating = getTMDBRating(data);
            if (rating !== '0.0') {
                var color = getRatingColor(rating);
                el.className = voteClass('rate--tmdb card__vote--separate');
                el.innerHTML = '<span style="color:' + color + '">' + formatRating(rating) + '</span>';
                el.style.display = '';
                el.style.background = getRatingBackgroundColor(rating) || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
            } else el.style.display = 'none';
        } else if (rateSource === 'imdb') {
            var rating = data.imdb_rating || data.ratingImdb || 0;
            if (rating > 0) {
                var color = getRatingColor(rating);
                el.className = voteClass('rate--imdb card__vote--separate');
                el.innerHTML = '<span style="color:' + color + '">' + formatRating(rating) + '</span>';
                el.style.display = '';
                el.style.background = getRatingBackgroundColor(rating) || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
            } else el.style.display = 'none';
        }
    }

    function createRatingSeparateElements(card) {
        var parent = getRatingParent(card);
        var sources = [];
        if (isRatingSourceVisible('tmdb')) sources.push('tmdb');
        if (isRatingSourceVisible('imdb')) sources.push('imdb');
        var wrapper = document.createElement('div');
        wrapper.className = voteClass('card__vote-separate-wrap');
        var posCSS = getRatingPositionCSS(0);
        wrapper.style.cssText = 'position:absolute;z-index:1;display:flex;flex-direction:column;gap:0.1em;box-sizing:border-box;' + posCSS;
        for (var i = 0; i < sources.length; i++) {
            var el = createRatingInnerBlock();
            el.dataset.rateSource = sources[i];
            el.style.display = 'none';
            wrapper.appendChild(el);
        }
        parent.appendChild(wrapper);
    }

    function updateCardRatingSeparate(card, data) {
        var idStr = data.id.toString();
        var elements = card.querySelectorAll('.card__vote-separate-wrap [data-rate-source]');
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            el.dataset.movieId = idStr;
            fillSingleRatingElement(el, data, el.dataset.rateSource);
        }
    }

    Lampa.Listener.follow('card', function (e) {
        if (e.type === 'create') {
            if (Lampa.Storage.get('rating_display_mode', 'separate') === 'separate') {
                createRatingSeparateElements(e.element);
            } else {
                createRatingLineElement(e.element);
            }
        }
        if (e.type === 'visible') {
            if (Lampa.Storage.get('rating_display_mode', 'separate') === 'separate') {
                updateCardRatingSeparate(e.element, e.data);
            } else {
                var line = e.element.querySelector('.card__vote-line');
                if (!line) line = createRatingLineElement(e.element);
                line.dataset.movieId = e.data.id.toString();
                updateCardRatingLine(line, e.data);
            }
        }
    });
})();
