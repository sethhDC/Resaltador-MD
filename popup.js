const defaultColorMap = {
    'hl-red': 'Crítico / Contraindicación',
    'hl-pink': 'Seguimiento / Alerta',
    'hl-yellow': 'Precaución / Interacción',
    'hl-green': 'Dosis / Esquema',
    'hl-cyan': 'Criterios Diagnósticos',
    'hl-orange': 'Efectos Adversos',
    'hl-purple': 'Hallazgos Laboratorio',
    'hl-blue': 'Información General',
    'hl-gray': 'Notas Secundarias',
    'hl-underline-red': 'Prioridad Alta'
};

const defaultCopyTemplate = '"[TEXTO]" - Fuente: [URL]';
const defaultExportFormat = 'pdf'; 
const defaultIncludeLabels = true; 
const defaultIncludeEmojis = true; 
const defaultEnableColorMenu = true;
const defaultShowHighlights = true;
const defaultUseSidePanel = false;

const themes = ['system', 'light', 'dark'];
const themeIcons = { system: '🌓', light: '☀️', dark: '🌙' };

function buildExportPayload(allData, includeSettings) {
    if (includeSettings) return allData;

    return {
        highlights: allData.highlights || [],
        folders: allData.folders || []
    };
}

function mergeHighlights(currentHighlights = [], importedHighlights = []) {
    const mergedMap = new Map();

    currentHighlights.forEach(item => {
        if (item && item.id) mergedMap.set(item.id, item);
    });

    importedHighlights.forEach(item => {
        if (item && item.id && !mergedMap.has(item.id)) {
            mergedMap.set(item.id, item);
        }
    });

    return Array.from(mergedMap.values());
}

function mergeFolders(currentFolders = [], importedFolders = []) {
    const folderMap = new Map();

    currentFolders.forEach(folder => {
        if (!folder || !folder.id) return;
        folderMap.set(folder.id, {
            ...folder,
            pages: Array.isArray(folder.pages) ? [...folder.pages] : []
        });
    });

    importedFolders.forEach(folder => {
        if (!folder || !folder.id) return;

        const importedPages = Array.isArray(folder.pages) ? folder.pages : [];

        if (!folderMap.has(folder.id)) {
            folderMap.set(folder.id, {
                ...folder,
                pages: [...new Set(importedPages)]
            });
        } else {
            const existing = folderMap.get(folder.id);
            folderMap.set(folder.id, {
                ...existing,
                ...folder,
                pages: [...new Set([
                    ...(Array.isArray(existing.pages) ? existing.pages : []),
                    ...importedPages
                ])]
            });
        }
    });

    return Array.from(folderMap.values());
}

function extractSettingsFromImport(importedData) {
    const settingsKeys = [
        'quickColors',
        'enableColorMenu',
        'showHighlights',
        'colorMap',
        'copyTemplate',
        'exportFormat',
        'includeLabels',
        'includeEmojis',
        'useSidePanel',
        'theme'
    ];

    const settings = {};

    settingsKeys.forEach(key => {
        if (key in importedData) {
            settings[key] = importedData[key];
        }
    });

    return settings;
}

