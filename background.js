const defaultUseSidePanel = false;

async function applyPanelMode() {
    try {
        const res = await chrome.storage.local.get({ useSidePanel: defaultUseSidePanel });
        const useSidePanel = !!res.useSidePanel;

        await chrome.sidePanel.setPanelBehavior({
            openPanelOnActionClick: useSidePanel
        });

        if (useSidePanel) {
            await chrome.action.setPopup({ popup: '' });
        } else {
            await chrome.action.setPopup({ popup: 'popup.html' });
        }
    } catch (error) {
        console.warn('No se pudo aplicar el modo de panel lateral:', error);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    applyPanelMode();
});

chrome.runtime.onStartup.addListener(() => {
    applyPanelMode();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.useSidePanel) {
        applyPanelMode();
    }
});