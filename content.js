let currentMenu = null;
const allColors = ['red', 'pink', 'yellow', 'green', 'cyan', 'orange', 'purple', 'blue', 'gray', 'underline-red'];
let quickColors = ['pink', 'yellow', 'green', 'blue', 'orange'];
let enableColorMenu = true;
let showHighlights = true;

chrome.storage.local.get(['quickColors', 'enableColorMenu', 'showHighlights'], (res) => {
    if (res.quickColors) quickColors = res.quickColors;
    if (typeof res.enableColorMenu === 'boolean') enableColorMenu = res.enableColorMenu;
    if (typeof res.showHighlights === 'boolean') showHighlights = res.showHighlights;
    applyHighlightsVisibility();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.quickColors) {
        quickColors = changes.quickColors.newValue || ['pink', 'yellow', 'green', 'blue', 'orange'];
    }

    if (changes.enableColorMenu) {
        enableColorMenu = changes.enableColorMenu.newValue;
        if (!enableColorMenu) removeMenu();
    }

    if (changes.showHighlights) {
        showHighlights = changes.showHighlights.newValue;
        applyHighlightsVisibility();
    }
});

document.addEventListener('mouseup', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (currentMenu && currentMenu.contains(e.target)) return;
    if (e.target.classList.contains('big-d-highlight')) return;

    if (!enableColorMenu) {
        removeMenu();
        return;
    }

    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (text.length > 0) {
        setTimeout(() => showMenu(e.pageX, e.pageY, selection), 10);
    } else {
        removeMenu();
    }
});

