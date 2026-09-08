let currentThreadId = localStorage.getItem("travel_thread_id") || null;
let latestAnswerMarkdown = "";

// Initialize theme on load
document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = localStorage.getItem("tripmate_theme") || "vintage";
    if (savedTheme === "midnight") {
        document.body.classList.add("theme-midnight");
        const btn = document.getElementById("themeToggle");
        if (btn) {
            btn.querySelector(".toggle-icon").textContent = "🧭";
            btn.querySelector(".toggle-text").textContent = "Vintage Passport";
        }
    }
});

function toggleTheme() {
    const isMidnight = document.body.classList.toggle("theme-midnight");
    localStorage.setItem("tripmate_theme", isMidnight ? "midnight" : "vintage");
    
    const btn = document.getElementById("themeToggle");
    if (btn) {
        if (isMidnight) {
            btn.querySelector(".toggle-icon").textContent = "🧭";
            btn.querySelector(".toggle-text").textContent = "Vintage Passport";
        } else {
            btn.querySelector(".toggle-icon").textContent = "✈️";
            btn.querySelector(".toggle-text").textContent = "Midnight Jetsetter";
        }
    }
}

function setPrompt(text) {
    document.getElementById("userInput").value = text;
}

function setLoading(isLoading) {
    const sendBtn = document.getElementById("sendBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");

    sendBtn.disabled = isLoading;

    if (isLoading) {
        btnText.classList.add("hidden");
        btnLoader.classList.remove("hidden");
    } else {
        btnText.classList.remove("hidden");
        btnLoader.classList.add("hidden");
    }
}

function showError(message) {
    const errorBox = document.getElementById("errorBox");
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
}

function hideError() {
    const errorBox = document.getElementById("errorBox");
    errorBox.classList.add("hidden");
    errorBox.textContent = "";
}

function showResult(answer, threadId) {
    latestAnswerMarkdown = answer;

    const resultSection = document.getElementById("resultSection");
    const resultBox = document.getElementById("resultBox");
    const threadInfo = document.getElementById("threadInfo");

    if (typeof marked !== "undefined") {
        resultBox.innerHTML = marked.parse(answer);
    } else {
        resultBox.innerText = answer;
    }

    threadInfo.textContent = `Thread ID: ${threadId}`;

    resultSection.classList.remove("hidden");

    resultSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function sendMessage() {
    hideError();

    const input = document.getElementById("userInput");
    const message = input.value.trim();

    if (!message) {
        showError("Please enter your travel request first.");
        return;
    }

    setLoading(true);

    try {
        const response = await fetch("/api/travel", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: message,
                thread_id: currentThreadId
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Something went wrong.");
        }

        currentThreadId = data.thread_id;
        localStorage.setItem("travel_thread_id", currentThreadId);

        showResult(data.answer, data.thread_id);

    } catch (error) {
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

function copyResult() {
    const resultBox = document.getElementById("resultBox");
    const text = resultBox.innerText;

    if (!text) {
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => {
            const copyBtn = document.querySelector(".copy-btn");
            const oldText = copyBtn.textContent;

            copyBtn.textContent = "Copied!";

            setTimeout(() => {
                copyBtn.textContent = oldText;
            }, 1400);
        })
        .catch(() => {
            showError("Could not copy result.");
        });
}

function downloadPDF() {
    const element = document.getElementById("pdfContent");
    if (!element) return;

    // Get current thread ID if available to append to the document header in onclone
    const threadInfo = document.getElementById("threadInfo")?.textContent || "";

    html2pdf().set({
        margin: [0.6, 0.5, 0.6, 0.5], // top, left, bottom, right margin in inches
        filename: "ai-travel-plan.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
            scale: 2.5,
            useCORS: true,
            scrollY: 0,
            scrollX: 0,
            onclone: (clonedDoc) => {
                // Ensure all fonts and print styles apply correctly in the clone
                const clonedContent = clonedDoc.getElementById("pdfContent");
                const clonedResultBox = clonedDoc.getElementById("resultBox");
                const clonedTitle = clonedDoc.querySelector(".pdf-title");

                if (clonedTitle) {
                    clonedTitle.style.display = "block";
                    clonedTitle.style.fontSize = "24px";
                    clonedTitle.style.borderBottom = "2px solid #1d2b3a";
                    clonedTitle.style.paddingBottom = "10px";
                    clonedTitle.style.marginBottom = "24px";
                }

                if (clonedContent) {
                    clonedContent.style.background = "#ffffff";
                    clonedContent.style.color = "#1d2b3a";
                    clonedContent.style.padding = "20px";
                    clonedContent.style.width = "100%";
                    clonedContent.style.height = "auto";
                    clonedContent.style.overflow = "visible";
                    clonedContent.style.boxSizing = "border-box";
                }

                if (clonedResultBox) {
                    clonedResultBox.style.color = "#2c3e50";
                    clonedResultBox.style.height = "auto";
                    clonedResultBox.style.overflow = "visible";
                }

                // Recursively set all parent elements in the cloned document to overflow: visible
                // and height: auto so they do not clip the child rendering area.
                let parent = clonedContent.parentElement;
                while (parent && parent !== clonedDoc.body && parent !== clonedDoc.documentElement) {
                    parent.style.height = "auto";
                    parent.style.maxHeight = "none";
                    parent.style.overflow = "visible";
                    parent.style.margin = "0";
                    parent.style.padding = "0";
                    parent.style.border = "none";
                    parent.style.boxShadow = "none";
                    parent = parent.parentElement;
                }
            }
        },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["li", "tr", "h1", "h2", "h3", "table"] }
    })
    .from(element)
    .save()
    .catch((err) => {
        console.error("PDF export failed:", err);
    });
}

document.addEventListener("keydown", function(event) {
    if (event.ctrlKey && event.key === "Enter") {
        sendMessage();
    }
});