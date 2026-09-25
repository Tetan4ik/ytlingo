// ================== ЛОГГЕР ==================
const LOG_PREFIX = "[YT-Lang]";

const statusBox = document.createElement("div");
statusBox.id = "yt-lang-helper-status";
document.documentElement.appendChild(statusBox);

function setStatus(text, level = "ok") {
    statusBox.textContent = text;
    statusBox.className = level;
}

function log(...args) {
    console.log(LOG_PREFIX, ...args);
    const lines = statusBox.textContent.split("\n").slice(-2);
    lines.push(args.join(" "));
    statusBox.textContent = lines.join("\n");
}


// ================== ОВЕРЛЕЙ ==================
let subtitleBox, linesContainer, navPrevBtn, navNextBtn;
let captions = [];
let currentIndex = -1;
let currentWordIndex = -1;

// Сколько строк показывать вокруг текущей (всего = LINES_BEFORE + 1 + LINES_AFTER)
let LINES_BEFORE = 2;
let LINES_AFTER = 2;

const translationCache = new Map();
let navLockUntil = 0;

function findPrevCaptionIndex(from) {
    for (let i = from - 1; i >= 0; i--) {
        if (getCaptionText(i)) return i;
    }
    return -1;
}

function findNextCaptionIndex(from) {
    for (let i = from + 1; i < captions.length; i++) {
        if (getCaptionText(i)) return i;
    }
    return -1;
}

function updateNavButtons() {
    if (!navPrevBtn || !navNextBtn || currentIndex < 0) {
        if (navPrevBtn) navPrevBtn.disabled = true;
        if (navNextBtn) navNextBtn.disabled = true;
        return;
    }
    navPrevBtn.disabled = findPrevCaptionIndex(currentIndex) === -1;
    navNextBtn.disabled = findNextCaptionIndex(currentIndex) === -1;
}

function seekToCaption(idx) {
    const video = document.querySelector("video");
    if (!video || idx < 0 || idx >= captions.length) return;

    const startSec = (captions[idx].tStartMs ?? 0) / 1000;
    video.currentTime = startSec;
    navLockUntil = performance.now() + 450;
    currentIndex = idx;
    currentWordIndex = -1;
    renderBlock();
    updateSpeakingWord(captions[idx].tStartMs ?? 0);
    updateNavButtons();
}

function stepCaption(delta) {
    if (currentIndex < 0 || captions.length === 0) return;
    const idx =
        delta < 0 ? findPrevCaptionIndex(currentIndex) : findNextCaptionIndex(currentIndex);
    if (idx === -1) return;
    seekToCaption(idx);
}

function getPlayerContainer() {
    return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
}

function createOverlay() {
    document.getElementById("yt-lang-helper-box")?.remove();

    subtitleBox = document.createElement("div");
    subtitleBox.id = "yt-lang-helper-box";

    const nav = document.createElement("div");
    nav.className = "yt-lang-nav";

    navPrevBtn = document.createElement("button");
    navPrevBtn.type = "button";
    navPrevBtn.className = "yt-lang-nav-btn prev";
    navPrevBtn.title = "Предыдущая реплика";
    navPrevBtn.setAttribute("aria-label", "Предыдущая реплика");
    navPrevBtn.textContent = "◀";
    navPrevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        stepCaption(-1);
    });

    linesContainer = document.createElement("div");
    linesContainer.id = "yt-lang-lines";

    navNextBtn = document.createElement("button");
    navNextBtn.type = "button";
    navNextBtn.className = "yt-lang-nav-btn next";
    navNextBtn.title = "Следующая реплика";
    navNextBtn.setAttribute("aria-label", "Следующая реплика");
    navNextBtn.textContent = "▶";
    navNextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        stepCaption(1);
    });

    nav.appendChild(navPrevBtn);
    nav.appendChild(linesContainer);
    nav.appendChild(navNextBtn);
    subtitleBox.appendChild(nav);

    updateNavButtons();

    const player = getPlayerContainer();
    if (player) {
        player.appendChild(subtitleBox);
    } else {
        document.body.appendChild(subtitleBox);
    }
    log("Оверлей создан (сверху видео, по центру)");
}

