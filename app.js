// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "82"; // <-- Incremented for SVG Import Database & Grid Layout

// 🍯 Import standalone, offline-ready CodeJar framework
import { CodeJar } from './libs/codejar.min.js';

// Dom Elements
const editorElement = document.getElementById('editor'); 
const consoleBox = document.getElementById('console');
const btnSave = document.getElementById('btn-save');
const fileLoad = document.getElementById('file-load');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const viewer3d = document.getElementById('viewer-3d');
const btnCameraReset = document.getElementById('btn-camera-reset');
const placeholderText = document.getElementById('placeholder-text');
const btnWireframe = document.getElementById('btn-wireframe');
const projectNameInput = document.getElementById('project-name-input');
const editorFontSizeSelect = document.getElementById('editor-font-size-select');
const modelColorInput = document.getElementById('model-color');
const btnColorTrigger = document.getElementById('btn-color-trigger');

// 🌐 THREE.JS SCOPE VARIABLES
let scene, camera, renderer, controls, currentMesh = null;
let workspaceInitialized = false;
let gridHelper = null;
let axesGroup = null;

let isGridVisible = localStorage.getItem('openscad_grid_visible') !== 'false';
let isAxesVisible = localStorage.getItem('openscad_axes_visible') !== 'false';

let openSCADFactory = null;
let currentStlBlob = null; 
const fontCache = {}; 
const stlCache = {}; 
const svgCache = {}; // 📁 NEW: Caches SVG files in memory

// ==========================================================================
// 🗄️ INDEXEDDB PERSISTENT STORAGE LAYERS
// ==========================================================================

// --- FONTS DB ---
function openFontsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OpenSCADCustomFontsDB', 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore('fonts');
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}
async function getPersistentFonts() {
    try {
        const db = await openFontsDB();
        return new Promise((resolve) => {
            const tx = db.transaction('fonts', 'readonly');
            const store = tx.objectStore('fonts');
            const fonts = [];
            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    fonts.push({ filename: cursor.key, binary: cursor.value });
                    cursor.continue();
                } else resolve(fonts);
            };
        });
    } catch (err) { return []; }
}
async function savePersistentFont(filename, uint8Array) {
    try {
        const db = await openFontsDB();
        db.transaction('fonts', 'readwrite').objectStore('fonts').put(uint8Array, filename);
    } catch (err) { console.error(err); }
}
async function deletePersistentFont(filename) {
    try {
        const db = await openFontsDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction('fonts', 'readwrite').objectStore('fonts').delete(filename);
            req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
    } catch (err) { console.error(err); }
}

// --- STL IMPORTS DB ---
function openStlsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OpenSCAD_STL_DB', 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore('stls');
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}
async function getPersistentStls() {
    try {
        const db = await openStlsDB();
        return new Promise((resolve) => {
            const tx = db.transaction('stls', 'readonly');
            const store = tx.objectStore('stls');
            const stls = [];
            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    stls.push({ filename: cursor.key, binary: cursor.value });
                    cursor.continue();
                } else resolve(stls);
            };
        });
    } catch (err) { return []; }
}
async function savePersistentStl(filename, uint8Array) {
    try {
        const db = await openStlsDB();
        db.transaction('stls', 'readwrite').objectStore('stls').put(uint8Array, filename);
    } catch (err) { console.error(err); }
}
async function deletePersistentStl(filename) {
    try {
        const db = await openStlsDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction('stls', 'readwrite').objectStore('stls').delete(filename);
            req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
    } catch (err) { console.error(err); }
}

// --- SVG IMPORTS DB ---
function openSvgsDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('OpenSCAD_SVG_DB', 1);
        request.onupgradeneeded = (e) => e.target.result.createObjectStore('svgs');
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}
async function getPersistentSvgs() {
    try {
        const db = await openSvgsDB();
        return new Promise((resolve) => {
            const tx = db.transaction('svgs', 'readonly');
            const store = tx.objectStore('svgs');
            const svgs = [];
            store.openCursor().onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    svgs.push({ filename: cursor.key, binary: cursor.value });
                    cursor.continue();
                } else resolve(svgs);
            };
        });
    } catch (err) { return []; }
}
async function savePersistentSvg(filename, uint8Array) {
    try {
        const db = await openSvgsDB();
        db.transaction('svgs', 'readwrite').objectStore('svgs').put(uint8Array, filename);
    } catch (err) { console.error(err); }
}
async function deletePersistentSvg(filename) {
    try {
        const db = await openSvgsDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction('svgs', 'readwrite').objectStore('svgs').delete(filename);
            req.onsuccess = resolve; req.onerror = () => reject(req.error);
        });
    } catch (err) { console.error(err); }
}

// 🍯 INITIALIZE CODEJAR INSTANCE
const jar = CodeJar(
    editorElement, 
    (el) => {
        if (typeof Prism !== 'undefined') {
            const code = el.textContent;
            const grammar = Prism.languages.openscad || Prism.languages.clike || Prism.languages.javascript;
            const langName = Prism.languages.openscad ? 'openscad' : (Prism.languages.clike ? 'clike' : 'javascript');
            if (grammar) el.innerHTML = Prism.highlight(code, grammar, langName);
            else Prism.highlightElement(el); 
        }
        try { applyInlineBracketMatching(el); } catch (e) { console.error("Bracket match error:", e); }
    },
    { tab: '\t', history: true, indentOn: /[(\[{]$/, addClosing: false } 
);

if (editorElement) {
    editorElement.addEventListener('click', () => applyInlineBracketMatching(editorElement));
    
    editorElement.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            applyInlineBracketMatching(editorElement);
        }
    });

    editorElement.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
            event.preventDefault();
            event.stopImmediatePropagation();
            const fakeRedoEvent = new KeyboardEvent('keydown', {
                key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
            });
            editorElement.dispatchEvent(fakeRedoEvent);
        }
    });
}

