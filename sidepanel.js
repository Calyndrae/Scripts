(async function () {
    'use strict';

    const V = {
        aaa: "rgba(21, 21, 21, 0.8)", bbb: "#1e1e1e", ccc: "#f4b6d2", ddd: "#e89ec4",
        eee: "#e3e3e3", fff: "#999999", ggg: "rgba(255,255,255,0.06)", hhh: "rgba(244,182,210,0.15)",
        iii: "#282828", kkk: "0 20px 60px rgba(0,0,0,0.20)", lll: "blur(20px)", mmm: "#151515"
    };

    const defaultSettings = {
        profile: { name: "User", callMe: "", about: "", avatar: "" },
        theme: "dark", 
        language: "en",
        appearance: { font: "'Inter', system-ui, sans-serif", accent: "pink", userColor: "default" },
        ai: { apiKey: "sk-6bc6f834c38c4565b9b882a511d529b0", memories: [], systemPrompt: "You are Cyrene, a highly capable AI assistant.", memoryEnabled: true }
    };

    const data = await chrome.storage.local.get(['cy_settings', 'sessions', 'currentId', 'projects']);
    
    let settings = data.cy_settings || defaultSettings;
    if (!settings.appearance) settings.appearance = defaultSettings.appearance;
    if (!settings.appearance.accent) settings.appearance.accent = "pink";
    if (!settings.appearance.userColor) settings.appearance.userColor = "default";
    if (!settings.language) settings.language = "en";
    if (typeof settings.profile.callMe === "undefined") { settings.profile.callMe = ""; settings.profile.about = ""; }
    if (typeof settings.ai.memoryEnabled === "undefined") settings.ai.memoryEnabled = true;

    let sessions = data.sessions || [{ id: Date.now(), title: "New Session", messages: [], model: "deepseek-chat", tools: [] }];
    let currentId = data.currentId || sessions[0].id;
    let projects = data.projects || [];
    let pendingProject = null;
    
    let activeSession = sessions.find(s => s.id === currentId);
    let wasChatLost = false;

    if (!activeSession) {
        activeSession = { id: Date.now(), title: "New Session", messages: [], model: "deepseek-chat", tools: [] };
        sessions.unshift(activeSession);
        currentId = activeSession.id;
        wasChatLost = true;
    }
    let activeProjectId = activeSession.projectId || null;

    let isWaitingForAPI = false; 
    let isTyping = false;        

    let i18n = {
        en: { 
            lang_name: "English", appearance: "Appearance", language: "Language", 
            ai_profile: "AI Profile", memories: "Memories", others: "Others",
            global_theme: "Global Theme", chat_font: "Chat Font", accent_color: "Accent Colour",
            user_bubble_color: "User Bubble Colour", new_chat: "+ New Chat", search: "Search",
            projects: "Projects", history: "HISTORY", workspace: "WORKSPACE", settings: "Settings",
            personal_details: "Personal Details", return: "Return", cancel: "Cancel", confirm: "Confirm",
            create_project: "Create Project", delete: "Delete", rename: "Rename", message_assistant: "Message Assistant...",
            tool_search: "Search", tool_interact: "Interact", tool_think: "Think"
        }
    };

    if (settings.language !== "en") {
        try {
            const fileUrl = chrome.runtime.getURL(`locales/${settings.language}.json`);
            const res = await fetch(fileUrl);
            if (res.ok) i18n[settings.language] = await res.json();
        } catch(e) { console.error("Cyrene couldn't load language file.", e); }
    }

    const t = (key, defaultText) => {
        if (i18n[settings.language] && i18n[settings.language][key]) return i18n[settings.language][key];
        if (i18n['en'] && i18n['en'][key]) return i18n['en'][key];
        return defaultText || key;
    };

    const saveState = () => { chrome.storage.local.set({sessions: sessions, currentId: currentId, projects: projects}); };
    const saveSettings = () => { chrome.storage.local.set({cy_settings: settings}); };
    const getActive = () => sessions.find(s => s.id === currentId) || sessions[0];

    function detectProvider(key) {
        if (!key) return "deepseek";
        if (key.startsWith("AIza")) return "gemini";
        if (key.startsWith("sk-proj-") || key.length > 45) return "openai";
        if (key.startsWith("sk-")) return "deepseek";
        return "deepseek";
    }

    function fetchSecureAPI(details) {
        chrome.runtime.sendMessage({
            action: "fetchAPI", url: details.url, method: details.method,
            headers: details.headers, data: details.data
        }, (response) => {
            if (response && response.error && details.onerror) details.onerror();
            else if (response && details.onload) details.onload({ status: response.status, responseText: response.responseText });
        });
    }

    const style = document.createElement("style");
    style.innerHTML = `
        :root, #cy-root {
            --aaa:${V.aaa}; --bbb:${V.bbb}; --ccc:${V.ccc}; --ddd:${V.ddd};
            --eee:${V.eee}; --fff:${V.fff}; --ggg:${V.ggg}; --hhh:${V.hhh};
            --iii:${V.iii}; --kkk:${V.kkk}; --lll:${V.lll}; --mmm:${V.mmm};
            --cy-font: ${settings.appearance.font};
            --user-bub: rgba(150, 150, 150, 0.15);
        }
        .cy-light-theme {
            --aaa: #f5f5f5; --bbb: #e0e0e0; --ccc: #e68ab4; --ddd: #d6709f;
            --eee: #222222; --fff: #666666; --ggg: rgba(0, 0, 0, 0.06); --hhh: rgba(230, 138, 180, 0.2);
            --iii: #ffffff; --mmm: #f5f5f5;
        }

        #cy-root * { box-sizing: border-box !important; font-family: var(--cy-font) !important; line-height: normal; }
        #cy-root input, #cy-root textarea, #cy-root button, #cy-root select { outline: none !important; border: none; background: none; }
        #cy-root hr { border: none; border-top: 1px solid rgba(150, 150, 150, 0.2); height: 0; background: transparent; margin: 15px 0; }

        /* Full Width Panel for Native Sidebar */
        #cy-panel {
            width: 100vw; height: 100vh; background: var(--aaa); display: flex; flex-direction: column; overflow: hidden; position: relative;
        }

        #cy-main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; background: var(--aaa); }
        #cy-header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; user-select: none; }

        .icon-btn { color: var(--eee); cursor: pointer; padding: 8px; border-radius: 12px; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        .icon-btn:hover { background: var(--ggg); }
        .cy-title { color: var(--eee); font-weight: 600; font-size: 14px; letter-spacing: 2px; pointer-events: none; margin-left: 15px; }

        #cy-chat { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; align-items: center; scroll-behavior: smooth; }
        #cy-chat.is-empty { justify-content: center; }

        .msg-row { display: flex; gap: 12px; width: 100%; max-width: 100%; margin-bottom: 30px; align-items: flex-start; }
        .msg-row.user { flex-direction: row-reverse; } .msg-row.ai { flex-direction: row; }

        .avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; overflow: hidden; }
        .avatar-user { background: var(--ccc); color: #fff; } .avatar-ai { background: var(--iii); color: var(--ccc); }

        .bubble { width: fit-content; max-width: 85%; font-size: 14px; line-height: 1.6; color: var(--eee); overflow-wrap: break-word; word-break: break-word; white-space: pre-wrap; }
        .bubble-user { background: var(--user-bub); padding: 12px 16px; border-radius: 20px 6px 20px 20px; transition: background 0.3s; }
        .bubble-ai { background: transparent; padding: 4px 0; width: 100%; }

        .bubble strong { font-weight: bold; color: var(--eee); } .bubble em { font-style: italic; }
        .bubble-ai hr { border-top: 1px solid rgba(150, 150, 150, 0.2); margin: 15px 0; }
        .bubble-ai ul { margin: 8px 0 8px 24px; padding: 0; list-style-type: disc; } .bubble-ai li { margin-bottom: 6px; }

        .bubble-ai pre { background: var(--iii); padding: 12px; border-radius: 8px; overflow-x: auto; margin: 10px 0; border: 1px solid rgba(150, 150, 150, 0.1); }
        .bubble-ai pre code { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: var(--eee); white-space: pre; }
        .bubble :not(pre) > code { background: rgba(150, 150, 150, 0.15); padding: 2px 6px; border-radius: 4px; color: var(--ccc); font-family: monospace; font-size: 12px; }

        .ai-action-bar { margin-top: 10px; display: flex; gap: 8px; }
        .action-icon-btn { color: var(--fff); cursor: pointer; padding: 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .action-icon-btn:hover { background: var(--ggg); color: var(--eee); }
        .loading-dots { color: var(--ccc); font-weight: bold; font-size: 18px; animation: pulse 1.5s infinite; }
        
        .empty-logo-anim { animation: ai-pulse-spin 5s infinite ease-in-out; transform-origin: center; margin-bottom: 15px; }
        @keyframes ai-pulse-spin { 0% { transform: scale(0.9) rotate(0deg); opacity: 0.6; } 50% { transform: scale(1.15) rotate(180deg); opacity: 1; filter: drop-shadow(0 0 12px var(--ccc)); } 100% { transform: scale(0.9) rotate(360deg); opacity: 0.6; } }
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

        #cy-footer { padding: 15px; display: flex; justify-content: center; background: var(--aaa); border-top: 1px solid rgba(150,150,150,0.1); }
        .input-box { width: 100%; max-width: 100%; background: var(--iii); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: 0.2s; border: 1px solid rgba(150,150,150,0.1); }
        .input-box:focus-within { border-color: var(--ccc); box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        #cy-textarea { width: 100%; color: var(--eee); font-size: 14px; resize: none; padding: 4px 0; max-height: 150px; }
        
        .input-toolbar { display: flex; justify-content: space-between; align-items: center; width: 100%; }
        .tool-btn { border: 1px solid rgba(150,150,150,0.2); color: var(--fff); font-size: 11px; font-weight: 600; padding: 6px 10px; border-radius: 10px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
        .tool-btn:hover { color: var(--eee); background: rgba(150,150,150,0.1); }
        .tool-btn.active { color: var(--ccc); border-color: var(--hhh); background: var(--hhh); }
        
        .plus-btn { color: var(--fff); font-size: 18px; font-weight: 300; cursor: pointer; transition: 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .plus-btn:hover { color: var(--eee); }

        #cy-send { width: 32px; height: 32px; background: var(--ccc); color: #151515; border-radius: 50%; cursor: pointer; font-weight: bold; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
        #cy-send:hover { transform: scale(1.05); }
        #cy-send.disabled { opacity: 0.5; cursor: not-allowed; }

        #cy-menu { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--mmm); z-index: 200; transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; }
        #cy-menu.open { transform: translateX(0); }

        .sidebar-bottom { display: flex; gap: 8px; margin: 15px; }
        .profile-container { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(150,150,150,0.05); border-radius: 12px; cursor: pointer; transition: 0.2s; flex: 1; border: 1px solid rgba(150,150,150,0.1); }
        .profile-container:hover { border-color: var(--ccc); }
        .profile-avatar-sm { width: 28px; height: 28px; border-radius: 50%; background: var(--ccc); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; overflow: hidden; }
        .profile-avatar-sm img { width: 100%; height: 100%; object-fit: cover; }
        .profile-name-sm { color: var(--eee); font-weight: 600; font-size: 13px; }

        .settings-btn-sm { background: rgba(150,150,150,0.05); border: 1px solid rgba(150,150,150,0.1); color: var(--eee); border-radius: 12px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; padding: 0 12px; }
        .settings-btn-sm:hover { border-color: var(--ccc); color: var(--ccc); }

        #cy-settings-view, #cy-profile-view { flex: 1; display: none; flex-direction: column; background: var(--mmm); overflow: hidden; position: absolute; top:0; left:0; width:100%; height:100%; z-index: 250; }
        .st-sidebar { display: flex; overflow-x: auto; padding: 10px; background: rgba(150,150,150,0.05); border-bottom: 1px solid rgba(150,150,150,0.1); gap: 6px; }
        .st-sidebar::-webkit-scrollbar { display: none; }
        .st-nav-btn { color: var(--fff); padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: 0.2s; font-size: 12px; font-weight: 600; white-space: nowrap; }
        .st-nav-btn.active { background: var(--hhh); color: var(--ccc); }
        .st-content { flex: 1; padding: 20px; overflow-y: auto; }
        .settings-section { margin-bottom: 25px; }
        .settings-title { font-size: 11px; text-transform: uppercase; color: var(--fff); font-weight: 700; margin-bottom: 12px; letter-spacing: 1px; }
        
        .cy-input-wrap { margin-bottom: 15px; width: 100%; }
        .cy-input-label { display: block; font-size: 12px; color: var(--eee); margin-bottom: 6px; }
        .cy-input { width: 100%; background: var(--iii); border: 1px solid rgba(150,150,150,0.2); color: var(--eee); padding: 10px 14px; border-radius: 10px; font-size: 13px; transition: 0.2s; }
        .cy-input:focus { border-color: var(--ccc); }

        .cy-mem-item { background: var(--iii); padding: 10px 12px; border-radius: 10px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border: 1px solid rgba(150,150,150,0.1); }

        .app-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap: 10px; margin-bottom: 15px; }
        .app-card { background: var(--iii); border: 2px solid rgba(150,150,150,0.1); border-radius: 10px; padding: 10px; cursor: pointer; text-align: center; transition: 0.2s; color: var(--fff); font-size: 11px; font-weight: 600; }
        .app-card.active { border-color: var(--ccc); background: var(--hhh); color: var(--ccc); }
        
        #menu-header { padding: 15px; display: flex; justify-content: space-between; align-items: center; color: var(--eee); font-weight: 600; }
        #history-list { flex: 1; overflow-y: auto; padding: 0 10px; }
        .history-item { padding: 10px 12px; border-radius: 10px; cursor: pointer; color: var(--fff); font-size: 13px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; transition: 0.2s; }
        .history-item:hover { background: var(--ggg); color: var(--eee); }
        .history-item.active { background: var(--hhh); color: var(--ccc); }
        .history-item-actions { display: flex; gap: 2px; }
        .ren-btn, .del-btn { opacity: 0; cursor: pointer; padding: 4px; transition: 0.2s; background: transparent; border: none; }
        .ren-btn { color: var(--fff); } .del-btn { color: #ff5f56; }
        .history-item:hover .ren-btn, .history-item:hover .del-btn { opacity: 1; }

        .sidebar-action-btn { color: var(--fff); padding: 10px 15px; border-radius: 10px; cursor: pointer; transition: 0.2s; font-weight: 600; text-align: left; display: flex; align-items: center; gap: 8px; margin: 0 10px 5px 10px; font-size: 13px; background: transparent; border: none; }
        .sidebar-action-btn:hover { background: rgba(150,150,150,0.1); color: var(--eee); }
        
        #cy-projects-main, #cy-projects-create { display:none; flex:1; flex-direction:column; padding: 20px; overflow-y:auto; background:var(--aaa); }
        .proj-box { background: var(--iii); border: 1px solid rgba(150,150,150,0.1); border-radius: 12px; padding: 15px; cursor: pointer; transition: 0.2s; position: relative; margin-bottom:10px; }
        .proj-box:hover { border-color: var(--ccc); }
        .proj-box-title { color: var(--eee); font-weight: bold; font-size: 14px; }
        .proj-box-desc { color: var(--fff); font-size: 11px; margin-top: 4px; }
        .proj-dots { position: absolute; top: 50%; transform: translateY(-50%); right: 10px; color: var(--fff); cursor: pointer; padding: 4px; }
        
        #cy-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 999999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
        #cy-modal-overlay.show { opacity: 1; }
        .cy-modal-box { background: var(--iii); border: 1px solid rgba(150,150,150,0.2); border-radius: 16px; padding: 20px; width: 85%; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .cy-modal-title { color: var(--eee); font-size: 16px; font-weight: 800; margin-bottom: 8px; }
        .cy-modal-desc { color: var(--fff); font-size: 12px; margin-bottom: 20px; }
        .cy-modal-input { width: 100%; background: var(--mmm); border: 1px solid rgba(150,150,150,0.2); color: var(--eee); padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; display: none; }
        .cy-modal-btns { display: flex; justify-content: flex-end; gap: 10px; }
        .cy-modal-btn { padding: 8px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
        .cy-btn-cancel { background: transparent; color: var(--fff); }
        .cy-btn-confirm { background: var(--ccc); color: #151515; }
        .cy-btn-danger { background: rgba(255,95,86,0.1); color: #ff5f56; }
    `;
    document.head.appendChild(style);

    function applyTheme() {
        let tSettings = settings.theme;
        if (tSettings === 'auto') tSettings = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        const rootEl = document.getElementById("cy-root");
        if (tSettings === 'light') rootEl.classList.add("cy-light-theme");
        else rootEl.classList.remove("cy-light-theme");

        let acc = settings.appearance.accent || 'pink';
        const c = {
            pink: { d: ['#f4b6d2', '#e89ec4', 'rgba(244,182,210,0.15)'], l: ['#e68ab4', '#d6709f', 'rgba(230,138,180,0.2)'] },
            blue: { d: ['#82b1ff', '#6aa3ff', 'rgba(130,177,255,0.15)'], l: ['#448aff', '#2979ff', 'rgba(68,138,255,0.2)'] },
            green: { d: ['#a5d6a7', '#81c784', 'rgba(165,214,167,0.15)'], l: ['#4caf50', '#43a047', 'rgba(76,175,80,0.2)'] },
            purple: { d: ['#b388ff', '#7c4dff', 'rgba(179,136,255,0.15)'], l: ['#7c4dff', '#651fff', 'rgba(124,77,255,0.2)'] },
            orange: { d: ['#ffb74d', '#ffa726', 'rgba(255,183,77,0.15)'], l: ['#ff9800', '#f57c00', 'rgba(255,152,0,0.2)'] }
        };
        let mode = tSettings === 'light' ? 'l' : 'd';
        rootEl.style.setProperty('--ccc', c[acc][mode][0]);
        rootEl.style.setProperty('--ddd', c[acc][mode][1]);
        rootEl.style.setProperty('--hhh', c[acc][mode][2]);

        let uc = settings.appearance.userColor || 'default';
        if (uc === 'default') rootEl.style.setProperty('--user-bub', 'rgba(150, 150, 150, 0.15)');
        else rootEl.style.setProperty('--user-bub', c[uc][mode][2]); 
    }

    const root = document.getElementById("cy-root");
    applyTheme();

    let initialAvatarHTML = settings.profile.avatar ? `<img src="${settings.profile.avatar}">` : settings.profile.name.charAt(0).toUpperCase();

    // NATIVE SIDE PANEL UI INJECTION
    root.innerHTML = `
        <div id="cy-panel" class="open fullscreen">
            <div id="cy-main-col">
                <div id="cy-header"></div>

                <div id="cy-profile-view">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                        <div style="font-size:16px; font-weight:700; color:var(--eee);">${t('personal_details', 'Personal Details')}</div>
                        <button id="btn-back-chat-prof" style="background: rgba(255,95,86,0.1); color: #ff5f56; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600;">${t('return', 'Return')}</button>
                    </div>
                    
                    <div class="avatar-upload-wrap">
                        <label class="avatar-preview" title="Click to upload picture">
                            <input type="file" id="st-avatar-upload" accept="image/*" style="display:none;">
                            <span id="st-avatar-render" style="font-weight:bold;">${initialAvatarHTML}</span>
                        </label>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <span style="color:var(--fff); font-size:12px;">Profile Picture</span>
                        </div>
                    </div>

                    <div class="cy-input-wrap">
                        <span class="cy-input-label">Your Name</span>
                        <input type="text" id="st-name" class="cy-input" value="${settings.profile.name}" maxlength="20">
                    </div>
                    <div class="cy-input-wrap">
                        <span class="cy-input-label">What should AI call you?</span>
                        <input type="text" id="st-callme" class="cy-input" value="${settings.profile.callMe}" maxlength="30">
                    </div>
                    <div class="cy-input-wrap">
                        <span class="cy-input-label">Let AI know more about you</span>
                        <textarea id="st-about" class="cy-input" maxlength="100" rows="3" style="resize:none;">${settings.profile.about}</textarea>
                    </div>
                </div>

                <div id="cy-settings-view">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 20px;">
                        <div style="font-size:16px; font-weight:700; color:var(--eee);">${t('settings', 'Settings')}</div>
                        <button id="btn-back-chat-set" style="background: rgba(255,95,86,0.1); color: #ff5f56; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600;">${t('return', 'Return')}</button>
                    </div>
                    <div style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                        <div class="st-sidebar">
                            <button class="st-nav-btn active" data-tab="st-appearance">${t('appearance', 'Appearance')}</button>
                            <button class="st-nav-btn" data-tab="st-language">${t('language', 'Language')}</button>
                            <button class="st-nav-btn" data-tab="st-ai">${t('ai_profile', 'AI Profile')}</button>
                            <button class="st-nav-btn" data-tab="st-memories">${t('memories', 'Memories')}</button>
                            <button class="st-nav-btn" data-tab="st-others">${t('others', 'Others')}</button>
                        </div>
                        
                        <div class="st-content">
                            <div id="st-language" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div class="settings-title">${t('language', 'Language')}</div>
                                    <div class="app-grid">
                                        <div class="app-card lang-opt ${settings.language === 'en' ? 'active' : ''}" data-lang="en">English</div>
                                        <div class="app-card lang-opt ${settings.language === 'zh' ? 'active' : ''}" data-lang="zh">简体中文</div>
                                        <div class="app-card lang-opt ${settings.language === 'es' ? 'active' : ''}" data-lang="es">Español</div>
                                    </div>
                                </div>
                            </div>

                            <div id="st-appearance" class="st-pane active">
                                <div class="settings-section">
                                    <div class="settings-title">${t('global_theme', 'Global Theme')}</div>
                                    <div class="app-grid" style="grid-template-columns: repeat(3, 1fr);">
                                        <div class="app-card theme-opt ${settings.theme === 'light' ? 'active' : ''}" data-theme="light">Light</div>
                                        <div class="app-card theme-opt ${settings.theme === 'auto' ? 'active' : ''}" data-theme="auto">Auto</div>
                                        <div class="app-card theme-opt ${settings.theme === 'dark' ? 'active' : ''}" data-theme="dark">Dark</div>
                                    </div>
                                </div>
                                <div class="settings-section">
                                    <div class="settings-title">${t('accent_color', 'Accent Colour')}</div>
                                    <div class="app-grid" style="grid-template-columns: repeat(5, 1fr);">
                                        <div class="app-card accent-opt ${settings.appearance.accent === 'pink' ? 'active' : ''}" data-accent="pink"><div style="width:20px;height:20px;border-radius:50%;background:#f4b6d2;margin:0 auto;"></div></div>
                                        <div class="app-card accent-opt ${settings.appearance.accent === 'blue' ? 'active' : ''}" data-accent="blue"><div style="width:20px;height:20px;border-radius:50%;background:#82b1ff;margin:0 auto;"></div></div>
                                        <div class="app-card accent-opt ${settings.appearance.accent === 'green' ? 'active' : ''}" data-accent="green"><div style="width:20px;height:20px;border-radius:50%;background:#a5d6a7;margin:0 auto;"></div></div>
                                        <div class="app-card accent-opt ${settings.appearance.accent === 'purple' ? 'active' : ''}" data-accent="purple"><div style="width:20px;height:20px;border-radius:50%;background:#b388ff;margin:0 auto;"></div></div>
                                        <div class="app-card accent-opt ${settings.appearance.accent === 'orange' ? 'active' : ''}" data-accent="orange"><div style="width:20px;height:20px;border-radius:50%;background:#ffb74d;margin:0 auto;"></div></div>
                                    </div>
                                </div>
                                <div class="settings-section">
                                    <div class="settings-title">${t('user_bubble_color', 'User Bubble Colour')}</div>
                                    <div class="app-grid" style="grid-template-columns: repeat(6, 1fr);">
                                        <div class="app-card usercolor-opt ${settings.appearance.userColor === 'default' ? 'active' : ''}" data-usercolor="default"><div style="width:20px;height:20px;border-radius:50%;background:rgba(150,150,150,0.5);margin:0 auto;"></div></div>
                                        <div class="app-card usercolor-opt ${settings.appearance.userColor === 'pink' ? 'active' : ''}" data-usercolor="pink"><div style="width:20px;height:20px;border-radius:50%;background:#f4b6d2;margin:0 auto;"></div></div>
                                        <div class="app-card usercolor-opt ${settings.appearance.userColor === 'blue' ? 'active' : ''}" data-usercolor="blue"><div style="width:20px;height:20px;border-radius:50%;background:#82b1ff;margin:0 auto;"></div></div>
                                        <div class="app-card usercolor-opt ${settings.appearance.userColor === 'green' ? 'active' : ''}" data-usercolor="green"><div style="width:20px;height:20px;border-radius:50%;background:#a5d6a7;margin:0 auto;"></div></div>
                                        <div class="app-card usercolor-opt ${settings.appearance.userColor === 'purple' ? 'active' : ''}" data-usercolor="purple"><div style="width:20px;height:20px;border-radius:50%;background:#b388ff;margin:0 auto;"></div></div>
                                        <div class="app-card usercolor-opt ${settings.appearance.userColor === 'orange' ? 'active' : ''}" data-usercolor="orange"><div style="width:20px;height:20px;border-radius:50%;background:#ffb74d;margin:0 auto;"></div></div>
                                    </div>
                                </div>
                            </div>

                            <div id="st-ai" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div class="cy-input-wrap">
                                        <span class="cy-input-label">API Key</span>
                                        <input type="password" id="st-api-key" class="cy-input" value="${settings.ai.apiKey}">
                                    </div>
                                    <div class="cy-input-wrap">
                                        <span class="cy-input-label">System Prompt</span>
                                        <textarea id="st-sys-prompt" class="cy-input" rows="6" style="resize:none;">${settings.ai.systemPrompt}</textarea>
                                    </div>
                                </div>
                            </div>

                            <div id="st-memories" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding-bottom:15px; border-bottom:1px solid rgba(150,150,150,0.1);">
                                        <span style="color:var(--eee); font-size:12px; font-weight:600;">Enable Memory</span>
                                        <label class="cy-toggle"><input type="checkbox" id="st-mem-toggle" ${settings.ai.memoryEnabled ? 'checked' : ''}><span class="cy-slider"></span></label>
                                    </div>
                                    <div id="st-memories-list"></div>
                                </div>
                            </div>

                            <div id="st-others" class="st-pane" style="display:none;">
                                <div class="settings-section">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <span style="color:var(--eee); font-size:12px; font-weight:600;">Delete All Chats</span>
                                        <button id="btn-delete-all" style="background: rgba(255,95,86,0.1); color: #ff5f56; padding:6px 12px; border-radius:8px; border:none; cursor:pointer;">Delete</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="cy-projects-main">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <div style="font-size:24px; font-weight:800; color:var(--eee);">${t('projects', 'Projects')}</div>
                        <button id="btn-create-proj-flow" style="background:var(--ccc); color:#151515; border:none; padding:8px 14px; border-radius:8px; font-weight:700; cursor:pointer;">New</button>
                    </div>
                    <div id="proj-list-container"></div>
                </div>

                <div id="cy-projects-create">
                    <div style="font-size:20px; font-weight:800; color:var(--eee); margin-bottom: 20px;">Create a Workspace</div>
                    <div class="cy-input-wrap">
                        <span class="cy-input-label">Project Name</span>
                        <input type="text" id="inp-proj-name" class="cy-input" maxlength="12">
                    </div>
                    <div class="cy-input-wrap">
                        <span class="cy-input-label">Description</span>
                        <input type="text" id="inp-proj-desc" class="cy-input" maxlength="40">
                    </div>
                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button id="btn-cancel-proj" style="background:transparent; border:1px solid rgba(150,150,150,0.2); color:var(--eee); padding:10px; border-radius:8px; flex:1;">${t('cancel', 'Cancel')}</button>
                        <button id="btn-confirm-proj" style="background:var(--ccc); color:#151515; border:none; padding:10px; border-radius:8px; font-weight:bold; flex:1;">${t('confirm', 'Confirm')}</button>
                    </div>
                </div>

                <div id="cy-chat"></div>

                <div id="cy-footer">
                    <div class="input-box">
                        <textarea id="cy-textarea" placeholder="${t('message_assistant', 'Message Assistant...')}" rows="1"></textarea>
                        <div class="input-toolbar">
                            <div id="cy-dynamic-toolbar-left" style="display:flex; gap:6px; align-items:center;"></div>
                            <button id="cy-send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="cy-menu">
                <div id="menu-header">
                    <span class="cy-title" style="margin-left: 0;">${t('workspace', 'WORKSPACE')}</span>
                    <button class="icon-btn" id="btn-close-menu">×</button>
                </div>
                <button class="sidebar-action-btn" id="btn-new-chat">${t('new_chat', '+ New Chat')}</button>
                <button class="sidebar-action-btn" id="btn-projects">${t('projects', 'Projects')}</button>
                <div style="padding: 15px 15px 5px; font-size: 11px; color: var(--fff); text-transform: uppercase; font-weight: 700;">${t('history', 'HISTORY')}</div>
                <div id="history-list"></div>
                <div class="sidebar-bottom">
                    <div id="cy-profile-btn" class="profile-container">
                        <div class="profile-avatar-sm" id="sidebar-avatar">${initialAvatarHTML}</div>
                        <div class="profile-name-sm" id="sidebar-name">${settings.profile.name}</div>
                    </div>
                    <button class="settings-btn-sm" id="btn-open-settings">⚙</button>
                </div>
            </div>
        </div>

        <div id="cy-modal-overlay">
            <div class="cy-modal-box">
                <div class="cy-modal-title" id="cy-modal-title">Title</div>
                <div class="cy-modal-desc" id="cy-modal-desc">Description</div>
                <input type="text" id="cy-modal-input" class="cy-modal-input">
                <div class="cy-modal-btns">
                    <button class="cy-modal-btn cy-btn-cancel" id="cy-modal-cancel">${t('cancel', 'Cancel')}</button>
                    <button class="cy-modal-btn" id="cy-modal-confirm">${t('confirm', 'Confirm')}</button>
                </div>
            </div>
        </div>
    `;

    const get = (id) => document.getElementById(id);
    const UI = {
        panel: get("cy-panel"), menu: get("cy-menu"), chat: get("cy-chat"), footer: get("cy-footer"),
        settingsView: get("cy-settings-view"), profileView: get("cy-profile-view"), list: get("history-list"),
        input: get("cy-textarea"), header: get("cy-header"), projMain: get("cy-projects-main"),
        projCreate: get("cy-projects-create"), dynamicLeft: get("cy-dynamic-toolbar-left"), sendBtn: get("cy-send")
    };

    function showModal({ title, desc, inputMode = false, inputValue = "", confirmText = t('confirm', 'Confirm'), isDanger = false, onConfirm }) {
        const overlay = get('cy-modal-overlay');
        get('cy-modal-title').textContent = title;
        if(desc) { get('cy-modal-desc').style.display = 'block'; get('cy-modal-desc').textContent = desc; } else get('cy-modal-desc').style.display = 'none';
        if (inputMode) { get('cy-modal-input').style.display = 'block'; get('cy-modal-input').value = inputValue; get('cy-modal-input').focus(); } else get('cy-modal-input').style.display = 'none';
        get('cy-modal-confirm').textContent = confirmText;
        get('cy-modal-confirm').className = `cy-modal-btn ${isDanger ? 'cy-btn-danger' : 'cy-btn-confirm'}`;
        overlay.style.display = 'flex'; void overlay.offsetWidth; overlay.classList.add('show');
        const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.style.display = 'none', 200); };
        get('cy-modal-cancel').onclick = close;
        get('cy-modal-confirm').onclick = () => { if (inputMode) onConfirm(get('cy-modal-input').value); else onConfirm(); close(); };
        get('cy-modal-input').onkeydown = (e) => { if(e.key === 'Enter') get('cy-modal-confirm').click(); }
    }

    get("btn-close-menu").onclick = () => UI.menu.classList.remove("open");

    function openSettings(tabId) {
        UI.chat.style.display = "none"; UI.footer.style.display = "none"; UI.profileView.style.display = "none"; UI.settingsView.style.display = "flex"; UI.menu.classList.remove("open");
        document.querySelectorAll('.st-nav-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('.st-pane').forEach(p => p.style.display = 'none');
        const btn = document.querySelector(`.st-nav-btn[data-tab="${tabId}"]`); if(btn) btn.classList.add('active');
        const pane = get(tabId); if(pane) pane.style.display = "block";
    }

    function openProfile() {
        UI.chat.style.display = "none"; UI.footer.style.display = "none"; UI.settingsView.style.display = "none"; UI.profileView.style.display = "flex"; UI.menu.classList.remove("open");
    }

    function returnToChat() {
        UI.settingsView.style.display = "none"; UI.profileView.style.display = "none"; UI.projMain.style.display = "none"; UI.projCreate.style.display = "none";
        UI.chat.style.display = "flex"; UI.footer.style.display = "flex";
        
        const active = getActive();
        const isProjChat = activeProjectId && active.messages.length > 0;
        
        if (activeProjectId || pendingProject) {
            let pName = pendingProject ? pendingProject.name : projects.find(p => p.id === activeProjectId)?.name;
            let leftBtn = isProjChat ? `<button class="icon-btn" id="btn-menu">←</button>` : `<button class="icon-btn" id="btn-menu">☰</button>`;
            UI.header.innerHTML = `<div style="display:flex; align-items:center;">${leftBtn}<div style="font-weight:800; font-size:15px; margin-left:10px; color:var(--ccc);">${pName}</div></div>`;
        } else {
            UI.header.innerHTML = `<div style="display:flex; align-items:center;"><button class="icon-btn" id="btn-menu">☰</button><span class="cy-title">CYRENE</span></div>`;
        }
        
        get("btn-menu").onclick = () => {
            if (isProjChat) {
                let emptyChat = sessions.find(s => s.projectId === activeProjectId && s.messages.length === 0);
                if (!emptyChat) { emptyChat = { id: Date.now(), title: "New Project Chat", messages: [], model: getActive().model, tools: getActive().tools, projectId: activeProjectId }; sessions.unshift(emptyChat); }
                currentId = emptyChat.id; saveState(); returnToChat();
            } else { UI.menu.classList.add("open"); }
        };
        render(); UI.chat.scrollTop = UI.chat.scrollHeight;
    }

    get("btn-open-settings").onclick = () => openSettings('st-appearance');
    get("cy-profile-btn").onclick = openProfile;
    get("btn-back-chat-set").onclick = returnToChat;
    get("btn-back-chat-prof").onclick = returnToChat;
    document.querySelectorAll('.st-nav-btn[data-tab]').forEach(btn => { btn.onclick = (e) => { if(!btn.disabled) openSettings(e.target.getAttribute('data-tab')); }; });

    get("btn-projects").onclick = () => {
        UI.chat.style.display = "none"; UI.footer.style.display = "none"; UI.settingsView.style.display = "none"; UI.profileView.style.display = "none"; UI.projCreate.style.display = "none";
        UI.projMain.style.display = "flex"; UI.menu.classList.remove("open"); renderProjects();
    };
    
    get("btn-create-proj-flow").onclick = () => { UI.projMain.style.display = "none"; UI.projCreate.style.display = "flex"; get("inp-proj-name").value = ""; get("inp-proj-desc").value = ""; };
    get("btn-cancel-proj").onclick = () => { UI.projCreate.style.display = "none"; UI.projMain.style.display = "flex"; };
    get("btn-confirm-proj").onclick = () => {
        const pName = get("inp-proj-name").value.trim(); const pDesc = get("inp-proj-desc").value.trim();
        if (!pName) return showModal({ title: "Error", desc: "Project name is required.", confirmText: "Okay" });
        if (projects.some(p => p.name.toLowerCase() === pName.toLowerCase())) return showModal({ title: "Error", desc: "A project with this name already exists.", confirmText: "Okay" });
        pendingProject = { name: pName, desc: pDesc }; activeProjectId = null;
        const n = { id: Date.now(), title: "New Project Chat", messages: [], model: getActive().model, tools: getActive().tools, isPendingProj: true };
        sessions.unshift(n); currentId = n.id; saveState(); UI.projCreate.style.display = "none"; returnToChat();
    };

    function renderProjects() {
        const container = get("proj-list-container"); container.innerHTML = "";
        projects.forEach(p => {
            const box = document.createElement("div"); box.className = "proj-box";
            box.innerHTML = `<div class="proj-box-title">${p.name}</div><div class="proj-box-desc">${p.desc}</div><button class="proj-dots">⋮</button>
            <div class="proj-menu"><button class="ren-proj-btn">${t('rename', 'Rename')}</button><button class="del-btn-menu">${t('delete', 'Delete')}</button></div>`;
            box.onclick = (e) => {
                if (e.target.closest('.proj-dots') || e.target.closest('.proj-menu')) return;
                activeProjectId = p.id;
                let pChat = sessions.find(s => s.projectId === p.id && s.messages.length === 0);
                if (!pChat) { pChat = { id: Date.now(), title: "New Project Chat", messages: [], model: getActive().model, tools: getActive().tools, projectId: p.id }; sessions.unshift(pChat); }
                currentId = pChat.id; saveState(); returnToChat();
            };
            const dots = box.querySelector('.proj-dots'); const menu = box.querySelector('.proj-menu');
            dots.onclick = (e) => { e.stopPropagation(); menu.style.display = menu.style.display === "flex" ? "none" : "flex"; };
            box.querySelector('.ren-proj-btn').onclick = (e) => { e.stopPropagation(); showModal({ title: "Rename", inputMode: true, inputValue: p.name, onConfirm: (n) => { n = n.trim(); if(n) { p.name = n; saveState(); renderProjects(); returnToChat(); } } }); };
            box.querySelector('.del-btn-menu').onclick = (e) => { e.stopPropagation(); showModal({ title: "Delete?", isDanger: true, onConfirm: () => { projects = projects.filter(x=>x.id!==p.id); sessions = sessions.filter(s=>s.projectId!==p.id); if(sessions.length===0) sessions=[{id:Date.now(),title:"New Session",messages:[],model:"deepseek-chat",tools:[]}]; currentId=sessions[0].id; activeProjectId=null; saveState(); renderProjects(); returnToChat(); } }); };
            container.appendChild(box);
        });
    }

    UI.input.oninput = function(e) {
        this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    };

    get("st-avatar-upload").onchange = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (evt) => { settings.profile.avatar = evt.target.result; const imgHTML = `<img src="${settings.profile.avatar}">`; avatarRender.innerHTML = imgHTML; sidebarAvatar.innerHTML = imgHTML; saveSettings(); render(); }; reader.readAsDataURL(file); } };
    get("st-name").oninput = (e) => { settings.profile.name = e.target.value || "User"; if(!settings.profile.avatar) { const initial = settings.profile.name.charAt(0).toUpperCase(); avatarRender.innerHTML = initial; sidebarAvatar.innerHTML = initial; } sidebarName.textContent = settings.profile.name; saveSettings(); render(); };
    get("st-callme").oninput = (e) => { settings.profile.callMe = e.target.value; saveSettings(); };
    get("st-about").oninput = (e) => { settings.profile.about = e.target.value; saveSettings(); };

    document.querySelectorAll(".theme-opt").forEach(btn => { btn.onclick = () => { document.querySelectorAll(".theme-opt").forEach(b => b.classList.remove("active")); btn.classList.add("active"); settings.theme = btn.getAttribute("data-theme"); applyTheme(); saveSettings(); }; });
    document.querySelectorAll(".accent-opt").forEach(btn => { btn.onclick = () => { document.querySelectorAll(".accent-opt").forEach(b => b.classList.remove("active")); btn.classList.add("active"); settings.appearance.accent = btn.getAttribute("data-accent"); applyTheme(); saveSettings(); }; });
    document.querySelectorAll(".usercolor-opt").forEach(btn => { btn.onclick = () => { document.querySelectorAll(".usercolor-opt").forEach(b => b.classList.remove("active")); btn.classList.add("active"); settings.appearance.userColor = btn.getAttribute("data-usercolor"); applyTheme(); saveSettings(); }; });
    document.querySelectorAll(".font-opt").forEach(btn => { btn.onclick = () => { document.querySelectorAll(".font-opt").forEach(b => b.classList.remove("active")); btn.classList.add("active"); settings.appearance.font = btn.getAttribute("data-font"); get("cy-root").style.setProperty('--cy-font', settings.appearance.font); saveSettings(); }; });
    document.querySelectorAll(".lang-opt").forEach(btn => { btn.onclick = () => { settings.language = btn.getAttribute("data-lang"); saveSettings(); setTimeout(() => { window.location.reload(); }, 200); }; });
    get("st-api-key").oninput = (e) => { settings.ai.apiKey = e.target.value; saveSettings(); render(); };
    get("st-sys-prompt").oninput = (e) => { settings.ai.systemPrompt = e.target.value; saveSettings(); };
    get("st-mem-toggle").onchange = (e) => { settings.ai.memoryEnabled = e.target.checked; saveSettings(); };

    function renderMemories() {
        const list = get("st-memories-list"); list.innerHTML = "";
        if (settings.ai.memories.length === 0) return;
        settings.ai.memories.forEach((mem, idx) => {
            const item = document.createElement("div"); item.className = "cy-mem-item"; item.innerHTML = `<span>${mem}</span> <button class="del-btn" style="opacity:1; padding:0 4px; border:none; background:transparent; color:#ff5f56; cursor:pointer;">×</button>`;
            item.querySelector('.del-btn').onclick = () => { settings.ai.memories.splice(idx, 1); saveSettings(); renderMemories(); }; list.appendChild(item);
        });
    }
    renderMemories();

    function render() {
        if (UI.settingsView.style.display === "flex" || UI.profileView.style.display === "flex") return;
        const active = getActive(); if(!active.tools) active.tools = [];

        UI.dynamicLeft.innerHTML = `
            <select class="tool-btn" id="gen-model-select" style="appearance:none; padding-right:12px;">
                <option value="deepseek-chat" ${active.model === "deepseek-chat" ? 'selected' : ''} style="color:#000;">DeepSeek</option>
                <option value="deepseek-reasoner" ${active.model === "deepseek-reasoner" ? 'selected' : ''} style="color:#000;">Reasoner</option>
            </select>
            <button class="tool-btn ${active.tools.includes("search") ? 'active' : ''}" id="ds-search">${t('tool_search', 'Search')}</button>
            <button class="tool-btn ${active.tools.includes("web") ? 'active' : ''}" id="ds-web">${t('tool_interact', 'Web')}</button>
        `;
        get("gen-model-select").onchange = (e) => { active.model = e.target.value; saveState(); render(); };
        get("ds-search").onclick = () => { if (active.tools.includes("search")) active.tools = active.tools.filter(t => t !== "search"); else active.tools.push("search"); saveState(); render(); };
        get("ds-web").onclick = () => { if (active.tools.includes("web")) active.tools = active.tools.filter(t => t !== "web"); else active.tools.push("web"); saveState(); render(); };

        if (isWaitingForAPI || isTyping) { UI.sendBtn.classList.add("disabled"); UI.sendBtn.disabled = true; UI.dynamicLeft.style.pointerEvents = "none"; UI.dynamicLeft.style.opacity = "0.5"; } 
        else { UI.sendBtn.classList.remove("disabled"); UI.sendBtn.disabled = false; UI.dynamicLeft.style.pointerEvents = "auto"; UI.dynamicLeft.style.opacity = "1"; }

        if (active.messages.length === 0) {
            UI.chat.classList.add('is-empty');
            if (activeProjectId || pendingProject) {
                let pName = pendingProject ? pendingProject.name : projects.find(p => p.id === activeProjectId)?.name;
                let pChats = activeProjectId ? sessions.filter(s => s.projectId === activeProjectId && s.messages.length > 0) : [];
                let chatsHTML = pChats.length === 0 ? `<div style="color:var(--fff); font-size:12px; font-style:italic; text-align:center;">Empty workspace.</div>` : pChats.map(s => `<div class="proj-dash-card" data-id="${s.id}"><div><div class="proj-dash-title">${s.title}</div><div class="proj-dash-meta">${s.messages.length} msgs</div></div></div>`).join("");
                UI.chat.innerHTML = `<div style="width:100%;"><div style="font-size:20px; font-weight:800; color:var(--eee); margin-bottom:15px;">${pName}</div>${chatsHTML}</div>`;
                setTimeout(() => { document.querySelectorAll('.proj-dash-card').forEach(card => { card.onclick = () => { currentId = parseInt(card.getAttribute('data-id')); saveState(); returnToChat(); }; }); }, 50);
            } else {
                UI.chat.innerHTML = `<div style="font-size:24px; font-weight:700; color:var(--eee); text-align:center;">Hi, ${settings.profile.callMe || settings.profile.name}.</div>`;
            }
        } else {
            UI.chat.classList.remove('is-empty');
            UI.chat.innerHTML = active.messages.map((m, idx) => {
                const isUser = m.role === 'user';
                let cleanContent = m.content.replace(/<save_memory>([\s\S]*?)<\/save_memory>/gi, "").replace(/<execute>([\s\S]*?)<\/execute>/gi, "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
                return `<div class="msg-row ${isUser ? 'user' : 'ai'}"><div class="bubble bubble-${isUser ? 'user' : 'ai'}">${cleanContent}</div></div>`;
            }).join("");
            if (isWaitingForAPI) UI.chat.innerHTML += `<div class="msg-row ai"><div class="bubble bubble-ai loading-dots">...</div></div>`;
        }
        UI.chat.scrollTop = UI.chat.scrollHeight;

        UI.list.innerHTML = "";
        let standardChats = sessions.filter(s => !s.projectId && !s.isPendingProj && s.messages.length > 0);
        standardChats.forEach(s => {
            const item = document.createElement("div"); item.className = `history-item ${s.id === currentId && !s.projectId ? 'active' : ''}`;
            item.innerHTML = `<span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">${s.title}</span><div class="history-item-actions"><button class="del-btn">×</button></div>`;
            item.onclick = (e) => { if(!e.target.closest('button')) { currentId = s.id; activeProjectId = null; saveState(); returnToChat(); UI.menu.classList.remove("open"); } };
            item.querySelector('.del-btn').onclick = (e) => { e.stopPropagation(); sessions = sessions.filter(x => x.id !== s.id); if (sessions.length === 0) sessions = [{ id: Date.now(), title: "New Session", messages: [], model: "deepseek-chat", tools: [] }]; if (currentId === s.id) { currentId = sessions[0].id; activeProjectId = null; } saveState(); render(); };
            UI.list.appendChild(item);
        });
        projects.forEach(p => {
            const f = document.createElement("div"); f.className = `history-item ${activeProjectId === p.id ? 'active' : ''}`;
            f.innerHTML = `<div style="font-weight:600;">📁 ${p.name}</div>`;
            f.onclick = () => { activeProjectId = p.id; let emptyChat = sessions.find(s => s.projectId === p.id && s.messages.length === 0); if (!emptyChat) { emptyChat = { id: Date.now(), title: "New Project Chat", messages: [], model: getActive().model, tools: getActive().tools, projectId: p.id }; sessions.unshift(emptyChat); } currentId = emptyChat.id; saveState(); returnToChat(); UI.menu.classList.remove("open"); };
            UI.list.appendChild(f);
        });
    }

    // --- NEW SIDE PANEL AWARE WEB CONTEXT FETCHER ---
    async function getWebContext() {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return "";

        try {
            let results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    let uiMap = "";
                    let interactables = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
                    let count = 0;
                    interactables.forEach(el => {
                        if (count > 100) return;
                        let rect = el.getBoundingClientRect();
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
                    return `[CURRENT WEBPAGE CONTEXT]\nURL: ${window.location.href}\nTitle: ${document.title}\n\n[INTERACTIVE UI ELEMENTS MAP]\n${uiMap || "No interactive elements found."}\n\n[FULL PAGE TEXT]\n${pageText}`;
                }
            });
            return results[0].result + "\n\n[WEB INTERACT CAPABILITIES... (god mode prompt)]";
        } catch (e) {
            return "[Error reading web page. The user might be on a protected Chrome settings page.]";
        }
    }

    async function sendMsg() {
        const text = UI.input.value.trim();
        if(!text || isWaitingForAPI || isTyping) return;

        const active = getActive();
        if (active.messages.length === 0) active.title = text.substring(0, 25) + '...';

        active.messages.push({ role: 'user', content: text });
        UI.input.value = ""; UI.input.style.height = "auto";
        isWaitingForAPI = true;
        saveState(); render(); returnToChat();

        let webContext = null;
        if (active.tools && active.tools.includes("web")) {
            webContext = await getWebContext();
        }

        let apiMessages = active.messages.map(m => ({ role: m.role, content: m.content }));
        let finalSysPrompt = settings.ai.systemPrompt || "You are a helpful AI assistant.";
        apiMessages.unshift({ role: "system", content: finalSysPrompt });

        if (webContext) {
            let lastUserMsg = apiMessages[apiMessages.length - 1];
            if (lastUserMsg && lastUserMsg.role === 'user') lastUserMsg.content = `${webContext}\n\n[User Query]\n${lastUserMsg.content}`;
        }

        fetchSecureAPI({
            method: "POST",
            url: "https://api.deepseek.com/chat/completions",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.ai.apiKey}` },
            data: JSON.stringify({ model: active.model || "deepseek-chat", messages: apiMessages }),
            onload: function(response) {
                isWaitingForAPI = false;
                if (response.status === 200) {
                    const data = JSON.parse(response.responseText);
                    active.messages.push({ role: 'assistant', content: data.choices[0].message.content.trim() });
                } else {
                    active.messages.push({ role: 'assistant', content: `API Error: ${response.status}` });
                }
                saveState(); render();
            },
            onerror: function() { isWaitingForAPI = false; active.messages.push({ role: 'assistant', content: "Network Error" }); saveState(); render(); }
        });
    }

    get("cy-send").onclick = sendMsg;
    UI.input.onkeydown = (e) => { if(e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isWaitingForAPI && !isTyping) sendMsg(); } };

    get("btn-new-chat").onclick = () => {
        if (pendingProject) { sessions = sessions.filter(s => !s.isPendingProj); pendingProject = null; }
        activeProjectId = null;
        const active = getActive();
        if (active.messages.length === 0 && !active.projectId) { returnToChat(); UI.menu.classList.remove("open"); return; }
        const n = { id: Date.now(), title: "New Session", messages: [], model: active.model, tools: active.tools };
        sessions.unshift(n); currentId = n.id; saveState(); returnToChat(); render(); UI.menu.classList.remove("open");
    };

    returnToChat();

    if (wasChatLost) {
        showModal({
            title: "Chat Not Found",
            desc: "The chat or workspace you were previously viewing no longer exists. A new session has been created for you.",
            confirmText: t('confirm', 'Okay'),
            onConfirm: () => { saveState(); render(); }
        });
    }
})();