document.addEventListener('DOMContentLoaded', async () => {
    renderAll();
    initTheme();
    
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', (e) => {
        clearSearchBtn.style.display = e.target.value.length > 0 ? 'block' : 'none';
        handleSearch(e);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        searchInput.dispatchEvent(new Event('input')); 
        searchInput.focus(); 
    });

    document.getElementById('themeBtn').addEventListener('click', async () => {
        const res = await chrome.storage.local.get({ theme: 'system' });
        let currentIdx = themes.indexOf(res.theme);
        let nextIdx = (currentIdx + 1) % themes.length;
        let nextTheme = themes[nextIdx];
        
        await chrome.storage.local.set({ theme: nextTheme });
        applyTheme(nextTheme);
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
        const mainUi = document.getElementById('main-ui');
        const settingsView = document.getElementById('settings-view');
        
        if (settingsView.style.display === 'flex') {
            settingsView.style.display = 'none';
            mainUi.style.display = 'block';
        } else {
            mainUi.style.display = 'none';
            settingsView.style.display = 'flex';
            renderSettings();
        }
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        document.getElementById('settings-view').style.display = 'none';
        document.getElementById('main-ui').style.display = 'block';
    });

    document.getElementById('resetSettingsBtn').addEventListener('click', async () => {
    if (confirm("⚠️ ¿Estás seguro de que deseas restablecer TODOS los ajustes clínicos a sus valores originales?\n\nNOTA: Esta acción restaurará los colores, plantillas, formatos de exportación y ajustes generales. ¡Tus expedientes y carpetas NO se borrarán!")) {
        await chrome.storage.local.set({
            colorMap: defaultColorMap,
            copyTemplate: defaultCopyTemplate,
            exportFormat: defaultExportFormat,
            includeLabels: defaultIncludeLabels,
            includeEmojis: defaultIncludeEmojis,
            enableColorMenu: defaultEnableColorMenu,
            showHighlights: defaultShowHighlights,
            useSidePanel: defaultUseSidePanel
        });
        renderSettings();
    }
});
    
    document.getElementById('exportDataBtn').addEventListener('click', async () => {
        const allData = await chrome.storage.local.get(null);

        const includeSettings = confirm(
            "¿Deseas exportar también la configuración?\n\n" +
            "Aceptar = Datos y configuración\n" +
            "Cancelar = Solo datos"
        );

        const exportData = buildExportPayload(allData, includeSettings);
        const dataStr = JSON.stringify(exportData, null, 2);

        const suffix = includeSettings ? 'Datos_y_Ajustes' : 'Solo_Datos';
        downloadFile(
            `Respaldo_MD_${suffix}_${new Date().toISOString().split('T')[0]}.json`,
            dataStr,
            'application/json'
        );
    });

    const importBtn = document.getElementById('importDataBtn');
    const fileInput = document.getElementById('importFileInput');
    importBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);

                const currentData = await chrome.storage.local.get(null);

                const mergedHighlights = mergeHighlights(
                    currentData.highlights || [],
                    importedData.highlights || []
                );

                const mergedFolders = mergeFolders(
                    currentData.folders || [],
                    importedData.folders || []
                );

                const importedSettings = extractSettingsFromImport(importedData);

                await chrome.storage.local.set({
                    highlights: mergedHighlights,
                    folders: mergedFolders,
                    ...importedSettings
                });

                alert("✅ Backup importado correctamente. Tus datos anteriores se mantuvieron y se fusionaron con los del archivo.");
                renderAll();
                renderSettings();
            } catch (err) {
                alert("❌ Error al leer o importar el archivo JSON.");
                console.error(err);
            }

            fileInput.value = '';
        };

        reader.readAsText(file);
    });
});

async function initTheme() {
    const res = await chrome.storage.local.get({ theme: 'system' });
    applyTheme(res.theme);
}

function applyTheme(theme) {
    const body = document.body;
    const iconSpan = document.getElementById('themeIcon');
    
    body.classList.remove('theme-system', 'theme-light', 'theme-dark');
    body.classList.add(`theme-${theme}`);
    iconSpan.innerText = themeIcons[theme];
    
    iconSpan.style.transform = 'scale(0.5)';
    setTimeout(() => iconSpan.style.transform = 'scale(1)', 50);
}