// ==========================================================================
// 📐 SMART MULTI-LINE BLOCK INDENTATION ENGINE
// ==========================================================================
if (editorElement) {
    editorElement.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            event.stopImmediatePropagation();

            let { start, end } = getSelectionCharacterOffsetWithin(editorElement);
            const value = jar.toString();
            const selectedText = value.substring(start, end);
            const isMultiLineSelection = selectedText.includes('\n');

            if (!isMultiLineSelection && !event.shiftKey) {
                const newCode = value.substring(0, start) + '\t' + value.substring(end);
                jar.updateCode(newCode);
                setSelectionCharacterOffsetWithin(editorElement, start + 1, start + 1);
                return;
            }

            let adjustedEnd = end;
            if (adjustedEnd > start && value[adjustedEnd - 1] === '\n') adjustedEnd--;

            const selectStartLineStart = value.lastIndexOf('\n', start - 1) + 1;
            const selectEndLineEnd = value.indexOf('\n', adjustedEnd);
            const finalEndPos = selectEndLineEnd === -1 ? value.length : selectEndLineEnd;

            const targetBlock = value.substring(selectStartLineStart, finalEndPos);
            let modifiedBlock = "";
            let newStart = start, newEnd = end;

            if (!event.shiftKey) {
                modifiedBlock = targetBlock.split('\n').map(line => '\t' + line).join('\n');
                const linesBeforeStart = value.substring(selectStartLineStart, start).split('\n').length - 1;
                const linesBeforeEnd = value.substring(selectStartLineStart, end).split('\n').length - 1;
                newStart = start + linesBeforeStart + 1;
                newEnd = end + linesBeforeEnd + 1;
            } else {
                let removedBeforeStart = 0, removedBeforeEnd = 0;
                let currentPosInBlock = 0;
                
                modifiedBlock = targetBlock.split('\n').map(line => {
                    let reduction = 0;
                    let newLine = line;
                    
                    if (line.startsWith('\t')) { reduction = 1; newLine = line.substring(1); } 
                    else if (line.startsWith('    ')) { reduction = 4; newLine = line.substring(4); } 
                    else if (line.match(/^ +/)) {
                        const spaces = line.match(/^ +/)[0].length;
                        reduction = Math.min(spaces, 4);
                        newLine = line.substring(reduction);
                    }
                    
                    const absoluteLineStart = selectStartLineStart + currentPosInBlock;
                    if (start > absoluteLineStart) removedBeforeStart += Math.min(reduction, start - absoluteLineStart);
                    if (end > absoluteLineStart) removedBeforeEnd += Math.min(reduction, end - absoluteLineStart);
                    
                    currentPosInBlock += line.length + 1;
                    return newLine;
                }).join('\n');
                
                newStart = Math.max(selectStartLineStart, start - removedBeforeStart);
                newEnd = Math.max(selectStartLineStart, end - removedBeforeEnd);
            }

            const newCode = value.substring(0, selectStartLineStart) + modifiedBlock + value.substring(finalEndPos);
            jar.updateCode(newCode);
            setSelectionCharacterOffsetWithin(editorElement, newStart, newEnd);
        }
    }, true);
}

function getSelectionCharacterOffsetWithin(element) {
    let start = 0, end = 0;
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        
        if (element.contains(range.startContainer)) {
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            start = preCaretRange.toString().length;
        }
        if (element.contains(range.endContainer)) {
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            end = preCaretRange.toString().length;
        }
        if (start > end) { const temp = start; start = end; end = temp; }
    }
    return { start, end };
}

function setSelectionCharacterOffsetWithin(element, start, end) {
    if (start < 0) start = 0;
    if (end < 0) end = 0;
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(element, 0);
    range.collapse(true);
    
    let currentOffset = 0;
    const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let currentNode = treeWalker.nextNode();
    let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
    
    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        if (!startNode && currentOffset + nodeLength >= start) { startNode = currentNode; startOffset = start - currentOffset; }
        if (!endNode && currentOffset + nodeLength >= end) { endNode = currentNode; endOffset = end - currentOffset; break; }
        currentOffset += nodeLength;
        currentNode = treeWalker.nextNode();
    }
    
    if (!startNode) { startNode = element; startOffset = element.childNodes.length; }
    if (!endNode) { endNode = element; endOffset = element.childNodes.length; }
    
    try {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        sel.removeAllRanges();
        sel.addRange(range);
    } catch (e) { console.error("Selection recovery matrix failure:", e); }
}

// ==========================================================================
// 💡 BI-DIRECTIONAL BRACKET MATCHING
// ==========================================================================
function applyInlineBracketMatching(editorDiv) {
    const oldHighlights = editorDiv.querySelectorAll('.bracket-match-glow, .bracket-mismatch-glow');
    oldHighlights.forEach(span => span.classList.remove('bracket-match-glow', 'bracket-mismatch-glow'));

    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const textContent = editorDiv.textContent;
    let cursorIndex = 0;
    const treeWalker = document.createTreeWalker(editorDiv, NodeFilter.SHOW_TEXT);
    let currentNode = treeWalker.nextNode();
    
    while (currentNode) {
        if (currentNode === range.startContainer) { cursorIndex += range.startOffset; break; }
        cursorIndex += currentNode.textContent.length;
        currentNode = treeWalker.nextNode();
    }

    const partners = { '{': '}', '}': '{', '[': ']', ']': '[', '(': ')', ')': '(' };
    let targetIndex = cursorIndex;
    let charToMatch = textContent[targetIndex];
    
    if (!partners[charToMatch]) {
        targetIndex = cursorIndex - 1;
        charToMatch = textContent[targetIndex];
    }
    if (!partners[charToMatch]) return;

    const ignoredMap = new Array(textContent.length).fill(false);
    let inSingleComment = false, inMultiComment = false, inString = false;

    for (let i = 0; i < textContent.length; i++) {
        if (inSingleComment) {
            ignoredMap[i] = true;
            if (textContent[i] === '\n') inSingleComment = false;
        } else if (inMultiComment) {
            ignoredMap[i] = true;
            if (textContent[i] === '*' && textContent[i + 1] === '/') { ignoredMap[i + 1] = true; i++; inMultiComment = false; }
        } else if (inString) {
            ignoredMap[i] = true;
            if (textContent[i] === '\\' && textContent[i + 1] === '"') { ignoredMap[i + 1] = true; i++; } 
            else if (textContent[i] === '"') inString = false;
        } else {
            if (textContent[i] === '/' && textContent[i + 1] === '/') { ignoredMap[i] = true; ignoredMap[i + 1] = true; i++; inSingleComment = true; } 
            else if (textContent[i] === '/' && textContent[i + 1] === '*') { ignoredMap[i] = true; ignoredMap[i + 1] = true; i++; inMultiComment = true; } 
            else if (textContent[i] === '"') { ignoredMap[i] = true; inString = true; }
        }
    }

    if (ignoredMap[targetIndex]) return;
    
    const partnerChar = partners[charToMatch];
    const isForwardScan = ['{', '[', '('].includes(charToMatch);
    let matchIndex = -1, balanceCounter = 0;

    if (isForwardScan) {
        for (let i = targetIndex; i < textContent.length; i++) {
            if (ignoredMap[i]) continue; 
            if (textContent[i] === charToMatch) balanceCounter++;
            if (textContent[i] === partnerChar) balanceCounter--;
            if (balanceCounter === 0) { matchIndex = i; break; }
        }
    } else {
        for (let i = targetIndex; i >= 0; i--) {
            if (ignoredMap[i]) continue; 
            if (textContent[i] === charToMatch) balanceCounter++;
            if (textContent[i] === partnerChar) balanceCounter--;
            if (balanceCounter === 0) { matchIndex = i; break; }
        }
    }

    let absoluteOffset = 0, targetSpanNode = null, matchSpanNode = null;
    const walker = document.createTreeWalker(editorDiv, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
        const nodeLength = textNode.textContent.length;
        if (targetIndex >= absoluteOffset && targetIndex < absoluteOffset + nodeLength) targetSpanNode = textNode.parentNode;
        if (matchIndex !== -1 && matchIndex >= absoluteOffset && matchIndex < absoluteOffset + nodeLength) matchSpanNode = textNode.parentNode;
        absoluteOffset += nodeLength;
        textNode = walker.nextNode();
    }

    if (targetSpanNode) {
        if (matchIndex !== -1 && matchSpanNode) {
            targetSpanNode.classList.add('bracket-match-glow');
            matchSpanNode.classList.add('bracket-match-glow');
        } else {
            targetSpanNode.classList.add('bracket-mismatch-glow');
        }
    }
}