function getCaptionText(idx) {
    if (idx < 0 || idx >= captions.length) return null;
    const text = captions[idx].segs?.map(s => s.utf8).join("").trim();
    return text || null;
}

function getCaptionEndMs(idx) {
    const cap = captions[idx];
    if (!cap) return 0;
    if (cap.dDurationMs) return cap.tStartMs + cap.dDurationMs;
    if (idx + 1 < captions.length) return captions[idx + 1].tStartMs;
    return cap.tStartMs + 3000;
}

/** Слова текущей реплики с интервалами (мс) для подсветки */
function buildWordTimings(caption, captionIdx) {
    const segs = caption.segs || [];
    const base = caption.tStartMs ?? 0;
    const capEnd = getCaptionEndMs(captionIdx);
    const hasOffset = segs.some(s => s.tOffsetMs !== undefined);

    if (hasOffset) {
        const timed = [];
        let lastOffset = 0;
        for (const seg of segs) {
            const utf8 = seg.utf8;
            if (!utf8 || !/[^\s\n]/.test(utf8)) continue;
            if (seg.tOffsetMs !== undefined) lastOffset = seg.tOffsetMs;
            timed.push({
                startMs: base + lastOffset,
                text: utf8,
            });
        }
        timed.sort((a, b) => a.startMs - b.startMs);

        const tokens = [];
        for (let t = 0; t < timed.length; t++) {
            const startMs = timed[t].startMs;
            const endMs = t + 1 < timed.length ? timed[t + 1].startMs : capEnd;
            const parts = timed[t].text.trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0) continue;
            if (parts.length === 1) {
                tokens.push({ word: parts[0], startMs, endMs });
            } else {
                const slice = Math.max(1, (endMs - startMs) / parts.length);
                parts.forEach((word, pi) => {
                    tokens.push({
                        word,
                        startMs: startMs + pi * slice,
                        endMs: startMs + (pi + 1) * slice,
                    });
                });
            }
        }
        return tokens;
    }

    const text = getCaptionText(captionIdx);
    if (!text) return [];
    const words = text.split(/\s+/).filter(Boolean);
    const duration = Math.max(1, capEnd - base);
    const perWord = duration / words.length;
    return words.map((word, i) => ({
        word,
        startMs: base + i * perWord,
        endMs: base + (i + 1) * perWord,
    }));
}

function getActiveWordIndex(caption, captionIdx, timeMs) {
    const timings = buildWordTimings(caption, captionIdx);
    for (let i = 0; i < timings.length; i++) {
        if (timeMs >= timings[i].startMs && timeMs < timings[i].endMs) return i;
    }
    if (timings.length && timeMs >= timings[timings.length - 1].startMs) {
        return timings.length - 1;
    }
    return -1;
}

function updateSpeakingWord(timeMs) {
    if (currentIndex < 0 || !linesContainer) return;

    const caption = captions[currentIndex];
    const activeIdx = getActiveWordIndex(caption, currentIndex, timeMs);
    if (activeIdx === currentWordIndex) return;
    currentWordIndex = activeIdx;

    const lineEl = linesContainer.querySelector(".yt-lang-line.current");
    if (!lineEl) return;
    lineEl.querySelectorAll(".yt-lang-word").forEach((span, i) => {
        span.classList.toggle("speaking", i === activeIdx);
    });
}