function showMenu(x, y, selection, isExisting = false, existingElement = null) {
    if (!enableColorMenu) return;

    removeMenu();
    const menu = document.createElement('div');
    menu.id = 'big-d-menu';
    menu.onmousedown = (e) => e.preventDefault(); 
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y - 50}px`;

    const currentColorClass = isExisting
        ? Array.from(existingElement.classList).find(cls => cls.startsWith('hl-'))
        : null;

    quickColors.slice(0, 5).forEach(name => {
        const colorClass = `hl-${name}`;
        const dot = createDot(name, colorClass, isExisting, currentColorClass, existingElement, selection);
        menu.appendChild(dot);
    });

    const configBtn = document.createElement('div');
    configBtn.className = 'config-btn';
    configBtn.innerHTML = '⚙️';
    configBtn.onclick = (e) => {
        e.stopPropagation();
        toggleConfigPanel(menu, selection, isExisting, existingElement);
    };
    menu.appendChild(configBtn);

    document.body.appendChild(menu);
    positionMenuWithinViewport(menu, x, y);
    currentMenu = menu;
}

function positionMenuWithinViewport(menu, x, y) {
    const margin = 14;
    const extraRightSafety = 12;

    const menuRect = menu.getBoundingClientRect();
    let left = x;
    let top = y - 50;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const viewportLeft = scrollX + margin;
    const viewportTop = scrollY + margin;
    const viewportRight = scrollX + window.innerWidth - margin - extraRightSafety;
    const viewportBottom = scrollY + window.innerHeight - margin;

    if (left + menuRect.width > viewportRight) {
        left = viewportRight - menuRect.width;
    }

    if (left < viewportLeft) {
        left = viewportLeft;
    }

    if (top + menuRect.height > viewportBottom) {
        top = y - menuRect.height - 12;
    }

    if (top < viewportTop) {
        top = viewportTop;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function createDot(name, colorClass, isExisting, currentColorClass, existingElement, selection) {
    const dot = document.createElement('div');
    dot.className = `color-dot ${colorClass}`;

    if (isExisting && colorClass === currentColorClass) {
        dot.classList.add('dot-active-delete');
        dot.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeHighlight(existingElement);
            removeMenu();
        };
    } else {
        dot.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (isExisting && existingElement) {
                updateHighlight(existingElement, name);
            } else if (selection) {
                applyHighlight(name, selection);
            }

            if (!document.getElementById('big-d-config-panel')) removeMenu();
        };
    }

    dot.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!quickColors.includes(name)) return;

        quickColors = quickColors.filter(c => c !== name);
        await chrome.storage.local.set({ quickColors });

        if (currentMenu) {
            refreshQuickMenu(currentMenu, selection, isExisting, existingElement);

            const configPanel = document.getElementById('big-d-config-panel');
            if (configPanel) {
                const panelDot = configPanel.querySelector(`.color-dot.hl-${name}`);
                if (panelDot) {
                    panelDot.classList.remove('dot-selected-config');
                }
            }
        }
    });

    return dot;
}

function toggleConfigPanel(parentMenu, selection = null, isExisting = false, existingElement = null) {
    let panel = document.getElementById('big-d-config-panel');
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div');
    panel.id = 'big-d-config-panel';
    panel.onmousedown = (e) => e.stopPropagation();

    const currentColorClass = isExisting && existingElement
        ? Array.from(existingElement.classList).find(cls => cls.startsWith('hl-'))
        : null;

    allColors.forEach(color => {
        const item = document.createElement('div');
        const itemColorClass = `hl-${color}`;
        item.className = `color-dot ${itemColorClass}`;

        if (quickColors.includes(color)) item.classList.add('dot-selected-config');

        // marcar visualmente el color actual cuando se abre sobre un resaltado existente
        if (isExisting && itemColorClass === currentColorClass) {
            item.classList.add('dot-active-delete');
        }

        item.onmousedown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            if (isExisting && existingElement) {
                if (itemColorClass === currentColorClass) {
                    removeHighlight(existingElement);
                } else {
                    updateHighlight(existingElement, color);
                }
            } else if (selection) {
                applyHighlight(color, selection);
            }

            removeMenu();
        };

        item.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (quickColors.includes(color)) {
                quickColors = quickColors.filter(c => c !== color);
                item.classList.remove('dot-selected-config');
                await chrome.storage.local.set({ quickColors });
                refreshQuickMenu(parentMenu, selection, isExisting, existingElement);
                return;
            }

            if (quickColors.length >= 5) {
                shakeElement(item);
                return;
            }

            quickColors.push(color);
            item.classList.add('dot-selected-config');
            await chrome.storage.local.set({ quickColors });
            refreshQuickMenu(parentMenu, selection, isExisting, existingElement);
        });

        panel.appendChild(item);
    });

    const hint = document.createElement('div');
    hint.textContent = 'Clic derecho: editar favoritos (max.5)';
    hint.style.gridColumn = '1 / -1';
    hint.style.fontSize = '9px';
    hint.style.fontWeight = '600';
    hint.style.opacity = '0.65';
    hint.style.textAlign = 'center';
    hint.style.marginTop = '2px';
    hint.style.lineHeight = '1.1';
    hint.style.color = '#555';

    panel.appendChild(hint);

    parentMenu.appendChild(panel);
}

function refreshQuickMenu(menu, selection = null, isExisting = false, existingElement = null) {
    const dots = menu.querySelectorAll(':scope > .color-dot');
    dots.forEach(d => d.remove());

    const configBtn = menu.querySelector('.config-btn');
    quickColors.slice(0, 5).forEach(name => {
        const dot = createDot(name, `hl-${name}`, isExisting, null, existingElement, selection);
        menu.insertBefore(dot, configBtn);
    });
}

function shakeElement(el) {
    el.animate(
        [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(4px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(3px)' },
            { transform: 'translateX(0)' }
        ],
        {
            duration: 220,
            easing: 'ease-in-out'
        }
    );
}

function applyHighlightsVisibility() {
    document.documentElement.classList.toggle('big-d-hide-highlights', !showHighlights);

    if (!showHighlights) {
        removeMenu();
    }
}

// NUEVO MOTOR: Enrutamiento CSS Robusto
function getCssPath(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return `#${el.id}`; // Prioridad a los IDs estructurados de las web médicas
    
    let path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE && el !== document.body) {
        if (el.id) {
            path.unshift(`#${el.id}`);
            break;
        }
        let index = 1;
        let sibling = el.previousElementSibling;
        while (sibling) {
            if (sibling.tagName === el.tagName) index++;
            sibling = sibling.previousElementSibling;
        }
        path.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${index})`);
        el = el.parentElement;
    }
    return path.join(' > ');
}

// Normalizador para asegurar que siempre interactuamos con el Texto, nunca con etiquetas
function getTerminalTextNode(node, offset, isStart) {
    if (node.nodeType === Node.TEXT_NODE) return { node, offset };
    if (node.childNodes && node.childNodes.length > 0) {
        let childIndex = isStart ? offset : offset - 1;
        childIndex = Math.max(0, Math.min(childIndex, node.childNodes.length - 1));
        let child = node.childNodes[childIndex];
        while (child && child.nodeType !== Node.TEXT_NODE) {
            child = isStart ? child.firstChild : child.lastChild;
        }
        if (child && child.nodeType === Node.TEXT_NODE) {
            return { node: child, offset: isStart ? 0 : child.textContent.length };
        }
    }
    return { node: null, offset: 0 }; 
}

async function applyHighlight(colorName, selection) {
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;
    
    const startPoint = getTerminalTextNode(range.startContainer, range.startOffset, true);
    const endPoint = getTerminalTextNode(range.endContainer, range.endOffset, false);
    
    if (!startPoint.node || !endPoint.node) return;

    // Subir hasta encontrar un bloque estructural fuerte (ej. un P, DIV, H1)
    let container = range.commonAncestorContainer;
    if (container.nodeType !== Node.ELEMENT_NODE) container = container.parentElement;
    while (container && container !== document.body && window.getComputedStyle(container).display === 'inline') {
        container = container.parentElement;
    }

    const path = getCssPath(container);
    
    // Calcular indexación de texto puro, ignorando etiquetas HTML internas
    let startOffset = 0, endOffset = 0;
    let walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let currentOffset = 0;
    let foundStart = false, foundEnd = false;
    
    let currentNode;
    while (currentNode = walker.nextNode()) {
        if (!foundStart && currentNode === startPoint.node) {
            startOffset = currentOffset + startPoint.offset;
            foundStart = true;
        }
        if (!foundEnd && currentNode === endPoint.node) {
            endOffset = currentOffset + endPoint.offset;
            foundEnd = true;
        }
        currentOffset += currentNode.textContent.length;
        if (foundStart && foundEnd) break;
    }
    
    const uniqueId = 'hl_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const cleanUrl = window.location.href.split('#')[0]; 
    
    const span = document.createElement('span');
    span.className = `hl-${colorName} big-d-highlight`;
    span.dataset.id = uniqueId;
    
    try {
        const newRange = document.createRange();
        newRange.setStart(startPoint.node, startPoint.offset);
        newRange.setEnd(endPoint.node, endPoint.offset);
        
        span.appendChild(newRange.extractContents());
        newRange.insertNode(span);
        attachClick(span);

        const res = await chrome.storage.local.get({ highlights: [] });
        res.highlights.push({
            id: uniqueId,
            text: text,
            colorClass: `hl-${colorName}`,
            url: cleanUrl,
            title: document.title,
            path: path,
            startOffset: startOffset,
            endOffset: endOffset,
            createdAt: new Date().toISOString()
        });
        await chrome.storage.local.set({ highlights: res.highlights });
        window.getSelection().removeAllRanges();
    } catch (e) { console.warn("Selección estructural compleja omitida por seguridad."); }
}

function attachClick(el) {
    el.onclick = (e) => {
        if (e.target.tagName === 'A') return;
        if (!enableColorMenu) return;
        if (!showHighlights) return;

        e.preventDefault();
        e.stopPropagation();
        showMenu(e.pageX, e.pageY, null, true, el);
    };
}

async function updateHighlight(el, colorName) {
    const id = el.dataset.id;
    el.className = `hl-${colorName} big-d-highlight`;
    const res = await chrome.storage.local.get({ highlights: [] });
    const index = res.highlights.findIndex(h => h.id === id);
    if (index !== -1) {
        res.highlights[index].colorClass = `hl-${colorName}`;
        await chrome.storage.local.set({ highlights: res.highlights });
    }
}

async function restore() {
    const res = await chrome.storage.local.get({ highlights: [] });
    const currentCleanUrl = window.location.href.split('#')[0];
    let pageHl = res.highlights.filter(h => h.url === currentCleanUrl);

    // 1. Agrupar los resaltados por su contenedor padre
    const groups = {};
    pageHl.forEach(hl => {
        if (!groups[hl.path]) groups[hl.path] = [];
        groups[hl.path].push(hl);
    });

    // 2. Restaurar procesando contenedor por contenedor
    for (let path in groups) {
        const container = document.querySelector(path);
        if (!container) continue;

        let groupHl = groups[path];
        
        // ORDENAMIENTO CRÍTICO: De mayor a menor offset (De abajo hacia arriba)
        // Esto neutraliza por completo la corrupción por Mutación Secuencial.
        groupHl.sort((a, b) => b.startOffset - a.startOffset);

        groupHl.forEach(hl => {
            try {
                let currentOffset = 0;
                let startNode, startNodeOffset, endNode, endNodeOffset;
                const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
                let currentNode;

                while (currentNode = walker.nextNode()) {
                    const nodeLength = currentNode.textContent.length;
                    
                    if (!startNode && hl.startOffset >= currentOffset && hl.startOffset <= currentOffset + nodeLength) {
                        startNode = currentNode;
                        startNodeOffset = hl.startOffset - currentOffset;
                    }
                    if (!endNode && hl.endOffset >= currentOffset && hl.endOffset <= currentOffset + nodeLength) {
                        endNode = currentNode;
                        endNodeOffset = hl.endOffset - currentOffset;
                        break;
                    }
                    currentOffset += nodeLength;
                }

                if (startNode && endNode) {
                    const range = document.createRange();
                    range.setStart(startNode, startNodeOffset);
                    range.setEnd(endNode, endNodeOffset);
                    
                    const span = document.createElement('span');
                    span.className = `${hl.colorClass} big-d-highlight`;
                    span.dataset.id = hl.id;
                    
                    span.appendChild(range.extractContents());
                    range.insertNode(span);
                    attachClick(span);
                }
            } catch(e) {
                console.warn("Restauración omitida para fragmento desfasado.");
            }
        });
    }

    applyHighlightsVisibility();
}

async function removeHighlight(el) {
    const id = el.dataset.id;
    const res = await chrome.storage.local.get({ highlights: [] });
    const newList = res.highlights.filter(h => h.id !== id);
    await chrome.storage.local.set({ highlights: newList });
    
    const parent = el.parentNode;
    while(el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    
    // Crucial: Al eliminar, se fusionan los nodos de texto de vuelta a su estado original
    parent.normalize(); 
}

function removeMenu() { if (currentMenu) { currentMenu.remove(); currentMenu = null; } }

window.addEventListener('load', () => setTimeout(restore, 1000));

// --- NUEVO: LISTENER PARA SINCRONIZACIÓN DESDE EL POPUP ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SYNC_DELETE_HIGHLIGHT") {
        const el = document.querySelector(`.big-d-highlight[data-id="${request.id}"]`);
        if (el) {
            const parent = el.parentNode;
            while(el.firstChild) parent.insertBefore(el.firstChild, el);
            parent.removeChild(el);
            parent.normalize();
        }
    }
});