// ==========================================================================
// 🛠️ COMPILATION ERROR HIGHLIGHTING
// ==========================================================================
function highlightErrorLine(lineNumber) {
    clearErrorHighlights();
    if (!lineNumber || lineNumber < 1) return;

    const lineGutter = document.getElementById('line-numbers');
    if (lineGutter) {
        const lines = lineGutter.innerHTML.split('<br>');
        if (lineNumber <= lines.length) {
            lines[lineNumber - 1] = `<span class="gutter-error-flare">${lineNumber}</span>`;
            lineGutter.innerHTML = lines.join('<br>');
        }
    }

    const codeText = jar.toString();
    const textLines = codeText.split('\n');
    if (lineNumber > textLines.length) return;

    let targetStartCharIndex = 0;
    for (let i = 0; i < lineNumber - 1; i++) targetStartCharIndex += textLines[i].length + 1; 
    let targetEndCharIndex = targetStartCharIndex + textLines[lineNumber - 1].length;
    if (targetStartCharIndex === targetEndCharIndex) targetEndCharIndex++;

    let currentAbsoluteOffset = 0;
    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();

    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        const startOfThisNode = currentAbsoluteOffset;
        const endOfThisNode = currentAbsoluteOffset + nodeLength;

        if (endOfThisNode > targetStartCharIndex && startOfThisNode < targetEndCharIndex) {
            let parentElement = currentNode.parentNode;
            if (parentElement === editorElement) {
                const spanWrap = document.createElement('span');
                parentElement.insertBefore(spanWrap, currentNode);
                spanWrap.appendChild(currentNode);
                parentElement = spanWrap;
            }
            parentElement.classList.add('editor-error-line-glow');
        }
        currentAbsoluteOffset += nodeLength;
        currentNode = walker.nextNode();
    }
}

function clearErrorHighlights() {
    editorElement.querySelectorAll('.editor-error-line-glow').forEach(el => el.classList.remove('editor-error-line-glow'));
    if (typeof triggerLineUpdate === 'function') triggerLineUpdate();
}

// ==========================================================================
// 🖥️ PERSISTENT CONSOLE TOGGLE
// ==========================================================================
const toggleConsoleBtn = document.getElementById('btn-toggle-console');
if (consoleBox && toggleConsoleBtn) {
    let isConsoleVisible = localStorage.getItem('openscad_console_visible') !== 'hidden';
    const applyConsoleLayout = (visible) => {
        if (visible) {
            consoleBox.style.display = 'block'; toggleConsoleBtn.textContent = 'Visible';
            toggleConsoleBtn.style.backgroundColor = '#28a745'; isConsoleVisible = true;
            localStorage.setItem('openscad_console_visible', 'visible');
        } else {
            consoleBox.style.display = 'none'; toggleConsoleBtn.textContent = 'Hidden';
            toggleConsoleBtn.style.backgroundColor = '#dc3545'; isConsoleVisible = false;
            localStorage.setItem('openscad_console_visible', 'hidden');
        }
    };
    applyConsoleLayout(isConsoleVisible);
    toggleConsoleBtn.addEventListener('click', () => {
        applyConsoleLayout(!isConsoleVisible);
        if (isConsoleVisible && typeof logToConsole === 'function') logToConsole("🖥️ Console restored.");
    });
}

// ==========================================================================
// 🔣 LINE NUMBERS TOGGLE
// ==========================================================================
const toggleLinesBtn = document.getElementById('btn-toggle-lines');
const lineNumbersDiv = document.getElementById('line-numbers');
let triggerLineUpdate = null;

if (editorElement && lineNumbersDiv && toggleLinesBtn) {
    const updateLineNumbers = (codeText) => {
        let currentCode = (typeof codeText === 'string') ? codeText : jar.toString();
        if (currentCode.endsWith('\n')) currentCode = currentCode.slice(0, -1);
        lineNumbersDiv.innerHTML = Array.from({ length: currentCode.split('\n').length }, (_, i) => i + 1).join('<br>');
    };
    triggerLineUpdate = updateLineNumbers;

    jar.onUpdate((code) => {
        if (editorElement.querySelectorAll('.editor-error-line-glow').length > 0 && lineNumbersDiv.innerHTML.includes('gutter-error-flare')) {
            editorElement.querySelectorAll('.editor-error-line-glow').forEach(el => el.classList.remove('editor-error-line-glow'));
        }
        updateLineNumbers(code);
        localStorage.setItem('openscad_editor_cache', code);
    });

    editorElement.addEventListener('scroll', () => lineNumbersDiv.scrollTop = editorElement.scrollTop);

    let isLinesEnabled = localStorage.getItem('openscad_lines_visible') !== 'disabled';
    const applyLinesLayout = (enabled) => {
        if (enabled) {
            lineNumbersDiv.style.display = 'block'; toggleLinesBtn.textContent = 'Enabled';
            toggleLinesBtn.style.backgroundColor = '#28a745'; isLinesEnabled = true;
            localStorage.setItem('openscad_lines_visible', 'enabled'); updateLineNumbers();
            lineNumbersDiv.scrollTop = editorElement.scrollTop;
        } else {
            lineNumbersDiv.style.display = 'none'; toggleLinesBtn.textContent = 'Disabled';
            toggleLinesBtn.style.backgroundColor = '#dc3545'; isLinesEnabled = false;
            localStorage.setItem('openscad_lines_visible', 'disabled');
        }
    };
    updateLineNumbers();
    applyLinesLayout(isLinesEnabled);
    toggleLinesBtn.addEventListener('click', () => applyLinesLayout(!isLinesEnabled));
}

let activeProjectName = localStorage.getItem('openscad_project_name') || 'untitled';
if (projectNameInput) projectNameInput.value = activeProjectName;
function updateWindowTitle() { document.title = `${activeProjectName}.scad`; }
updateWindowTitle();

const savedFontSizeStr = localStorage.getItem('openscad_editor_font_size') || '14px';
if (editorElement && editorFontSizeSelect) {
    editorElement.style.fontSize = savedFontSizeStr;
    if (lineNumbersDiv) lineNumbersDiv.style.fontSize = savedFontSizeStr; 
    editorFontSizeSelect.value = savedFontSizeStr;
}

const savedColorHexStr = localStorage.getItem('openscad_model_color') || '#3b82f6';
if (modelColorInput) modelColorInput.value = savedColorHexStr;
if (btnColorTrigger) btnColorTrigger.style.background = savedColorHexStr;
let activeModelColor = parseInt(savedColorHexStr.replace('#', '0x'), 16);

