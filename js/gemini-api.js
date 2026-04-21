// js/gemini-api.js

const SYSTEM_PROMPT = `
You are UTTAM VIKALP.
- Style: Direct, Logical, Hinglish.
- Rules:
1. If 2+ Images are uploaded: You are in "VERSUS MODE". Compare them pixel-by-pixel. Create a comparison TABLE. Declare a Winner.
2. If Desi Mode is ON: Use Indian context (₹, local brands).
3. If Web Mode is ON: You MUST use the Google Search tool to find the most recent news, prices, dates, or current events BEFORE answering. Do not rely on old training data whenever asked for "latest" or "aj ki" information. ALWAYS include clickable source links (URLs) at the end.
`;

let cachedModelName = null;
let currentApiIndex = 0;

export async function generateAIResponse(userText, apiKeys, isDesiMode, imageArray = [], isWebMode = false, expertise = "General") {
    
    if(!apiKeys || apiKeys.length === 0) return "🛑 Error: No API Keys provided.";

    try {
        let promptText = `You are UTTAM VIKALP, a Master Decision Engine.
- Role/Persona: ${expertise} (Adjust your tone and advice based on this exact role).
- Style: Direct, Logical, Hinglish.
- Rules:
1. If 2+ Images are uploaded: You are in "VERSUS MODE". Compare them pixel-by-pixel. Create a comparison TABLE. Declare a Winner.
2. If Desi Mode is ON: Use Indian context (₹, local brands, cultural nuances).
3. If Web Mode is ON: You MUST use the Google Search tool to find the most recent news, prices, dates, or current events BEFORE answering. Do not rely on old training data whenever asked for "latest" or "aj ki" information. VERY IMPORTANT: Always include clickable source links (URLs) at the end of your response so the user knows where you got the information.
4. IMPORTANT: Unless it's a casual greeting, ALWAYS structure your response EXACTLY using these 4 Markdown section markers:
# [TAB] Practical
(step-by-step logic here)
# [TAB] Creative
(out-of-the-box or viral ideas here)
# [TAB] Safe
(risks, compliance, warnings here)
# [TAB] Roast
(play devil's advocate and highlight flaws here)

User query: ${userText}`;
        
        if (imageArray.length > 1) {
            promptText += "\n[INSTRUCTION: Make sure to include the Comparison Table within the Practical tab.]";
        } else if (imageArray.length === 1 && !userText) {
            promptText += "Describe this image within the tab structure.";
        }

        const parts = [{ text: promptText }];
        
        if (imageArray.length > 0) {
            imageArray.forEach(img => { parts.push(img); });
        }

        // 4. Tools Configuration (Web Search) - FIX: Use "googleSearch" instead of "google_search"
        const tools = [];
        if (isWebMode) {
            tools.push({ googleSearch: {} }); // Official Google Search Tool
        }

        const payload = { 
            contents: [{ parts: parts }],
            tools: tools.length > 0 ? tools : undefined
        };

        // RELAY RACE LOGIC (Continuous Round Robin)
        let attempts = 0;
        const maxAttempts = apiKeys.length; // Try each key once in this cycle
        let lastErrorMessage = "";

        while (attempts < maxAttempts) {
            const currentKey = apiKeys[currentApiIndex % apiKeys.length];
            let retries = 1; // 1 retry for 503 per key

            for (let r = 0; r <= retries; r++) {
                try {
                    const modelName = await getWorkingModel(currentKey, imageArray.length > 0);
                    const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${currentKey}`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        const errorMessage = errorData.error ? errorData.error.message : 'Unknown API Error';
                        
                        if (response.status === 503 || errorMessage.toLowerCase().includes("high demand")) {
                            if (r < retries) {
                                console.warn(`Model overloaded. Retrying in 2 seconds... (Attempt ${r+1})`);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                continue; 
                            }
                        }

                        if (response.status === 404) cachedModelName = null;
                        
                        throw new Error(errorMessage);
                    }

                    const data = await response.json();
                    
                    const candidate = data.candidates[0];
                    if (candidate.content && candidate.content.parts) {
                        return candidate.content.parts.map(p => p.text).join('');
                    } else {
                        return "⚠️ AI ne soch liya par bol nahi paaya. (Complex Output format)";
                    }

                } catch (err) {
                    if (err.message.toLowerCase().includes("high demand") && r < retries) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }
                    lastErrorMessage = err.message;
                    break; // Break inner loop to try next API key
                }
            } // End of Retry Loop
            
            console.warn(`Key ${(currentApiIndex % apiKeys.length) + 1} Exhausted/Failed. Switching to next key... 🚀`);
            currentApiIndex++;
            attempts++;
        } // End of Relay Race Loop

        // If we exhausted all keys
        return `🛑 Error: Aapki saari (${apiKeys.length}) API Keys ki limit khatam ho chuki hai. Please 1 minute baad try karein. (Details: ${lastErrorMessage})`;

    } catch (error) {
        console.error("AI Error:", error);
        return `🛑 Error: ${error.message}`;
    }
}

// Auto-Scanner (Same as before, just robust)
async function getWorkingModel(apiKey, requiresVision) {
    if (cachedModelName && !requiresVision) return cachedModelName;

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(listUrl);
        const data = await response.json();
        
        // Priority Models
        const models = data.models || [];
        let bestModel = null;

        // Both flash and pro models inherently support vision in Gemini 1.5 and 2.x
        // We prioritize the fastest and newest models
        const preferences = [
            "2.5-flash",
            "2.0-flash",
            "1.5-flash"
        ];

        for (const pref of preferences) {
            bestModel = models.find(m => m.name.includes(pref));
            if (bestModel) break;
        }
        
        // Fallback to 1.5 flash if none found (safest for most API keys right now)
        const finalName = bestModel ? bestModel.name : "models/gemini-1.5-flash";
        cachedModelName = finalName;
        return finalName;
    } catch (e) {
        return "models/gemini-1.5-flash";
    }
}

// Magic Rewrite Function
export async function rewritePrompt(userText, apiKeys) {
    if (!userText || !apiKeys || apiKeys.length === 0) return userText;
    
    let attempts = 0;
    const maxAttempts = apiKeys.length;
    let lastErrorMessage = "";

    while (attempts < maxAttempts) {
        const currentKey = apiKeys[currentApiIndex % apiKeys.length];
        let retries = 1;

        for (let r = 0; r <= retries; r++) {
            try {
                const modelName = await getWorkingModel(currentKey, false);
                const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${currentKey}`;
                const payload = {
                    contents: [{ parts: [{ text: `Rewrite this raw idea into a highly professional, detailed, and clear instruction prompt (return ONLY the rewritten English text, no pleasantries): "${userText}"` }] }]
                };
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                
                if (!response.ok) {
                    const errData = await response.json();
                    const errMsg = errData.error ? errData.error.message : "Rewrite failed";
                    
                    if (response.status === 503 || errMsg.toLowerCase().includes("high demand")) {
                        if (r < retries) {
                            console.warn(`Rewrite overloaded. Retrying in 2s... (Attempt ${r+1})`);
                            await new Promise(res => setTimeout(res, 2000));
                            continue;
                        }
                    }
                    throw new Error(errMsg);
                }
                const data = await response.json();
                return data.candidates[0].content.parts.map(p => p.text).join('').trim();
            } catch(e) {
                if (e.message.toLowerCase().includes("high demand") && r < retries) {
                    await new Promise(res => setTimeout(res, 2000));
                    continue;
                }
                lastErrorMessage = e.message;
                break; // Break inner loop to try next API key
            }
        } // End of retry loop
        
        console.warn(`Rewrite: Key ${(currentApiIndex % apiKeys.length) + 1} Failed. Trying Backup Key...`);
        currentApiIndex++;
        attempts++;
    }
    
    throw new Error(`Saari (${apiKeys.length}) API Keys exhaust ho chuki hain. Please 1 min baad try karein.\n(Last Error: ${lastErrorMessage})`);
}