async function renderSettings() {
    const container = document.getElementById('color-mapping-container');
    container.innerHTML = '';
    
    const res = await chrome.storage.local.get({ 
        colorMap: defaultColorMap, 
        copyTemplate: defaultCopyTemplate,
        exportFormat: defaultExportFormat,
        includeLabels: defaultIncludeLabels,
        includeEmojis: defaultIncludeEmojis,
        enableColorMenu: defaultEnableColorMenu,
        showHighlights: defaultShowHighlights,
        useSidePanel: defaultUseSidePanel
    });
    
    const formatSelect = document.getElementById('exportFormatSelect');
    if (formatSelect) {
        formatSelect.value = res.exportFormat;
        formatSelect.addEventListener('change', async (e) => {
            await chrome.storage.local.set({ exportFormat: e.target.value });
        });
    }

    const colorMenuCheck = document.getElementById('enableColorMenuCheck');
    if (colorMenuCheck) {
        colorMenuCheck.checked = res.enableColorMenu;
        colorMenuCheck.onchange = async (e) => {
            await chrome.storage.local.set({ enableColorMenu: e.target.checked });
        };
    }

    const showHighlightsCheck = document.getElementById('showHighlightsCheck');
    if (showHighlightsCheck) {
        showHighlightsCheck.checked = res.showHighlights;
        showHighlightsCheck.onchange = async (e) => {
            await chrome.storage.local.set({ showHighlights: e.target.checked });
        };
    }

    const useSidePanelCheck = document.getElementById('useSidePanelCheck');
    if (useSidePanelCheck) {
        useSidePanelCheck.checked = res.useSidePanel;
        useSidePanelCheck.onchange = async (e) => {
            await chrome.storage.local.set({ useSidePanel: e.target.checked });
        };
    }

    const labelCheck = document.getElementById('includeLabelCheck');
    if (labelCheck) {
        labelCheck.checked = res.includeLabels;
        labelCheck.addEventListener('change', async (e) => {
            await chrome.storage.local.set({ includeLabels: e.target.checked });
        });
    }

    const emojiCheck = document.getElementById('includeEmojiCheck');
    if (emojiCheck) {
        emojiCheck.checked = res.includeEmojis;
        emojiCheck.addEventListener('change', async (e) => {
            await chrome.storage.local.set({ includeEmojis: e.target.checked });
        });
    }

    const templateInput = document.getElementById('copyTemplateInput');
    if (templateInput) {
        templateInput.value = res.copyTemplate;
        templateInput.addEventListener('change', async (e) => {
            await chrome.storage.local.set({ copyTemplate: e.target.value });
        });
    }
    
    const map = res.colorMap;
    const colorsConfig = [
        { id: 'hl-red', hex: '#ff0000' }, { id: 'hl-pink', hex: '#ff007f' },
        { id: 'hl-yellow', hex: '#ffff00' }, { id: 'hl-green', hex: '#00ff00' },
        { id: 'hl-cyan', hex: '#00ffff' }, { id: 'hl-orange', hex: '#ff8c00' },
        { id: 'hl-purple', hex: '#9400d3' }, { id: 'hl-blue', hex: '#0000ff' },
        { id: 'hl-gray', hex: '#808080' }, { id: 'hl-underline-red', hex: '#fff', border: '2px solid #ff0000' }
    ];
    
    colorsConfig.forEach(c => {
        const row = document.createElement('div');
        row.className = 'color-map-row';
        const dot = document.createElement('div');
        dot.className = 'color-dot-preview';
        dot.style.backgroundColor = c.hex;
        if (c.border) { dot.style.border = c.border; dot.style.backgroundColor = 'transparent'; }
        
        const input = document.createElement('input');
        input.className = 'color-map-input';
        input.type = 'text';
        input.placeholder = 'Definir significado...';
        input.value = map[c.id] || '';
        
        input.addEventListener('change', async (e) => {
            const currentRes = await chrome.storage.local.get({ colorMap: defaultColorMap });
            currentRes.colorMap[c.id] = e.target.value.trim();
            await chrome.storage.local.set({ colorMap: currentRes.colorMap });
        });
        row.appendChild(dot); row.appendChild(input); container.appendChild(row);
    });
}

function getColorEmoji(colorClass) {
    const emojiMap = {
        'hl-red': '🔴', 'hl-pink': '🩷', 'hl-yellow': '🟡', 'hl-green': '🟢',
        'hl-cyan': '💠', 'hl-orange': '🟠', 'hl-purple': '🟣', 'hl-blue': '🔵',
        'hl-gray': '🔘', 'hl-underline-red': '🚨'
    };
    return emojiMap[colorClass] || '📌';
}

function formatShortDate(dateString) {
    if (!dateString) return 'Sin fecha';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Sin fecha';

    return new Intl.DateTimeFormat('es-BO', {
        day: 'numeric',
        month: 'numeric',
        year: '2-digit'
    }).format(date);
}

function getPageCreatedAt(items) {
    const validDates = items
        .map(item => item.createdAt)
        .filter(Boolean)
        .map(date => new Date(date))
        .filter(date => !isNaN(date.getTime()));

    if (validDates.length === 0) return null;

    validDates.sort((a, b) => a - b);
    return validDates[0].toISOString();
}

function groupItemsByDate(items) {
    const groups = new Map();

    const sortedItems = [...items].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateA - dateB;
    });

    sortedItems.forEach(item => {
        const label = formatShortDate(item.createdAt);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(item);
    });

    return Array.from(groups.entries()).map(([dateLabel, items]) => ({
        dateLabel,
        items
    }));
}

async function handleExport(data, type, groupedPages = null) {
    const res = await chrome.storage.local.get({ 
        exportFormat: defaultExportFormat, 
        colorMap: defaultColorMap,
        includeLabels: defaultIncludeLabels,
        includeEmojis: defaultIncludeEmojis
    });
    
    const { exportFormat: format, colorMap, includeLabels, includeEmojis } = res;

    if (format === 'pdf') {
        if (type === 'page') exportToPDF(data, colorMap, includeLabels, includeEmojis);
        else exportFolderToPDF(data, groupedPages, colorMap, includeLabels, includeEmojis);
    } else if (format === 'md') {
        if (type === 'page') exportToMarkdown(data, colorMap, includeLabels, includeEmojis);
        else exportFolderToMarkdown(data, groupedPages, colorMap, includeLabels, includeEmojis);
    } else if (format === 'txt') {
        if (type === 'page') exportToText(data, colorMap, includeLabels, includeEmojis);
        else exportFolderToText(data, groupedPages, colorMap, includeLabels, includeEmojis);
    }
}