function logToConsole(message) {
    let cleanMessage = message.replace(/^\[ERROR\]:\s*/gm, '');
    if (cleanMessage.includes("Could not initialize localization") || cleanMessage.includes("Fontconfig error")) return; 
    consoleBox.textContent += `\n${cleanMessage}`;
    consoleBox.scrollTop = consoleBox.scrollHeight; 
}

// ---- FILE OPERATIONS ----
btnSave.addEventListener('click', () => {
    const blob = new Blob([jar.toString()], { type: 'text/plain' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    let safeFilename = activeProjectName.trim().replace(/\.scad$/i, '') || "untitled"; 
    link.download = `${safeFilename}.scad`; link.click();
    logToConsole(`Saved ${safeFilename}.scad successfully.`);
});

fileLoad.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        jar.updateCode(e.target.result); 
        logToConsole(`Loaded file: ${file.name}`);
        localStorage.setItem('openscad_editor_cache', e.target.result);
        activeProjectName = file.name.replace(/\.scad$/i, '');
        localStorage.setItem('openscad_project_name', activeProjectName);
        if (projectNameInput) projectNameInput.value = activeProjectName;
        updateWindowTitle();
        if (typeof btnPreview !== 'undefined' && !btnPreview.disabled) btnPreview.click();
    };
    reader.readAsText(file);
});

let wireframeMode = false;
btnWireframe.addEventListener('click', () => {
    wireframeMode = !wireframeMode; 
    btnWireframe.textContent = wireframeMode ? 'Wireframe' : 'Solid';
    btnWireframe.style.background = wireframeMode ? '#444' : '#007acc';  
    if (currentMesh && currentMesh.material) currentMesh.material.wireframe = wireframeMode;
});

window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault(); event.stopImmediatePropagation(); 
        if (!btnPreview.disabled) { logToConsole('⌨️ Hotkey Triggered: [Ctrl + Enter]'); btnPreview.click(); }
    }
}, true); 

btnColorTrigger.addEventListener('click', () => modelColorInput.click());
modelColorInput.addEventListener('input', (event) => {
    const selectedHex = event.target.value;
    localStorage.setItem('openscad_model_color', selectedHex);
    btnColorTrigger.style.background = selectedHex;
    activeModelColor = parseInt(selectedHex.replace('#', '0x'), 16);
    if (currentMesh && currentMesh.material) currentMesh.material.color.setHex(activeModelColor);
});

async function initOpenSCAD() {
    logToConsole(`Build ${BUILD_NUMBER} - OpenSCAD PWA Environment`);
    logToConsole('System ready. Instantiating WASM...');
    
    const savedCode = localStorage.getItem('openscad_editor_cache');
    if (savedCode && savedCode.trim() !== "") {
        jar.updateCode(savedCode); 
    } else {
        jar.updateCode(`linear_extrude(height = 4) {\n\ttext(\n\t\ttext = "Hello, world!", \n\t\tsize = 14, \n\t\tfont = "Liberation Sans:style=Bold", \n\t\thalign = "center", \n\t\tvalign = "center"\n\t);\n}`); 
    }
    if (typeof triggerLineUpdate === 'function') triggerLineUpdate();
    
    try {
        const OpenSCADModule = await import('./libs/openscad.js');
        openSCADFactory = OpenSCADModule.default || OpenSCADModule.createOpenSCAD || OpenSCADModule;
        await openSCADFactory();
        
        const fontFiles = [
            'LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf',
            'LiberationMono-Regular.ttf', 'LiberationMono-Bold.ttf', 'LiberationMono-Italic.ttf', 'LiberationMono-BoldItalic.ttf',
            'LiberationSerif-Regular.ttf', 'LiberationSerif-Bold.ttf', 'LiberationSerif-Italic.ttf', 'LiberationSerif-BoldItalic.ttf'
        ];

        for (const fontName of fontFiles) {
            try {
                const response = await fetch(`./fonts/${fontName}`);
                if (!response.ok) continue;
                fontCache[fontName] = new Uint8Array(await response.arrayBuffer());
            } catch (err) {}
        }
        
        // Restore Custom Fonts
        try {
            const customFonts = await getPersistentFonts();
            for (const font of customFonts) fontCache[font.filename] = font.binary;
            if (customFonts.length > 0) logToConsole(`✔ Restored ${customFonts.length} custom fonts from local DB.`);
        } catch (err) { console.error(err); }

        // Restore Custom STL files
        try {
            const customStls = await getPersistentStls();
            for (const stl of customStls) stlCache[stl.filename] = stl.binary;
            if (customStls.length > 0) logToConsole(`✔ Restored ${customStls.length} custom STLs from local DB.`);
        } catch (err) { console.error(err); }

        // Restore Custom SVG files
        try {
            const customSvgs = await getPersistentSvgs();
            for (const svg of customSvgs) svgCache[svg.filename] = svg.binary;
            if (customSvgs.length > 0) logToConsole(`✔ Restored ${customSvgs.length} custom SVGs from local DB.`);
        } catch (err) { console.error(err); }

        logToConsole('✅ Engine ready! Alter code and click Preview freely.');
        btnPreview.disabled = false;
        btnPreview.click();
        
    } catch (err) { logToConsole(`Failed to initialize OpenSCAD: ${err.message}`); }
}

