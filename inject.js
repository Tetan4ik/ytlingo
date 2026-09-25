// inject.js — этот файл выполняется в контексте страницы YouTube
(function () {
    const TAG = "[YT-Lang:inject]";

    function sendPlayerResponse() {
        if (window.ytInitialPlayerResponse) {
            console.log(TAG, "ytInitialPlayerResponse найден, отправляю");
            window.postMessage({
                type: "YT_LANG_PLAYER_RESPONSE",
                data: window.ytInitialPlayerResponse
            }, "*");
            return true;
        }
        return false;
    }

    // Пробуем сразу
    if (sendPlayerResponse()) return;

    // Если нет — ждём появления
    let tries = 0;
    const iv = setInterval(() => {
        tries++;
        if (sendPlayerResponse()) {
            clearInterval(iv);
        } else if (tries > 60) {
            clearInterval(iv);
            console.warn(TAG, "ytInitialPlayerResponse так и не появился за 30 сек");
            window.postMessage({ type: "YT_LANG_PLAYER_RESPONSE", data: null }, "*");
        }
    }, 500);
})();
