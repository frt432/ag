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

    function getReactionImageSrc(medianReaction) {
        if (!medianReaction) return '';
        if (isTriggerOn('animated_reactions', false)) {
            return ANIMATED_REACTIONS_BASE_URL + '/reaction-' + medianReaction + '.gif';
        }
        return SVG_REACTIONS_BASE_URL + '/' + medianReaction + '.svg';
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
            var isEmpty = ((!value.kp || value.kp === 0) && (!value.imdb || value.imdb === 0) && (!value.rating || value.rating === 0) && (!value.vote_average || value.vote_average === 0));
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

    var stringCache = {};
    function normalizeString(str) {
        if (stringCache[str]) return stringCache[str];
        var normalized = str
            .replace(/[\s.,:;''`!?]+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-')
            .replace(/ё/g, 'е');
        stringCache[str] = normalized;
        return normalized;
    }

    function cleanString(str) {
        return normalizeString(str)
            .replace(/^[ \/\\]+/, '')
            .replace(/[ \/\\]+$/, '')
            .replace(/\+( *[+\/\\])+/g, '+')
            .replace(/([+\/\\] *)+\+/g, '+')
            .replace(/( *[\/\\]+ *)+/g, '+');
    }

    function matchStrings(str1, str2) {
        return typeof str1 === 'string' && typeof str2 === 'string' && normalizeString(str1) === normalizeString(str2);
    }

    function containsString(str1, str2) {
        return typeof str1 === 'string' && typeof str2 === 'string' && normalizeString(str1).indexOf(normalizeString(str2)) !== -1;
    }

    var KP_API_URL = 'https://kinopoiskapiunofficial.tech/';
    function getKpApiKey() {
        var k = Lampa.Storage.get('rating_kp_api_key', '') || Lampa.Storage.get('source_api_key', '');
        return String(k || '').trim();
    }
    function canUseKinopoiskApi() {
        return getKpApiKey().length > 0;
    }
    function getKpHeaders() {
        var k = getKpApiKey();
        if (!k) return {};
        return { 'X-API-KEY': k };
    }
    function cacheEmptyKpRating(itemId) {
        return ratingCache.set('kp_rating', itemId, { kp: 0, imdb: 0 });
    }

    function findBestKpMatch(results, title, originalTitle, releaseYear) {
        if (!results || !results.length) return null;
        results.forEach(function (r) {
            r.tmp_year = parseInt(String(r.year || r.start_date || "0000").slice(0, 4));
        });
        var filtered = results;
        if (originalTitle) {
            var matched = results.filter(function (r) {
                return containsString(r.orig_title || r.nameEn, originalTitle) ||
                    containsString(r.en_title || r.nameOriginal, originalTitle) ||
                    containsString(r.title || r.nameRu || r.name, originalTitle);
            });
            if (matched.length) filtered = matched;
        }
        if (filtered.length > 1 && releaseYear) {
            var yearMatch = filtered.filter(function (r) { return r.tmp_year == releaseYear; });
            if (!yearMatch.length) {
                yearMatch = filtered.filter(function (r) { return r.tmp_year && r.tmp_year > releaseYear - 2 && r.tmp_year < releaseYear + 2; });
            }
            if (yearMatch.length) filtered = yearMatch;
        }
        return filtered[0] || null;
    }

    function getKinopoiskRating(item, callback) {
        if (item.kp_rating > 0 || item.imdb_rating > 0) {
            var result = ratingCache.set('kp_rating', item.id, {
                kp: parseFloat(item.kp_rating) || 0,
                imdb: parseFloat(item.imdb_rating) || 0,
                timestamp: Date.now()
            });
            callback(result);
            return;
        }
        if (item.ratingKinopoisk > 0 || item.ratingImdb > 0) {
            var result = ratingCache.set('kp_rating', item.id, {
                kp: parseFloat(item.ratingKinopoisk) || 0,
                imdb: parseFloat(item.ratingImdb) || 0,
                timestamp: Date.now()
            });
            callback(result);
            return;
        }
        var cached = ratingCache.get('kp_rating', item.id);
        if (cached) {
            callback(cached);
            return;
        }
        try {
            var otherCache = Lampa.Storage.cache('kp_rating', 500, {});
            var otherData = otherCache[item.id];
            if (otherData && (otherData.kp > 0 || otherData.imdb > 0)) {
                var result = ratingCache.set('kp_rating', item.id, {
                    kp: parseFloat(otherData.kp) || 0,
                    imdb: parseFloat(otherData.imdb) || 0,
                    timestamp: Date.now()
                });
                callback(result);
                return;
            }
        } catch (e) {}
        if (!canUseKinopoiskApi()) {
            callback(cacheEmptyKpRating(item.id));
            return;
        }
        if (item.kinopoisk_id) {
            addToQueue(function () {
                var request = getRequest();
                request.timeout(5000);
                request.silent(KP_API_URL + 'api/v2.2/films/' + item.kinopoisk_id, function (data) {
                    var res = ratingCache.set('kp_rating', item.id, {
                        kp: parseFloat(data.ratingKinopoisk) || 0,
                        imdb: parseFloat(data.ratingImdb) || 0,
                        timestamp: Date.now()
                    });
                    releaseRequest(request);
                    callback(res);
                }, function () {
                    releaseRequest(request);
                    callback(cacheEmptyKpRating(item.id));
                }, false, { headers: getKpHeaders() });
            });
            return;
        }
        if (!(item.title || item.name) && !item.imdb_id) {
            callback(cacheEmptyKpRating(item.id));
            return;
        }
        addToQueue(function () {
            var request = getRequest();
            var title = cleanString(item.title || item.name || '');
            var releaseYear = parseInt(String(item.release_date || item.first_air_date || item.last_air_date || "0000").slice(0, 4));
            var originalTitle = item.original_title || item.original_name;

            var searchUrl;
            if (item.imdb_id) {
                searchUrl = KP_API_URL + 'api/v2.2/films?imdbId=' + encodeURIComponent(item.imdb_id);
            } else {
                searchUrl = KP_API_URL + 'api/v2.1/films/search-by-keyword?keyword=' + encodeURIComponent(title);
            }

            request.timeout(5000);
            request.silent(searchUrl, function (data) {
                var results = data.films || data.items || [];
                if (!results.length && data && (data.kinopoiskId || data.filmId)) {
                    results = [data];
                }
                var best = findBestKpMatch(results, title, originalTitle, releaseYear);
                if (!best) {
                    releaseRequest(request);
                    callback(cacheEmptyKpRating(item.id));
                    return;
                }

                var kpFromSearch = parseFloat(best.rating || best.ratingKinopoisk) || 0;
                var imdbFromSearch = parseFloat(best.ratingImdb) || 0;
                var movieId = best.kinopoiskId || best.filmId || best.kp_id || best.kinopoisk_id;

                if (kpFromSearch > 0) {
                    ratingCache.set('kp_rating', item.id, {
                        kp: kpFromSearch,
                        imdb: imdbFromSearch,
                        timestamp: Date.now()
                    });
                }

                if (movieId && (kpFromSearch === 0 || imdbFromSearch === 0)) {
                    if (kpFromSearch > 0) callback({ kp: kpFromSearch, imdb: imdbFromSearch });
                    request.timeout(5000);
                    request.silent(KP_API_URL + 'api/v2.2/films/' + movieId, function (detail) {
                        var fullKp = parseFloat(detail.ratingKinopoisk) || 0;
                        var fullImdb = parseFloat(detail.ratingImdb) || 0;
                        var res = ratingCache.set('kp_rating', item.id, {
                            kp: fullKp > 0 ? fullKp : kpFromSearch,
                            imdb: fullImdb > 0 ? fullImdb : imdbFromSearch,
                            timestamp: Date.now()
                        });
                        releaseRequest(request);
                        callback(res);
                    }, function () {
                        releaseRequest(request);
                        callback(ratingCache.set('kp_rating', item.id, {
                            kp: kpFromSearch,
                            imdb: imdbFromSearch,
                            timestamp: Date.now()
                        }));
                    }, false, { headers: getKpHeaders() });
                } else {
                    releaseRequest(request);
                    callback(ratingCache.set('kp_rating', item.id, {
                        kp: kpFromSearch,
                        imdb: imdbFromSearch,
                        timestamp: Date.now()
                    }));
                }
            }, function () {
                releaseRequest(request);
                callback(cacheEmptyKpRating(item.id));
            }, false, { headers: getKpHeaders() });
        });
    }

    function calculateLampaRating10(reactions) {
        var weightedSum = 0;
        var totalCount = 0;
        var reactionCnt = {};
        var reactionCoef = { fire: 5, nice: 4, think: 3, bore: 2, shit: 1 };
        for (var i = 0; i < reactions.length; i++) {
            var item = reactions[i];
            var count = parseInt(item.counter, 10) || 0;
            var coef = reactionCoef[item.type] || 0;
            weightedSum += count * coef;
            totalCount += count;
            reactionCnt[item.type] = (reactionCnt[item.type] || 0) + count;
        }
        if (totalCount === 0) return { rating: 0, medianReaction: '' };
        var avgRating = weightedSum / totalCount;
        var rating10 = (avgRating - 1) * 2.5;
        var finalRating = rating10 >= 0 ? parseFloat(rating10.toFixed(1)) : 0;
        var medianReaction = '';
        var medianIndex = Math.ceil(totalCount / 2.0);
        var keys = Object.keys(reactionCoef);
        var sortedReactions = keys.sort(function (a, b) { return reactionCoef[a] - reactionCoef[b]; });
        var cumulativeCount = 0;
        while (sortedReactions.length && cumulativeCount < medianIndex) {
            medianReaction = sortedReactions.pop();
            cumulativeCount += (reactionCnt[medianReaction] || 0);
        }
        return { rating: finalRating, medianReaction: medianReaction };
    }

    function fetchLampaRating(ratingKey) {
        return new Promise(function (resolve) {
            var request = getRequest();
            var url = "https://cubnotrip.top/api/reactions/get/" + ratingKey;
            request.timeout(10000);
            request.silent(url, function (data) {
                try {
                    if (data && data.result && Array.isArray(data.result)) {
                        var result = calculateLampaRating10(data.result);
                        resolve(result);
                    } else {
                        resolve({ rating: 0, medianReaction: '' });
                    }
                } catch (e) {
                    resolve({ rating: 0, medianReaction: '' });
                } finally {
                    releaseRequest(request);
                }
            }, function () {
                releaseRequest(request);
                resolve({ rating: 0, medianReaction: '' });
            }, false);
        });
    }

    var pendingLampaRequests = {};
    function getLampaRating(ratingKey) {
        var cached = ratingCache.get('lampa_rating', ratingKey);
        if (cached) return Promise.resolve(cached);
        if (pendingLampaRequests[ratingKey]) return pendingLampaRequests[ratingKey];
        pendingLampaRequests[ratingKey] = fetchLampaRating(ratingKey).then(function (result) {
            return ratingCache.set('lampa_rating', ratingKey, result);
        }).catch(function () {
            return { rating: 0, medianReaction: '' };
        }).then(function (result) {
            delete pendingLampaRequests[ratingKey];
            return result;
        }, function (error) {
            delete pendingLampaRequests[ratingKey];
            throw error;
        });
        return pendingLampaRequests[ratingKey];
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
        line.innerHTML = '<div class="card__rate-item rate--tmdb" style="display:none"><div>0.0</div><span class="source--name"></span></div><div class="card__rate-item rate--imdb" style="display:none"><div>0.0</div><span class="source--name"></span></div><div class="card__rate-item rate--kp" style="display:none"><div>0.0</div><span class="source--name"></span></div><div class="card__rate-item rate--lampa" style="display:none"><span class="rate-value">0.0</span><span class="source--name rate-icon-reaction"></span></div>';
        var parent = getRatingParent(card);
        parent.appendChild(line);
        return line;
    }

    // ОРИГИНАЛЬНАЯ ФУНКЦИЯ С ЖЕСТКИМИ СТРУКТУРНЫМИ ЗАГЛУШКАМИ НА KP И LAMPA
    function isRatingSourceVisible(source) {
        if (source === 'kp' || source === 'lampa') return false; 
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
        } catch (e) {}

        try {
            var kpFromData = (data.kp_rating != null ? data.kp_rating : (data.ratingKinopoisk != null ? data.ratingKinopoisk : 0));
            var imdbFromData = (data.imdb_rating != null ? data.imdb_rating : (data.ratingImdb != null ? data.ratingImdb : 0));
            var cachedKp = ratingCache.get('kp_rating', data.id);
            var kpVal = (kpFromData > 0 ? kpFromData : (cachedKp && cachedKp.kp)) || 0;
            var imdbVal = (imdbFromData > 0 ? imdbFromData : (cachedKp && cachedKp.imdb)) || 0;

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

            var kpItem = ratingLine.querySelector('.rate--kp');
            if (kpItem) {
                var kpDiv = kpItem.querySelector('div');
                var kpText = kpVal ? formatRating(kpVal) : '0.0';
                if (kpDiv) {
                    kpDiv.textContent = kpText;
                    kpDiv.style.color = getRatingColor(kpText);
                }
                var show = (kpVal > 0) && isRatingSourceVisible('kp'); 
                kpItem.style.display = show ? '' : 'none';
            }
        } catch (e) {}

        try {
            var lampaKey = (data.seasons || data.first_air_date || data.original_name) ? 'tv_' + data.id : 'movie_' + data.id;
            var cachedLampa = ratingCache.get('lampa_rating', lampaKey);
            var lampaItem = ratingLine.querySelector('.rate--lampa');
            if (lampaItem) {
                var lampaValEl = lampaItem.querySelector('.rate-value');
                var lampaReactionIcon = lampaItem.querySelector('.rate-icon-reaction');
                var hasLampa = cachedLampa && cachedLampa.rating > 0;
                var lampaText = hasLampa ? formatRating(cachedLampa.rating) : '0.0';
                if (lampaValEl) {
                    lampaValEl.textContent = lampaText;
                    lampaValEl.style.color = getRatingColor(lampaText);
                }
                if (lampaReactionIcon) {
                    if (hasLampa && cachedLampa.medianReaction) {
                        lampaReactionIcon.style.backgroundImage = 'url(' + getReactionImageSrc(cachedLampa.medianReaction) + ')';
                    } else {
                        lampaReactionIcon.style.backgroundImage = '';
                    }
                }
                var show = hasLampa && isRatingSourceVisible('lampa'); 
                lampaItem.style.display = show ? '' : 'none';
            }
        } catch (e) {}
        var firstRating = null;
        try {
            var tmdbR = getTMDBRating(data);
            if (tmdbR !== '0.0' && isRatingSourceVisible('tmdb')) firstRating = tmdbR;
            if (!firstRating && imdbVal > 0 && isRatingSourceVisible('imdb')) firstRating = String(imdbVal);
            if (!firstRating && kpVal > 0 && isRatingSourceVisible('kp')) firstRating = String(kpVal);
            if (!firstRating && cachedLampa && cachedLampa.rating > 0 && isRatingSourceVisible('lampa')) firstRating = String(cachedLampa.rating);
        } catch (e) {}
        var lineBg = getRatingBackgroundColor(firstRating || '0');
        ratingLine.style.background = lineBg || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
        var anyVisible = (tmdbItem && tmdbItem.style.display !== 'none') || (imdbItem && imdbItem.style.display !== 'none') || (kpItem && kpItem.style.display !== 'none') || (lampaItem && lampaItem.style.display !== 'none');
        ratingLine.style.display = anyVisible ? '' : 'none';
    }

    function getRatingDisplayMode() {
        return Lampa.Storage.get('rating_display_mode', 'separate');
    }

    function fillSingleRatingElement(el, data, rateSource) {
        if (!el || !data || !rateSource) return;
        var idStr = data.id.toString();
        if (el.dataset.movieId !== idStr) return;
        el.classList.add('card__vote--separate');
        
        if (rateSource === 'kp' || rateSource === 'lampa') {
            el.style.display = 'none';
            return;
        }

        if (rateSource === 'tmdb') {
            var rating = getTMDBRating(data);
            if (rating !== '0.0') {
                var color = getRatingColor(rating);
                el.className = voteClass('rate--tmdb card__vote--separate');
                el.innerHTML = '<span style="color:' + color + '">' + formatRating(rating) + '</span> <span class="source--name"></span>';
                el.style.display = '';
                var bg = getRatingBackgroundColor(rating);
                el.style.background = bg || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
            } else {
                el.style.display = 'none';
            }
            return;
        }
        if (rateSource === 'imdb') {
            getKinopoiskRating(data, function (res) {
                if (!el.parentNode || el.dataset.movieId !== idStr) return;
                var val = res.imdb; 
                if (val && val > 0) {
                    var text = formatRating(val);
                    var color = getRatingColor(val);
                    el.className = voteClass('rate--imdb card__vote--separate');
                    el.innerHTML = '<span style="color:' + color + '">' + text + '</span> <span class="source--name"></span>';
                    el.style.display = '';
                    var bg = getRatingBackgroundColor(val);
                    el.style.background = bg || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
                } else {
                    el.style.display = 'none';
                }
            });
            return;
        }
    }

    function createRatingSeparateElements(card) {
        var parent = getRatingParent(card);
        var sources = [];
        if (isRatingSourceVisible('tmdb')) sources.push('tmdb');
        if (isRatingSourceVisible('imdb')) sources.push('imdb');
        if (isRatingSourceVisible('kp')) sources.push('kp');
        if (isRatingSourceVisible('lampa')) sources.push('lampa');
        var wrapper = document.createElement('div');
        wrapper.className = voteClass('card__vote-separate-wrap');
        var posCSS = getRatingPositionCSS(0);
        wrapper.style.cssText = 'position:absolute;z-index:1;display:flex;flex-direction:column;gap:0.1em;box-sizing:border-box;' + posCSS;
        for (var i = 0; i < sources.length; i++) {
            var el = createRatingInnerBlock();
            el.dataset.rateSource = sources[i];
            el.classList.add('card__vote--separate');
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

    function showTmdbFallback(ratingElement, data) {
        var tmdb = getTMDBRating(data);
        if (tmdb !== '0.0') {
            var color = getRatingColor(tmdb);
            ratingElement.className = voteClass('rate--tmdb');
            ratingElement.innerHTML = '<span style="color:' + color + '">' + formatRating(tmdb) + '</span> <span class="source--name"></span>';
            var bg = getRatingBackgroundColor(tmdb);
            ratingElement.style.background = bg || ('rgba(0,0,0,' + getRatingBackgroundAlpha() + ')');
            return;
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

    // ОРИГИНАЛЬНЫЙ БЛОК НАСТРОЕК (Вырезаны только тумблеры отображения KP и Лампы)
    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name === 'main') {
            var item = $('<div class="settings-folder selector" data-component="plugins_ratings">Рейтинги</div>');
            item.on('hover:enter', function () {
                Lampa.Settings.add({
                    title: 'Рейтинги',
                    component: 'plugins_ratings',
                    onBack: function () {
                        Lampa.Settings.main();
                    }
                });
            });
            e.body.find('[data-component="plugins"]').after(item);
        }
        if (e.name === 'plugins_ratings') {
            var body = Lampa.Settings.Builder([
                {
                    title: 'Режим отображения',
                    type: 'select',
                    name: 'rating_display_mode',
                    value: 'separate',
                    options: {
                        separate: 'Раздельно',
                        line: 'В одну линию'
                    }
                },
                {
                    title: 'Положение',
                    type: 'select',
                    name: 'rating_position',
                    value: 'bottom',
                    options: {
                        top: 'Сверху',
                        bottom: 'Снизу'
                    }
                },
                {
                    title: 'Показывать TMDB',
                    type: 'toggle',
                    name: 'rating_show_tmdb',
                    value: true
                },
                {
                    title: 'Показывать IMDB',
                    type: 'toggle',
                    name: 'rating_show_imdb',
                    value: true
                },
                {
                    title: 'Цветной текст рейтинга',
                    type: 'toggle',
                    name: 'colored_ratings_poster',
                    value: true
                },
                {
                    title: 'Цветной фон плашки',
                    type: 'toggle',
                    name: 'rating_colored_windows',
                    value: false
                },
                {
                    title: 'Прозрачность окна (%)',
                    type: 'input',
                    name: 'rating_window_opacity',
                    value: '0'
                },
                {
                    title: 'Смещение по X',
                    type: 'input',
                    name: 'rating_offset_x',
                    value: '0'
                },
                {
                    title: 'Смещение по Y',
                    type: 'input',
                    name: 'rating_offset_y',
                    value: '0'
                },
                {
                    title: 'Токен Кинопоиска (для IMDB)',
                    type: 'input',
                    name: 'rating_kp_api_key',
                    value: ''
                }
            ]);
            e.body.append(body);
        }
    });
})();