function exportToMarkdown(page, colorMap, includeLabels, includeEmojis) {
    let md = `# Expediente: ${page.title}\n\n**Fuente:** [Enlace Original](${page.url})\n\n---\n\n`;
    page.items.forEach(item => {
        let parts = [];
        if (includeEmojis) parts.push(getColorEmoji(item.colorClass));
        if (includeLabels) parts.push(`[${colorMap[item.colorClass] || 'Resaltado'}]`);
        let prefix = parts.length > 0 ? `**${parts.join(' ')}**: ` : '';
        md += `- ${prefix}${item.text}\n`;
    });
    downloadFile(`Expediente_${page.title.substring(0, 20)}.md`, md, 'text/markdown');
}

function exportFolderToMarkdown(folder, groupedPages, colorMap, includeLabels, includeEmojis) {
    let md = `# Reporte de Carpeta: ${folder.name}\n\n**Total de páginas:** ${folder.pages.length}\n\n---\n\n`;
    folder.pages.forEach(url => {
        const page = groupedPages[url];
        if (!page) return;
        md += `## ${page.title}\n*Fuente: [Enlace Original](${url})*\n\n`;
        page.items.forEach(item => {
            let parts = [];
            if (includeEmojis) parts.push(getColorEmoji(item.colorClass));
            if (includeLabels) parts.push(`[${colorMap[item.colorClass] || 'Resaltado'}]`);
            let prefix = parts.length > 0 ? `**${parts.join(' ')}**: ` : '';
            md += `- ${prefix}${item.text}\n`;
        });
        md += `\n---\n\n`;
    });
    downloadFile(`Carpeta_${folder.name.replace(/\s+/g, '_')}.md`, md, 'text/markdown');
}

function exportToText(page, colorMap, includeLabels, includeEmojis) {
    let txt = `EXPEDIENTE: ${page.title}\nFUENTE: ${page.url}\n\n=========================\n\n`;
    page.items.forEach(item => {
        let parts = [];
        if (includeEmojis) parts.push(getColorEmoji(item.colorClass));
        if (includeLabels) parts.push(`[${colorMap[item.colorClass] || 'Resaltado'}]`);
        let prefix = parts.length > 0 ? `${parts.join(' ')}: ` : '';
        txt += `${prefix}${item.text}\n\n`;
    });
    downloadFile(`Expediente_${page.title.substring(0, 20)}.txt`, txt, 'text/plain');
}

