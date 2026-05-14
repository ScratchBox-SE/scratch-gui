export default async function ({ addon, console }) {
    const vm = addon.tab.traps.vm;

    let WM = null;
    const getWM = async () => {
        if (WM) return WM;
        const mod = await import("../../window-system/window-manager.js");
        WM = mod.default;
        return WM;
    };

    function el(tag, props = {}, ...children) {
        const node = Object.assign(document.createElement(tag), props);
        for (const child of children) {
            node.append(typeof child === "string" ? document.createTextNode(child) : child);
        }
        return node;
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return "…";
        if (seconds < 60) return `${Math.ceil(seconds)}s`;
        const m = Math.floor(seconds / 60);
        const s = Math.ceil(seconds % 60);
        return `${m}m ${s}s`;
    }

    function decodeCode(code) {
        const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        code = code.toUpperCase().trim();
        if (code.length < 3) return null;
        const prefix = code[0];
        const rest = code.slice(1);
        if (rest.length % 2 !== 0) return null;
        const blocks = [];
        for (let i = 0; i < rest.length; i += 2) {
            const v1 = ALPHABET.indexOf(rest[i]);
            const v2 = ALPHABET.indexOf(rest[i + 1]);
            if (v1 === -1 || v2 === -1) return null;
            blocks.push(v1 * 32 + v2);
        }
        if (prefix === "A" && blocks.length === 2) return `192.168.${blocks[0]}.${blocks[1]}`;
        if (prefix === "B" && blocks.length === 3) return `10.${blocks[0]}.${blocks[1]}.${blocks[2]}`;
        if (prefix === "C" && blocks.length === 2) return `172.16.${blocks[0]}.${blocks[1]}`;
        return null;
    }

    async function getDefaultProjectName() {
        const titleInput = document.querySelector("input[class*='project-title-input']");
        if (titleInput?.value) return titleInput.value;
        if (document.title) return document.title.replace(/ on Scratch$/, "").replace(/ - MistWarp$/, "").trim();
        return "Scratch Project";
    }

    async function getAuthor() {
        try {
            const user = await addon.auth.getUser();
            return user?.username || "Me";
        } catch {
            return "Me";
        }
    }

    async function uploadProject({ baseUrl, projectName, onProgress }) {
        if (!vm) throw new Error("Scratch VM not available.");
        const blob = await vm.saveProjectSb3();
        const author = await getAuthor();
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${baseUrl}/send`);
            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.setRequestHeader("X-Project-Title", projectName);
            xhr.setRequestHeader("X-Project-Author", author);
            xhr.setRequestHeader("X-Chunk-Offset", "0");

            if (xhr.upload) {
                xhr.upload.onprogress = (e) => {
                    if (!e.lengthComputable) {
                        onProgress(0, Infinity);
                        return;
                    }
                    const percent = (e.loaded / e.total) * 100;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = e.loaded / elapsed || 1;
                    const secondsLeft = (e.total - e.loaded) / speed;
                    onProgress(percent, secondsLeft);
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(new Error(`Server returned ${xhr.status}: ${xhr.statusText}`));
            };
            xhr.onerror = () => reject(new Error("Network error: could not reach the console."));
            xhr.send(blob);
        });
    }

    let seWindow = null;

    async function openSEWindow() {
        if (seWindow) {
            seWindow.show();
            return;
        }

        const wm = await getWM();
        let advancedMode = false;
        let projectName = await getDefaultProjectName();

        function showError(root, sendArea, btnRow, message) {
            root.querySelector(".se-error-box")?.remove();
            const box = el("div", { className: "se-error-box" });
            box.innerHTML = message;
            root.insertBefore(box, btnRow);
            sendArea.style.display = "";
            btnRow.style.display = "";
            seWindow?.setTitle("Send to Scratch Everywhere");
        }

        function buildContent() {
            const root = el("div", { className: "se-window-root" });

            root.appendChild(el("label", { className: "se-label", textContent: "Project name", htmlFor: "se-name" }));
            const nameInput = el("input", { type: "text", id: "se-name", className: "se-input", value: projectName });
            nameInput.addEventListener("input", () => projectName = nameInput.value.trim() || "Scratch Project");
            root.appendChild(nameInput);

            const simpleSection = el("div", { className: "se-section" });
            simpleSection.appendChild(el("label", { className: "se-label", textContent: "Console code", htmlFor: "se-code" }));
            const codeInput = el("input", { type: "text", id: "se-code", className: "se-input se-input--mono", placeholder: "e.g. A5K1K" });
            codeInput.addEventListener("input", () => codeInput.value = codeInput.value.toUpperCase());
            simpleSection.appendChild(codeInput);
            simpleSection.appendChild(el("p", { className: "se-hint", textContent: "The code is displayed on your console's SE! screen (settings > Receive Projects)" }));
            root.appendChild(simpleSection);

            const advSection = el("div", { className: "se-section", style: "display:none" });
            advSection.appendChild(el("label", { className: "se-label", textContent: "Host / IP address", htmlFor: "se-host" }));
            const hostInput = el("input", { type: "text", id: "se-host", className: "se-input se-input--mono", placeholder: "192.168.1.100" });
            advSection.appendChild(hostInput);
            advSection.appendChild(el("label", { className: "se-label", textContent: "Port", htmlFor: "se-port" }));
            const portInput = el("input", { type: "text", id: "se-port", className: "se-input se-input--short se-input--mono", placeholder: "8080", value: "8080" });
            advSection.appendChild(portInput);
            const httpsRow = el("div", { className: "se-toggle-row" });
            const httpsCheckbox = el("input", { type: "checkbox", id: "se-https", className: "se-checkbox" });
            httpsRow.appendChild(httpsCheckbox);
            httpsRow.appendChild(el("label", { className: "se-toggle-label", htmlFor: "se-https", textContent: "Use HTTPS" }));
            advSection.appendChild(httpsRow);
            root.appendChild(advSection);

            const toggleRow = el("div", { className: "se-toggle-row se-toggle-row--right" });
            const toggleBtn = el("button", { className: "se-link-btn", textContent: "Show advanced options", type: "button" });
            toggleBtn.addEventListener("click", () => {
                advancedMode = !advancedMode;
                simpleSection.style.display = advancedMode ? "none" : "";
                advSection.style.display = advancedMode ? "" : "none";
                toggleBtn.textContent = advancedMode ? "Hide advanced options" : "Show advanced options";
            });
            toggleRow.appendChild(toggleBtn);
            root.appendChild(toggleRow);

            const progressArea = el("div", { className: "se-progress-area", style: "display:none" });
            const progressTrack = el("div", { className: "se-progress-track" });
            const progressFill = el("div", { className: "se-progress-fill" });
            const progressLabel = el("div", { className: "se-progress-label", textContent: "Preparing…" });
            progressTrack.appendChild(progressFill);
            progressArea.appendChild(progressTrack);
            progressArea.appendChild(progressLabel);
            root.appendChild(progressArea);

            const btnRow = el("div", { className: "se-btn-row" });
            const cancelBtn = el("button", { className: "se-btn se-btn--secondary", textContent: "Cancel", type: "button" });
            cancelBtn.addEventListener("click", () => seWindow?.close());
            const sendBtn = el("button", { className: "se-btn se-btn--primary", textContent: "Send to Console", type: "button" });

            sendBtn.addEventListener("click", async () => {
                let host, port, useHttps;
                if (advancedMode) {
                    host = hostInput.value.trim();
                    port = portInput.value.trim() || "8080";
                    useHttps = httpsCheckbox.checked;
                    if (!host) { hostInput.focus(); hostInput.classList.add("se-input--error"); return; }
                } else {
                    const code = codeInput.value.trim();
                    if (!code) { codeInput.focus(); codeInput.classList.add("se-input--error"); return; }
                    const decoded = decodeCode(code);
                    if (!decoded) { showError(root, simpleSection, btnRow, "<b>Invalid code.</b>"); return; }
                    host = decoded; port = "8080"; useHttps = false;
                }

                const baseUrl = `${useHttps ? "https" : "http"}://${host}:${port}`;
                simpleSection.style.display = advSection.style.display = toggleRow.style.display = btnRow.style.display = "none";
                progressArea.style.display = "";
                seWindow.setTitle("Sending…");

                try {
                    await uploadProject({
                        baseUrl, projectName,
                        onProgress: (percent, secondsLeft) => {
                            progressFill.style.width = `${percent}%`;
                            progressLabel.textContent = percent >= 100 ? "Processing…" : `${Math.round(percent)}% · ${formatTime(secondsLeft)}`;
                        }
                    });
                    progressFill.classList.add("se-progress-fill--success");
                    progressLabel.textContent = "Sent successfully!";
                    setTimeout(() => seWindow?.close(), 1400);
                } catch (err) {
                    progressArea.style.display = "none";
                    toggleRow.style.display = "";
                    if (advancedMode) advSection.style.display = ""; else simpleSection.style.display = "";
                    showError(root, advancedMode ? advSection : simpleSection, btnRow, `<b>Upload failed.</b><br>${err.message}`);
                }
            });

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(sendBtn);
            root.appendChild(btnRow);
            return root;
        }

        seWindow = wm.createWindow({
            id: "se-send-window",
            title: "Send to Scratch Everywhere",
            width: 400,
            height: 360,
            resizable: false,
            className: "se-window",
            onClose: () => seWindow = null
        });
        seWindow.setContent(buildContent());
        seWindow.show();
    }

    while (true) {
        const fileGroup = await addon.tab.waitForElement(
            'div[class*="menu-bar_file-group"]',
            {
                markAsSeen: true,
                reduxEvents: [
                    'scratch-gui/mode/SET_PLAYER',
                    'fontsLoaded/SET_FONTS_LOADED',
                    'scratch-gui/locales/SELECT_LOCALE'
                ]
            }
        );

        if (fileGroup.querySelector(".sa-se-navbar-item")) continue;
        const referenceItem = fileGroup.querySelector('div[class*="menu-bar_menu-bar-item"]');
        if (!referenceItem) continue;

        const navBtn = document.createElement("div");
        navBtn.className = `${referenceItem.className} sa-se-navbar-item`;

        const iconSpan = document.createElement("span");
        iconSpan.className = "sa-se-nav-icon";

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "18");
        svg.setAttribute("height", "11");
        svg.setAttribute("viewBox", "0 0 17.5 10.8");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.innerHTML = `<g transform="translate(-231.7 -174.6)"><g fill="none" stroke="currentColor"><path d="M236.7 175.1c0 0 .1 3.7 .1 2.8-.1-3.6-3.2-2.8-3.5-2.5-1.4 1.5-.4 3.5 .2 3.9 .9 .7 2.7 .9 3.2 1.3 1.9 1.5 .4 4-1.2 4.1-3.5 .2-3.3-3.8-3.3-3.2 0 .7 0 3.2 0 3.2"/><path d="M246.3 181.7l-.3 3.2-7.4-.1 1.4 0 0-4.8 3.4-.1 0 1.5 0-2.8 0 1.3s-3.3 .1-3.3 .1c0-.2-.1-4.6-.1-4.6l-1.2 0 7-.3 0 2.1"/><path d="M248.3 182.5l0-7.2"/><path d="M248 184.5c0-.2 .2-.4 .4-.4 .2 0 .4 .2 .4 .4s-.2 .4-.4 .4c-.2 0-.4-.2-.4-.4z" fill="currentColor"/></g></g>`;

        iconSpan.appendChild(svg);
        navBtn.appendChild(iconSpan);
        navBtn.appendChild(document.createTextNode("Send to Console"));

        navBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openSEWindow();
        });

        fileGroup.appendChild(navBtn);
    }
}