function renderLine(caption, captionIdx, translation, isCurrent, activeWordIndex = -1) {
    const line = document.createElement("div");
    line.className = "yt-lang-line" + (isCurrent ? " current" : "");

    const orig = document.createElement("div");
    orig.className = "yt-lang-original";

    const timings = buildWordTimings(caption, captionIdx);
    timings.forEach((t, i) => {
        const span = document.createElement("span");
        span.className = "yt-lang-word" + (isCurrent && i === activeWordIndex ? " speaking" : "");
        span.textContent = t.word;
        span.addEventListener("click", () => saveWord(t.word, span));
        orig.appendChild(span);
        if (i < timings.length - 1) orig.appendChild(document.createTextNode(" "));
    });

    const trans = document.createElement("div");
    trans.className = "yt-lang-translated";
    trans.textContent = translation || "…";

    line.appendChild(orig);
    line.appendChild(trans);
    return line;
}

async function renderBlock() {
    if (currentIndex < 0 || !linesContainer) return;

    const start = Math.max(0, currentIndex - LINES_BEFORE);
    const end = Math.min(captions.length - 1, currentIndex + LINES_AFTER);

    linesContainer.innerHTML = "";

    const video = document.querySelector("video");
    const timeMs = video ? video.currentTime * 1000 : 0;
    const activeWordForCurrent =
        currentIndex >= start && currentIndex <= end
            ? getActiveWordIndex(captions[currentIndex], currentIndex, timeMs)
            : -1;
    currentWordIndex = activeWordForCurrent;

    for (let i = start; i <= end; i++) {
        const text = getCaptionText(i);
        if (!text) continue;

        let translation = translationCache.get(text);
        if (translation === undefined) {
            translationCache.set(text, null);

            translateText(text).then(tr => {
                translationCache.set(text, tr);
                const lines = linesContainer.querySelectorAll(".yt-lang-line");
                const offset = i - start;
                if (lines[offset]) {
                    lines[offset].querySelector(".yt-lang-translated").textContent = tr;
                }
            }).catch(() => {
                translationCache.set(text, "");
            });
        }

        const isCurrent = i === currentIndex;
        linesContainer.appendChild(
            renderLine(
                captions[i],
                i,
                translation || "…",
                isCurrent,
                isCurrent ? activeWordForCurrent : -1
            )
        );
    }
    updateNavButtons();
}

function updateSubtitles() {
    const video = document.querySelector("video");
    if (!video || captions.length === 0) return;

    const time = video.currentTime * 1000;

    if (performance.now() < navLockUntil) {
        updateSpeakingWord(time);
        return;
    }

    const idx = captions.findIndex(
        (c, i) =>
            time >= c.tStartMs &&
            (i === captions.length - 1 || time < captions[i + 1].tStartMs)
    );

    if (idx === -1) return;

    if (idx !== currentIndex) {
        currentIndex = idx;
        currentWordIndex = -1;
        renderBlock();
    } else {
        updateSpeakingWord(time);
    }
}

function logError(...args) {
    console.error(LOG_PREFIX, ...args);
    setStatus(args.join(" "), "error");
}


// ================== ПОЛУЧЕНИЕ ytInitialPlayerResponse ==================
// ВАЖНО: content script изолирован от window страницы.
// Нужно внедрить скрипт в контекст страницы через <script>.

function injectPageScript() {
    return new Promise((resolve) => {
        // Внедряем через src — это обходит CSP
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("inject.js");
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);

        const handler = (event) => {
            if (event.source !== window) return;
            if (event.data?.type === "YT_LANG_PLAYER_RESPONSE") {
                window.removeEventListener("message", handler);
                if (event.data.data) {
                    console.log("[YT-Lang] playerResponse получен через MAIN world");
                    resolve(event.data.data);
                } else {
                    console.warn("[YT-Lang] playerResponse не пришёл");
                    resolve(null);
                }
            }
        };
        window.addEventListener("message", handler);

        // Таймаут на всякий случай
        setTimeout(() => {
            window.removeEventListener("message", handler);
            resolve(null);
        }, 35000);
    });
}

// ================== ОЖИДАНИЕ ПЕРЕХВАЧЕННЫХ СУБТИТРОВ ==================
let capturedCaptions = null; // { text, lang }

