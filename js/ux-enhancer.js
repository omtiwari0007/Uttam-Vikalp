// js/ux-enhancer.js

export function initUXEnhancements(textareaElement) {
    let complimentGiven = false;
    let hintGiven = false;

    // Provide guidance on focus
    textareaElement.addEventListener('focus', () => {
        if (textareaElement.value.trim().length === 0 && !hintGiven) {
            showToast("💡 Pro Tip: Describe your problem in detail for the best advice from Uttam Vikalp!");
            hintGiven = true;
            setTimeout(() => hintGiven = false, 120000); // Allow hint again after 2 mins
        }
    });

    // Provide a compliment on descriptive prompts
    textareaElement.addEventListener('input', () => {
        const length = textareaElement.value.trim().length;
        
        // If prompt is rich and hasn't been complimented yet
        if (length > 60 && !complimentGiven) {
            showToast("🌟 Great detail! The more context you provide, the better I can assist you.");
            complimentGiven = true;
            
            // Allow compliment again after an hour
            setTimeout(() => complimentGiven = false, 3600000);
        }
    });
}

export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'ux-toast';
    toast.innerHTML = `<span class="material-symbols-rounded">stars</span> <span>${message}</span>`;
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500); // Remove from DOM after fade out
    }, 4000);
}

// Attach directly to DOM if it's imported in the HTML top-level
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('user-input');
    if (textarea) {
        initUXEnhancements(textarea);
    }
});
