// js/app.js
import { initAuthListener, loginUser, logoutUser } from "./auth.js";
import { auth, db, collection, addDoc, onSnapshot, doc, updateDoc, getDoc, setDoc } from "./firebase-config.js";
import { generateAIResponse, rewritePrompt } from "./gemini-api.js"; 

// --- DOM ELEMENTS ---
const elements = {
    // General
    sidebar: document.getElementById('sidebar'),
    sidebarBrand: document.getElementById('sidebar-brand'), // NEW: For closing
    chatArena: document.getElementById('chat-arena'),
    voteArena: document.getElementById('vote-arena'),
    mobileMenuBtn: document.getElementById('mobile-menu'),
    textarea: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    chatContainer: document.getElementById('chat-container'),
    desiToggle: document.getElementById('desi-mode'),
    webToggle: document.getElementById('web-mode'), // Web Toggle
    proBtn: document.getElementById('pro-btn'), // Dumb to Pro
    expertiseSelect: document.getElementById('expertise-select'), // Expertise
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings'),
    saveSettingsBtn: document.getElementById('save-settings'),
    apiKeyInput1: document.getElementById('api-key-1'),
    apiKeyInput2: document.getElementById('api-key-2'),
    apiKeyInput3: document.getElementById('api-key-3'),
    loginTrigger: document.getElementById('login-trigger'),
    fileInput: document.getElementById('file-upload'),
    filePreview: document.getElementById('file-preview'),
    voiceBtn: document.getElementById('voice-btn'),
    pinnedVaultBtn: document.querySelector('.menu button:nth-child(2)'),
    historyList: document.querySelector('.history-list'), // For History Sync
    statusText: document.getElementById('status-text')
};

// --- STATE ---
const state = {
    apiKeys: JSON.parse(localStorage.getItem("gemini_keys_array")) || [localStorage.getItem("gemini_key") || ""].filter(Boolean),
    currentImages: [], // Changed to Array for Versus Mode
    pinnedChats: JSON.parse(localStorage.getItem("pinned_vault")) || [],
    chatHistory: JSON.parse(localStorage.getItem("chat_history")) || [] // NEW History Array
};

// --- INIT ---
let userDocRef = null;