function exportFolderToText(folder, groupedPages, colorMap, includeLabels, includeEmojis) {
    let txt = `REPORTE DE CARPETA: ${folder.name}\nTOTAL DE PÁGINAS: ${folder.pages.length}\n\n=========================\n\n`;
    folder.pages.forEach(url => {
        const page = groupedPages[url];
        if (!page) return;
        txt += `PÁGINA: ${page.title}\nFUENTE: ${url}\n\n`;
        page.items.forEach(item => {
            let parts = [];
            if (includeEmojis) parts.push(getColorEmoji(item.colorClass));
            if (includeLabels) parts.push(`[${colorMap[item.colorClass] || 'Resaltado'}]`);
            let prefix = parts.length > 0 ? `${parts.join(' ')}: ` : '';
            txt += `${prefix}${item.text}\n\n`;
        });
        txt += `-------------------------\n\n`;
    });
    downloadFile(`Carpeta_${folder.name.replace(/\s+/g, '_')}.txt`, txt, 'text/plain');
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('addFolderBtn').onclick = async () => {
    const name = prompt("Nombre de la nueva carpeta:");
    if (name) {
        const data = await chrome.storage.local.get({ folders: [] });
        data.folders.push({ id: Date.now().toString(), name: name, pages: [] });
        await chrome.storage.local.set({ folders: data.folders });
        renderAll();
    }
};

async function renderAll() {
    const mainContainer = document.getElementById('main-container');
    const data = await chrome.storage.local.get({ highlights: [], folders: [] });
    mainContainer.innerHTML = '';

    const groupedPages = data.highlights.reduce((acc, hl) => {
        if (!acc[hl.url]) acc[hl.url] = { url: hl.url, title: hl.title || hl.url, items: [] };
        acc[hl.url].items.push(hl);
        return acc;
    }, {});

    const urlsInFolders = new Set();
    data.folders.forEach(f => f.pages.forEach(p => urlsInFolders.add(p)));

    data.folders.forEach(folder => {
        mainContainer.appendChild(createFolderUI(folder, groupedPages, data.folders));
    });

    const unorganizedUrls = Object.keys(groupedPages).filter(url => !urlsInFolders.has(url));
    if (unorganizedUrls.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'unorganized-divider';
        divider.innerHTML = `<p style="font-size:11px; color:#95a5a6; margin: 10px 0 2px 10px; font-weight:bold; text-transform:uppercase;">Sin organizar</p>`;
        mainContainer.appendChild(divider);
        unorganizedUrls.forEach(url => {
            mainContainer.appendChild(createPageCard(groupedPages[url], data.folders));
        });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value) {
        searchInput.dispatchEvent(new Event('input'));
    }
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const isSearching = query.length > 0;
    
    const folders = document.querySelectorAll('.folder-container');
    const wrappers = document.querySelectorAll('.page-wrapper');
    
    wrappers.forEach(wrapper => {
        const card = wrapper.querySelector('.page-card');
        const detail = wrapper.querySelector('.highlights-detail');
        const entries = wrapper.querySelectorAll('.hl-entry');
        let cardHasMatch = false;
        
        const titleText = card.querySelector('.title').innerText.toLowerCase();
        
        entries.forEach(entry => {
            const textNode = entry.querySelectorAll('span')[1];
            const text = textNode ? textNode.innerText.toLowerCase() : entry.textContent.toLowerCase();
            
            if (!isSearching || text.includes(query) || titleText.includes(query)) {
                entry.style.display = '';
                if (isSearching && text.includes(query)) cardHasMatch = true;
            } else {
                entry.style.display = 'none';
            }
        });
        
        if (!isSearching) {
            wrapper.style.display = '';
            detail.style.display = 'none';
        } else {
            if (cardHasMatch || titleText.includes(query)) {
                wrapper.style.display = '';
                detail.style.display = 'block'; 
            } else {
                wrapper.style.display = 'none';
            }
        }
    });
    
    folders.forEach(folder => {
        const header = folder.querySelector('.folder-header');
        const content = folder.querySelector('.folder-content');
        const folderName = folder.querySelector('.folder-name').innerText.toLowerCase();
        
        const wrappersInFolder = Array.from(content.querySelectorAll('.page-wrapper'));
        const hasVisibleWrappers = wrappersInFolder.some(w => w.style.display !== 'none');
        
        if (!isSearching) {
            folder.style.display = '';
            content.style.display = 'none';
            header.classList.remove('open');
        } else {
            if (hasVisibleWrappers || folderName.includes(query)) {
                folder.style.display = '';
                content.style.display = 'flex'; 
                header.classList.add('open');
                
                if (!hasVisibleWrappers && folderName.includes(query)) {
                    wrappersInFolder.forEach(w => {
                        w.style.display = '';
                        w.querySelector('.highlights-detail').style.display = 'block';
                        w.querySelectorAll('.hl-entry').forEach(e => e.style.display = '');
                    });
                }
            } else {
                folder.style.display = 'none';
            }
        }
    });
    
    const dividers = document.querySelectorAll('.unorganized-divider');
    dividers.forEach(div => {
        if (!isSearching) {
            div.style.display = '';
        } else {
            const mainWrappers = Array.from(document.querySelectorAll('#main-container > .page-wrapper'));
            const hasVisible = mainWrappers.some(w => w.style.display !== 'none');
            div.style.display = hasVisible ? '' : 'none';
        }
    });
}

function createFolderUI(folder, groupedPages, allFolders) {
    const container = document.createElement('div');
    container.className = 'folder-container';

    const header = document.createElement('div');
    header.className = 'folder-header';
    header.innerHTML = `
        <span class="folder-arrow">▶</span>
        <span class="folder-name">📁 ${folder.name} (${folder.pages.length})</span>
        <div class="folder-actions">
            <button class="btn-action btn-pdf" style="font-size:12px;" title="Exportar carpeta completa">📄</button>
            <button class="btn-action btn-move" style="font-size:12px;" title="Renombrar">✏️</button>
            <button class="btn-action btn-delete" style="font-size:12px;" title="Eliminar Carpeta">🗑️</button>
        </div>
    `;

    const content = document.createElement('div');
    content.className = 'folder-content';
    folder.pages.forEach(url => {
        if (groupedPages[url]) content.appendChild(createPageCard(groupedPages[url], allFolders, folder.id));
    });

    header.onclick = (e) => {
        if (e.target.closest('button')) return;
        const isOpen = content.style.display === 'flex';
        content.style.display = isOpen ? 'none' : 'flex';
        header.classList.toggle('open', !isOpen);
    };

    header.querySelector('.btn-pdf').onclick = (e) => {
        e.stopPropagation();
        handleExport(folder, 'folder', groupedPages);
    };

    header.querySelector('.btn-move').onclick = async () => {
        const newName = prompt("Nuevo nombre:", folder.name);
        if (newName) { folder.name = newName; await chrome.storage.local.set({ folders: allFolders }); renderAll(); }
    };

    header.querySelector('.btn-delete').onclick = async () => {
        if (confirm(`¿Eliminar carpeta "${folder.name}"?`)) {
            const newFolders = allFolders.filter(f => f.id !== folder.id);
            await chrome.storage.local.set({ folders: newFolders }); renderAll();
        }
    };

    container.appendChild(header);
    container.appendChild(content);
    return container;
}

function createPageCard(page, allFolders) {
    const domain = new URL(page.url).hostname;
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper'; 
    const card = document.createElement('div');
    card.className = 'page-card';
    const count = page.items.length;
    const countText = count === 1 ? '1 resaltado' : `${count} resaltados`;
    const pageCreatedAt = getPageCreatedAt(page.items);
    const pageCreatedText = pageCreatedAt ? formatShortDate(pageCreatedAt) : 'Sin fecha';

    card.innerHTML = `
        <div class="favicon"><img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" style="width:100%"></div>
        <div class="info">
            <span class="title">${page.title}</span>
            <span class="page-meta">
                <span class="domain-link" style="cursor: pointer;" title="Ir a la página original">${domain}</span> · ${countText} · Creada: ${pageCreatedText}
            </span>
        </div>
        <div class="actions">
            <button class="btn-action btn-pdf" title="Exportar">📄</button>
            <button class="btn-action btn-move" title="Mover">📂</button>
            <button class="btn-action btn-delete" title="Eliminar Página">✕</button>
        </div>
    `;

    const domainLink = card.querySelector('.domain-link');
    domainLink.onmouseover = () => domainLink.style.textDecoration = 'underline';
    domainLink.onmouseout = () => domainLink.style.textDecoration = 'none';
    domainLink.onclick = (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: page.url });
    };

    const detail = document.createElement('div');
    detail.className = 'highlights-detail';

    const groupedByDate = groupItemsByDate(page.items);

    groupedByDate.forEach(group => {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'hl-date-group';
        dateHeader.innerText = group.dateLabel;
        detail.appendChild(dateHeader);

        group.items.forEach(item => {
            const entry = document.createElement('div');
            entry.className = `hl-entry ${item.colorClass}`;
            
            const bullet = document.createElement('span');
            bullet.innerHTML = '&bull; ';
            bullet.className = 'nav-bullet';

            const textNode = document.createElement('span');
            textNode.className = 'hl-text';
            textNode.innerText = item.text;

            const actionsGroup = document.createElement('div');
            actionsGroup.className = 'hl-actions';

            const copyBtn = document.createElement('span');
            copyBtn.innerHTML = '📋';
            copyBtn.className = 'hl-btn';
            copyBtn.title = 'Copiar con fuente';
            
            copyBtn.onclick = async (e) => {
                e.stopPropagation();
                const res = await chrome.storage.local.get({ copyTemplate: defaultCopyTemplate, colorMap: defaultColorMap });
                const template = res.copyTemplate || defaultCopyTemplate;
                const colorLabel = res.colorMap[item.colorClass] || 'Resaltado';
                const emoji = getColorEmoji(item.colorClass);
                const date = new Date().toLocaleDateString();
                const domain = new URL(page.url).hostname;

                const formattedText = template
                    .replace(/\[TEXTO\]/g, item.text)
                    .replace(/\[URL\]/g, page.url)
                    .replace(/\[TITULO\]/g, page.title)
                    .replace(/\[CATEGORIA\]/g, colorLabel)
                    .replace(/\[ICONO\]/g, emoji)
                    .replace(/\[FECHA\]/g, date)
                    .replace(/\[DOMINIO\]/g, domain);
                
                navigator.clipboard.writeText(formattedText);
                copyBtn.innerHTML = '✅';
                setTimeout(() => { copyBtn.innerHTML = '📋'; }, 1000);
            };

            const linkBtn = document.createElement('span');
            linkBtn.innerHTML = '🔗';
            linkBtn.className = 'hl-btn';
            linkBtn.title = 'Ir a la fuente (Scroll)';
            linkBtn.onclick = (e) => {
                e.stopPropagation();
                const textFragment = encodeURIComponent(item.text.trim());
                const targetUrl = `${page.url}#:~:text=${textFragment}`;
                chrome.tabs.create({ url: targetUrl });
            };

            const deleteBtn = document.createElement('span');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'hl-btn delete';
            deleteBtn.title = 'Eliminar registro';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm("¿Eliminar este registro?")) {
                    const res = await chrome.storage.local.get({ highlights: [] });
                    const newList = res.highlights.filter(h => h.id !== item.id);
                    await chrome.storage.local.set({ highlights: newList });
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, { action: "SYNC_DELETE_HIGHLIGHT", id: item.id }).catch(() => {});
                        }
                    });
                    renderAll();
                }
            };

            actionsGroup.appendChild(copyBtn);
            actionsGroup.appendChild(linkBtn);
            actionsGroup.appendChild(deleteBtn);

            entry.appendChild(bullet);
            entry.appendChild(textNode);
            entry.appendChild(actionsGroup);
            detail.appendChild(entry);
        });
    });

    card.onclick = (e) => {
        if (e.target.closest('button')) return;
        detail.style.display = detail.style.display === 'block' ? 'none' : 'block';
    };

    card.querySelector('.btn-pdf').onclick = (e) => { e.stopPropagation(); handleExport(page, 'page'); };
    
    card.querySelector('.btn-move').onclick = async (e) => {
        e.stopPropagation();
        const options = ["(Sin organizar)", ...allFolders.map(f => f.name)];
        const choice = prompt(`Mover a:\n${options.map((o, i) => `${i}: ${o}`).join('\n')}`);
        if (choice !== null && options[choice]) {
            allFolders.forEach(f => f.pages = f.pages.filter(p => p !== page.url));
            if (parseInt(choice) > 0) allFolders[parseInt(choice) - 1].pages.push(page.url);
            await chrome.storage.local.set({ folders: allFolders }); renderAll();
        }
    };
    card.querySelector('.btn-delete').onclick = async (e) => {
        e.stopPropagation();
        if (confirm("¿Borrar todos los resaltados de esta página?")) {
            const res = await chrome.storage.local.get({ highlights: [] });
            const newList = res.highlights.filter(h => h.url !== page.url);
            allFolders.forEach(f => f.pages = f.pages.filter(p => p !== page.url));
            await chrome.storage.local.set({ highlights: newList, folders: allFolders }); renderAll();
        }
    };

    wrapper.appendChild(card);
    wrapper.appendChild(detail);
    return wrapper;
}

