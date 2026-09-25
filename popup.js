if (new URLSearchParams(location.search).get("window") === "1") {
    document.body.classList.add("window-mode");
}

const linesSelect = document.getElementById("linesCount");

// Загружаем сохранённое значение
chrome.storage.local.get("linesCount").then(({ linesCount = 7 }) => {
    linesSelect.value = String(linesCount);
});

// Сохраняем при изменении
linesSelect.addEventListener("change", async () => {
    await chrome.storage.local.set({ linesCount: parseInt(linesSelect.value, 10) });
});


async function getWords() {
    const { savedWords = [] } = await chrome.storage.local.get("savedWords");
    return savedWords;
}

async function setWords(words) {
    await chrome.storage.local.set({ savedWords: words });
}

async function render() {
    const words = await getWords();
    const list = document.getElementById("list");
    const countEl = document.getElementById("count");
    list.innerHTML = "";
    countEl.textContent = words.length ? `(${words.length})` : "";

    if (words.length === 0) {
        list.innerHTML = '<div class="empty">Словарь пуст</div>';
        return;
    }

    const sorted = [...words].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    sorted.forEach((w) => {
        const div = document.createElement("div");
        div.className = "word-item";

        const text = document.createElement("div");
        text.className = "word-text";
        text.innerHTML = `<b>${escapeHtml(w.word)}</b><br><span class="translation">${escapeHtml(w.translation || "")}</span>`;

        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "✕";
        delBtn.title = "Удалить";
        delBtn.addEventListener("click", async () => {
            const current = await getWords();
            const updated = current.filter((x) => x.word !== w.word);
            await setWords(updated);
            render();
        });

        div.appendChild(text);
        div.appendChild(delBtn);
        list.appendChild(div);
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

document.getElementById("clear").addEventListener("click", async () => {
    if (!confirm("Удалить все слова из словаря?")) return;
    await setWords([]);
    render();
});

document.getElementById("export").addEventListener("click", async () => {
    const words = await getWords();
    if (words.length === 0) return;

    const csv =
        "word,translation,addedAt\n" +
        words
            .map(
                (w) =>
                    `"${(w.word || "").replace(/"/g, '""')}","${(w.translation || "").replace(/"/g, '""')}",${w.addedAt || ""}`
            )
            .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vocabulary.csv";
    a.click();
    URL.revokeObjectURL(url);
});

// Открыть словарь в отдельном центрированном окне
document.getElementById("openWindow").addEventListener("click", async () => {
    const width = 400;
    const height = 700;
    const left = Math.round((screen.availWidth - width) / 2);
    const top = 40; // сверху, но не впритык

    await chrome.windows.create({
        url: chrome.runtime.getURL("popup.html?window=1"),
        type: "popup",
        width,
        height,
        left,
        top,
    });
    window.close();
});

render();