function init() {
    // Hide splash screen after minimum delay + load time
    window.addEventListener('load', () => {
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if(splash) {
                splash.classList.add('splash-hidden');
                setTimeout(() => splash.remove(), 600); // Remove from DOM after fade out
            }
        }, 1500); // Minimum 1.5 seconds to show the cool animation
    });

    // Check if URL is in Panchayat Share Mode
    const params = new URLSearchParams(window.location.search);
    if (params.has('panchayat')) {
        initVoteMode(params.get('panchayat'));
        return; // Stop normal init
    }

    initAuthListener();
    
    // Cloud Sync Listener for Pinned Chats & History
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            userDocRef = doc(db, "users", user.uid);
            try {
                const snap = await getDoc(userDocRef);
                if (snap.exists()) {
                    // Sync Vault
                    const cloudVault = snap.data().vault || [];
                    const mergedVault = [...state.pinnedChats];
                    cloudVault.forEach(item => { if (!mergedVault.some(m => m.text === item.text)) mergedVault.push(item); });
                    state.pinnedChats = mergedVault;
                    localStorage.setItem("pinned_vault", JSON.stringify(state.pinnedChats));

                    // Sync History
                    const cloudHistory = snap.data().history || [];
                    const mergedHistory = [...state.chatHistory];
                    cloudHistory.forEach(item => { 
                        const itemPrompt = typeof item === 'string' ? item : item.prompt;
                        if (!mergedHistory.some(m => (typeof m === 'string' ? m : m.prompt) === itemPrompt)) {
                            mergedHistory.push(item);
                        }
                    });
                    state.chatHistory = mergedHistory;
                    localStorage.setItem("chat_history", JSON.stringify(state.chatHistory));

                } else {
                    // Initialize empty cloud user document
                    await setDoc(userDocRef, { vault: state.pinnedChats, history: state.chatHistory });
                }
                renderHistorySideBar();
            } catch(e) { console.error("Cloud sync error:", e); }
        } else {
            userDocRef = null;
            renderHistorySideBar();
        }
    });

    setupVoiceInput();

    // Listeners
    if(elements.pinnedVaultBtn) elements.pinnedVaultBtn.addEventListener('click', showVault);
    elements.fileInput.addEventListener('change', handleFileSelect);
    
    // Settings & Login Logic (Relay Race)
    if(elements.settingsBtn) elements.settingsBtn.addEventListener('click', () => {
        elements.settingsModal.classList.remove('hidden');
        elements.apiKeyInput1.value = state.apiKeys[0] || "";
        elements.apiKeyInput2.value = state.apiKeys[1] || "";
        elements.apiKeyInput3.value = state.apiKeys[2] || "";
    });
    elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.saveSettingsBtn.addEventListener('click', () => {
        const k1 = elements.apiKeyInput1.value.trim();
        const k2 = elements.apiKeyInput2.value.trim();
        const k3 = elements.apiKeyInput3.value.trim();
        const keys = [k1, k2, k3].filter(k => k); // Remove empty strings
        
        if(keys.length > 0) {
            localStorage.setItem("gemini_keys_array", JSON.stringify(keys));
            state.apiKeys = keys;
            alert(`Brain Setup Complete! ${keys.length} Engine(s) loaded. 🧠`);
            elements.settingsModal.classList.add('hidden');
        } else {
            alert("At least Primary API Key is required!");
        }
    });
    if(elements.loginTrigger) elements.loginTrigger.addEventListener('click', () => {
        const user = auth.currentUser;
        user ? (confirm("Logout?") && logoutUser()) : loginUser();
    });
    if(elements.mobileMenuBtn) elements.mobileMenuBtn.addEventListener('click', () => elements.sidebar.classList.toggle('open'));
    
    // NEW: Close sidebar on mobile when brand logo is clicked
    if(elements.sidebarBrand) {
        elements.sidebarBrand.addEventListener('click', () => {
            if(window.innerWidth <= 768) {
                elements.sidebar.classList.remove('open');
            }
        });
    }

    elements.sendBtn.addEventListener('click', handleSend);
    elements.textarea.addEventListener('input', autoResizeTextarea);
    elements.textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    if(elements.proBtn) elements.proBtn.addEventListener('click', async (e) => {
        e.preventDefault(); // Prevent accidental form submit behavior
        const txt = elements.textarea.value.trim();
        if(!txt) return;
        if(state.apiKeys.length === 0) { alert("Set API Key first!"); return; }
        
        elements.proBtn.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s linear infinite">sync</span>`;
        try {
            const newText = await rewritePrompt(txt, state.apiKeys);
            elements.textarea.value = newText;
            autoResizeTextarea(); // Expand box automatically
        } catch (err) {
            alert("Rewrite Failed: " + err.message);
        }
        elements.proBtn.innerHTML = `<span class="material-symbols-rounded">magic_button</span>`;
    });
}

// --- MULTI-FILE HANDLING (VERSUS MODE) ---
function handleFileSelect(e) {
    const files = Array.from(e.target.files); // Convert to array
    if (files.length === 0) return;

    // Reset and process new files
    state.currentImages = [];
    elements.filePreview.innerHTML = '';
    elements.filePreview.classList.remove('hidden');

    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            // Add to State
            state.currentImages.push({
                inlineData: { mimeType: file.type, data: event.target.result.split(',')[1] }
            });

            // Add Thumbnail to UI
            const thumb = document.createElement('div');
            thumb.style.cssText = "display:inline-block; position:relative; margin-right:10px;";
            thumb.innerHTML = `
                <img src="${event.target.result}" height="60" style="border-radius:8px; border:1px solid var(--primary)">
                <div style="position:absolute; top:-5px; right:-5px; background:red; color:white; border-radius:50%; width:18px; height:18px; font-size:12px; text-align:center; cursor:pointer;">${index + 1}</div>
            `;
            elements.filePreview.appendChild(thumb);
        };
        reader.readAsDataURL(file);
    });

    // Versus Mode Alert
    if(files.length > 1) {
        elements.statusText.innerText = "⚔️ Versus Mode Ready";
        elements.statusText.style.color = "var(--accent)";
    }
}

window.clearImage = () => {
    state.currentImages = [];
    elements.filePreview.innerHTML = '';
    elements.filePreview.classList.add('hidden');
    elements.statusText.innerText = "Ready";
    elements.statusText.style.color = "";
};

