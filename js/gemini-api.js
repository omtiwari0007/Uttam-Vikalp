// js/gemini-api.js

const SYSTEM_PROMPT = `
You are UTTAM VIKALP.
- Style: Direct, Logical, Hinglish.
- Rules:
1. If 2+ Images are uploaded: You are in "VERSUS MODE". Compare them pixel-by-pixel. Create a comparison TABLE. Declare a Winner.
2. If Desi Mode is ON: Use Indian context (₹, local brands).
3. If Web Mode is ON: You MUST use the Google Search tool to find the most recent news, prices, dates, or current events BEFORE answering. Do not rely on old training data whenever asked for "latest" or "aj ki" information.
`;

let cachedModelName = null;

export async function generateAIResponse(userText, apiKeys, isDesiMode, imageArray = [], isWebMode = false, expertise = "General") {
    
    if(!apiKeys || apiKeys.length === 0) return "🛑 Error: No API Keys provided.";

    try {
        let promptText = `You are UTTAM VIKALP, a Master Decision Engine.
- Role/Persona: ${expertise} (Adjust your tone and advice based on this exact role).
- Style: Direct, Logical, Hinglish.
- Rules:
1. If 2+ Images are uploaded: You are in "VERSUS MODE". Compare them pixel-by-pixel. Create a comparison TABLE. Declare a Winner.
2. If Desi Mode is ON: Use Indian context (₹, local brands, cultural nuances).
3. If Web Mode is ON: You MUST use the Google Search tool to find the most recent news, prices, dates, or current events BEFORE answering. Do not rely on old training data whenever asked for "latest" or "aj ki" information.
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

        // RELAY RACE LOGIC (Up to 3 keys fallback)
        for (let i = 0; i < apiKeys.length; i++) {
            const currentKey = apiKeys[i];
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
                    
                    // Specific limits check (429 Too Many Requests)
                    if (response.status === 429 && i < apiKeys.length - 1) {
                        console.warn(`Key ${i+1} Exhausted. Firing Backup Key ${i+2}... 🚀`);
                        continue; // Jump to the next key in the loop
                    }

                    if (response.status === 404) {
                        cachedModelName = null;
                        throw new Error(`API Error (404): ${errorData.error ? errorData.error.message : 'Unknown'}. URL was: ${url}`);
                    }
                    throw new Error(errorData.error ? errorData.error.message : 'Unknown API Error');
                }

                const data = await response.json();
                
                const candidate = data.candidates[0];
                if (candidate.content && candidate.content.parts) {
                    return candidate.content.parts.map(p => p.text).join('');
                } else {
                    return "⚠️ AI ne soch liya par bol nahi paaya. (Complex Output format)";
                }

            } catch (err) {
                // Return error if it's the last key, otherwise keep looping
                if (i === apiKeys.length - 1) {
                    throw err; 
                }
            }
        } // End of Relay Race Loop

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
    
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[i];
        try {
            const modelName = await getWorkingModel(currentKey, false);
            const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${currentKey}`;
            const payload = {
                contents: [{ parts: [{ text: `Rewrite this raw idea into a highly professional, detailed, and clear instruction prompt (return ONLY the rewritten English text, no pleasantries): "${userText}"` }] }]
            };
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            
            if (!response.ok) {
                const errData = await response.json();
                if (response.status === 429 && i < apiKeys.length - 1) {
                    console.warn(`Rewrite: Key ${i+1} Exhausted. Trying Backup Key ${i+2}...`);
                    continue;
                }
                throw new Error(errData.error ? errData.error.message : "Rewrite failed");
            }
            const data = await response.json();
            return data.candidates[0].content.parts.map(p => p.text).join('').trim();
        } catch(e) {
            if (i === apiKeys.length - 1) {
                console.error("Rewrite error:", e);
                throw new Error(`${e.message}\n(Tip: Subah-Subah quota bhar gaya? Settings (⚙️) me jao aur 2nd Backup API Key load karo!)`);
            }
        }
    }
}