// Слушаем сообщения от page_script.js
window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "YT_LANG_CAPTION_CAPTURED") {
        // Берём английскую дорожку (или первую доступную)
        if (event.data.lang.startsWith("en") || !capturedCaptions) {
            capturedCaptions = {
                text: event.data.text,
                lang: event.data.lang
            };
            log(`Получены перехваченные субтитры (${event.data.lang}), длина: ${event.data.text.length}`);
        }
    }
});

// ================== ПАРСИНГ JSON3 ==================
function parseJson3(text) {
    try {
        const data = JSON.parse(text);
        return data.events || [];
    } catch (e) {
        logError("Ошибка парсинга json3:", e.message);
        return [];
    }
}

// ================== ИНИЦИАЛИЗАЦИЯ ==================
async function init() {
    log("Инициализация...");
    const { linesCount = 7 } = await chrome.storage.local.get("linesCount");
    const total = Math.max(1, linesCount);
    LINES_BEFORE = Math.floor((total - 1) / 2);
    LINES_AFTER = total - 1 - LINES_BEFORE;

    createOverlay();
    capturedCaptions = null; // сбрасываем при навигации

    // Ждём, пока плеер запросит субтитры и мы их перехватим
    log("Ждём перехвата субтитров от плеера...");
    log("Убедитесь, что на видео ВКЛЮЧЕНЫ субтитры (CC)!");

    let waited = 0;
    while (!capturedCaptions && waited < 60000) {
        await new Promise(r => setTimeout(r, 1000));
        waited += 1000;
    }

    if (!capturedCaptions) {
        logError("Не удалось перехватить субтитры за 60 сек. Включены ли CC на видео?");
        return;
    }

    captions = parseJson3(capturedCaptions.text);
    log(`Распарсено строк субтитров: ${captions.length}`);

    if (captions.length === 0) {
        logError("Субтитры пустые. Возможно, формат не JSON3 или дорожка не та.");
        return;
    }

    // Подключаем обновление субтитров
    const attach = () => {
        const video = document.querySelector("video");
        if (!video) return false;
        video.addEventListener("timeupdate", updateSubtitles);
        log("Слушатель timeupdate подключён");
        setStatus("✅ Работает. Кликайте по словам.", "ok");
        return true;
    };

    if (!attach()) {
        const observer = new MutationObserver(() => {
            if (attach()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

// ================== ПЕРЕВОД ==================
async function translateText(text, targetLang = "ru") {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data[0].map(item => item[0]).join("");
}

// ================== СОХРАНЕНИЕ СЛОВ ==================
async function saveWord(word, el) {
    const clean = word.replace(/[.,!?;:"'()\[\]]/g, "").toLowerCase();
    if (!clean) return;

    const { savedWords = [] } = await chrome.storage.local.get("savedWords");
    if (savedWords.some(w => w.word === clean)) {
        log(`Уже сохранено: ${clean}`);
        return;
    }

    const translation = await translateText(clean);
    savedWords.push({ word: clean, translation, addedAt: Date.now() });
    await chrome.storage.local.set({ savedWords });
    log(`Сохранено: ${clean} → ${translation}`);

    if (el) {
        el.style.background = "#ffeb3b";
        setTimeout(() => (el.style.background = ""), 500);
    }
}

// ================== SPA-НАВИГАЦИЯ ==================
window.addEventListener("yt-navigate-finish", () => {
    log("Навигация YouTube, перезапуск");
    currentIndex = -1;
    currentWordIndex = -1;
    captions = [];
    translationCache.clear();
    document.getElementById("yt-lang-helper-box")?.remove();
    setTimeout(init, 1500);
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.linesCount) return;
    const total = Math.max(1, changes.linesCount.newValue ?? 7);
    LINES_BEFORE = Math.floor((total - 1) / 2);
    LINES_AFTER = total - 1 - LINES_BEFORE;
    if (currentIndex >= 0) renderBlock();
});




init();