// ---- PREVIEW PIPELINE ----
btnPreview.addEventListener('click', async () => {
    if (!openSCADFactory) return;
    clearErrorHighlights();
    logToConsole('--- Generating Preview ---');
    const scriptCode = jar.toString(); 
    const errorLogs = [];

    try {
        const instance = await new Promise((resolve, reject) => {
            try {
                const inst = openSCADFactory({
                    noInitialRun: true,
                    print: (text) => logToConsole(`[OpenSCAD]: ${text}`),
                    printErr: (text) => { logToConsole(`[ERROR]: ${text}`); errorLogs.push(text); },
                    onRuntimeInitialized: () => resolve(inst)
                });
                if (inst && typeof inst.then === 'function') inst.then(resolve).catch(reject);
            } catch (initError) { reject(initError); }
        });

        try { instance.FS.mkdir('/fonts'); } catch(e) { /* ignore */ }
        
        for (const [fontName, fontData] of Object.entries(fontCache)) {
            instance.FS.writeFile(`/${fontName}`, fontData);
            instance.FS.writeFile(`/fonts/${fontName}`, fontData);
            if (instance.fonts && typeof instance.fonts.registerFont === 'function') {
                instance.fonts.registerFont(`/${fontName}`);
                instance.fonts.registerFont(`/fonts/${fontName}`);
            }
        }
        if (instance.ENV) instance.ENV.OPENSCAD_FONTDIR = '/fonts';

        // 📁 INJECT STLS INTO WASM ROOT
        for (const [stlName, stlData] of Object.entries(stlCache)) {
            try {
                instance.FS.writeFile(`/${stlName}`, stlData);
                const stat = instance.FS.stat(`/${stlName}`);
                logToConsole(`✔ WASM FS Mapped: /${stlName} (${stat.size} bytes)`);
            } catch (fsErr) {
                logToConsole(`[ERROR] WASM FS failed to map STL: /${stlName}`);
            }
        }

        // 📁 INJECT SVGS INTO WASM ROOT
        for (const [svgName, svgData] of Object.entries(svgCache)) {
            try {
                instance.FS.writeFile(`/${svgName}`, svgData);
                const stat = instance.FS.stat(`/${svgName}`);
                logToConsole(`✔ WASM FS Mapped: /${svgName} (${stat.size} bytes)`);
            } catch (fsErr) {
                logToConsole(`[ERROR] WASM FS failed to map SVG: /${svgName}`);
            }
        }

        instance.FS.writeFile('/input.scad', scriptCode);
        instance.callMain(['/input.scad', '-o', '/output.stl']);
        
        if (instance.FS.analyzePath('/output.stl').exists) {
            const stlData = instance.FS.readFile('/output.stl');
            currentStlBlob = new Blob([stlData], { type: 'application/sla' });
            update3DModelViewer(URL.createObjectURL(currentStlBlob));
            placeholderText.style.display = 'none';
            btnExport.disabled = false;
        } else {
            let detectedErrorLine = null;
            for (const logLine of errorLogs) {
                const lineMatch = logLine.match(/line\s+(\d+)/i);
                if (lineMatch) { detectedErrorLine = parseInt(lineMatch[1], 10); break; }
            }
            if (detectedErrorLine) highlightErrorLine(detectedErrorLine);
        }
    } catch (error) { 
        let errorMsg = error.message || error;
        if (typeof error === 'number') {
            errorMsg = `[C++ Exception Pointer: ${error}] The WASM engine hard-crashed.`;
            if (typeof instance !== 'undefined' && instance.getExceptionMessage) {
                try { errorMsg += `\nDetailed Trace: ${instance.getExceptionMessage(error)}`; } catch(e){}
            }
        }
        logToConsole(`Execution error: ${errorMsg}`); 
    }
});

btnExport.addEventListener('click', () => {
    if (!currentStlBlob) return;
    const link = document.createElement('a'); link.href = URL.createObjectURL(currentStlBlob);
    link.download = 'openscad_model.stl'; link.click();
    logToConsole('Exported openscad_model.stl successfully.');
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

function init3DWorkspace() {
    if (workspaceInitialized) return; 
    workspaceInitialized = true;

    const container = document.getElementById('viewer-3d');
    const w = container.clientWidth || 500, h = container.clientHeight || 500;

    scene = new THREE.Scene(); scene.background = new THREE.Color(0x222222);
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000); camera.position.set(40, 40, 40);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(w, h); renderer.setPixelRatio(window.devicePixelRatio); 
    container.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.1;

    gridHelper = new THREE.GridHelper(400, 40, 0x444444, 0x444444);
    gridHelper.position.y = 0; gridHelper.material.polygonOffset = true; gridHelper.material.polygonOffsetFactor = 1; gridHelper.material.polygonOffsetUnits = 1;
    scene.add(gridHelper);

    axesGroup = new THREE.Group();
    const gridHalfSize = 200;
    const overlayConfig = (colorHex) => ({ color: colorHex, depthTest: true, transparent: true, polygonOffset: true, polygonOffsetFactor: 0.5, polygonOffsetUnits: 0.5 });
    
    axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-gridHalfSize, 0, 0), new THREE.Vector3(gridHalfSize, 0, 0)]), new THREE.LineBasicMaterial(overlayConfig(0xcc5252))));
    axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -gridHalfSize), new THREE.Vector3(0, 0, gridHalfSize)]), new THREE.LineBasicMaterial(overlayConfig(0x52cc7a))));
    axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -gridHalfSize, 0), new THREE.Vector3(0, gridHalfSize, 0)]), new THREE.LineBasicMaterial(overlayConfig(0x007acc))));
    scene.add(axesGroup);
    
    gridHelper.visible = isGridVisible; axesGroup.visible = isAxesVisible;
    
    const compassContainer = document.createElement('div');
    compassContainer.style.position = 'absolute'; compassContainer.style.top = '10px'; compassContainer.style.right = '10px'; compassContainer.style.width = '80px'; compassContainer.style.height = '80px'; compassContainer.style.zIndex = '100'; compassContainer.style.pointerEvents = 'none'; 
    container.appendChild(compassContainer);

    const compassScene = new THREE.Scene();
    const compassCamera = new THREE.PerspectiveCamera(50, 1, 1, 100);
    const compassRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); 
    compassRenderer.setSize(80, 80); compassRenderer.setPixelRatio(window.devicePixelRatio); compassContainer.appendChild(compassRenderer.domElement);

    const compassAxes = new THREE.AxesHelper(20); compassAxes.rotation.x = -Math.PI / 2;
    const colors = compassAxes.geometry.attributes.color;
    colors.setXYZ(0, 0.8, 0.32, 0.32); colors.setXYZ(1, 0.8, 0.32, 0.32); 
    colors.setXYZ(2, 0.32, 0.8, 0.48); colors.setXYZ(3, 0.32, 0.8, 0.48); 
    colors.setXYZ(4, 0.0, 0.48, 0.8);  colors.setXYZ(5, 0.0, 0.48, 0.8);  
    colors.needsUpdate = true; compassScene.add(compassAxes);

    const create2DLabel = (id, text, color) => {
        const oldEl = document.getElementById(id); if (oldEl) oldEl.remove();
        const el = document.createElement('div'); el.id = id; el.innerText = text; el.style.position = 'absolute'; el.style.color = color; el.style.fontFamily = 'Arial, sans-serif'; el.style.fontWeight = 'bold'; el.style.fontSize = '10px'; el.style.pointerEvents = 'none'; el.style.transform = 'translate(-50%, -50%)';
        compassContainer.appendChild(el); return el;
    };
    create2DLabel('compass-lbl-x', 'X', '#888888'); create2DLabel('compass-lbl-y', 'Y', '#888888'); create2DLabel('compass-lbl-z', 'Z', '#888888');

    scene.add(new THREE.AmbientLight(0xffffff, 0.55)); 
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.5); keyLight.position.set(150, 200, 100); scene.add(keyLight);
    const topLight = new THREE.DirectionalLight(0xffffff, 0.15); topLight.position.set(0, 250, 0); scene.add(topLight);
    const headlight = new THREE.DirectionalLight(0xffffff, 0.45); headlight.position.set(0, 0, 1); camera.add(headlight); scene.add(camera); 
    
    function animate() {
        requestAnimationFrame(animate);
        const cw = container.clientWidth, ch = container.clientHeight;
        const currentSize = new THREE.Vector2(); renderer.getSize(currentSize);
        if (cw > 0 && ch > 0 && (currentSize.x !== cw || currentSize.y !== ch)) {
            camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch, true);
        }
        controls.update(); renderer.render(scene, camera);

        if (compassCamera && compassRenderer) {
            compassCamera.position.copy(camera.position); compassCamera.position.sub(controls.target); compassCamera.position.setLength(60); compassCamera.lookAt(0, 0, 0);
            compassRenderer.render(compassScene, compassCamera);
            const xEl = document.getElementById('compass-lbl-x'), yEl = document.getElementById('compass-lbl-y'), zEl = document.getElementById('compass-lbl-z');
            if (xEl && yEl && zEl && compassAxes) {
                const tempV = new THREE.Vector3(); compassScene.updateMatrixWorld(true);
                const updateLabelPosition = (element, x3d, y3d, z3d) => {
                    tempV.set(x3d, y3d, z3d).applyMatrix4(compassAxes.matrixWorld); tempV.project(compassCamera);
                    element.style.left = `${(tempV.x * 0.5 + 0.5) * 80}px`; element.style.top = `${(-tempV.y * 0.5 + 0.5) * 80}px`;
                };
                updateLabelPosition(xEl, 15, 0, 0); updateLabelPosition(yEl, 0, 15, 0); updateLabelPosition(zEl, 0, 0, 15);
            }
        }
    }
    animate();
}