function exportFolderToPDF(folder, groupedPages, colorMap, includeLabels, includeEmojis) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(26, 115, 232);
    doc.text(`Reporte de Carpeta: ${folder.name}`, 10, 20);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text(`Total de páginas: ${folder.pages.length}`, 10, 28);
    doc.setDrawColor(200); doc.line(10, 32, 200, 32);
    
    let y = 40;

    // --- LEYENDA PARA CARPETA (NUEVO) ---
    if (includeLabels || includeEmojis) {
        const allItems = folder.pages.flatMap(url => groupedPages[url] ? groupedPages[url].items : []);
        const usedColors = [...new Set(allItems.map(i => i.colorClass))];
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
        doc.text("Leyenda de Colores en Carpeta:", 10, y);
        y += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        
        usedColors.forEach(cls => {
            const colors = getPDFColors(cls);
            const label = includeLabels ? (colorMap[cls] || 'Resaltado') : '';
            const emoji = includeEmojis ? getColorEmoji(cls) : '';
            
            doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
            doc.rect(10, y - 3.5, 3, 3, 'F');
            doc.setTextColor(60);
            doc.text(`${emoji} ${label}`.trim(), 15, y);
            y += 5;
        });
        y += 10;
    }

    folder.pages.forEach((url) => {
        const page = groupedPages[url];
        if (!page) return;

        if (y + 30 > 275) { doc.addPage(); y = 20; }
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(40, 40, 40);
        doc.text(page.title, 10, y);
        y += 7;
        doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(120);
        doc.text(`Fuente: ${url}`, 10, y);
        y += 10;

// --- TAMAÑO 11 PARA EL CONTENIDO ---
        doc.setFontSize(11);
        const lineHeight = 6;

        page.items.forEach((item) => {
            const colors = getPDFColors(item.colorClass);
            const splitText = doc.splitTextToSize(item.text, 175);
            const blockHeight = (splitText.length * lineHeight) + 2;

            if (y + blockHeight > 275) { doc.addPage(); y = 20; doc.setFontSize(11); }
            
            if (item.colorClass === 'hl-underline-red') {
                doc.setTextColor(0, 0, 0); doc.text(splitText, 15, y, { lineHeightFactor: 1.1 });
                doc.setDrawColor(255, 0, 0); doc.setLineWidth(0.6);
                for (let i = 0; i < splitText.length; i++) {
                    const textWidth = doc.getTextWidth(splitText[i]);
                    doc.line(15, y + (i * lineHeight) + 1.2, 15 + textWidth, y + (i * lineHeight) + 1.2);
                }
            } else {
                doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
                doc.rect(12, y - 4.5, 185, blockHeight, 'F');
                doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
                doc.text(splitText, 15, y, { lineHeightFactor: 1.1 });
            }
            y += blockHeight + 6;
        });
        y += 10;
    });
    doc.save(`Reporte_Folder_${folder.name.replace(/\s+/g, '_')}.pdf`);
}