// --- CHAT LOGIC ---
async function handleSend() {
    const text = elements.textarea.value.trim();
    if (!text && state.currentImages.length === 0) return;
    if (state.apiKeys.length === 0) { alert("Set API Key first!"); return; }

    // UI: User Message
    let userHtml = text;
    if(state.currentImages.length > 0) {
        userHtml = `<span style="font-size:0.8em; opacity:0.7;">[Attached ${state.currentImages.length} Images]</span><br>${text}`;
    }
    appendMessage(userHtml, 'user');
    
    // Prepare Data
    const imagesToSend = [...state.currentImages]; // Copy array
    const isWeb = elements.webToggle ? elements.webToggle.checked : false;

    // Clear Input
    elements.textarea.value = '';
    elements.textarea.style.height = 'auto'; // Reset sizing
    clearImage(); // Clear UI immediately

    const loadingId = appendMessage(isWeb ? "Searching Web..." : "Thinking...", 'ai', true);

    // Call AI
    const expertise = elements.expertiseSelect ? elements.expertiseSelect.value : "General";
    let response = "";
    try {
        response = await generateAIResponse(text, state.apiKeys, elements.desiToggle.checked, imagesToSend, isWeb, expertise);
    } catch(err) {
        response = `Error: ${err.message}`;
    }
    
    document.getElementById(loadingId).remove();
    typeMessage(response, 'ai');

    // SAVE FULL CONVERSATION TO HISTORY //
    if(text) {
        saveToHistory({ prompt: text, response: response });
    }
}

// --- GLOBAL FUNCTIONS (Voice, Pin, Card) ---
// --- VOTING POLL MODE (FORMERLY PANCHAYAT) ---
let currentVoteData = null;

async function initVoteMode(voteId) {
    // Hide chat, show vote arena
    elements.sidebar.style.display = 'none';
    elements.chatArena.style.display = 'none';
    elements.voteArena.style.display = 'flex';
    elements.voteArena.classList.remove('hidden');

    const ptRef = doc(db, "panchayats", voteId);
    
    // Realtime listener
    try {
        onSnapshot(ptRef, (snapshot) => {
            if (!snapshot.exists()) {
                document.getElementById('vote-question').innerText = "Oops! Voting Poll link broken or deleted.";
                return;
            }
            currentVoteData = snapshot.data();
            document.getElementById('vote-question').innerText = currentVoteData.question;
            document.getElementById('count-yes').innerText = currentVoteData.yes || 0;
            document.getElementById('count-no').innerText = currentVoteData.no || 0;
        }, (error) => {
            console.error("Snapshot error:", error);
            document.getElementById('vote-question').innerText = "Database Access Error: " + error.message;
        });
    } catch (err) {
        console.error("Init Vote Error:", err);
    }

    // Vote Buttons Logic
    document.getElementById('btn-vote-yes').onclick = () => castVote(ptRef, 'yes');
    document.getElementById('btn-vote-no').onclick = () => castVote(ptRef, 'no');
}

async function castVote(docRef, type) {
    if(!currentVoteData) return;
    const hasVoted = localStorage.getItem(`voted_${docRef.id}`);
    if(hasVoted) { alert("Aap pehle hi vote kar chuke hain! (One vote per person)"); return; }

    const updateData = {};
    updateData[type] = (currentVoteData[type] || 0) + 1;
    
    await updateDoc(docRef, updateData);
    localStorage.setItem(`voted_${docRef.id}`, true);
    alert("Vote Registered! ✅");
}

window.startPanchayat = async function(btnElement) {
    const messageDiv = btnElement.closest('.message');
    const fullText = messageDiv.querySelector('.msg-content').innerText;
    const textPreview = fullText.length > 200 ? fullText.substring(0, 200) + "..." : fullText;
    
    const question = prompt("Voting Poll Question:\nWhat exactly do you want to ask your friends?", "Ye idea kaisa lag raha hai?");
    if (!question) return;

    try {
        const docRef = await addDoc(collection(db, "panchayats"), {
            question: question + "\n\nContext:\n" + textPreview,
            yes: 0,
            no: 0,
            createdAt: new Date().toISOString()
        });
        
        const link = window.location.origin + window.location.pathname + "?panchayat=" + docRef.id;
        
        // Copy to clipboard
        navigator.clipboard.writeText(link).then(() => {
            alert("Voting Poll Created! 🗳️\nLink Copied to Clipboard. Share it on WhatsApp/Friends:\n" + link);
        });

        // Add Live Tracker to UI
        const trackerId = `tracker-${docRef.id}`;
        const trackerDiv = document.createElement('div');
        trackerDiv.id = trackerId;
        trackerDiv.style.cssText = "margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.2); border: 1px solid var(--accent); border-radius: 8px; font-size: 0.9em;";
        trackerDiv.innerHTML = `<strong>🗳️ Live Poll Status:</strong> <span style="color:#10b981">👍 Yes: 0</span> | <span style="color:#ef4444">👎 No: 0</span>`;
        
        // Append tracker to the message footer
        const footer = messageDiv.querySelector('.msg-footer');
        if (footer) {
            footer.parentNode.insertBefore(trackerDiv, footer.nextSibling);
        }

        // Listen for realtime updates on this specific poll
        onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                const trk = document.getElementById(trackerId);
                if (trk) {
                    trk.innerHTML = `<strong>🗳️ Live Poll Status:</strong> <span style="color:#10b981">👍 Yes: ${data.yes || 0}</span> | <span style="color:#ef4444">👎 No: ${data.no || 0}</span><br><a href="${link}" target="_blank" style="color:var(--primary); font-size:0.8em; text-decoration:underline;">Poll Link</a>`;
                }
            }
        });

    } catch(err) {
        console.error("Firestore error:", err);
        alert("Voting Poll Failed to start. DB Error.");
    }
};