function update3DModelViewer(blobUrl) {
    if (!workspaceInitialized) init3DWorkspace(); 
    let savedPosition = null, savedTarget = null;
    if (currentMesh && camera && controls) { savedPosition = camera.position.clone(); savedTarget = controls.target.clone(); }
    if (currentMesh) { scene.remove(currentMesh); currentMesh.geometry.dispose(); currentMesh.material.dispose(); currentMesh = null; }

    new THREE.STLLoader().load(blobUrl, (geometry) => {
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: activeModelColor, roughness: 0.85, metalness: 0.05, wireframe: wireframeMode });
        material.onBeforeCompile = (shader) => {
            shader.fragmentShader = `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); } float proceduralNoise(vec3 p) { return hash(p.xy + p.z); }\n` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(`#include <opaque_fragment>`, `float noiseGrit = proceduralNoise(vViewPosition * 4.0) * 0.12; outgoingLight.rgb += vec3(noiseGrit - 0.06); #include <opaque_fragment>`);
        };
        currentMesh = new THREE.Mesh(geometry, material); currentMesh.position.set(0, 0, 0); currentMesh.rotation.x = -Math.PI / 2;
        scene.add(currentMesh);
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        if (savedPosition && savedTarget) { camera.position.copy(savedPosition); controls.target.copy(savedTarget); } 
        else {
            const radius = geometry.boundingSphere.radius; const targetDistance = radius > 0 ? radius * 3.5 : 50; 
            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance); controls.target.set(0, 0, 0); camera.lookAt(0, 0, 0);
        }
        controls.update();
    });
}

btnPreview.disabled = true; btnExport.disabled = true;
initOpenSCAD(); init3DWorkspace();
btnWireframe.style.background = '#007acc'; 

// ==========================================================================
// ⚙️ SETTINGS & MANAGER MODALS
// ==========================================================================
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const btnToggleGrid = document.getElementById('btn-toggle-grid');
const btnToggleAxes = document.getElementById('btn-toggle-axes');

// FONT DOM
const btnOpenFontsMenu = document.getElementById('btn-open-fonts-menu');
const fontsOverlay = document.getElementById('fonts-overlay');
const btnCloseFonts = document.getElementById('btn-close-fonts');
const fontUploadInput = document.getElementById('font-upload');

// STL DOM
const btnOpenStlsMenu = document.getElementById('btn-open-stls-menu');
const stlsOverlay = document.getElementById('stls-overlay');
const btnCloseStls = document.getElementById('btn-close-stls');
const stlUploadInput = document.getElementById('stl-upload');

// SVG DOM
const btnOpenSvgsMenu = document.getElementById('btn-open-svgs-menu');
const svgsOverlay = document.getElementById('svgs-overlay');
const btnCloseSvgs = document.getElementById('btn-close-svgs');
const svgUploadInput = document.getElementById('svg-upload');

function closeAllMenus() {
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
    if (fontsOverlay) fontsOverlay.classList.add('hidden');
    if (stlsOverlay) stlsOverlay.classList.add('hidden');
    if (svgsOverlay) svgsOverlay.classList.add('hidden');
}

if (btnSettings) btnSettings.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeAllMenus);

window.addEventListener('click', (event) => {
    if (event.target === settingsOverlay || event.target === fontsOverlay || event.target === stlsOverlay || event.target === svgsOverlay) closeAllMenus();
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const isAnyOpen = [settingsOverlay, fontsOverlay, stlsOverlay, svgsOverlay].some(el => el && !el.classList.contains('hidden'));
        if (isAnyOpen) { logToConsole('⌨️ Hotkey Triggered: [Escape] - Closing Overlays'); closeAllMenus(); }
    }
});

// 🔍 FONT METADATA PARSER
function extractFontMetadata(uint8Array) {
    try {
        const data = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
        const signature = data.getUint32(0, false);
        if (signature !== 0x00010000 && signature !== 0x4F54544F && signature !== 0x74727565) return null;
        const numTables = data.getUint16(4, false);
        let nameTableOffset = -1;
        for (let i = 0; i < numTables; i++) {
            const offset = 12 + i * 16;
            const tag = String.fromCharCode(data.getUint8(offset), data.getUint8(offset+1), data.getUint8(offset+2), data.getUint8(offset+3));
            if (tag === 'name') { nameTableOffset = data.getUint32(offset + 8, false); break; }
        }
        if (nameTableOffset === -1) return null;
        const count = data.getUint16(nameTableOffset + 2, false), stringOffset = data.getUint16(nameTableOffset + 4, false);
        let family = "Unknown", style = "Unknown";
        for (let i = 0; i < count; i++) {
            const recordOffset = nameTableOffset + 6 + i * 12;
            const platformID = data.getUint16(recordOffset, false), nameID = data.getUint16(recordOffset + 6, false), length = data.getUint16(recordOffset + 8, false), offset = data.getUint16(recordOffset + 10, false);
            if (nameID === 1 || nameID === 2) {
                const strOffset = nameTableOffset + stringOffset + offset; let str = "";
                if (platformID === 1) for (let j = 0; j < length; j++) str += String.fromCharCode(data.getUint8(strOffset + j));
                else if (platformID === 3) for (let j = 0; j < length; j += 2) str += String.fromCharCode(data.getUint16(strOffset + j, false));
                if (str && str.trim().length > 0) {
                    const cleanStr = str.replace(/\0/g, ''); 
                    if (nameID === 1) family = cleanStr; if (nameID === 2) style = cleanStr;
                }
            }
        }
        return { family, style };
    } catch (e) { return null; }
}