function exportToPDF(page, colorMap, includeLabels, includeEmojis) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Encabezado del documento
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(40, 40, 40);
    doc.text("Resaltador Médico MD", 10, 20);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text(`Expediente: ${page.title}`, 10, 28); doc.text(`Fuente: ${page.url}`, 10, 34);
    doc.setDrawColor(200); doc.line(10, 38, 200, 38);
    
    let y = 45;

    // --- SECCIÓN DE LEYENDA (NUEVO) ---
    if (includeLabels || includeEmojis) {
        const usedColors = [...new Set(page.items.map(i => i.colorClass))];
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
        doc.text("Leyenda de Colores:", 10, y);
        y += 6;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        
        usedColors.forEach(cls => {
            const colors = getPDFColors(cls);
            const label = includeLabels ? (colorMap[cls] || 'Resaltado') : '';
            const emoji = includeEmojis ? getColorEmoji(cls) : '';
            
            // Dibujar cuadrito de color
            doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
            doc.rect(10, y - 3.5, 3, 3, 'F');
            doc.setTextColor(60);
            doc.text(`${emoji} ${label}`.trim(), 15, y);
            y += 5;
        });
        y += 5;
        doc.line(10, y - 2, 200, y - 2);
        y += 8;
    }

    // Contenido de los resaltados
    doc.setFontSize(11); 
    const fontSize = 11;
    const lineHeight = 6; // Espacio entre líneas para fuente 11

    page.items.forEach((item) => {
        const colors = getPDFColors(item.colorClass);
        const splitText = doc.splitTextToSize(item.text, 175);
        
        // Calculamos la altura del bloque basada en el número de líneas
        const blockHeight = (splitText.length * lineHeight) + 2; 

        if (y + blockHeight > 275) { doc.addPage(); y = 20; doc.setFontSize(11); }

        if (item.colorClass === 'hl-underline-red') {
            doc.setTextColor(0, 0, 0); 
            doc.text(splitText, 15, y, { lineHeightFactor: 1.1 });
            doc.setDrawColor(255, 0, 0); doc.setLineWidth(0.6);
            for (let i = 0; i < splitText.length; i++) {
                const textWidth = doc.getTextWidth(splitText[i]);
                doc.line(15, y + (i * lineHeight) + 1.2, 15 + textWidth, y + (i * lineHeight) + 1.2);
            }
        } else {
            // El rectángulo ahora se ajusta mejor a la fuente 11 (y - 4.5)
            doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
            doc.rect(12, y - 4.5, 185, blockHeight, 'F'); 
            doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
            doc.text(splitText, 15, y, { lineHeightFactor: 1.1 });
        }
        y += blockHeight + 6;
    });
    doc.save(`Reporte_MD_${page.title.substring(0, 20)}.pdf`);
}

function getPDFColors(colorClass) {
    const map = {
        'hl-red': { bg: [255, 0, 0], text: [255, 255, 255] }, 'hl-pink': { bg: [255, 0, 127], text: [255, 255, 255] },
        'hl-yellow': { bg: [255, 255, 0], text: [0, 0, 0] }, 'hl-green': { bg: [0, 255, 0], text: [0, 0, 0] },
        'hl-cyan': { bg: [0, 255, 255], text: [0, 0, 0] }, 'hl-orange': { bg: [255, 140, 0], text: [0, 0, 0] },
        'hl-purple': { bg: [148, 0, 211], text: [255, 255, 255] }, 'hl-blue': { bg: [0, 0, 255], text: [255, 255, 255] },
        'hl-gray': { bg: [128, 128, 128], text: [255, 255, 255] }
    };
    return map[colorClass] || { bg: [240, 240, 240], text: [0, 0, 0] };
}