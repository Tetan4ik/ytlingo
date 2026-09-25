// page_script.js — MAIN world, видит всё, что видит YouTube
(function () {
    const TAG = "[YT-Lang:page]";
    const originalFetch = window.fetch;

    // Кэш: ключ = videoId, значение = { url, text }
    const captionCache = {};

    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
            if (url && url.includes("/api/timedtext")) {
                // Клонируем, чтобы не испортить оригинальный поток плеера
                const clone = response.clone();
                clone.text().then((text) => {
                    if (!text) return;
                    const u = new URL(url, location.href);
                    const videoId = u.searchParams.get("v");
                    const lang = u.searchParams.get("lang") || "";
                    const tlang = u.searchParams.get("tlang") || "";
                    const key = `${lang}|${tlang}`;

                    if (!captionCache[videoId]) captionCache[videoId] = {};
                    captionCache[videoId][key] = { url: url, text: text };
                    console.log(TAG, "Перехвачены субтитры", videoId, key, "длина:", text.length);

                    // Отправляем в content script
                    window.postMessage({
                        type: "YT_LANG_CAPTION_CAPTURED",
                        videoId: videoId,
                        lang: key,
                        text: text
                    }, "*");
                }).catch(() => {});
            }
        } catch (e) {
            // Молча игнорируем — не ломаем плеер
        }

        return response;
    };

    // Также перехватываем XHR на всякий случай
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._ytLangUrl = url;
        return originalOpen.call(this, method, url, ...rest);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener("load", () => {
            try {
                if (this._ytLangUrl && this._ytLangUrl.includes("/api/timedtext")) {
                    const u = new URL(this._ytLangUrl, location.href);
                    const videoId = u.searchParams.get("v");
                    const lang = u.searchParams.get("lang") || "";
                    const tlang = u.searchParams.get("tlang") || "";
                    const key = `${lang}|${tlang}`;
                    if (!captionCache[videoId]) captionCache[videoId] = {};
                    captionCache[videoId][key] = { url: this._ytLangUrl, text: this.responseText };
                    console.log(TAG, "XHR перехвачен", videoId, key, "длина:", this.responseText.length);

                    // ← ЭТОГО НЕ ХВАТАЛО:
                    window.postMessage({
                        type: "YT_LANG_CAPTION_CAPTURED",
                        videoId: videoId,
                        lang: key,
                        text: this.responseText
                    }, "*");
                }
            } catch (e) {
                console.warn(TAG, "Ошибка обработки XHR:", e);
            }
        });
        return originalSend.apply(this, args);
    };

    // Делаем кэш доступным (для отладки)
    window.__ytLangCaptionCache = captionCache;
})();
