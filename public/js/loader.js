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

    // 2. Hide Loader IMMEDIATELY when the page assets finish downloading
    window.addEventListener('load', () => {
        clearInterval(textInterval); // Stop the text loop instantly
        
        // Force the CSS transition to be snappy (250ms instead of 700ms)
        loaderOverlay.style.transition = 'opacity 0.25s ease'; 
        loaderOverlay.style.opacity = '0';  // Trigger the fade-out
        
        // Remove it from the DOM as soon as the quick fade is done
        setTimeout(() => {
            loaderOverlay.style.display = 'none';
        }, 250);
    });
});