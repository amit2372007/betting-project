// public/js/loader.js

document.addEventListener("DOMContentLoaded", () => {
    // 1. Text Cycling Logic
    const loaderPhrases = [
        "Verifying wallet balance...",
        "Syncing real-time match odds...",
        "Securing transaction tunnel...",
        "Loading casino modules...",
        "Preparing the pitch..."
    ];
    
    const textEl = document.getElementById('dynamic-loader-text');
    const loaderOverlay = document.getElementById('global-loader');
    
    if (!textEl || !loaderOverlay) return; // Failsafe in case loader isn't on this page

    let phraseIdx = 0;

    // Cycle through phrases every 2.5 seconds
    const textInterval = setInterval(() => {
        textEl.style.opacity = 0;
        setTimeout(() => {
            phraseIdx = (phraseIdx + 1) % loaderPhrases.length;
            textEl.innerText = loaderPhrases[phraseIdx];
            textEl.style.opacity = 1;
        }, 400); 
    }, 2500);

    // 2. Hide Loader when the entire page finishes downloading
    window.addEventListener('load', () => {
        // Artificial delay: Ensure the user sees the loader for at least 1.2 seconds 
        // even if they have super fast internet. It builds premium anticipation!
        setTimeout(() => {
            clearInterval(textInterval); // Stop the text loop
            loaderOverlay.style.opacity = '0';  // Trigger the CSS fade-out transition
            
            // Wait for the fade out to finish (700ms), then completely remove it from the DOM
            setTimeout(() => {
                loaderOverlay.style.display = 'none';
            }, 700);
        }, 1200); 
    });
});