// 🎨 FONT RENDERER
async function renderCustomFontManagerList() {
    const listContainer = document.getElementById('custom-fonts-manager-list');
    if (!listContainer) return;
    const customFonts = await getPersistentFonts();
    if (customFonts.length === 0) { listContainer.innerHTML = `<div style="font-size: 0.8rem; color: #555; text-align: center; padding: 12px; font-style: italic;">No custom fonts installed</div>`; return; }
    listContainer.innerHTML = ''; 
    customFonts.forEach(font => {
        let meta = { family: 'Unknown', style: 'Unknown' };
        if (font.binary) meta = extractFontMetadata(font.binary) || meta;
        const safeFamily = meta.family.replace(/-/g, '\\-');
        let openScadSyntax = `font = "${safeFamily}"`;
        if (meta.style !== 'Unknown' && meta.style !== 'Regular') openScadSyntax = `font = "${safeFamily}:style=${meta.style}"`;

        const rowWrap = document.createElement('div'); rowWrap.style.display = 'flex'; rowWrap.style.flexDirection = 'column'; rowWrap.style.padding = '8px 10px'; rowWrap.style.borderBottom = '1px solid #222'; rowWrap.style.gap = '6px';
        const topRow = document.createElement('div'); topRow.style.display = 'flex'; topRow.style.justifyContent = 'space-between'; topRow.style.alignItems = 'center';
        const nameLabel = document.createElement('span'); nameLabel.textContent = font.filename; nameLabel.style.overflow = 'hidden'; nameLabel.style.textOverflow = 'ellipsis'; nameLabel.style.whiteSpace = 'nowrap'; nameLabel.style.maxWidth = '210px'; nameLabel.style.color = '#ddd'; nameLabel.style.fontWeight = 'bold';
        
        const delBtn = document.createElement('button'); delBtn.textContent = '✕'; delBtn.style.background = '#dc3545'; delBtn.style.color = '#fff'; delBtn.style.padding = '2px 7px'; delBtn.style.fontSize = '0.75rem'; delBtn.style.borderRadius = '3px'; delBtn.style.cursor = 'pointer'; delBtn.style.fontWeight = 'bold';
        delBtn.addEventListener('click', async () => {
            if (confirm(`Uninstall "${font.filename}"?`)) {
                await deletePersistentFont(font.filename); delete fontCache[font.filename]; 
                logToConsole(`🗑️ Font uninstalled: ${font.filename}`); renderCustomFontManagerList();
                if (openSCADFactory && !btnPreview.disabled) btnPreview.click(); 
            }
        });
        topRow.appendChild(nameLabel); topRow.appendChild(delBtn);

        const syntaxBox = document.createElement('div'); syntaxBox.textContent = openScadSyntax; syntaxBox.style.fontSize = '0.75rem'; syntaxBox.style.color = '#00c3ff'; syntaxBox.style.background = '#1a1a1a'; syntaxBox.style.padding = '5px 8px'; syntaxBox.style.borderRadius = '4px'; syntaxBox.style.fontFamily = 'monospace'; syntaxBox.style.cursor = 'text'; syntaxBox.style.userSelect = 'all'; syntaxBox.style.webkitUserSelect = 'all';
        rowWrap.appendChild(topRow); rowWrap.appendChild(syntaxBox); listContainer.appendChild(rowWrap);
    });
}

// 📁 STL RENDERER
async function renderCustomStlManagerList() {
    const listContainer = document.getElementById('custom-stls-manager-list');
    if (!listContainer) return;
    const customStls = await getPersistentStls();
    if (customStls.length === 0) { listContainer.innerHTML = `<div style="font-size: 0.8rem; color: #555; text-align: center; padding: 12px; font-style: italic;">No custom STLs imported</div>`; return; }
    listContainer.innerHTML = ''; 
    customStls.forEach(stl => {
        const rowWrap = document.createElement('div'); rowWrap.style.display = 'flex'; rowWrap.style.flexDirection = 'column'; rowWrap.style.padding = '8px 10px'; rowWrap.style.borderBottom = '1px solid #222'; rowWrap.style.gap = '6px';
        const topRow = document.createElement('div'); topRow.style.display = 'flex'; topRow.style.justifyContent = 'space-between'; topRow.style.alignItems = 'center';
        
        const nameLabel = document.createElement('span'); nameLabel.textContent = stl.filename; nameLabel.style.overflow = 'hidden'; nameLabel.style.textOverflow = 'ellipsis'; nameLabel.style.whiteSpace = 'nowrap'; nameLabel.style.maxWidth = '210px'; nameLabel.style.color = '#ddd'; nameLabel.style.fontWeight = 'bold';
        
        const delBtn = document.createElement('button'); delBtn.textContent = '✕'; delBtn.style.background = '#dc3545'; delBtn.style.color = '#fff'; delBtn.style.padding = '2px 7px'; delBtn.style.fontSize = '0.75rem'; delBtn.style.borderRadius = '3px'; delBtn.style.cursor = 'pointer'; delBtn.style.fontWeight = 'bold';
        delBtn.addEventListener('click', async () => {
            if (confirm(`Remove STL "${stl.filename}"?`)) {
                await deletePersistentStl(stl.filename); delete stlCache[stl.filename]; 
                logToConsole(`🗑️ STL removed: ${stl.filename}`); renderCustomStlManagerList();
                if (openSCADFactory && !btnPreview.disabled) btnPreview.click(); 
            }
        });
        topRow.appendChild(nameLabel); topRow.appendChild(delBtn);

        const syntaxBox = document.createElement('div'); syntaxBox.textContent = `import("${stl.filename}");`; syntaxBox.style.fontSize = '0.75rem'; syntaxBox.style.color = '#00c3ff'; syntaxBox.style.background = '#1a1a1a'; syntaxBox.style.padding = '5px 8px'; syntaxBox.style.borderRadius = '4px'; syntaxBox.style.fontFamily = 'monospace'; syntaxBox.style.cursor = 'text'; syntaxBox.style.userSelect = 'all'; syntaxBox.style.webkitUserSelect = 'all';
        rowWrap.appendChild(topRow); rowWrap.appendChild(syntaxBox); listContainer.appendChild(rowWrap);
    });
}

