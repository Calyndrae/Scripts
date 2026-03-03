(async function () {
    'use strict';

    /* =========================
       🎨 THEME VARIABLES
    ========================= */
    const V = {
        aaa: "rgba(21, 21, 21, 0.8)", bbb: "#1e1e1e", ccc: "#f4b6d2", ddd: "#e89ec4",
        eee: "#e3e3e3", fff: "#999999", ggg: "rgba(255,255,255,0.06)", hhh: "rgba(244,182,210,0.15)",
        iii: "#282828", kkk: "0 20px 60px rgba(0,0,0,0.20)", lll: "blur(20px)", mmm: "#151515"
    };

    /* =========================
       💾 DATA, SETTINGS & API (CHROME NATIVE)
    ========================= */
    const defaultSettings = {
        profile: { name: "User", callMe: "", about: "", avatar: "" },
        theme: "dark", 
        appearance: { font: "'Inter', system-ui, sans-serif" },
        ai: { apiKey: "sk-6bc6f834c38c4565b9b882a511d529b0", memories: [], systemPrompt: "You are Cyrene, a highly capable AI assistant.", memoryEnabled: true },
        keybinds: { open: "Alt+C", close: "Alt+C" }
    };

    // Load data from Chrome Storage
    const data = await chrome.storage.local.get(['cy_settings', 'sessions', 'currentId']);
    
    let settings = data.cy_settings || defaultSettings;
    if (!settings.appearance) settings.appearance = defaultSettings.appearance;
    if (typeof settings.profile.callMe === "undefined") { settings.profile.callMe = ""; settings.profile.about = ""; }
    if (typeof settings.ai.memoryEnabled === "undefined") settings.ai.memoryEnabled = true;

    let sessions = data.sessions || [{ id: Date.now(), title: "New Session", messages: [], model: "deepseek-chat", tools: [] }];
    let currentId = data.currentId || sessions[0].id;

    let isWaitingForAPI = false; 
    let isTyping = false;        

    const saveState = () => { chrome.storage.local.set({sessions: sessions, currentId: currentId}); };
    const saveSettings = () => { chrome.storage.local.set({cy_settings: settings}); };
    const getActive = () => sessions.find(s => s.id === currentId) || sessions[0];

    function detectProvider(key) {
        if (!key) return "deepseek";
        if (key.startsWith("AIza")) return "gemini";
        if (key.startsWith("sk-proj-") || key.length > 45) return "openai";
        if (key.startsWith("sk-")) return "deepseek";
        return "deepseek";
    }

    // Proxy API requests to background.js
    function fetchSecureAPI(details) {
        chrome.runtime.sendMessage({
            action: "fetchAPI",
            url: details.url,
            method: details.method,
            headers: details.headers,
            data: details.data
        }, (response) => {
            if (response && response.error) {
                if (details.onerror) details.onerror();
            } else if (response) {
                if (details.onload) details.onload({ status: response.status, responseText: response.responseText });
            }
        });
    }

    /* =========================
       🎨 STYLES
    ========================= */
    const style = document.createElement("style");
    style.innerHTML = `
        :root {
            --aaa:${V.aaa}; --bbb:${V.bbb}; --ccc:${V.ccc}; --ddd:${V.ddd};
            --eee:${V.eee}; --fff:${V.fff}; --ggg:${V.ggg}; --hhh:${V.hhh};
            --iii:${V.iii}; --kkk:${V.kkk}; --lll:${V.lll}; --mmm:${V.mmm};
            --cy-font: ${settings.appearance.font};
        }

        .cy-light-theme {
            --aaa: rgba(250, 250, 250, 0.85); --bbb: #e0e0e0; --ccc: #e68ab4; --ddd: #d6709f;
            --eee: #222222; --fff: #666666; --ggg: rgba(0, 0, 0, 0.06); --hhh: rgba(230, 138, 180, 0.2);
            --iii: #ffffff; --mmm: #f5f5f5;
        }

        /* --- CSS SANITIZER --- */
        #cy-root * { box-sizing: border-box !important; font-family: var(--cy-font) !important; line-height: normal; text-shadow: none !important; letter-spacing: normal; }
        #cy-root input, #cy-root textarea, #cy-root button, #cy-root select { outline: none !important; -webkit-appearance: none !important; appearance: none !important; text-decoration: none !important; }
        #cy-root input:focus, #cy-root textarea:focus, #cy-root button:focus { outline: none !important; }
        #cy-root strong, #cy-root b { font-weight: bold !important; color: inherit !important; }
        #cy-root hr { border: none !important; border-top: 1px solid rgba(150, 150, 150, 0.2) !important; height: 0 !important; background: transparent !important; margin: 15px 0 !important; }

        /* Centered Dock Bar */
        #cy-fab {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); width: 160px; height: 46px; border-radius: 23px;
            background: var(--aaa); backdrop-filter: var(--lll); -webkit-backdrop-filter: var(--lll); box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid rgba(150,150,150,0.2);
            color: var(--eee); font-size: 14px; font-weight: 600; letter-spacing: 2px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; z-index: 10000; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #cy-fab:hover { background: var(--iii); border-color: var(--ccc); color: var(--ccc); transform: translateX(-50%) scale(1.05); }
        #cy-fab.hidden { opacity: 0; pointer-events: none; transform: translate(-50%, 30px) scale(0.8); }

        /* Main Panel */
        #cy-panel {
            position: fixed; top: 2vh; right: 2vw; width: 450px; height: 96vh;
            background: var(--aaa); backdrop-filter: var(--lll); -webkit-backdrop-filter: var(--lll); border-radius: 20px; box-shadow: var(--kkk); border: none;
            z-index: 9999; display: flex; flex-direction: column; overflow: hidden; transform-origin: bottom center; transform: translateY(20vh) scale(0.7); opacity: 0; pointer-events: none; transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #cy-panel.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }

        .win-controls { position: absolute; top: 15px; right: 15px; display: flex; gap: 4px; align-items: center; z-index: 1000; }
        .win-btn { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: var(--fff); font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; font-family: monospace; }
        .win-btn:hover { background: var(--ggg); color: var(--eee); }
        .win-close:hover { background: #ff5f56; color: #fff; }

        #cy-main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        #cy-header { padding: 15px 20px; padding-right: 120px; display: flex; justify-content: space-between; align-items: center; cursor: grab; user-select: none; }
        #cy-header:active { cursor: grabbing; }

        .icon-btn { background: transparent; border: none; color: var(--eee); cursor: pointer; padding: 8px; border-radius: 12px; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        .icon-btn:hover { background: var(--ggg); }
        .cy-title { color: var(--eee); font-weight: 600; font-size: 14px; letter-spacing: 2px; pointer-events: none; margin-left: 15px; }

        #cy-chat { flex: 1; overflow-y: auto; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; scroll-behavior: smooth; }
        #cy-chat.is-empty { justify-content: flex-end; padding-bottom: 4vh; }
        #cy-chat.is-empty ~ #cy-footer { margin-bottom: 35vh; }

        .msg-row { display: flex; gap: 16px; width: 100%; max-width: 800px; margin-bottom: 35px; align-items: flex-start; }
        .msg-row.user { flex-direction: row-reverse; } .msg-row.ai { flex-direction: row; }

        .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; flex-shrink: 0; overflow: hidden; }
        .avatar-user { background: var(--ccc); color: #fff; } .avatar-ai { background: var(--iii); color: var(--ccc); }

        .bubble { width: fit-content; max-width: 80%; font-size: 15px; line-height: 1.7; color: var(--eee); overflow-wrap: break-word; word-break: break-word; white-space: pre-wrap; letter-spacing: 0.2px; }
        .bubble-user { background: var(--bbb); padding: 14px 20px; border-radius: 24px 8px 24px 24px; }
        .bubble-ai { background: transparent; padding: 4px 0; width: 100%; }

        .bubble strong { font-weight: bold; color: var(--eee); } .bubble em { font-style: italic; }
        .bubble-ai hr { border: none; border-top: 1px solid rgba(150, 150, 150, 0.2); margin: 15px 0; }
        .bubble-ai ul { margin: 8px 0 8px 24px; padding: 0; list-style-type: disc; } .bubble-ai li { margin-bottom: 6px; }

        .bubble-ai h1 { font-size: 22px; font-weight: 700; color: var(--ccc); margin: 16px 0 8px 0; line-height: 1.3; }
        .bubble-ai h2 { font-size: 18px; font-weight: 600; color: var(--eee); margin: 14px 0 6px 0; line-height: 1.3; }
        .bubble-ai h3 { font-size: 16px; font-weight: 600; color: var(--eee); margin: 12px 0 4px 0; line-height: 1.3; }
        .bubble-ai h1:first-child, .bubble-ai h2:first-child, .bubble-ai h3:first-child { margin-top: 0; }

        .bubble-ai pre { background: var(--iii); padding: 14px; border-radius: 8px; overflow-x: auto; margin: 12px 0; border: 1px solid rgba(150, 150, 150, 0.1); box-shadow: inset 0 2px 10px rgba(0,0,0,0.1); }
        .bubble-ai pre code { font-family: 'Courier New', Courier, monospace; font-size: 13px; color: var(--eee); white-space: pre; }
        .bubble :not(pre) > code { background: rgba(150, 150, 150, 0.15); padding: 2px 6px; border-radius: 4px; color: var(--ccc); font-family: monospace; font-size: 13px; }

        .ai-action-bar { margin-top: 10px; display: flex; gap: 8px; }
        .action-icon-btn { background: transparent; border: none; color: var(--fff); cursor: pointer; padding: 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .action-icon-btn:hover { background: var(--ggg); color: var(--eee); }
        .loading-dots { color: var(--ccc); font-weight: bold; font-size: 18px; animation: pulse 1.5s infinite; }
        
        .empty-logo-anim { animation: ai-pulse-spin 5s infinite ease-in-out; transform-origin: center; }
        @keyframes ai-pulse-spin { 0% { transform: scale(0.9) rotate(0deg); opacity: 0.6; } 50% { transform: scale(1.15) rotate(180deg); opacity: 1; filter: drop-shadow(0 0 12px var(--ccc)); } 100% { transform: scale(0.9) rotate(360deg); opacity: 0.6; } }
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

        #cy-footer { padding: 15px 20px 30px 20px; display: flex; justify-content: center; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .input-box { width: 100%; max-width: 800px; background: var(--iii); border-radius: 20px; border: none; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; transition: 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .input-box:focus-within { box-shadow: 0 0 0 2px rgba(244,182,210,0.4), 0 8px 25px rgba(0,0,0,0.1); }
        #cy-textarea { width: 100%; background: transparent; border: none; outline: none; color: var(--eee); font-size: 15px; resize: none; padding: 4px 0; max-height: 200px; }
        
        .input-toolbar { display: flex; justify-content: space-between; align-items: center; width: 100%; transition: opacity 0.2s; }
        .tool-btn { background: transparent; border: 1px solid rgba(150,150,150,0.2); color: var(--fff); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 12px; cursor: pointer; transition: 0.2s; outline: none; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
        .tool-btn:hover { color: var(--eee); background: rgba(150,150,150,0.1); }
        .tool-btn.active { color: var(--ccc); border-color: var(--hhh); background: var(--hhh); }
        
        .plus-btn { background: transparent; border: none; color: var(--fff); font-size: 20px; font-weight: 300; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; padding-bottom: 2px; }
        .plus-btn:hover { background: var(--ggg); color: var(--eee); }

        #cy-send { width: 36px; height: 36px; background: var(--ccc); color: #fff; border: none; border-radius: 50%; cursor: pointer; font-weight: bold; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        #cy-send:hover { transform: scale(1.05); background: var(--ddd); }
        #cy-send.disabled { opacity: 0.5; cursor: not-allowed; }

        #cy-menu { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--mmm); z-index: 200; border: none; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; border-radius: inherit; }
        #cy-menu.open { transform: translateY(0); }

        .sidebar-bottom { display: flex; gap: 8px; margin: 0 15px 15px 15px; }
        .profile-container { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(150,150,150,0.05); border-radius: 14px; cursor: pointer; transition: 0.2s; border: 1px solid rgba(150,150,150,0.1); flex: 1; overflow: hidden; }
        .profile-container:hover { background: rgba(150,150,150,0.1); border-color: var(--ccc); }
        .profile-avatar-sm { width: 32px; height: 32px; border-radius: 50%; background: var(--ccc); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; overflow: hidden; font-size: 14px; flex-shrink: 0; }
        .profile-avatar-sm img { width: 100%; height: 100%; object-fit: cover; }
        .profile-name-sm { color: var(--eee); font-weight: 600; font-size: 14px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .settings-btn-sm { background: rgba(150,150,150,0.05); border: 1px solid rgba(150,150,150,0.1); color: var(--eee); border-radius: 14px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; padding: 0 14px; outline: none; flex-shrink: 0; }
        .settings-btn-sm:hover { background: rgba(150,150,150,0.1); border-color: var(--ccc); color: var(--ccc); }

        #cy-settings-view, #cy-profile-view { flex: 1; display: none; flex-direction: column; border-top: 1px solid rgba(150,150,150,0.1); overflow: hidden; background: transparent; }
        .st-sidebar { width: 140px; background: rgba(150,150,150,0.02); border-right: 1px solid rgba(150,150,150,0.1); padding: 15px 10px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; border-top: none; }
        .st-nav-btn { background: transparent; border: none; color: var(--fff); text-align: left; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; font-size: 13px; font-weight: 600; }
        .st-nav-btn:hover:not(:disabled) { background: var(--ggg); color: var(--eee); }
        .st-nav-btn.active { background: var(--hhh); color: var(--ccc); }
        .st-content { flex: 1; padding: 25px; padding-top: 10px; overflow-y: auto; position: relative; }
        .settings-section { margin-bottom: 25px; }
        .settings-title { font-size: 12px; text-transform: uppercase; color: var(--fff); font-weight: 700; margin-bottom: 15px; letter-spacing: 1px; }
        
        .cy-input-wrap { margin-bottom: 15px; }
        .cy-input-label { display: block; font-size: 13px; color: var(--eee); margin-bottom: 6px; }
        .cy-input { background: var(--iii); border: 1px solid rgba(150,150,150,0.2); color: var(--eee); padding: 10px 14px; border-radius: 12px; font-size: 14px; outline: none; transition: 0.2s; font-family: var(--cy-font); }
        .cy-input:focus { border-color: var(--ccc); box-shadow: 0 0 0 2px var(--hhh); }

        .cy-mem-item { background: var(--iii); padding: 10px 14px; border-radius: 10px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border: 1px solid rgba(150,150,150,0.1); }

        .avatar-upload-wrap { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; }
        .avatar-preview { width: 70px; height: 70px; border-radius: 50%; background: var(--ccc); color: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; border: 2px dashed rgba(150,150,150,0.3); transition: 0.2s; font-size: 28px; }
        .avatar-preview:hover { border-color: var(--ccc); }
        .avatar-preview img { width: 100%; height: 100%; object-fit: cover; }

        .app-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 15px; max-width: 380px; }
        .app-card { background: var(--iii); border: 2px solid rgba(150,150,150,0.1); border-radius: 12px; padding: 12px; cursor: pointer; text-align: center; transition: 0.2s; color: var(--fff); font-size: 12px; font-weight: 600; }
        .app-card:hover { border-color: rgba(150,150,150,0.4); color: var(--eee); }
        .app-card.active { border-color: var(--ccc); background: var(--hhh); color: var(--ccc); }
        
        .theme-ill { height: 60px; border-radius: 8px; border: 1px solid rgba(150,150,150,0.2); margin-bottom: 8px; display: flex; flex-direction: column; overflow: hidden; }
        .ill-head { width: 100%; height: 14px; background: rgba(150,150,150,0.1); }
        .ill-body { flex: 1; padding: 6px; display: flex; flex-direction: column; gap: 6px; }
        .ill-bub { height: 8px; border-radius: 4px; width: 60%; }
        .ill-bub.left { background: rgba(150,150,150,0.2); align-self: flex-start; }
        .ill-bub.right { background: var(--ccc); align-self: flex-end; }
        
        .ill-light { background: #f5f5f5; } .ill-dark { background: #151515; } .ill-auto { background: linear-gradient(135deg, #f5f5f5 50%, #151515 50%); }
        .font-display { height: 60px; border-radius: 8px; border: 1px solid rgba(150,150,150,0.2); margin-bottom: 8px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--eee); background: rgba(150,150,150,0.05); }

        .cy-toggle { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
        .cy-toggle input { opacity: 0; width: 0; height: 0; }
        .cy-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(150,150,150,0.2); border-radius: 20px; transition: .3s; }
        .cy-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: var(--fff); border-radius: 50%; transition: .3s; }
        .cy-toggle input:checked + .cy-slider { background-color: var(--ccc); }
        .cy-toggle input:checked + .cy-slider:before { transform: translateX(16px); background-color: #fff; }

        #btn-delete-all:hover { background: rgba(255,95,86,0.2) !important; border-color: rgba(255,95,86,0.4) !important; }

        #cy-panel.fullscreen {
            width: 100vw !important; height: 100vh !important;
            top: 0 !important; left: 0 !important; right: auto !important;
            flex-direction: row; border-radius: 0 !important; transform: translateX(0);
            background: var(--mmm) !important; backdrop-filter: none !important; border: none; padding: 25px; gap: 20px;
        }
        #cy-panel.fullscreen .win-controls { top: 20px; right: 20px; }
        #cy-panel.fullscreen #cy-menu { position: relative; transform: none !important; width: 280px; height: 100%; background: transparent; border: none; z-index: 10; flex-shrink: 0; }
        #cy-panel.fullscreen #cy-main-col { flex: 1; background: var(--bbb); border-radius: 16px; box-shadow: var(--kkk); padding: 5px; border: none; }
        #cy-panel.fullscreen #btn-menu { display: none; }
        #cy-panel.fullscreen #btn-menu-sidebar { display: none; }

        #menu-header { padding: 10px 15px 20px 15px; display: flex; justify-content: space-between; align-items: center; color: var(--eee); font-weight: 600; font-size: 16px; border: none; }
        #history-list { flex: 1; overflow-y: auto; padding: 10px; }
        .history-item { padding: 12px 14px; border-radius: 10px; cursor: pointer; color: var(--fff); font-size: 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; transition: 0.2s; border: none; }
        .history-item:hover { background: var(--ggg); color: var(--eee); }
        .history-item.active { background: var(--hhh); color: var(--ccc); }
        .history-item-actions { display: flex; gap: 2px; }
        .ren-btn, .del-btn { background: transparent; border: none; opacity: 0; cursor: pointer; padding: 4px; transition: 0.2s; }
        .ren-btn { color: var(--fff); }
        .del-btn { color: #ff5f56; }
        .history-item:hover .ren-btn, .history-item:hover .del-btn { opacity: 1; }
        .ren-btn:hover { background: rgba(150,150,150,0.2); border-radius: 6px; color: var(--eee); }
        .del-btn:hover { background: rgba(255,95,86,0.1); border-radius: 6px; }

        .new-chat-btn { margin: 0 15px 15px 15px; padding: 14px; background: rgba(150,150,150,0.1); border-radius: 14px; color: var(--eee); text-align: center; cursor: pointer; transition: 0.2s; font-weight: 600; border: none; }
        .new-chat-btn:hover { color: var(--ccc); background: var(--hhh); }
    `;
    document.head.appendChild(style);

    function applyTheme() {
        let t = settings.theme;
        if (t === 'auto') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        if (t === 'light') document.getElementById("cy-root").classList.add("cy-light-theme");
        else document.getElementById("cy-root").classList.remove("cy-light-theme");
    }

    const root = document.createElement("div");
    root.id = "cy-root";
    document.body.appendChild(root);
    applyTheme();

    let initialAvatarHTML = settings.profile.avatar ? `<img src="${settings.profile.avatar}">` : settings.profile.name.charAt(0).toUpperCase();

    root.innerHTML = `
        <button id="cy-fab">✦ CYRENE</button>
        <div id="cy-panel">
            <div class="win-controls">
                <button class="win-btn" id="win-max" title="Full Screen">□</button>
                <button class="win-btn win-close" id="win-close" title="Close">×</button>
            </div>

            <div id="cy-main-col">
                <div id="cy-header">
                    <div style="display:flex; align-items:center;">
                        <button class="icon-btn" id="btn-menu">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                        </button>
                        <span class="cy-title">CYRENE</span>
                    </div>
                </div>

                <div id="cy-profile-view" style="display:none; flex:1; flex-direction:column; padding: 30px; overflow-y:auto; border-top: 1px solid rgba(150,150,150,0.1);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 30px;">
                        <div style="font-size:18px; font-weight:700; color:var(--eee);">Personal Details</div>
                        <button id="btn-back-chat-prof" style="background: rgba(255,95,86,0.1); color: #ff5f56; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">Return</button>
                    </div>
                    
                    <div class="avatar-upload-wrap">
                        <label class="avatar-preview" title="Click to upload picture">
                            <input type="file" id="st-avatar-upload" accept="image/*" style="display:none;">
                            <span id="st-avatar-render" style="font-weight:bold;">${initialAvatarHTML}</span>
                        </label>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <span style="color:var(--fff); font-size:13px;">Profile Picture</span>
                            <span style="color:var(--eee); font-size:11px; opacity:0.6;">Click to browse local files</span>
                        </div>
                    </div>

                    <div class="cy-input-wrap">
                        <span class="cy-input-label">Your Name (Max 20)</span>
                        <input type="text" id="st-name" class="cy-input" value="${settings.profile.name}" maxlength="20" style="width: 200px;">
                    </div>
                    <div class="cy-input-wrap">
                        <span class="cy-input-label">What should AI call you? (Max 30)</span>
                        <input type="text" id="st-callme" class="cy-input" value="${settings.profile.callMe}" maxlength="30" style="width: 280px;" placeholder="E.g., Commander, Boss, Friend">
                    </div>
                    <div class="cy-input-wrap">
                        <span class="cy-input-label">Let AI know more about you (Max 100)</span>
                        <textarea id="st-about" class="cy-input" maxlength="100" rows="3" style="width: 100%; max-width:600px; resize:none;" placeholder="E.g., I'm a developer, I love sci-fi, I prefer short answers.">${settings.profile.about}</textarea>
                    </div>
                </div>

                <div id="cy-settings-view">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 30px 30px 10px 30px;">
                        <div style="font-size:18px; font-weight:700; color:var(--eee);">Settings</div>
                        <button id="btn-back-chat-set" style="background: rgba(255,95,86,0.1); color: #ff5f56; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600;">Return</button>
                    </div>
                    <div style="display:flex; flex-direction:row; flex:1; overflow:hidden;">
                        <div class="st-sidebar">
                            <button class="st-nav-btn active" data-tab="st-appearance">Appearance</button>
                            <button class="st-nav-btn" disabled style="opacity: 0.5; cursor: not-allowed;" title="Coming Soon">Language</button>
                            <button class="st-nav-btn" data-tab="st-ai">AI Profile</button>
                            <button class="st-nav-btn" data-tab="st-memories">Memories</button>
                            <button class="st-nav-btn" data-tab="st-others">Others</button>
                        </div>
                        
                        <div class="st-content">
                            <div id="st-appearance" class="st-pane active">
                                <div class="settings-section">
                                    <div class="settings-title">Global Theme</div>
                                    <div class="app-grid">
                                        <div class="app-card theme-opt ${settings.theme === 'light' ? 'active' : ''}" data-theme="light">
                                            <div class="theme-ill ill-light"><div class="ill-head"></div><div class="ill-body"><div class="ill-bub right"></div><div class="ill-bub left"></div></div></div> White
                                        </div>
                                        <div class="app-card theme-opt ${settings.theme === 'auto' ? 'active' : ''}" data-theme="auto">
                                            <div class="theme-ill ill-auto"><div class="ill-head"></div><div class="ill-body"><div class="ill-bub right"></div><div class="ill-bub left"></div></div></div> Auto
                                        </div>
                                        <div class="app-card theme-opt ${settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                                            <div class="theme-ill ill-dark"><div class="ill-head"></div><div class="ill-body"><div class="ill-bub right"></div><div class="ill-bub left"></div></div></div> Dark
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section">
                                    <div class="settings-title">Chat Font</div>
                                    <div class="app-grid">
                                        <div class="app-card font-opt ${settings.appearance.font.includes('Inter') ? 'active' : ''}" data-font="'Inter', system-ui, sans-serif">
                                            <div class="font-display" style="font-family: 'Inter', system-ui, sans-serif;">Hi!</div> Inter
                                        </div>
                                        <div class="app-card font-opt ${settings.appearance.font.includes('Arial') ? 'active' : ''}" data-font="Arial, sans-serif">
                                            <div class="font-display" style="font-family: Arial, sans-serif;">Hi!</div> Arial
                                        </div>
                                        <div class="app-card font-opt ${settings.appearance.font.includes('Courier') ? 'active' : ''}" data-font="'Courier New', Courier, monospace">
                                            <div class="font-display" style="font-family: 'Courier New', Courier, monospace;">Hi!</div> Courier
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div id="st-ai" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div class="settings-title">AI Engine</div>
                                    <div class="cy-input-wrap">
                                        <span class="cy-input-label">API Key</span>
                                        <input type="password" id="st-api-key" class="cy-input" value="${settings.ai.apiKey}" maxlength="40">
                                    </div>
                                    <div class="cy-input-wrap">
                                        <span class="cy-input-label">System Prompt (Max 700 Words)</span>
                                        <textarea id="st-sys-prompt" class="cy-input" rows="6" style="width:100%; max-width:600px; resize:none;">${settings.ai.systemPrompt}</textarea>
                                    </div>
                                </div>
                            </div>

                            <div id="st-memories" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div class="settings-title">Long-Term Memory</div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid rgba(150,150,150,0.1);">
                                        <div>
                                            <div style="color:var(--eee); font-size:13px; font-weight:600; margin-bottom:4px;">Generate memory from chat history</div>
                                            <div style="font-size:11px; color:var(--fff); max-width:280px; line-height:1.4;">Allowing AI to remember relevant context from your chats.</div>
                                        </div>
                                        <label class="cy-toggle"><input type="checkbox" id="st-mem-toggle" ${settings.ai.memoryEnabled ? 'checked' : ''}><span class="cy-slider"></span></label>
                                    </div>
                                    <div id="st-memories-list"></div>
                                </div>
                            </div>

                            <div id="st-others" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div class="settings-title">Client Settings</div>
                                    <div class="cy-input-wrap">
                                        <span class="cy-input-label">Open Menu Keybind (Max 3 keys)</span>
                                        <input type="text" id="st-key-open" class="cy-input" value="${settings.keybinds.open}" readonly style="width: 250px;" placeholder="Click & press keys">
                                    </div>
                                    <div class="cy-input-wrap" style="margin-bottom:0;">
                                        <span class="cy-input-label">Close Menu Keybind (Max 3 keys)</span>
                                        <input type="text" id="st-key-close" class="cy-input" value="${settings.keybinds.close}" readonly style="width: 250px;" placeholder="Click & press keys">
                                    </div>
                                    <div style="font-size:11px; color:var(--fff); margin-top:6px;">If Open and Close are the same, it functions as a Toggle.</div>
                                </div>
                                <div class="settings-section">
                                    <div class="settings-title">Data Management</div>
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <div>
                                            <div style="color:var(--eee); font-size:13px; font-weight:600; margin-bottom:4px;">Delete All Chats</div>
                                            <div style="font-size:11px; color:var(--fff);">Permanently erase all your conversation history.</div>
                                        </div>
                                        <button id="btn-delete-all" style="background: rgba(255,95,86,0.1); color: #ff5f56; border:1px solid rgba(255,95,86,0.2); padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; font-size:12px; transition:0.2s;">Delete</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="cy-chat"></div>

                <div id="cy-footer">
                    <div class="input-box">
                        <textarea id="cy-textarea" placeholder="Message Assistant..." rows="1"></textarea>
                        <div class="input-toolbar">
                            <div id="cy-dynamic-toolbar-left" style="display:flex; gap:8px; align-items:center;"></div>
                            <button id="cy-send">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="cy-menu">
                <div id="menu-header" style="padding: 15px 20px; justify-content: flex-start;">
                    <button class="icon-btn" id="btn-menu-sidebar" title="Toggle Sidebar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                    <span class="cy-title" style="margin-left: 15px; pointer-events: none;">WORKSPACE</span>
                </div>
                <div class="new-chat-btn" id="btn-new-chat">+ Start New Conversation</div>
                <div style="padding: 0 15px; font-size: 11px; color: var(--fff); text-transform: uppercase; margin-top: 5px; font-weight: 700;">History</div>
                <div id="history-list"></div>
                <div class="sidebar-bottom">
                    <div id="cy-profile-btn" class="profile-container" title="Edit Profile">
                        <div class="profile-avatar-sm" id="sidebar-avatar">${initialAvatarHTML}</div>
                        <div class="profile-name-sm" id="sidebar-name">${settings.profile.name}</div>
                    </div>
                    <button class="settings-btn-sm" id="btn-open-settings" title="Settings">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    /* =========================
       🎮 LOGIC & WINDOW MGMT
    ========================= */
    const UI = {
        panel: document.getElementById("cy-panel"),
        menu: document.getElementById("cy-menu"),
        chat: document.getElementById("cy-chat"),
        footer: document.getElementById("cy-footer"),
        settingsView: document.getElementById("cy-settings-view"),
        profileView: document.getElementById("cy-profile-view"),
        list: document.getElementById("history-list"),
        input: document.getElementById("cy-textarea"),
        header: document.getElementById("cy-header"),
        maxBtn: document.getElementById("win-max"),
        dynamicLeft: document.getElementById("cy-dynamic-toolbar-left"),
        sendBtn: document.getElementById("cy-send")
    };

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

    // Dock & Window Controls
    const fabDock = document.getElementById("cy-fab");

    fabDock.onclick = () => {
        UI.panel.classList.add("open");
        fabDock.classList.add("hidden");
    };

    document.getElementById("win-close").onclick = () => {
        UI.panel.classList.remove("open");
        UI.panel.classList.remove("fullscreen");
        fabDock.classList.remove("hidden");
    };

    UI.maxBtn.onclick = () => {
        const isFS = UI.panel.classList.toggle("fullscreen");
        UI.maxBtn.textContent = isFS ? "❐" : "□";
        if (!isFS) UI.menu.classList.remove("open");
    };

    document.getElementById("btn-menu").onclick = () => UI.menu.classList.add("open");
    document.getElementById("btn-menu-sidebar").onclick = () => UI.menu.classList.remove("open");

    function openSettings(tabId) {
        UI.chat.style.display = "none";
        UI.footer.style.display = "none";
        UI.profileView.style.display = "none";
        UI.settingsView.style.display = "flex";

        if (!UI.panel.classList.contains("fullscreen")) {
            UI.menu.classList.remove("open");
        }

        document.querySelectorAll('.st-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.st-pane').forEach(p => p.style.display = 'none');

        const btn = document.querySelector(`.st-nav-btn[data-tab="${tabId}"]`);
        if(btn) btn.classList.add('active');

        const pane = document.getElementById(tabId);
        if(pane) pane.style.display = "block";
    }

    function openProfile() {
        UI.chat.style.display = "none";
        UI.footer.style.display = "none";
        UI.settingsView.style.display = "none";
        UI.profileView.style.display = "flex";

        if (!UI.panel.classList.contains("fullscreen")) {
            UI.menu.classList.remove("open");
        }
    }

    function returnToChat() {
        UI.settingsView.style.display = "none";
        UI.profileView.style.display = "none";
        UI.chat.style.display = "flex";
        UI.footer.style.display = "flex";
        render(); 
        UI.chat.scrollTop = UI.chat.scrollHeight;
    }

    document.getElementById("btn-open-settings").onclick = () => openSettings('st-appearance');
    document.getElementById("cy-profile-btn").onclick = openProfile;
    document.getElementById("btn-back-chat-set").onclick = returnToChat;
    document.getElementById("btn-back-chat-prof").onclick = returnToChat;

    document.querySelectorAll('.st-nav-btn[data-tab]').forEach(btn => {
        btn.onclick = (e) => {
            if(btn.disabled) return;
            openSettings(e.target.getAttribute('data-tab'));
        };
    });

    let isDragging = false, startX, startY, startLeft, startTop;

    UI.header.onmousedown = (e) => {
        if (e.target.closest('.icon-btn') || e.target.closest('.win-controls') || UI.panel.classList.contains("fullscreen")) return;
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = UI.panel.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        UI.panel.style.right = "auto";
        UI.panel.style.left = startLeft + "px";
        UI.panel.style.top = startTop + "px";
        UI.panel.style.transition = "none";

        document.addEventListener("mousemove", onDrag);
        document.addEventListener("mouseup", stopDrag);
    };

    function onDrag(e) {
        if(!isDragging) return;
        UI.panel.style.left = startLeft + (e.clientX - startX) + "px";
        UI.panel.style.top = startTop + (e.clientY - startY) + "px";
    }

    function stopDrag() {
        isDragging = false;
        UI.panel.style.transition = "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s, height 0.3s";
        document.removeEventListener("mousemove", onDrag); document.removeEventListener("mouseup", stopDrag);
    }

    UI.input.oninput = function(e) {
        let words = this.value.split(/\s+/);
        if (words.length > 150 && this.value.trim() !== "") {
            this.value = words.slice(0, 150).join(" ");
        }
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    };

    /* =========================
       ⚙️ PROFILE & SETTINGS BINDINGS
    ========================= */
    const avatarRender = document.getElementById("st-avatar-render");
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    const sidebarName = document.getElementById("sidebar-name");

    document.getElementById("st-avatar-upload").onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                settings.profile.avatar = evt.target.result;
                const imgHTML = `<img src="${settings.profile.avatar}">`;
                avatarRender.innerHTML = imgHTML;
                sidebarAvatar.innerHTML = imgHTML;
                saveSettings(); render();
            };
            reader.readAsDataURL(file);
        }
    };

    document.getElementById("st-name").oninput = (e) => {
        settings.profile.name = e.target.value || "User";
        if(!settings.profile.avatar) {
            const initial = settings.profile.name.charAt(0).toUpperCase();
            avatarRender.innerHTML = initial;
            sidebarAvatar.innerHTML = initial;
        }
        sidebarName.textContent = settings.profile.name;
        saveSettings(); render();
    };

    document.getElementById("st-callme").oninput = (e) => { settings.profile.callMe = e.target.value; saveSettings(); };
    document.getElementById("st-about").oninput = (e) => { settings.profile.about = e.target.value; saveSettings(); };

    document.querySelectorAll(".theme-opt").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".theme-opt").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            settings.theme = btn.getAttribute("data-theme");
            applyTheme();
            saveSettings();
        };
    });

    document.querySelectorAll(".font-opt").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".font-opt").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            settings.appearance.font = btn.getAttribute("data-font");
            document.getElementById("cy-root").style.setProperty('--cy-font', settings.appearance.font);
            saveSettings();
        };
    });

    document.getElementById("st-api-key").oninput = (e) => { settings.ai.apiKey = e.target.value; saveSettings(); render(); };

    document.getElementById("st-sys-prompt").oninput = (e) => {
        let words = e.target.value.split(/\s+/);
        if (words.length > 700 && e.target.value.trim() !== "") {
            e.target.value = words.slice(0, 700).join(" ");
        }
        settings.ai.systemPrompt = e.target.value;
        saveSettings();
    };

    document.getElementById("st-mem-toggle").onchange = (e) => {
        settings.ai.memoryEnabled = e.target.checked;
        saveSettings();
    };

    document.getElementById("btn-delete-all").onclick = () => {
        if (confirm("Are you sure you want to permanently delete all chats? This cannot be undone.")) {
            sessions = [{ id: Date.now(), title: "New Session", messages: [], model: "deepseek-chat", tools: [] }];
            currentId = sessions[0].id;
            saveState();
            render();
        }
    };

    function bindKeyCapture(inputId, keyType) {
        const el = document.getElementById(inputId);
        el.onkeydown = (e) => {
            e.preventDefault();
            let keys = [];
            if(e.ctrlKey) keys.push('Ctrl');
            if(e.altKey) keys.push('Alt');
            if(e.shiftKey) keys.push('Shift');
            if(e.metaKey) keys.push('Meta');
            if(['Control', 'Alt', 'Shift', 'Meta'].indexOf(e.key) === -1) {
                keys.push(e.key.toUpperCase());
            }
            if (keys.length > 3) keys = keys.slice(0, 3);
            const bindStr = keys.join('+');
            el.value = bindStr;
            settings.keybinds[keyType] = bindStr;
            saveSettings();
        };
    }
    bindKeyCapture("st-key-open", "open");
    bindKeyCapture("st-key-close", "close");

    // Hide UI on Hotkey
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        let keys = [];
        if(e.ctrlKey) keys.push('Ctrl');
        if(e.altKey) keys.push('Alt');
        if(e.shiftKey) keys.push('Shift');
        if(e.metaKey) keys.push('Meta');
        if(['Control', 'Alt', 'Shift', 'Meta'].indexOf(e.key) === -1) {
            keys.push(e.key.toUpperCase());
        }
        if (keys.length > 3) keys = keys.slice(0, 3);
        const currentPress = keys.join('+');

        const { open, close } = settings.keybinds;

        if (open === close && currentPress === open && open !== "") {
            document.getElementById("cy-root").style.display = (document.getElementById("cy-root").style.display === "none") ? "block" : "none";
            e.preventDefault();
        } else if (currentPress === open && open !== "") {
            document.getElementById("cy-root").style.display = "block";
            e.preventDefault();
        } else if (currentPress === close && close !== "") {
            document.getElementById("cy-root").style.display = "none";
            e.preventDefault();
        }
    });

    function renderMemories() {
        const list = document.getElementById("st-memories-list");
        list.innerHTML = "";
        if (settings.ai.memories.length === 0) {
            list.innerHTML = `<div style="color:var(--fff); font-size:12px; font-style:italic;">No memories saved yet.</div>`;
            return;
        }
        settings.ai.memories.forEach((mem, idx) => {
            const item = document.createElement("div");
            item.className = "cy-mem-item";
            item.innerHTML = `<span>${mem}</span> <button class="del-btn" style="opacity:1; padding:0 4px;">×</button>`;
            item.querySelector('.del-btn').onclick = () => {
                settings.ai.memories.splice(idx, 1);
                saveSettings();
                renderMemories();
            };
            list.appendChild(item);
        });
    }
    renderMemories();

    function render() {
        if (UI.settingsView.style.display === "flex" || UI.profileView.style.display === "flex") {
            return;
        }

        const active = getActive();
        const provider = detectProvider(settings.ai.apiKey);
        if(!active.tools) active.tools = [];

        if (provider === "deepseek") {
            const isSearch = active.tools.includes("search");
            const isWeb = active.tools.includes("web");
            const isThink = active.model === "deepseek-reasoner";
            UI.dynamicLeft.innerHTML = `
                <button class="tool-btn ${isSearch ? 'active' : ''}" id="ds-search" title="Internet Search">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    Search
                </button>
                <button class="tool-btn ${isWeb ? 'active' : ''}" id="ds-web" title="Web Interact">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path></svg>
                    Interact
                </button>
                <button class="tool-btn ${isThink ? 'active' : ''}" id="ds-think" title="Think Model">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                    Think
                </button>
            `;
            
            document.getElementById("ds-search").onclick = () => {
                if (active.tools.includes("search")) active.tools = active.tools.filter(t => t !== "search");
                else active.tools.push("search");
                saveState(); render();
            };
            document.getElementById("ds-web").onclick = () => {
                if (active.tools.includes("web")) active.tools = active.tools.filter(t => t !== "web");
                else active.tools.push("web");
                saveState(); render();
            };
            document.getElementById("ds-think").onclick = () => {
                active.model = active.model === "deepseek-reasoner" ? "deepseek-chat" : "deepseek-reasoner";
                saveState(); render();
            };

        } else {
            let models = provider === "openai"
                ? ["gpt-4o", "gpt-4o-mini", "o1-preview"]
                : ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"];

            if (!models.includes(active.model)) active.model = models[0];

            let hasSearch = !active.model.includes("o1");
            let hasVision = !active.model.includes("o1");
            const isWeb = active.tools.includes("web");

            UI.dynamicLeft.innerHTML = `
                <button class="plus-btn" title="Upload File">+</button>
                <select class="tool-btn" id="gen-model-select" style="appearance:none; padding-right:12px; padding-left:12px;">
                    ${models.map(m => `<option value="${m}" ${active.model === m ? 'selected' : ''} style="color:#000;">${m}</option>`).join("")}
                </select>
                ${hasSearch ? `<button class="tool-btn active" title="Web Search" style="padding:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button>` : ''}
                <button class="tool-btn ${isWeb ? 'active' : ''}" id="gen-web" title="Web Interact" style="padding:6px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path><path d="M13 13l6 6"></path></svg>
                </button>
                ${hasVision ? `<button class="tool-btn active" title="Vision/Image" style="padding:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></button>` : ''}
            `;

            document.getElementById("gen-model-select").onchange = (e) => {
                active.model = e.target.value;
                saveState(); render();
            };
            document.getElementById("gen-web").onclick = () => {
                if (active.tools.includes("web")) active.tools = active.tools.filter(t => t !== "web");
                else active.tools.push("web");
                saveState(); render();
            };
        }

        const toolbarLeft = document.getElementById("cy-dynamic-toolbar-left");
        if (isWaitingForAPI || isTyping) {
            UI.sendBtn.classList.add("disabled");
            UI.sendBtn.disabled = true;
            if (toolbarLeft) {
                toolbarLeft.style.pointerEvents = "none";
                toolbarLeft.style.opacity = "0.5";
            }
        } else {
            UI.sendBtn.classList.remove("disabled");
            UI.sendBtn.disabled = false;
            if (toolbarLeft) {
                toolbarLeft.style.pointerEvents = "auto";
                toolbarLeft.style.opacity = "1";
            }
        }

        if (active.messages.length === 0) {
            UI.chat.classList.add('is-empty');

            if (!active.emptyGreeting) {
                const name = settings.profile.callMe || settings.profile.name || "User";
                const r = Math.random();
                if (r < 0.4) {
                    const hr = new Date().getHours();
                    if (hr < 12) active.emptyGreeting = `Good Morning, ${name}.`;
                    else if (hr < 18) active.emptyGreeting = `Good Afternoon, ${name}.`;
                    else active.emptyGreeting = `Good Evening, ${name}.`;
                } else if (r < 0.6) {
                    const langs = [
                        `Hi, ${name}.`, `你好, ${name}.`, `Hola, ${name}.`, `Bonjour, ${name}.`,
                        `こんにちは, ${name}.`, `Hallo, ${name}.`, `Ciao, ${name}.`, `Olá, ${name}.`,
                        `안녕하세요, ${name}.`, `Namaste, ${name}.`
                    ];
                    active.emptyGreeting = langs[Math.floor(Math.random() * langs.length)];
                } else {
                    const greets = [
                        `What's Up, ${name}?`, `How are you doing, ${name}?`, `Ready to explore, ${name}?`,
                        `How can I assist you, ${name}?`, `Great to see you, ${name}!`,
                        `What's on your mind, ${name}?`, `Let's get started, ${name}.`
                    ];
                    active.emptyGreeting = greets[Math.floor(Math.random() * greets.length)];
                }
                saveState();
            }

            UI.chat.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; gap:16px;">
                    <svg class="empty-logo-anim" width="34" height="34" viewBox="0 0 24 24" fill="var(--ccc)" stroke="none">
                        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
                    </svg>
                    <div style="font-size:24px; font-weight:700; color:var(--eee);">${active.emptyGreeting}</div>
                </div>
            `;
        } else {
            UI.chat.classList.remove('is-empty');
            let lastAiIdx = -1;
            for (let i = active.messages.length - 1; i >= 0; i--) {
                if (active.messages[i].role === 'assistant') {
                    lastAiIdx = i;
                    break;
                }
            }

            UI.chat.innerHTML = active.messages.map((m, idx) => {
                const isUser = m.role === 'user';
                const roleClass = isUser ? 'user' : 'ai';

                let avatarHTML = '✦';
                if (isUser) {
                    if (settings.profile.avatar) {
                        avatarHTML = `<img src="${settings.profile.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
                    } else {
                        avatarHTML = settings.profile.name.charAt(0).toUpperCase();
                    }
                }

                let cleanContent = m.content.trim();

                cleanContent = cleanContent.replace(/<save_memory>([\s\S]*?)<\/save_memory>/gi, "");
                cleanContent = cleanContent.replace(/<execute>([\s\S]*?)<\/execute>/gi, "");

                cleanContent = cleanContent.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                let codeBlocks = [];
                cleanContent = cleanContent.replace(/```[^\n]*\n([\s\S]*?)```/g, function(match, code) {
                    codeBlocks.push(code.trim());
                    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
                });

                let inlineCodes = [];
                cleanContent = cleanContent.replace(/`([^`\n]+)`/g, function(match, code) {
                    inlineCodes.push(code);
                    return `__INLINECODE_${inlineCodes.length - 1}__`;
                });

                if (!isUser) {
                    cleanContent = cleanContent.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
                    cleanContent = cleanContent.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
                    cleanContent = cleanContent.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
                    cleanContent = cleanContent.replace(/\n*^---+\s*$\n*/gm, "<hr>");
                    cleanContent = cleanContent.replace(/^(\s*)[-*]\s+(.*)$/gm, "<ul><li>$2</li></ul>");
                    cleanContent = cleanContent.replace(/<\/ul>\n*<ul>/g, "");
                }

                cleanContent = cleanContent.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
                cleanContent = cleanContent.replace(/\*([\s\S]+?)\*/g, "<em>$1</em>");
                cleanContent = cleanContent.replace(/\n/g, "<br>");

                cleanContent = cleanContent.replace(/__INLINECODE_(\d+)__/g, function(match, idx) {
                    return `<code>${inlineCodes[idx]}</code>`;
                });
                cleanContent = cleanContent.replace(/__CODEBLOCK_(\d+)__/g, function(match, idx) {
                    return `<pre><code>${codeBlocks[idx]}</code></pre>`;
                });

                let actionBar = '';
                if (!isUser && idx === lastAiIdx && !isWaitingForAPI && !isTyping) {
                    actionBar = `<div class="ai-action-bar"><button class="action-icon-btn copy-btn" data-idx="${idx}" title="Copy to clipboard"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="action-icon-btn regen-btn" title="Regenerate response"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button></div>`;
                }

                return `<div class="msg-row ${roleClass}"><div class="avatar avatar-${roleClass}">${avatarHTML}</div><div class="bubble bubble-${roleClass}">${cleanContent}${actionBar}</div></div>`;
            }).join("");

            if (isWaitingForAPI) {
                UI.chat.innerHTML += `<div class="msg-row ai"><div class="avatar avatar-ai">✦</div><div class="bubble bubble-ai loading-dots">...</div></div>`;
            }
        }
        UI.chat.scrollTop = UI.chat.scrollHeight;

        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.onclick = () => {
                const msgIdx = btn.getAttribute('data-idx');
                const rawText = active.messages[msgIdx].content;
                navigator.clipboard.writeText(rawText).then(() => {
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27c93f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
                });
            };
        });

        document.querySelectorAll('.regen-btn').forEach(btn => {
            btn.onclick = () => {
                if (isWaitingForAPI || isTyping) return;
                const active = getActive();
                if (active.messages.length > 0 && active.messages[active.messages.length - 1].role === 'assistant') {
                    active.messages.pop();
                }
                isWaitingForAPI = true;
                saveState(); render();

                let webContext = null;
                if (active.tools && active.tools.includes("web")) webContext = getWebContext();

                if (active.tools && active.tools.includes("search")) {
                    let lastUserMsg = active.messages.slice().reverse().find(m => m.role === 'user');
                    if(lastUserMsg) {
                        fetchDuckDuckGo(lastUserMsg.content, (res) => callDeepSeekAPI(res, webContext));
                    } else callDeepSeekAPI(null, webContext);
                } else {
                    callDeepSeekAPI(null, webContext);
                }
            };
        });

        UI.list.innerHTML = "";
        sessions.forEach(s => {
            if (s.messages.length === 0) return;

            const item = document.createElement("div");
            item.className = `history-item ${s.id === currentId ? 'active' : ''}`;

            item.innerHTML = `
                <span class="chat-title-span" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%; flex:1;">${s.title}</span>
                <div class="history-item-actions">
                    <button class="ren-btn" title="Rename">✎</button>
                    <button class="del-btn" title="Delete">×</button>
                </div>
            `;

            item.onclick = (e) => {
                if(!e.target.closest('.del-btn') && !e.target.closest('.ren-btn') && !e.target.closest('.rename-input')) {
                    currentId = s.id; saveState(); returnToChat(); render();
                    if(!UI.panel.classList.contains("fullscreen")) {
                        UI.menu.classList.remove("open");
                    }
                }
            };

            item.querySelector('.ren-btn').onclick = (e) => {
                e.stopPropagation();
                const span = item.querySelector('.chat-title-span');
                span.innerHTML = `<input type="text" class="rename-input" maxlength="12" value="${s.title}" style="width:100%; background:transparent; border:none; color:inherit; outline:none; font-size:inherit; font-family:inherit;">`;

                const input = span.querySelector('input');
                input.focus();
                input.select();

                const saveRename = () => {
                    const newTitle = input.value.trim();
                    s.title = newTitle || "New Session";
                    saveState();
                    render();
                };

                input.onblur = saveRename;
                input.onkeydown = (ke) => {
                    if (ke.key === "Enter") {
                        ke.preventDefault();
                        input.blur();
                    }
                };
            };

            item.querySelector('.del-btn').onclick = (e) => {
                e.stopPropagation();
                sessions = sessions.filter(x => x.id !== s.id);
                if (sessions.length === 0) sessions = [{ id: Date.now(), title: "New Session", messages: [], model: "deepseek-chat", tools: [] }];
                if (currentId === s.id) currentId = sessions[0].id;
                saveState(); render();
            };

            UI.list.appendChild(item);
        });
    }

    function fetchDuckDuckGo(query, callback) {
        fetchSecureAPI({
            method: "POST",
            url: "https://lite.duckduckgo.com/lite/",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: "q=" + encodeURIComponent(query),
            onload: function(response) {
                if (response.status === 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, "text/html");
                    const snippets = Array.from(doc.querySelectorAll('.result-snippet')).map(el => el.textContent.trim());
                    if (snippets.length > 0) {
                        callback(snippets.slice(0, 3).map(s => "- " + s).join("\n"));
                    } else {
                        callback("No real-time search results found.");
                    }
                } else {
                    callback(null);
                }
            },
            onerror: function() { callback(null); }
        });
    }

    function getWebContext() {
        document.getElementById('cy-root').style.display = 'none';

        let uiMap = "";
        const interactables = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
        let count = 0;
        interactables.forEach(el => {
            if (count > 100) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            let type = el.tagName.toLowerCase();
            let text = el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || "";
            text = text.trim().replace(/\n/g, ' ');
            if (!text) return;

            if (type === 'a') type = 'link';

            uiMap += `[${type.toUpperCase()}: "${text}"]\n`;
            count++;
        });

        let pageText = document.body.innerText || "";
        if(pageText.length > 1000) pageText = pageText.substring(0, 1000) + "... [Truncated]";

        document.getElementById('cy-root').style.display = 'block';

        return `[CURRENT WEBPAGE CONTEXT]\nURL: ${window.location.href}\nTitle: ${document.title}\n\n[INTERACTIVE UI ELEMENTS MAP]\nThis is a structural list of clickable buttons, links, and inputs currently visible on the screen. Use this map to know EXACTLY what text to look for:\n${uiMap || "No interactive elements found."}\n\n[FULL PAGE TEXT]\n${pageText}\n[END WEBPAGE CONTEXT]\n\n[WEB INTERACT CAPABILITIES - GOD MODE]\nYou are natively integrated into the user's browser. You have full JavaScript execution rights to interact with the current webpage.\nIf the user asks you to click, scroll, fill forms, or interact, you MUST output valid, raw vanilla JavaScript inside an <execute> tag.\n\nExample:\n<execute>\nlet btn = Array.from(document.querySelectorAll('button, div')).find(e => e.innerText.includes('enero'));\nif (btn) {\n  btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));\n  btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));\n  btn.click();\n}\n</execute>\n\nSTRICT RULES:\n1. Keep code highly concise (under 15 lines recommended).\n2. For modern React sites, standard .click() often fails. Always dispatch MouseEvents (mousedown, mouseup, click) with {bubbles: true}.\n3. NEVER apologize. You CAN interact. Just write the script inside <execute>.`;
    }

    function callDeepSeekAPI(searchContext = null, webContext = null) {
        const active = getActive();
        let apiMessages = active.messages.map(m => ({ role: m.role, content: m.content }));

        let finalSysPrompt = settings.ai.systemPrompt || "You are a helpful AI assistant.";
        if (settings.profile.callMe) finalSysPrompt += `\n\nThe user prefers to be called: "${settings.profile.callMe}".`;
        if (settings.profile.about) finalSysPrompt += `\n\nContext about the user: "${settings.profile.about}".`;

        if (settings.ai.memoryEnabled) {
            if (settings.ai.memories.length > 0) {
                finalSysPrompt += "\n\n[Your Long-Term Memories about the User]\n" + settings.ai.memories.map(m => "- " + m).join("\n");
            }
            finalSysPrompt += "\n\n[Memory Instructions]\nIf the user explicitly shares personal facts, preferences, or asks you to remember something, you MUST save it by outputting the exact fact wrapped inside <save_memory>fact goes here</save_memory> tags. Only do this when completely necessary.";
        }

        apiMessages.unshift({ role: "system", content: finalSysPrompt });

        if (webContext) {
            let lastUserMsg = apiMessages[apiMessages.length - 1];
            if (lastUserMsg && lastUserMsg.role === 'user') {
                lastUserMsg.content = `${webContext}\n\n[User Query]\n${lastUserMsg.content}`;
            }
        }

        if (searchContext) {
            let lastUserMsg = apiMessages[apiMessages.length - 1];
            if (lastUserMsg && lastUserMsg.role === 'user') {
                if (lastUserMsg.content.includes("[User Query]")) {
                    lastUserMsg.content = `[Real-Time Web Search Results]\n${searchContext}\n\n` + lastUserMsg.content;
                } else {
                    lastUserMsg.content = `[Real-Time Web Search Results]\n${searchContext}\n\n[User Query]\n${lastUserMsg.content}\n\nInstruction: Answer the User Query accurately using the provided Web Search Results.`;
                }
            }
        }

        fetchSecureAPI({
            method: "POST",
            url: "https://api.deepseek.com/chat/completions",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${settings.ai.apiKey}`
            },
            data: JSON.stringify({
                model: active.model || "deepseek-chat",
                messages: apiMessages
            }),
            onload: function(response) {
                isWaitingForAPI = false;
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const rawAiMessage = data.choices[0].message.content;

                        if (settings.ai.memoryEnabled) {
                            const memoryMatches = [...rawAiMessage.matchAll(/<save_memory>([\s\S]*?)<\/save_memory>/gi)];
                            if (memoryMatches.length > 0) {
                                memoryMatches.forEach(match => settings.ai.memories.push(match[1].trim()));
                                saveSettings();
                                renderMemories();
                            }
                        }

                        const executeMatches = [...rawAiMessage.matchAll(/<execute>([\s\S]*?)<\/execute>/gi)];
                        executeMatches.forEach(match => {
                            let code = match[1].trim();
                            code = code.replace(/^```(javascript|js)?\n/i, '').replace(/```$/i, '').trim();
                            try {
                                new Function(code)();
                            } catch (e) {
                                console.error("Cyrene Execute Error:", e);
                            }
                        });

                        let displayMessage = rawAiMessage;
                        displayMessage = displayMessage.replace(/<save_memory>[\s\S]*?<\/save_memory>/gi, "");
                        displayMessage = displayMessage.replace(/<execute>[\s\S]*?<\/execute>/gi, "");
                        displayMessage = displayMessage.trim();

                        active.messages.push({ role: 'assistant', content: "" });
                        isTyping = true;
                        let msgIdx = active.messages.length - 1;
                        let startTime = null;

                        const duration = Math.min(800 + displayMessage.length * 12, 3500);
                        function easeOutQuad(x) { return 1 - (1 - x) * (1 - x); }

                        function animateTyping(timestamp) {
                            if (!startTime) startTime = timestamp;
                            let progress = (timestamp - startTime) / duration;
                            if (progress > 1) progress = 1;

                            let easedProgress = easeOutQuad(progress);
                            let charsToShow = Math.floor(displayMessage.length * easedProgress);

                            active.messages[msgIdx].content = displayMessage.substring(0, charsToShow);
                            render();

                            if (progress < 1) {
                                requestAnimationFrame(animateTyping);
                            } else {
                                isTyping = false;
                                saveState();
                                render();
                            }
                        }

                        requestAnimationFrame(animateTyping);

                    } catch(e) {
                        active.messages.push({ role: 'assistant', content: "Error parsing API response." });
                        saveState(); render();
                    }
                } else {
                    active.messages.push({ role: 'assistant', content: `API Error: ${response.status} - Check your API connection.` });
                    saveState(); render();
                }
            },
            onerror: function() {
                isWaitingForAPI = false;
                active.messages.push({ role: 'assistant', content: "Network Error: Failed to connect to DeepSeek." });
                saveState(); render();
            }
        });
    }

    function sendMsg() {
        const text = UI.input.value.trim();
        if(!text || isWaitingForAPI || isTyping) return;

        const active = getActive();
        if (active.messages.length === 0) active.title = text.substring(0, 25) + '...';

        active.messages.push({ role: 'user', content: text });
        UI.input.value = ""; UI.input.style.height = "auto";
        isWaitingForAPI = true;
        saveState(); render();

        returnToChat();

        let webContext = null;
        if (active.tools && active.tools.includes("web")) {
            webContext = getWebContext();
        }

        if (active.tools && active.tools.includes("search")) {
            fetchDuckDuckGo(text, function(searchResults) {
                callDeepSeekAPI(searchResults, webContext);
            });
        } else {
            callDeepSeekAPI(null, webContext);
        }
    }

    document.getElementById("cy-send").onclick = sendMsg;
    UI.input.onkeydown = (e) => {
        if(e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!isWaitingForAPI && !isTyping) sendMsg();
        }
    };

    document.getElementById("btn-new-chat").onclick = () => {
        const active = getActive();
        if (active.messages.length === 0) {
            returnToChat();
            if(!UI.panel.classList.contains("fullscreen")) UI.menu.classList.remove("open");
            return;
        }
        const n = { id: Date.now(), title: "New Session", messages: [], model: active.model, tools: active.tools };
        sessions.unshift(n); currentId = n.id; saveState(); returnToChat(); render();
        if(!UI.panel.classList.contains("fullscreen")) {
            UI.menu.classList.remove("open");
        }
    };

    render();
})();