window.speakText = function(btnElement) {
    if (!('speechSynthesis' in window)) {
        alert("Your browser does not support text-to-speech.");
        return;
    }
    
    const synth = window.speechSynthesis;
    const iconSpan = btnElement.querySelector('.material-symbols-rounded');

    // Check if THIS message is the one currently speaking
    const isPlayingThis = (iconSpan.innerText === 'pause_circle' || iconSpan.innerText === 'stop_circle');

    if (synth.speaking || synth.pending) {
        if (isPlayingThis) {
            if (synth.paused) {
                synth.resume();
                if (iconSpan) iconSpan.innerText = 'pause_circle';
            } else {
                synth.pause();
                if (iconSpan) iconSpan.innerText = 'play_circle';
            }
            return;
        } else {
            // Stop whatever was playing
            synth.cancel();
            document.querySelectorAll('.btn-share .material-symbols-rounded').forEach(span => {
                if (span.innerText === 'pause_circle' || span.innerText === 'play_circle' || span.innerText === 'stop_circle') {
                    span.innerText = 'volume_up';
                }
            });
        }
    }
    
    // Get raw text from the message container
    let rawText = btnElement.closest('.message').querySelector('.msg-content').innerText;
    
    // Clean up text
    let cleanText = rawText.replace(/[*#_`]/g, '');

    // Initialize Utterance
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Reset icon when speech ends naturally
    utterance.onend = function() {
        if (iconSpan) iconSpan.innerText = 'volume_up';
    };

    // Change icon to pause since it starts playing
    if (iconSpan) iconSpan.innerText = 'pause_circle';
    
    // Voice selection logic
    let voices = synth.getVoices();
    
    if (voices.length === 0) {
        synth.onvoiceschanged = function() {
            voices = synth.getVoices();
            setAndPlayVoice(utterance, voices);
        };
    } else {
        setAndPlayVoice(utterance, voices);
    }
    
    function setAndPlayVoice(u, availableVoices) {
        let targetVoice = availableVoices.find(v => v.lang.includes('hi') || v.lang.includes('IN'));
        if (targetVoice) {
            u.voice = targetVoice;
        }
        
        // Add a bit of 'singing' effect if lyrics are detected
        if (cleanText.includes('🎵') || cleanText.includes('🎶')) {
            u.pitch = 1.2;
            u.rate = 0.9;
        } else {
            u.rate = 1.0;
            u.pitch = 1.0;
        }
        
        synth.speak(u);
    }
};

window.pinMessage = async function(btnElement) {
    const text = btnElement.closest('.message').querySelector('.msg-content').innerText;
    state.pinnedChats.push({ text, date: new Date().toLocaleDateString() });
    localStorage.setItem("pinned_vault", JSON.stringify(state.pinnedChats));
    
    if (userDocRef) {
        try {
            await updateDoc(userDocRef, { vault: state.pinnedChats });
        } catch(e) { console.error("Cloud pin failed:", e); }
    }
    alert("Saved to Vault! 📌");
};

// --- SIDEBAR HISTORY MANAGER ---
async function saveToHistory(itemObj) {
    const promptText = typeof itemObj === 'string' ? itemObj : itemObj.prompt;
    if(state.chatHistory.some(h => (typeof h === 'string' ? h : h.prompt) === promptText)) return; // Prevent exact duplicates immediately
    
    state.chatHistory.unshift(itemObj); // Add to top
    if(state.chatHistory.length > 15) state.chatHistory.pop(); // Keep only last 15
    
    localStorage.setItem("chat_history", JSON.stringify(state.chatHistory));
    
    renderHistorySideBar();
    
    if (userDocRef) {
        try {
            await updateDoc(userDocRef, { history: state.chatHistory });
        } catch(e) { console.error("Cloud history save failed:", e); }
    }
}

function renderHistorySideBar() {
    if(!elements.historyList) return;
    elements.historyList.innerHTML = ''; // Clear default

    if(state.chatHistory.length === 0) {
        elements.historyList.innerHTML = `<div class="history-item" style="padding:10px;text-align:center;opacity:0.6;">No recent chats yet.</div>`;
        return;
    }

    state.chatHistory.forEach(item => {
        const isString = typeof item === 'string';
        const displayPrompt = isString ? item : item.prompt;
        
        const div = document.createElement('div');
        div.className = 'history-item';
        div.style.cssText = "padding:10px; margin-bottom:5px; border-radius:6px; cursor:pointer; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
        div.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px; vertical-align:middle; margin-right:5px; opacity:0.7">chat_bubble</span> ${displayPrompt}`;
        
        div.onmouseover = () => div.style.background = "rgba(255,255,255,0.05)";
        div.onmouseout = () => div.style.background = "transparent";
        
        div.onclick = () => {
            if(window.innerWidth < 768) elements.sidebar.classList.remove('open');
            
            if (isString || !item.response) {
                // Legacy support: Just paste into input
                elements.textarea.value = displayPrompt;
                elements.textarea.focus();
                autoResizeTextarea();
            } else {
                // Render full conversation directly
                elements.chatContainer.innerHTML = ''; // Clear entire arena (removes welcome screen etc)
                appendMessage(item.prompt, 'user');
                typeMessage(item.response, 'ai');
            }
        };

        elements.historyList.appendChild(div);
    });
}

window.deletePin = async function(index) {
    state.pinnedChats.splice(index, 1);
    localStorage.setItem("pinned_vault", JSON.stringify(state.pinnedChats));
    
    if (userDocRef) {
        try {
            await updateDoc(userDocRef, { vault: state.pinnedChats });
        } catch(e) { console.error("Cloud delete failed:", e); }
    }
    showVault();
};

window.createViralCard = function(btnElement) {
    const msgText = btnElement.closest('.message').querySelector('.msg-content').innerText;
    const card = document.createElement('div');
    card.id = 'capture-area';
    card.innerHTML = `
        <div class="capture-header">
            <span class="material-symbols-rounded" style="color:#6366f1; font-size: 40px;">psychology</span>
            <div><div class="capture-brand">UTTAM VIKALP</div><div class="capture-sub">AI Assistant</div></div>
        </div>
        <div class="capture-content">${msgText}</div>
        <div class="capture-footer">Generated by Uttam Vikalp AI</div>`;
    document.body.appendChild(card);
    html2canvas(card, { backgroundColor: "#1e212b", scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'share.png';
        link.href = canvas.toDataURL("image/png");
        link.click();
        document.body.removeChild(card);
    });
};

function showVault() {
    if(state.pinnedChats.length === 0) {
        alert("Vault is empty! Pin a message first."); return;
    }
    const vaultHtml = state.pinnedChats.map((item, index) => 
        `<div style="background:#333; padding:10px; margin-bottom:10px; border-radius:8px;">
            <small style="color:#aaa">${item.date}</small>
            <p>${item.text.substring(0, 100)}...</p>
            <button onclick="deletePin(${index})" style="color:red; background:none; border:none; cursor:pointer;">🗑️ Remove</button>
         </div>`
    ).join('');

    const vaultModal = document.createElement('div');
    vaultModal.className = 'modal';
    vaultModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h3>📌 Vault</h3><button onclick="this.closest('.modal').remove()" class="btn-icon">✕</button></div>
            <div style="max-height:60vh; overflow-y:auto;">${vaultHtml}</div>
        </div>`;
    document.body.appendChild(vaultModal);
}

function setupVoiceInput() {
    if (!('webkitSpeechRecognition' in window)) { elements.voiceBtn.style.display = 'none'; return; }
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-IN';
    elements.voiceBtn.addEventListener('click', () => {
        elements.voiceBtn.style.color === 'red' ? recognition.stop() : recognition.start();
    });
    recognition.onstart = () => { elements.voiceBtn.style.color = 'red'; elements.statusText.innerText = "Listening..."; };
    recognition.onend = () => { elements.voiceBtn.style.color = ''; elements.statusText.innerText = "Ready"; };
    recognition.onresult = (event) => {
        elements.textarea.value += event.results[0][0].transcript;
        autoResizeTextarea();
        elements.textarea.focus();
    };
}

function autoResizeTextarea() {
    elements.textarea.style.height = 'auto';
    elements.textarea.style.height = elements.textarea.scrollHeight + 'px';
}

// Helper: Type Effect & Tab Parser
function typeMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.id = `msg-${Date.now()}`;
    const toolsHtml = `
        <div class="msg-footer">
            <button class="btn-share" onclick="createViralCard(this)" title="Share Image Card"><span class="material-symbols-rounded">share</span></button>
            <button class="btn-share" onclick="startPanchayat(this)" title="Start Voting Poll"><span class="material-symbols-rounded">how_to_vote</span></button>
            <button class="btn-share" onclick="speakText(this)" title="Listen Audio"><span class="material-symbols-rounded">volume_up</span></button>
            <button class="btn-share" onclick="pinMessage(this)" title="Pin to Vault"><span class="material-symbols-rounded">push_pin</span></button>
        </div>`;
    elements.chatContainer.appendChild(div);
    
    // Check if AI responded with Tri-Tabs
    if (sender === 'ai' && text.includes("# [TAB]")) {
        const parts = text.split(/# \[TAB\]\s*/).filter(p => p.trim() !== "");
        let tabsHtml = `<div class="ai-tabs">`;
        let contentsHtml = ``;
        
        parts.forEach((part, index) => {
            const lines = part.trim().split('\n');
            const tabName = lines[0].trim();
            let tabContent = lines.slice(1).join('\n');
            
            if (typeof marked !== 'undefined') {
                tabContent = marked.parse(tabContent, { breaks: true });
            } else {
                tabContent = tabContent.replace(/\n(?!\<)/g, '<br>');
            }
            
            const activeClass = index === 0 ? "active" : "";
            tabsHtml += `<button class="ai-tab ${activeClass}" data-tab="${tabName}" onclick="switchTab(this, '${div.id}')">${tabName}</button>`;
            contentsHtml += `<div class="tab-content ${activeClass}" data-content="${tabName}">${tabContent}</div>`;
        });
        tabsHtml += `</div>`;
        div.innerHTML = `<div class="msg-content">${tabsHtml}${contentsHtml}</div>` + toolsHtml;
    } else {
        div.innerHTML = `<div class="msg-content"></div>` + (sender === 'ai' ? toolsHtml : '');
        let htmlText = text;
        
        if (sender === 'ai' && typeof marked !== 'undefined') {
            htmlText = marked.parse(htmlText, { breaks: true });
        } else {
            htmlText = htmlText.replace(/```mermaid\n([\s\S]*?)```/g, '<div class="mermaid">$1</div>');
            htmlText = htmlText.replace(/\n(?!\<)/g, '<br>');
        }
        
        div.querySelector('.msg-content').innerHTML = htmlText;
    }
    
    // Post-process message for Mermaid graphs
    if(sender === 'ai') {
        // Find Mermaid blocks converted by marked JS
        div.querySelectorAll('.msg-content pre code.language-mermaid').forEach(el => {
            const mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'mermaid';
            mermaidDiv.textContent = el.textContent; 
            el.parentElement.replaceWith(mermaidDiv);
        });

        // Regex fallback for unparsed / custom tab content
        div.querySelectorAll('.tab-content').forEach(tc => {
            let htmlText = tc.innerHTML.replace(/```mermaid\s*([\s\S]*?)```/g, '<div class="mermaid">$1</div>');
            tc.innerHTML = htmlText;
        });
        
        // Render Flowcharts
        setTimeout(() => {
            if(window.mermaid) {
                window.mermaid.init(undefined, div.querySelectorAll('.mermaid'));
            }
        }, 100);
    }
    
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

window.switchTab = function(btn, msgId) {
    const container = document.getElementById(msgId);
    if(!container) return;
    const tabName = btn.getAttribute('data-tab');
    container.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
    container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const contentDiv = Array.from(container.querySelectorAll('.tab-content')).find(c => c.getAttribute('data-content') === tabName);
    if(contentDiv) contentDiv.classList.add('active');
};

function appendMessage(text, sender, isLoading = false) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.id = isLoading ? 'loading-bubble' : `msg-${Date.now()}`;
    const contentHtml = isLoading ? `<div class="bouncing-dots"><div></div><div></div><div></div><div></div></div>` : text;
    div.innerHTML = `<div class="msg-content">${contentHtml}</div>`;
    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
    return div.id;
}

init();