// 📊 SVG RENDERER
async function renderCustomSvgManagerList() {
    const listContainer = document.getElementById('custom-svgs-manager-list');
    if (!listContainer) return;
    const customSvgs = await getPersistentSvgs();
    if (customSvgs.length === 0) { listContainer.innerHTML = `<div style="font-size: 0.8rem; color: #555; text-align: center; padding: 12px; font-style: italic;">No custom SVGs imported</div>`; return; }
    listContainer.innerHTML = ''; 
    customSvgs.forEach(svg => {
        const rowWrap = document.createElement('div'); rowWrap.style.display = 'flex'; rowWrap.style.flexDirection = 'column'; rowWrap.style.padding = '8px 10px'; rowWrap.style.borderBottom = '1px solid #222'; rowWrap.style.gap = '6px';
        const topRow = document.createElement('div'); topRow.style.display = 'flex'; topRow.style.justifyContent = 'space-between'; topRow.style.alignItems = 'center';
        
        const nameLabel = document.createElement('span'); nameLabel.textContent = svg.filename; nameLabel.style.overflow = 'hidden'; nameLabel.style.textOverflow = 'ellipsis'; nameLabel.style.whiteSpace = 'nowrap'; nameLabel.style.maxWidth = '210px'; nameLabel.style.color = '#ddd'; nameLabel.style.fontWeight = 'bold';
        
        const delBtn = document.createElement('button'); delBtn.textContent = '✕'; delBtn.style.background = '#dc3545'; delBtn.style.color = '#fff'; delBtn.style.padding = '2px 7px'; delBtn.style.fontSize = '0.75rem'; delBtn.style.borderRadius = '3px'; delBtn.style.cursor = 'pointer'; delBtn.style.fontWeight = 'bold';
        delBtn.addEventListener('click', async () => {
            if (confirm(`Remove SVG "${svg.filename}"?`)) {
                await deletePersistentSvg(svg.filename); delete svgCache[svg.filename]; 
                logToConsole(`🗑️ SVG removed: ${svg.filename}`); renderCustomSvgManagerList();
                if (openSCADFactory && !btnPreview.disabled) btnPreview.click(); 
            }
        });
        topRow.appendChild(nameLabel); topRow.appendChild(delBtn);

        const syntaxBox = document.createElement('div'); syntaxBox.textContent = `import("${svg.filename}");`; syntaxBox.style.fontSize = '0.75rem'; syntaxBox.style.color = '#00c3ff'; syntaxBox.style.background = '#1a1a1a'; syntaxBox.style.padding = '5px 8px'; syntaxBox.style.borderRadius = '4px'; syntaxBox.style.fontFamily = 'monospace'; syntaxBox.style.cursor = 'text'; syntaxBox.style.userSelect = 'all'; syntaxBox.style.webkitUserSelect = 'all';
        rowWrap.appendChild(topRow); rowWrap.appendChild(syntaxBox); listContainer.appendChild(rowWrap);
    });
}

// ---- BRIDGES ----
if (btnOpenFontsMenu) {
    btnOpenFontsMenu.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        if (fontsOverlay) { fontsOverlay.classList.remove('hidden'); renderCustomFontManagerList(); }
    });
}
if (btnCloseFonts) {
    btnCloseFonts.addEventListener('click', () => {
        if (fontsOverlay) fontsOverlay.classList.add('hidden');
        if (settingsOverlay) settingsOverlay.classList.remove('hidden'); 
    });
}

if (btnOpenStlsMenu) {
    btnOpenStlsMenu.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        if (stlsOverlay) { stlsOverlay.classList.remove('hidden'); renderCustomStlManagerList(); }
    });
}
if (btnCloseStls) {
    btnCloseStls.addEventListener('click', () => {
        if (stlsOverlay) stlsOverlay.classList.add('hidden');
        if (settingsOverlay) settingsOverlay.classList.remove('hidden'); 
    });
}

if (btnOpenSvgsMenu) {
    btnOpenSvgsMenu.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        if (svgsOverlay) { svgsOverlay.classList.remove('hidden'); renderCustomSvgManagerList(); }
    });
}
if (btnCloseSvgs) {
    btnCloseSvgs.addEventListener('click', () => {
        if (svgsOverlay) svgsOverlay.classList.add('hidden');
        if (settingsOverlay) settingsOverlay.classList.remove('hidden'); 
    });
}

// ---- UPLOAD HANDLERS ----
if (fontUploadInput) {
    fontUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const fontData = new Uint8Array(e.target.result);
            fontCache[file.name] = fontData; await savePersistentFont(file.name, fontData);
            logToConsole(`📁 Font "${file.name}" saved permanently.`); renderCustomFontManagerList();
            if (openSCADFactory && !btnPreview.disabled) btnPreview.click();
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    });
}

if (stlUploadInput) {
    stlUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        let safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-]/g, '_');
        const reader = new FileReader();
        reader.onload = async (e) => {
            const stlData = new Uint8Array(e.target.result);
            stlCache[safeName] = stlData; await savePersistentStl(safeName, stlData);
            logToConsole(`📁 STL "${safeName}" saved for import.`); renderCustomStlManagerList();
            if (openSCADFactory && !btnPreview.disabled) btnPreview.click();
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    });
}

if (svgUploadInput) {
    svgUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        let safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-]/g, '_');
        const reader = new FileReader();
        reader.onload = async (e) => {
            const svgData = new Uint8Array(e.target.result);
            svgCache[safeName] = svgData; await savePersistentSvg(safeName, svgData);
            logToConsole(`📁 SVG "${safeName}" saved for import.`); renderCustomSvgManagerList();
            if (openSCADFactory && !btnPreview.disabled) btnPreview.click();
        };
        reader.readAsArrayBuffer(file); event.target.value = '';
    });
}

const applyGridLayout = (visible) => {
    isGridVisible = visible; localStorage.setItem('openscad_grid_visible', visible);
    if (gridHelper) gridHelper.visible = visible;
    if (btnToggleGrid) { btnToggleGrid.innerText = visible ? 'Visible' : 'Hidden'; btnToggleGrid.style.backgroundColor = visible ? '#28a745' : '#dc3545'; }
};
const applyAxesLayout = (visible) => {
    isAxesVisible = visible; localStorage.setItem('openscad_axes_visible', visible);
    if (axesGroup) axesGroup.visible = visible;
    if (btnToggleAxes) { btnToggleAxes.innerText = visible ? 'Visible' : 'Hidden'; btnToggleAxes.style.backgroundColor = visible ? '#28a745' : '#dc3545'; }
};

applyGridLayout(isGridVisible); applyAxesLayout(isAxesVisible);
if (btnToggleGrid) btnToggleGrid.addEventListener('click', () => applyGridLayout(!isGridVisible));
if (btnToggleAxes) btnToggleAxes.addEventListener('click', () => applyAxesLayout(!isAxesVisible));

const leftPaneContainer = document.getElementById('left-pane-container');
const panelSplitGutter = document.getElementById('panel-split-gutter');
if (leftPaneContainer && panelSplitGutter) {
    leftPaneContainer.style.width = `${localStorage.getItem('openscad_layout_split') || '50'}%`;
    panelSplitGutter.addEventListener('mousedown', (e) => {
        e.preventDefault(); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
        function onMouseMove(moveEvent) {
            let pct = (moveEvent.clientX / window.innerWidth) * 100;
            if (pct < 15) pct = 15; if (pct > 85) pct = 85;
            leftPaneContainer.style.width = `${pct}%`; localStorage.setItem('openscad_layout_split', Math.round(pct).toString());
            if (typeof renderer !== 'undefined' && renderer && typeof camera !== 'undefined' && camera) {
                const container3d = document.getElementById('viewer-3d');
                if (container3d) {
                    const cw = container3d.clientWidth, ch = container3d.clientHeight;
                    if (cw > 0 && ch > 0) { camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch, true); }
                }
            }
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = 'default'; document.body.style.userSelect = 'text';
            logToConsole(`📐 Split layout updated and cached to: ${localStorage.getItem('openscad_layout_split')}%`);
        }
        document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
    });
}
