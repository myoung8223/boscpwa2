// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "180"; // <-- Incremented for SVG Import Database & Grid Layout

// 🍯 Import standalone, offline-ready CodeJar framework
import { CodeJar } from './libs/codejar.min.js';
import OpenSCAD from './libs/openscad.js';

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
const closeHelpBtn = document.getElementById('close-help-btn');
const helpOverlay = document.getElementById('help-overlay');
const btnSettingsCheatSheet = document.getElementById('btn-settings-cheat-sheet');
const settingsOverlay = document.getElementById('settings-overlay');

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

function updateWindowTitle() { 
    // Fallback to 'untitled' if the user clears the input field entirely
    const displayTitle = activeProjectName.trim() || 'untitled';
    document.title = `${displayTitle}.scad`; 
}

if (projectNameInput) {
    projectNameInput.value = activeProjectName;
    
    // 🔌 ADDED: Listen for live updates when the user renames the project
    projectNameInput.addEventListener('input', (event) => {
        activeProjectName = event.target.value; 
        localStorage.setItem('openscad_project_name', activeProjectName);
        updateWindowTitle();
    });
}

updateWindowTitle();

// ---- PERSISTENT FONT SIZE INITIALIZATION & LISTENER ----
const savedFontSizeStr = localStorage.getItem('openscad_editor_font_size') || '14px';
if (editorElement && editorFontSizeSelect) {
    editorElement.style.fontSize = savedFontSizeStr;
    if (lineNumbersDiv) lineNumbersDiv.style.fontSize = savedFontSizeStr; 
    editorFontSizeSelect.value = savedFontSizeStr;

    // 🔧 RESTORED: Font Size Changer Listener
    editorFontSizeSelect.addEventListener('change', (event) => {
        const newSize = event.target.value;
        editorElement.style.fontSize = newSize;
        if (lineNumbersDiv) lineNumbersDiv.style.fontSize = newSize;
        localStorage.setItem('openscad_editor_font_size', newSize);
        if (typeof triggerLineUpdate === 'function') triggerLineUpdate();
    });
}

/*
// 🔧 RESTORED: Camera Reset Listener
if (btnCameraReset) {
    btnCameraReset.addEventListener('click', () => {
        if (camera && controls) {
            // Check if there is an active model to center on, otherwise use default
            if (currentMesh && currentMesh.geometry && currentMesh.geometry.boundingSphere) {
                const radius = currentMesh.geometry.boundingSphere.radius; 
                const targetDistance = radius > 0 ? radius * 3.5 : 50; 
                camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            } else {
                camera.position.set(40, 40, 40);
            }
            controls.target.set(0, 0, 0); 
            camera.lookAt(0, 0, 0);
            controls.update();
            logToConsole('📷 Camera view reset.');
        }
    });
}
*/

/*
// 📷 Reusable function to perfectly frame any Three.js mesh
function frameModelInCamera(mesh) {
    if (!camera || !controls) return;

    if (mesh && mesh.geometry) {
        mesh.geometry.computeBoundingBox();
        const boundingBox = mesh.geometry.boundingBox;
        
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const padding = 1.2; 
        const fov = camera.fov * (Math.PI / 180);
        let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * padding;
        
        if (camera.aspect < 1) cameraDistance /= camera.aspect;

        const viewDirection = new THREE.Vector3(1, 1.2, 1).normalize();
        camera.position.copy(center).add(viewDirection.multiplyScalar(cameraDistance));
        
        controls.target.copy(center); 
        camera.lookAt(center);
    } else {
        camera.position.set(40, 40, 40);
        controls.target.set(0, 0, 0); 
        camera.lookAt(0, 0, 0);
    }
    controls.update();
}
*/

// 📷 Reusable function to perfectly frame any Three.js mesh or group structure
function frameModelInCamera(mesh) {
    if (!camera || !controls) return;

    if (mesh) {
        // Create an empty bounding box
        const boundingBox = new THREE.Box3();
        // Automatically measures all components inside a Group or a Mesh
        boundingBox.setFromObject(mesh);
        
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // Ensure we handle cases where the object has zero volume/hasn't rendered yet
        const validDim = maxDim > 0 ? maxDim : 50;
        
        const padding = 1.2; 
        const fov = camera.fov * (Math.PI / 180);
        let cameraDistance = Math.abs(validDim / 2 / Math.tan(fov / 2)) * padding;
        
        if (camera.aspect < 1) cameraDistance /= camera.aspect;

        // Angle the camera slightly down at the model's center bounds
        const viewDirection = new THREE.Vector3(1, 1.2, 1).normalize();
        camera.position.copy(center).add(viewDirection.multiplyScalar(cameraDistance));
        
        controls.target.copy(center); 
        camera.lookAt(center);
    } else {
        // Fallback default position if no model exists on screen
        camera.position.set(40, 40, 40);
        controls.target.set(0, 0, 0); 
        camera.lookAt(0, 0, 0);
    }
    controls.update();
}

// 🔧 Camera Reset Listener
if (btnCameraReset) {
    btnCameraReset.addEventListener('click', () => {
        frameModelInCamera(currentMesh);
        logToConsole('📷 Camera view reset to object bounds.');
    });
}

const savedColorHexStr = localStorage.getItem('openscad_model_color') || '#3b82f6';
if (modelColorInput) modelColorInput.value = savedColorHexStr;
if (btnColorTrigger) btnColorTrigger.style.background = savedColorHexStr;
let activeModelColor = parseInt(savedColorHexStr.replace('#', '0x'), 16);

// ❌ Close Help Menu Button Listener
if (closeHelpBtn && helpOverlay) {
    closeHelpBtn.addEventListener('click', () => {
        helpOverlay.classList.add('hidden');
    });
}

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
    
    if (currentMesh) {
        currentMesh.traverse((child) => {
            if (child.isMesh && child.material) {
                
                // Handle cases where a mesh has multiple materials
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat, index) => {
                        // Create and cache a basic, unlit material for this specific part
                        if (!child.userData[`origMat_${index}`]) {
                            child.userData[`origMat_${index}`] = mat;
                            child.userData[`wireMat_${index}`] = new THREE.MeshBasicMaterial({
                                color: mat.color, 
                                wireframe: true
                            });
                        }
                        // Swap between the original lit material and the unlit wireframe
                        child.material[index] = wireframeMode ? child.userData[`wireMat_${index}`] : child.userData[`origMat_${index}`];
                    });
                } else {
                    // Handle standard single material
                    if (!child.userData.originalMaterial) {
                        child.userData.originalMaterial = child.material;
                        child.userData.wireframeMaterial = new THREE.MeshBasicMaterial({
                            color: child.material.color || 0x007acc, // Fallback color just in case
                            wireframe: true
                        });
                    }
                    // Swap the materials
                    child.material = wireframeMode ? child.userData.wireframeMaterial : child.userData.originalMaterial;
                }
            }
        });
    }
});

window.addEventListener('keydown', (event) => {
    // 🚀 Preview / Render [F5] or [F6]
    if (event.key === 'F5' || event.key === 'F6') {
        event.preventDefault(); 
        event.stopImmediatePropagation(); 
        if (!btnPreview.disabled) { 
            logToConsole(`⌨️ Hotkey Triggered: [${event.key}] (Preview)`);
            btnPreview.click(); 
        }
    }

	// 🚀 Export to STL [F7]
    if (event.key === 'F7') {
        event.preventDefault(); 
        event.stopImmediatePropagation(); 
        if (btnExport && !btnExport.disabled) { 
            logToConsole('⌨️ Hotkey Triggered: [F7] (Export)'); 
            btnExport.click(); 
        }
    }
	
    // Existing: [Ctrl] + [Enter]
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault(); 
        event.stopImmediatePropagation(); 
        if (!btnPreview.disabled) { 
            logToConsole('⌨️ Hotkey Triggered: [Ctrl] + [Enter]'); 
            btnPreview.click(); 
        }
    }

	// 💾 Save File [Ctrl] + [S]
    if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault(); // Stops browser "Save Page As"
        event.stopImmediatePropagation();
        if (btnSave && !btnSave.disabled) {
            logToConsole('⌨️ Hotkey Triggered: [Ctrl] + [S] (Save)');
            btnSave.click();
        }
    }

    // 📂 Open File [Ctrl] + [O]
    if (event.ctrlKey && event.key.toLowerCase() === 'o') {
        event.preventDefault(); // Stops browser "Open Local File"
        event.stopImmediatePropagation();
        if (fileLoad) {
            logToConsole('⌨️ Hotkey Triggered: [Ctrl] + [O] (Open)');
            fileLoad.click();
        }
    }

    // ⚙️ Open Settings [Ctrl] + [,]
    if (event.ctrlKey && event.key === ',') {
        event.preventDefault(); 
        event.stopImmediatePropagation(); 
        logToConsole(`⌨️ Hotkey Triggered: Settings`); 
        
        // 👉 Grab the actual settings button by its ID and click it
        // (Change 'btn-settings' if your HTML uses a different ID for the gear icon!)
        const settingsButton = document.getElementById('btn-settings');
        if (settingsButton) {
            settingsButton.click();
        }
    }

	// ❓ Open/Close Help Cheat Sheet [F1]
    if (event.key === 'F1') {
        event.preventDefault(); 
        event.stopImmediatePropagation(); 
        
        const helpOverlay = document.getElementById('help-overlay');
        if (helpOverlay) {
            helpOverlay.classList.toggle('hidden'); // Flips it on or off!
            logToConsole(`⌨️ Hotkey Triggered: [F1] (Toggled Help)`); 
        }
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

// ❓ Open Cheat Sheet from Settings Menu
if (btnSettingsCheatSheet && settingsOverlay && helpOverlay) {
    btnSettingsCheatSheet.addEventListener('click', () => {
        settingsOverlay.classList.add('hidden'); // Close Settings
        helpOverlay.classList.remove('hidden');  // Open Cheat Sheet
        logToConsole('📘 Opened Cheat Sheet from Settings Menu');
    });
}

async function initOpenSCAD() {
    logToConsole(`Build ${BUILD_NUMBER} - OpenSCAD PWA Environment`);
    logToConsole('System ready. Instantiating WASM...');
    
    const savedCode = localStorage.getItem('openscad_editor_cache');
    if (savedCode && savedCode.trim() !== "") {
        jar.updateCode(savedCode); 
    } else {
        //jar.updateCode(`linear_extrude(height = 4) {\n\ttext(\n\t\ttext = "Hello, world!", \n\t\tsize = 14, \n\t\tfont = "Liberation Sans:style=Bold", \n\t\thalign = "center", \n\t\tvalign = "center"\n\t);\n}`); 

jar.updateCode(`$fn = 25;   // number of segments set to 25

linear_extrude(height = 4) {   // 3D text
	text(
		text = "Basic OpenSCAD PWA", 
		size = 14, 
		font = "Liberation Sans:style=Bold", 
		halign = "center", 
		valign = "center"
	);
}

translate([-50, 40, 0])
sphere(d=25);             // sphere

translate([0, 40, 0])
rotate_extrude(convexity = 10)   // torus
	translate([14, 0, 0])
		circle(r = 7);

translate([50, 40, 0])
cylinder(d=25, h=20);    // cylinder

translate([-50, -40, 0])
cube([25, 25, 25], center=true);   // cube

translate([0, -40, 0])	
cylinder(d1=25, d2=0, h=20);   // conic cylinder

translate([50, -40, 0])
hull() {                                   // hull example (D6 die)
	translate([-8, -8, -8]) sphere(d=4);
	translate([8, -8, -8]) sphere(d=4);
	translate([-8, 8, -8]) sphere(d=4);
	translate([8, 8, -8]) sphere(d=4);
	translate([-8, -8, 8]) sphere(d=4);
	translate([8, -8, 8]) sphere(d=4);
	translate([-8, 8, 8]) sphere(d=4);
	translate([8, 8, 8]) sphere(d=4);
}`);
        
    }
    if (typeof triggerLineUpdate === 'function') triggerLineUpdate();
    
	try {
		// 🚀 Grab the global OpenSCAD factory initialized by your HTML script tag
        openSCADFactory = OpenSCAD;
        
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
            if (customFonts.length > 0) logToConsole(`✔ Restored ${customFonts.length} custom font(s) from local DB.`);
        } catch (err) { console.error(err); }

        // Restore Custom STL files
        try {
            const customStls = await getPersistentStls();
            for (const stl of customStls) stlCache[stl.filename] = stl.binary;
            if (customStls.length > 0) logToConsole(`✔ Restored ${customStls.length} custom STL(s) from local DB.`);
        } catch (err) { console.error(err); }

        // Restore Custom SVG files
        try {
            const customSvgs = await getPersistentSvgs();
            for (const svg of customSvgs) svgCache[svg.filename] = svg.binary;
            if (customSvgs.length > 0) logToConsole(`✔ Restored ${customSvgs.length} custom SVG(s) from local DB.`);
        } catch (err) { console.error(err); }

        logToConsole('✅ Engine ready! Alter code and click Preview freely.');
        btnPreview.disabled = false;
        btnPreview.click();
        
    } catch (err) { logToConsole(`Failed to initialize OpenSCAD: ${err.message}`); }
}

// ---- PREVIEW PIPELINE ----
btnPreview.addEventListener('click', async () => {
    if (!openSCADFactory) return;
    
    if (placeholderText) {
        placeholderText.textContent = "🛠️ Building Preview...";
        placeholderText.style.display = 'flex';
    }

    clearErrorHighlights();
    logToConsole('--- Generating Preview ---');
    const scriptCode = jar.toString(); 
    const errorLogs = [];

    // Isolate % modifiers (ignoring math modulo operations)
    const ghostRegex = /%(?=\s*(cube|sphere|cylinder|polyhedron|square|circle|polygon|translate|rotate|scale|resize|mirror|multmatrix|color|offset|hull|minkowski|union|difference|intersection|for|intersection_for|if|linear_extrude|rotate_extrude|surface|projection|render|text|import)\b)/g;
    const hasGhost = ghostRegex.test(scriptCode);
    ghostRegex.lastIndex = 0; 

    try {
        // --- INSTANCE SETTINGS BUILDER FUNCTION ---
        const createWasmInstance = async () => {
            return await openSCADFactory({
                noInitialRun: true,
                locateFile: (path) => `./libs/openscad.wasm`,
                ENV: { HOME: '/home/web_user' },
                preRun: [
                    function(Module) {
                        try { Module.FS.mkdir('/home'); } catch(e) {}
                        try { Module.FS.mkdir('/home/web_user'); } catch(e) {}
                        try { Module.FS.mkdir('/home/web_user/.fonts'); } catch(e) {}

                        for (const fontName of Object.keys(fontCache)) {
                            try { 
                                const fontData = new Uint8Array(fontCache[fontName]);
                                Module.FS.writeFile(`/home/web_user/.fonts/${fontName}`, fontData); 
                            } catch (fsErr) { console.error(`[ERROR] Failed to map font: ${fontName}`); }
                        }
                    }
                ],
                print: (text) => logToConsole(`[OpenSCAD]: ${text}`),
                printErr: (text) => {
                    errorLogs.push(text);
                    logToConsole(`[ERROR]: ${text}`);
                }
            });
        };

        // 📝 Pre-map external resources helper
        const mapExternalResources = (instance) => {
            for (const stlName of Object.keys(stlCache)) {
                try { instance.FS.writeFile(`/${stlName}`, new Uint8Array(stlCache[stlName])); } catch (e) {}
            }
            for (const svgName of Object.keys(svgCache)) {
                try { instance.FS.writeFile(`/${svgName}`, new Uint8Array(svgCache[svgName])); } catch (e) {}
            }
        };

        // ---------------------------------------------------------
        // 🚀 PASS 1: CORE SOLID COMPILER (INSTANCE 1)
        // ---------------------------------------------------------
        logToConsole("⚡ Initializing Solid Geometry Compiler Instance...");
        const solidInstance = await createWasmInstance();
        mapExternalResources(solidInstance);

        const solidCode = scriptCode.replace(/%[^;{]*({[^}]*}|;)/g, '');
        logToConsole("\n🪲 [DEBUG] --- PASS 1 CODE (SOLID GEOMETRY) ---");
        logToConsole(solidCode);
        logToConsole("🪲 -----------------------------------------\n");

        solidInstance.FS.writeFile('/solid_input.scad', solidCode);
        
        let solidData = null;
        try {
            solidInstance.callMain(['/solid_input.scad', '--backend=manifold', '-o', '/solid.3mf']);
            if (solidInstance.FS.analyzePath('/solid.3mf').exists) {
                solidData = solidInstance.FS.readFile('/solid.3mf');
                currentStlBlob = new Blob([solidData], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
                btnExport.disabled = false;
            }
        } catch (err) {
            logToConsole("Pass 1 execution finished.");
        }

        // ---------------------------------------------------------
        // 🚀 PASS 2: ISOLATED GHOST COMPILER (INSTANCE 2)
        // ---------------------------------------------------------
        let ghostData = null;
        if (hasGhost) {
            logToConsole("⚡ Initializing Dedicated Ghost Geometry Compiler Instance...");
            const ghostInstance = await createWasmInstance();
            mapExternalResources(ghostInstance);

            logToConsole("📥 Running structural scope parsing to isolate ghost layers...");
            const cleanGhostCode = isolateOpenSCADGhosts(scriptCode);
            const ghostModuleHeader = `module __GHOST__() { color([0.987, 0.012, 0.876]) children(); }\n\n`;
            const ghostCode = ghostModuleHeader + cleanGhostCode;
            
            logToConsole("\n🪲 [DEBUG] --- PASS 2 CODE (GHOST GEOMETRY) ---");
            logToConsole(ghostCode);
            logToConsole("🪲 -----------------------------------------\n");
            
            ghostInstance.FS.writeFile('/ghost_input.scad', ghostCode);
            
            try {
                ghostInstance.callMain(['/ghost_input.scad', '--backend=manifold', '-o', '/ghost.3mf']);
                if (ghostInstance.FS.analyzePath('/ghost.3mf').exists) {
                    ghostData = ghostInstance.FS.readFile('/ghost.3mf');
                }
            } catch (err) {
                logToConsole("Pass 2 execution finished.");
            }
        }

        // ---------------------------------------------------------
        // 📦 ASSEMBLE & RENDER DISPATCH
        // ---------------------------------------------------------
        if (solidData || ghostData) {
            update3DModelViewer(solidData, ghostData);
            if (placeholderText) placeholderText.style.display = 'none';
        } else {
            if (placeholderText) placeholderText.textContent = "❌ Build Failed (Check Console)";
            let detectedErrorLine = null;
            for (const logLine of errorLogs) {
                const lineMatch = logLine.match(/line\s+(\d+)/i);
                if (lineMatch) { detectedErrorLine = parseInt(lineMatch[1], 10); break; }
            }
            if (detectedErrorLine) highlightErrorLine(detectedErrorLine);
        }
    } catch (error) {
        if (placeholderText) placeholderText.textContent = "⚠️ Engine Crash";
        logToConsole(`Execution error: ${error.message || error}`);
    }
});

// STL export feature
btnExport.addEventListener('click', () => {
    if (!currentMesh) {
        logToConsole(`[ERROR]: No model loaded to export.`);
        return;
    }
    
    try {
        logToConsole(`⚙️ Forcing absolute orientation matrices for STL export...`);
        
        const exporter = new THREE.STLExporter();
        
        // 1. Structural clone of the visual group structure
        const exportClone = currentMesh.clone();
        
        // 2. Break the link to the live preview's sharing by deep-cloning inner geometries
        exportClone.traverse((child) => {
            if (child.isMesh && child.geometry) {
                child.geometry = child.geometry.clone();
            }
        });

		// 3. 🔥 THE FINAL PIECE: Lay flat, then apply a pure quaternion spin on the up-vector
		exportClone.rotation.set(0, 0, 0); 
		
		// First: Lay it perfectly flat on the bed (the stable layout we established)
		exportClone.rotation.z = Math.PI / 2;
		
		// Force Three.js to process and bake the horizontal orientation first
		exportClone.updateMatrix();
		exportClone.updateMatrixWorld(true);
		
		// problem with this!
		// Second: Rotate exactly 90 degrees around the slicer's Up Vector (Z-Axis)
		// Note: If it spins clockwise but you wanted counter-clockwise, change Math.PI / 2 to -Math.PI / 2
		const upAxis = new THREE.Vector3(0, 0, 1);
		const spinQuaternion = new THREE.Quaternion().setFromAxisAngle(upAxis, 0);   // -Math.PI / 2
		
		// Apply the spin directly to the object's combined matrix
		exportClone.applyQuaternion(spinQuaternion);
		
		// 4. Final bake before sending the stable coordinates to the STL exporter
		exportClone.updateMatrix();
		exportClone.updateMatrixWorld(true);
		
        logToConsole(`📦 Packaging corrected coordinate arrays into binary STL...`);
        
        // 5. Parse the fully updated and baked structural clone
        const stlResult = exporter.parse(exportClone, { binary: true });
        
        // 6. Package and Download
        const stlBlob = new Blob([stlResult], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(stlBlob);
        
        const projectName = projectNameInput.value.trim() || "openscad_model";
        link.download = `${projectName}.stl`; 
        link.click();
        
        // 7. Housekeeping: Free up memory from temporary cloned objects
        exportClone.traverse((child) => {
            if (child.isMesh && child.geometry) child.geometry.dispose();
        });
        
        logToConsole(`✔ Exported ${projectName}.stl successfully!`);
    } catch (exportErr) {
        logToConsole(`[ERROR]: Failed to export STL geometry: ${exportErr.message}`);
        console.error(exportErr);
    }
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
                updateLabelPosition(xEl, 23, 0, 0); updateLabelPosition(yEl, 0, 23, 0); updateLabelPosition(zEl, 0, 0, 23);   // position axes labels past compass line segment endpoints
            }
        }
    }
    animate();
}

// ==========================================================================
// 🎨 MULTI-PASS 3MF VIEWER (Solids + Translucent Ghosts)
// ==========================================================================
function update3DModelViewer(solidData, ghostData = null) {
    if (!workspaceInitialized) init3DWorkspace();

    let savedPosition = null;
    let savedTarget = null;
    if (currentMesh && camera && controls) {
        savedPosition = camera.position.clone();
        savedTarget = controls.target.clone();
    }

    // Safely remove the old mesh from the scene and free memory
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
        currentMesh = null;
    }

    logToConsole("📥 Processing 3MF multi-pass graphics layout...");

    try {
        if (typeof fflate === 'undefined') {
            throw new Error("fflate.js library is missing or failed to load. Check your index.html tags!");
        }

        // THE COMPATIBILITY LAYER FOR THREE.JS 3MF LOADER
        window.JSZip = {
            loadAsync: async function(data) {
                const bytes = new Uint8Array(data);
                const unzippedFiles = fflate.unzipSync(bytes);
                return {
                    file: function(relativePath) {
                        const fileData = unzippedFiles[relativePath];
                        if (!fileData) return null;
                        return {
                            async: async function(type) {
                                if (type === 'string') return new TextDecoder().decode(fileData);
                                return fileData.buffer;
                            }
                        };
                    }
                };
            }
        };

        const loader = new THREE.ThreeMFLoader();
        const masterGroup = new THREE.Group();
        const fallbackHexColor = modelColorInput ? modelColorInput.value : "#3b82f6";

        // ---------------------------------------------------------
        // 🎨 PASS 1: CORE SOLID GEOMETRY PROCESSING
        // ---------------------------------------------------------
        if (solidData) {
            const solidBytes = new Uint8Array(solidData);
            const solidGroup = loader.parse(solidBytes.buffer);
            
            if (solidGroup) {
                solidGroup.traverse((child) => {
                    if (child.isMesh) {
                        if (child.geometry) child.geometry.computeVertexNormals();

                        const hasGeometryVertexColors = !!(child.geometry && child.geometry.attributes && child.geometry.attributes.color);
                        const materials = Array.isArray(child.material) ? child.material : [child.material];

                        materials.forEach((mat) => {
                            if (!mat) return;
                            const loaderFlaggedVertexColors = (mat.vertexColors === true || mat.vertexColors === THREE.VertexColors);
                            
                            // 🔍 WIDENED DETECTOR: Catch variant default OpenSCAD yellows/oranges safely
                            let isDefaultOpenSCADYellow = false;
                            if (mat.color) {
                                const r = mat.color.r, g = mat.color.g, b = mat.color.b;
                                if (r > 0.70 && g > 0.55 && b < 0.50 && (r - b) > 0.15) {
                                    isDefaultOpenSCADYellow = true;
                                }
                            }
                            if (hasGeometryVertexColors) {
                                const colorAttr = child.geometry.attributes.color;
                                if (colorAttr && colorAttr.count > 0) {
                                    const vR = colorAttr.getX(0), vG = colorAttr.getY(0), vB = colorAttr.getZ(0);
                                    if (vR > 0.70 && vG > 0.55 && vB < 0.50 && (vR - vB) > 0.15) {
                                        isDefaultOpenSCADYellow = true;
                                    }
                                }
                            }

                            // 🚀 MATERIAL COLOR ROUTER
                            if (!isDefaultOpenSCADYellow) {
                                // Script has an explicit, custom color() rule applied
                                if (hasGeometryVertexColors || loaderFlaggedVertexColors) {
                                    mat.vertexColors = true;
                                    mat.color.setRGB(1, 1, 1);
                                }
                                if (mat.opacity < 1.0) {
                                    mat.transparent = true;
                                    if (mat.opacity < 0.8) {
                                        mat.depthWrite = false;
                                        mat.side = THREE.DoubleSide;
                                    } else {
                                        mat.depthWrite = true;
                                        mat.side = THREE.FrontSide;
                                    }
                                } else {
                                    mat.transparent = false;
                                    mat.depthWrite = true;
                                    mat.side = THREE.FrontSide;
                                }
                            } else {
                                // Unstyled geometry -> Force your custom workspace color picker setting
                                mat.vertexColors = false;
                                mat.color.set(fallbackHexColor);
                                mat.transparent = false;
                                mat.depthWrite = true;
                                mat.side = THREE.FrontSide;
                                mat.opacity = 1.0;
                            }

                            mat.roughness = 0.5;
                            mat.metalness = 0.1;
                            if (typeof wireframeMode !== 'undefined') mat.wireframe = wireframeMode;
                            mat.needsUpdate = true;
                        });
                    }
                });
                masterGroup.add(solidGroup);
            }
        }

// ---------------------------------------------------------
        // 💎 PASS 2: GHOST GEOMETRY PROCESSING (SMOKY GLASS)
        // ---------------------------------------------------------
        if (ghostData) {
            logToConsole("🪲 [DEBUG] Parsing Ghost Data Mesh Layer...");
            const ghostBytes = new Uint8Array(ghostData);
            const ghostGroup = loader.parse(ghostBytes.buffer);
            
            if (ghostGroup) {
                let meshCount = 0;
                
                // 💡 CRITICAL: Force the transparent layer to render AFTER all solid items
                ghostGroup.renderOrder = 1;

                ghostGroup.traverse((child) => {
                    if (child.isMesh) {
                        meshCount++;
                        if (child.geometry) child.geometry.computeVertexNormals();
                        
                        // ✨ PREMIUM CYAN SMOKY ICE-GLASS MATERIAL
                        const glassMaterial = new THREE.MeshStandardMaterial({
                            color: 0xa5f3fc,          // 🧊 Light cyan/ice glass tint
                            transparent: true,        // Enable alpha mapping channels
                            opacity: 0.30,            // Smooth, subtle translucency density
                            depthWrite: false,        // Prevents see-through faces from cutting out solids
                            side: THREE.DoubleSide,   // Render both outer and inner interior walls
                            roughness: 0.15,          // Glossy, polished glass surface finish
                            metalness: 0.1            // Faint metallic edge sheen
                        });

                        if (typeof wireframeMode !== 'undefined') {
                            glassMaterial.wireframe = wireframeMode;
                        }

                        // Apply to single and multi-material assets uniformly
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map(() => glassMaterial.clone());
                        } else {
                            child.material = glassMaterial;
                        }
                        
                        child.material.needsUpdate = true;
                    }
                });
                
                logToConsole(`🪲 [DEBUG] Ghost Pass found and processed ${meshCount} glass meshes.`);
                masterGroup.add(ghostGroup);
            }
        }
		
		
		/*
		// ---------------------------------------------------------
        // 💎 PASS 2: GHOST GEOMETRY PROCESSING (DEBUG OPAQUE MODE)
        // ---------------------------------------------------------
        if (ghostData) {
            logToConsole("🪲 [DEBUG] Parsing Ghost Data Mesh Layer...");
            const ghostBytes = new Uint8Array(ghostData);
            const ghostGroup = loader.parse(ghostBytes.buffer);
            
            if (ghostGroup) {
                let meshCount = 0;
                ghostGroup.traverse((child) => {
                    if (child.isMesh) {
                        meshCount++;
                        if (child.geometry) child.geometry.computeVertexNormals();
                        
                        // 🚨 FORCE OPAQUE HIGH-VISIBILITY MATERIAL
                        const debugMaterial = new THREE.MeshStandardMaterial({
                            color: 0xff00ff,          // Bright Neon Magenta / Fuchsia
                            transparent: false,       // <-- BYPASS TRANSPARENCY ENTIRELY
                            opacity: 1.0,             // Fully solid
                            depthWrite: true,         // Standard depth behavior
                            side: THREE.DoubleSide,   // Render inside and outside walls
                            roughness: 0.4,
                            metalness: 0.2
                        });

                        if (typeof wireframeMode !== 'undefined') {
                            debugMaterial.wireframe = wireframeMode;
                        }

                        // Override material arrays safely
                        if (Array.isArray(child.material)) {
                            child.material = child.material.map(() => debugMaterial.clone());
                        } else {
                            child.material = debugMaterial;
                        }
                        
                        child.material.needsUpdate = true;
                    }
                });
                
                logToConsole(`🪲 [DEBUG] Ghost Pass found and processed ${meshCount} meshes inside 3MF.`);
                masterGroup.add(ghostGroup);
            } else {
                logToConsole("🪲 [DEBUG ALERT] Ghost 3MF parsed into an empty group object.");
            }
        }
		*/

        // Complete compilation group assignment
        currentMesh = masterGroup;
        currentMesh.rotation.x = -Math.PI / 2; // Correct OpenSCAD coordinate system to Three.js space
        scene.add(currentMesh);

        // Retain view camera positions smoothly
        if (savedPosition && savedTarget) {
            camera.position.copy(savedPosition);
            controls.target.copy(savedTarget);
            controls.update();
        } else {
            frameModelInCamera(currentMesh);
        }

        if (typeof render === 'function') render();
        logToConsole("✨ 3D Render Canvas Updated Successfully.");

    } catch (err) {
        console.error("3MF Parse Pipeline Failure via fflate:", err);
        logToConsole(`[ERROR] 3D Viewer pipeline failed: ${err.message}`);
        if (placeholderText) {
            placeholderText.textContent = "❌ Render Error (Check Console)";
            placeholderText.style.display = 'flex';
        }
    }
}

btnPreview.disabled = true; btnExport.disabled = true;
initOpenSCAD(); init3DWorkspace();
btnWireframe.style.background = '#007acc'; 

// ==========================================================================
// ⚙️ SETTINGS & MANAGER MODALS
// ==========================================================================
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
//const settingsOverlay = document.getElementById('settings-overlay');    // already declared with other Dom elements at top of source
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

// 📜 LICENSES DOM (ADDED)
const btnOpenLicensesMenu = document.getElementById('btn-open-licenses-menu');
const licensesOverlay = document.getElementById('licenses-overlay');
const btnCloseLicenses = document.getElementById('btn-close-licenses');
const licensesTextContainer = document.getElementById('licenses-text-container');

// 📄 CREDITS AND LICENSE TEXT LITERAL
const THIRD_PARTY_LICENSES_TEXT = `CREDITS & THIRD-PARTY OPEN SOURCE NOTICES

Basic OpenSCAD PWA was architected, designed, and tested by Michael Young. 

The vast majority of the code syntax in this application was generated 
using Google Gemini Large Language Models (including Gemini Flash, Gemini 
Pro, and Gemini Experimental/Thinking models). 

The author's role focused on structural engineering ideas, UI/UX steering, 
extensive behavioral testing, and orchestrating the integration of the 
third-party libraries listed below.

===========================================================================
                  Basic OpenSCAD PWA (GNU GPL v2 License)
===========================================================================
<a href="https://github.com/myoung8223/boscpwa" target="_blank" style="color: #52b1ff; text-decoration: underline; font-weight: bold;">https://github.com/myoung8223/boscpwa</a>

Basic OpenSCAD PWA is Copyright (c) 2026 Michael Young.

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License.

Please see the "GNU GENERAL PUBLIC LICENSE (VERSION 2)" section at the 
bottom of this document for the full licensing terms and conditions.

===========================================================================
                    OpenSCAD WASM (GNU GPL v2 License)
===========================================================================
<a href="https://github.com/openscad/openscad-wasm" target="_blank" style="color: #52b1ff; text-decoration: underline; font-weight: bold;">https://github.com/openscad/openscad-wasm</a>

OpenSCAD is Copyright (c) 2009-2026 Clifford Wolf, Marius Kintel, et al.
This port is distributed under the GNU General Public License, version 2.

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License.

Please see the "GNU GENERAL PUBLIC LICENSE (VERSION 2)" section at the 
bottom of this document for the full licensing terms and conditions.

===========================================================================
                          scad2stl (MIT License)
===========================================================================
<a href="https://github.com/code4fukui/scad2stl" target="_blank" style="color: #52b1ff; text-decoration: underline; font-weight: bold;">https://github.com/code4fukui/scad2stl</a>

Copyright (c) 2024 Taisuke Fukuno

Please see the "MIT LICENSE" section at the 
bottom of this document for the full licensing terms and conditions.

===========================================================================
                           three.js (MIT License)
===========================================================================
<a href="https://github.com/mrdoob/three.js" target="_blank" style="color: #52b1ff; text-decoration: underline; font-weight: bold;">https://github.com/mrdoob/three.js</a>

Copyright © 2010-2026 three.js authors

Please see the "MIT LICENSE" section at the 
bottom of this document for the full licensing terms and conditions.

===========================================================================
                           CodeJar (MIT License)
===========================================================================
<a href="https://github.com/antonmedv/codejar" target="_blank" style="color: #52b1ff; text-decoration: underline; font-weight: bold;">https://github.com/antonmedv/codejar</a>

Copyright (c) 2020 Anton Medvedev

Please see the "MIT LICENSE" section at the 
bottom of this document for the full licensing terms and conditions.

===========================================================================
                            prism (MIT License)
===========================================================================
<a href="https://github.com/PrismJS/prism" target="_blank" style="color: #52b1ff; text-decoration: underline; font-weight: bold;">https://github.com/PrismJS/prism</a>

Copyright (c) 2012 Lea Verou

Please see the "MIT LICENSE" section at the 
bottom of this document for the full licensing terms and conditions.

===========================================================================
                  GNU GENERAL PUBLIC LICENSE (VERSION 2)
===========================================================================
Applies to: Basic OpenSCAD PWA, OpenSCAD WASM

                    GNU GENERAL PUBLIC LICENSE
                       Version 2, June 1991

 Copyright (C) 1989, 1991 Free Software Foundation, Inc.,
 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The licenses for most software are designed to take away your
freedom to share and change it.  By contrast, the GNU General Public
License is intended to guarantee your freedom to share and change free
software--to make sure the software is free for all its users.  This
General Public License applies to most of the Free Software
Foundation's software and to any other program whose authors commit to
using it.  (Some other Free Software Foundation software is covered by
the GNU Lesser General Public License instead.)  You can apply it to
your programs, too.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
this service if you wish), that you receive source code or can get it
if you want it, that you can change the software or use pieces of it
in new free programs; and that you know you can do these things.

  To protect your rights, we need to make restrictions that forbid
anyone to deny you these rights or to ask you to surrender the rights.
These restrictions translate to certain responsibilities for you if you
distribute copies of the software, or if you modify it.

  For example, if you distribute copies of such a program, whether
gratis or for a fee, you must give the recipients all the rights that
you have.  You must make sure that they, too, receive or can get the
source code.  And you must show them these terms so they know their
rights.

  We protect your rights with two steps: (1) copyright the software, and
(2) offer you this license which gives you legal permission to copy,
distribute and/or modify the software.

  Also, for each author's protection and ours, we want to make certain
that everyone understands that there is no warranty for this free
software.  If the software is modified by someone else and passed on, we
want its recipients to know that what they have is not the original, so
that any problems introduced by others will not reflect on the original
authors' reputations.

  Finally, any free program is threatened constantly by software
patents.  We wish to avoid the danger that redistributors of a free
program will individually obtain patent licenses, in effect making the
program proprietary.  To prevent this, we have made it clear that any
patent must be licensed for everyone's free use or not licensed at all.

  The precise terms and conditions for copying, distribution and
modification follow.

                    GNU GENERAL PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. This License applies to any program or other work which contains
a notice placed by the copyright holder saying it may be distributed
under the terms of this General Public License.  The "Program", below,
refers to any such program or work, and a "work based on the Program"
means either the Program or any derivative work under copyright law:
that is to say, a work containing the Program or a portion of it,
either verbatim or with modifications and/or translated into another
language.  (Hereinafter, translation is included without limitation in
the term "modification".)  Each licensee is addressed as "you".

Activities other than copying, distribution and modification are not
covered by this License; they are outside its scope.  The act of
running the Program is not restricted, and the output from the Program
is covered only if its contents constitute a work based on the
Program (independent of having been made by running the Program).
Whether that is true depends on what the Program does.

  1. You may copy and distribute verbatim copies of the Program's
source code as you receive it, in any medium, provided that you
conspicuously and appropriately publish on each copy an appropriate
copyright notice and disclaimer of warranty; keep intact all the
notices that refer to this License and to the absence of any warranty;
and give any other recipients of the Program a copy of this License
along with the Program.

You may copy a fee for the physical act of transferring a copy, and
you may at your option offer warranty protection in exchange for a fee.

  2. You may modify your copy or copies of the Program or any portion
of it, thus forming a work based on the Program, and copy and
distribute such modifications or work under the terms of Section 1
above, provided that you also meet all of these conditions:

    a) You must cause the modified files to carry prominent notices
    stating that you changed the files and the date of any change.

    b) You must cause any work that you distribute or publish, that in
    whole or in part contains or is derived from the Program or any
    part thereof, to be licensed as a whole at no charge to all third
    parties under the terms of this License.

    c) If the modified program normally reads commands interactively
    when run, you must cause it, when started running for such
    interactive use in the most ordinary way, to print or display an
    announcement including an appropriate copyright notice and a
    notice that there is no warranty (or else, saying that you provide
    a warranty) and that users may redistribute the program under
    these conditions, and telling the user how to view a copy of this
    License.  (Exception: if the Program itself is interactive but
    does not normally print such an announcement, your work based on
    the Program is not required to print an announcement.)

These requirements apply to the modified work as a whole.  If
identifiable sections of that work are not derived from the Program,
and can be reasonably considered independent and separate works in
themselves, then this License, and its terms, do not apply to those
sections when you distribute them as separate works.  But when you
distribute the same sections as part of a whole which is a work based
on the Program, the distribution of the whole must be on the terms of
this License, whose permissions for other licensees extend to the
entire whole, and thus to each and every part regardless of who wrote it.

Thus, it is not the intent of this section to claim rights or contest
your rights to work written entirely by you; rather, the intent is to
exercise the right to control the distribution of derivative or
collective works based on the Program.

In addition, mere aggregation of another work not based on the Program
with the Program (or with a work based on the Program) on a volume of
a storage or distribution medium does not bring the other work under
the scope of this License.

  3. You may copy and distribute the Program (or a work based on it,
under Section 2) in object code or executable form under the terms of
Sections 1 and 2 above provided that you also do one of the following:

    a) Accompany it with the complete corresponding machine-readable
    source code, which must be distributed under the terms of Sections
    1 and 2 above on a medium customarily used for software interchange; or,

    b) Accompany it with a written offer, valid for at least three
    years, to give any third party, for a charge no more than your
    cost of physically performing source distribution, a complete
    machine-readable copy of the corresponding source code, to be
    distributed under the terms of Sections 1 and 2 above on a medium
    customarily used for software interchange; or,

    c) Accompany it with the information you received as to the offer
    to distribute corresponding source code.  (This alternative is
    allowed only for noncommercial distribution and only if you
    received the program in object code or executable form with such
    an offer, in accord with Subsection b above.)

The source code for a work means the preferred form of the work for
making modifications to it.  For an executable work, complete source
code means all the source code for all modules it contains, plus any
associated interface definition files, plus the scripts used to
control compilation and installation of the executable.  However, as a
special exception, the source code distributed need not include
anything that is normally distributed (in either source or binary
form) with the major components (compiler, kernel, and so on) of the
operating system on which the executable runs, unless that component
itself accompanies the executable.

If distribution of executable or object code is made by offering
access to copy from a designated place, then offering equivalent
access to copy the source code from the same place counts as
distribution of the source code, even though third parties are not
compelled to copy the source along with the object code.

  4. You may not copy, modify, sublicense, or distribute the Program
except as expressly provided under this License.  Any attempt
otherwise to copy, modify, sublicense or distribute the Program is
void, and will automatically terminate your rights under this License.
However, parties who have received copies, or rights, from you under
this License will not have their licenses terminated so long as such
parties remain in full compliance.

  5. You are not required to accept this License, since you have not
signed it.  However, nothing else grants you permission to modify or
distribute the Program or its derivative works.  These actions are
prohibited by law if you do not accept this License.  Therefore, by
modifying or distributing the Program (or any work based on the
Program), you indicate your acceptance of this License to do so, and
all its terms and conditions for copying, distributing or modifying
the Program or works based on it.

  6. Each time you redistribute the Program (or any work based on the
Program), the recipient automatically receives a license from the
original licensor to copy, distribute or modify the Program subject to
these terms and conditions.  You may not impose any further
restrictions on the recipients' exercise of the rights granted herein.
You are not responsible for enforcing compliance by third parties to
this License.

  7. If, as a consequence of a court judgment or allegation of patent
infringement or for any other reason (not limited to patent issues),
conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot
distribute so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you
may not distribute the Program at all.  For example, if a patent
license would not permit royalty-free redistribution of the Program by
all those who receive copies directly or indirectly through you, then
the only way you could satisfy both it and this License would be to
refrain entirely from distribution of the Program.

If any portion of this section is held invalid or unenforceable under
any particular circumstance, the balance of the section is intended to
apply and the section as a whole is intended to apply in other
circumstances.

It is not the purpose of this section to induce you to infringe any
patents or other property right claims or to contest validity of any
such claims; this section has the sole purpose of protecting the
integrity of the free software distribution system, which is
implemented by public license practices.  Many people have made
generous contributions to the wide range of software distributed
through that system in reliance on consistent application of that
system; it is up to the author/donor to decide if he or she is willing
to distribute software through any other system and a licensee cannot
impose that choice.

This section is intended to make thoroughly clear what is believed to
be a consequence of the rest of this License.

  8. If the distribution and/or use of the Program is restricted in
certain countries either by patents or by copyrighted interfaces, the
original copyright holder who places the Program under this License
may add an explicit geographical distribution limitation excluding
those countries, so that distribution is permitted only in or among
countries not thus excluded.  In such case, this License incorporates
the limitation as if written in the body of this License.

  9. The Free Software Foundation may publish revised and/or new versions
of the General Public License from time to time.  Such new versions will
be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

Each version is given a distinguishing version number.  If the Program
specifies a version number of this License which applies to it and "any
later version", you have the option of following the terms and conditions
either of that version or of any later version published by the Free
Software Foundation.  If the Program does not specify a version number of
this License, you may choose any version ever published by the Free Software
Foundation.

  10. If you wish to incorporate parts of the Program into other free
programs whose distribution conditions are different, write to the author
to ask for permission.  For software which is copyrighted by the Free
Software Foundation, write to the Free Software Foundation; we sometimes
make exceptions for this.  Our decision will be guided by the two goals
of preserving the free status of all derivatives of our free software and
of promoting the sharing and reuse of software generally.

                            NO WARRANTY

  11. BECAUSE THE PROGRAM IS LICENSED FREE OF CHARGE, THERE IS NO WARRANTY
FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW.  EXCEPT WHEN
OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES
PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED
OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.  THE ENTIRE RISK AS
TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU.  SHOULD THE
PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING,
REPAIR OR CORRECTION.

  12. IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MAY MODIFY AND/OR
REDISTRIBUTE THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES,
INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING
OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED
TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY
YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER
PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
convey the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

Also add information on how to contact you by electronic and paper mail.

If the program is interactive, make it output a short notice like this
when it starts in an interactive mode:

    Gnomovision version 69, Copyright (C) year name of author
    Gnomovision comes with ABSOLUTELY NO WARRANTY; for details type \`show w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type \`show c' for details.

The hypothetical commands \`show w' and \`show c' should show the appropriate
parts of the General Public License.  Of course, the commands you use may
be called something other than \`show w' and \`show c'; they could even be
mouse-clicks or menu items--whatever suits your program.

You should also get your employer (if you work as a programmer) or your
school, if any, to sign a "copyright disclaimer" for the program, if
necessary.  Here is a sample; alter the names:

  Yoyodyne, Inc., hereby disclaims all copyright interest in the program
  \`Gnomovision' (which makes passes at compilers) written by James Hacker.

  <signature of Ty Coon>, 1 April 1989
  Ty Coon, President of Vice

This General Public License does not permit incorporating your program into
proprietary programs.  If your program is a subroutine library, you may
consider it more useful to permit linking proprietary applications with the
library.  If this is what you want to do, use the GNU Lesser General
Public License instead of this License.

===========================================================================
                                MIT LICENSE
===========================================================================
Applies to: CodeJar, Three.js, Scad2Stl, Prism.js

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;

function closeAllMenus() {
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
    if (fontsOverlay) fontsOverlay.classList.add('hidden');
    if (stlsOverlay) stlsOverlay.classList.add('hidden');
    if (svgsOverlay) svgsOverlay.classList.add('hidden');
    if (licensesOverlay) licensesOverlay.classList.add('hidden');
	if (typeof helpOverlay !== 'undefined' && helpOverlay) helpOverlay.classList.add('hidden');
}

// Update your window click listener to include the new overlay
window.addEventListener('click', (event) => {
    if (event.target === settingsOverlay || event.target === fontsOverlay || event.target === stlsOverlay || event.target === svgsOverlay || event.target === licensesOverlay) {
        closeAllMenus();
    }
});

// Update your Escape key listener
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const isAnyOpen = [settingsOverlay, fontsOverlay, stlsOverlay, svgsOverlay, licensesOverlay, helpOverlay].some(el => el && !el.classList.contains('hidden'));
        if (isAnyOpen) { logToConsole('⌨️ Hotkey Triggered: [Escape] - Closing Overlays'); closeAllMenus(); }
    }
});

/*
// ---- LICENSES BRIDGES & RENDERING ----
if (btnOpenLicensesMenu) {
    btnOpenLicensesMenu.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        if (licensesOverlay) {
            licensesOverlay.classList.remove('hidden');
            // Inject the string literal into the pre/code container
            if (licensesTextContainer) {
                licensesTextContainer.textContent = THIRD_PARTY_LICENSES_TEXT;
            }
        }
    });
}
*/

// ---- LICENSES BRIDGES & RENDERING ----
if (btnOpenLicensesMenu) {
    btnOpenLicensesMenu.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        if (licensesOverlay) {
            licensesOverlay.classList.remove('hidden');
            // 🌐 INJECT AS HTML SO THE GITHUB URL BECOMES A CLICKABLE LINK
            if (licensesTextContainer) {
                licensesTextContainer.innerHTML = THIRD_PARTY_LICENSES_TEXT;
            }
        }
    });
}

if (btnCloseLicenses) {
    btnCloseLicenses.addEventListener('click', () => {
        if (licensesOverlay) licensesOverlay.classList.add('hidden');
        if (settingsOverlay) settingsOverlay.classList.remove('hidden'); 
    });
}

/*
function closeAllMenus() {
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
    if (fontsOverlay) fontsOverlay.classList.add('hidden');
    if (stlsOverlay) stlsOverlay.classList.add('hidden');
    if (svgsOverlay) svgsOverlay.classList.add('hidden');
}
*/

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
        //const safeFamily = meta.family.replace(/-/g, '\\-');
        const safeFamily = meta.family.replace(/-/g, '\\\\-');   // Fontconfig requires '\-' for literal hyphens, which means we must double-escape ('\\\\-') for OpenSCAD's C-style string parser.
        let openScadSyntax = `font = "${safeFamily}"`;
        if (meta.style !== 'Unknown' && meta.style !== 'Regular') openScadSyntax = `font = "${safeFamily}:style=${meta.style}"`;

        const rowWrap = document.createElement('div'); rowWrap.style.display = 'flex'; rowWrap.style.flexDirection = 'column'; rowWrap.style.padding = '8px 10px'; rowWrap.style.borderBottom = '1px solid #222'; rowWrap.style.gap = '6px';
        const topRow = document.createElement('div'); topRow.style.display = 'flex'; topRow.style.justifyContent = 'space-between'; topRow.style.alignItems = 'center';
        const nameLabel = document.createElement('span'); nameLabel.textContent = font.filename; nameLabel.style.overflow = 'hidden'; nameLabel.style.textOverflow = 'ellipsis'; nameLabel.style.whiteSpace = 'nowrap'; nameLabel.style.maxWidth = '210px'; nameLabel.style.color = '#ddd'; nameLabel.style.fontWeight = 'bold';
        
        const delBtn = document.createElement('button'); delBtn.textContent = '✕'; delBtn.style.background = '#dc3545'; delBtn.style.color = '#fff'; delBtn.style.padding = '2px 7px'; delBtn.style.fontSize = '0.75rem'; delBtn.style.borderRadius = '3px'; delBtn.style.cursor = 'pointer'; delBtn.style.fontWeight = 'bold';
        delBtn.addEventListener('click', async () => {
            //if (confirm(`Uninstall "${font.filename}"?`)) {   // remove confirmation
                await deletePersistentFont(font.filename); delete fontCache[font.filename]; 
                logToConsole(`🗑️ Font uninstalled: ${font.filename}`); renderCustomFontManagerList();
                if (openSCADFactory && !btnPreview.disabled) btnPreview.click(); 
            //}
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
            //if (confirm(`Remove STL "${stl.filename}"?`)) {   remove confirmation
                await deletePersistentStl(stl.filename); delete stlCache[stl.filename]; 
                logToConsole(`🗑️ STL removed: ${stl.filename}`); renderCustomStlManagerList();
                if (openSCADFactory && !btnPreview.disabled) btnPreview.click(); 
            //}
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
            //if (confirm(`Remove SVG "${svg.filename}"?`)) {   // remove confirmation
                await deletePersistentSvg(svg.filename); delete svgCache[svg.filename]; 
                logToConsole(`🗑️ SVG removed: ${svg.filename}`); renderCustomSvgManagerList();
                if (openSCADFactory && !btnPreview.disabled) btnPreview.click(); 
            //}
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

function isolateOpenSCADGhosts(code) {
    let i = 0;
    const len = code.length;
    
    function skipWhitespaceAndComments() {
        while (i < len) {
            const ch = code[i];
            if (/\s/.test(ch)) {
                i++;
            } else if (ch === '/' && code[i+1] === '/') {
                while (i < len && code[i] !== '\n') i++;
            } else if (ch === '/' && code[i+1] === '*') {
                i += 2;
                while (i < len && !(code[i] === '*' && code[i+1] === '/')) i++;
                i += 2;
            } else {
                break;
            }
        }
    }
    
    function parseComponent(isInsideGhostScope) {
        skipWhitespaceAndComments();
        if (i >= len) return "";
        
        let hasGhostModifier = false;
        let hasIgnoreModifier = false;
        
        // Match modifier prefixes sequentially
        while (i < len) {
            let ch = code[i];
            if (ch === '%') { hasGhostModifier = true; i++; }
            else if (ch === '*') { hasIgnoreModifier = true; i++; }
            else if (ch === '!' || ch === '#') { i++; } 
            else break;
            skipWhitespaceAndComments();
        }
        
        const effectiveGhost = isInsideGhostScope || hasGhostModifier;
        skipWhitespaceAndComments();
        if (i >= len) return "";

        // Context 1: Block Scope Content encapsulated via Braces { ... }
        if (code[i] === '{') {
            i++; // consume '{'
            let blockContent = "";
            while (true) {
                skipWhitespaceAndComments();
                if (i >= len || code[i] === '}') break;
                blockContent += parseComponent(effectiveGhost);
            }
            if (i < len && code[i] === '}') i++; // consume '}'
            
            if (effectiveGhost) {
                return hasGhostModifier ? `__GHOST__() { ${blockContent} } ` : `{ ${blockContent} } `;
            } else {
                return `{ ${blockContent} } `;
            }
        }
        
        // Context 2: Structural Expression Strings (Parameters & Call Signatures)
        let expression = "";
        let parensCount = 0;
        let endedWithSemicolon = false;
        
        while (i < len) {
            let char = code[i];
            expression += char;
            if (char === '(') parensCount++;
            if (char === ')') parensCount--;
            i++;
            
            if (char === ';' && parensCount === 0) {
                endedWithSemicolon = true;
                break;
            }
            
            // Fix: If we just closed a parenthesis loop, check if a semicolon follows immediately 
            // (skipping spaces) and consume it as part of this exact node context!
            if (parensCount === 0 && char === ')') {
                let peek = i;
                while (peek < len && /\s/.test(code[peek])) peek++;
                if (peek < len && code[peek] === ';') {
                    // Consume everything up to and including that semicolon
                    while (i <= peek) {
                        expression += code[i];
                        i++;
                    }
                    endedWithSemicolon = true;
                }
                break;
            }
        }
        
        skipWhitespaceAndComments();
        
        // Identify if this statement acts as an operation wrapper or a final leaf geometry node
        let isWrapper = false;
        if (!endedWithSemicolon && i < len) {
            let nextChar = code[i];
            if (nextChar === '{' || nextChar === '%' || nextChar === '*' || /[a-zA-Z0-9_$]/.test(nextChar)) {
                isWrapper = true;
            }
        }
        
        if (isWrapper) {
            let childContent = parseComponent(effectiveGhost);
            if (effectiveGhost) {
                return hasGhostModifier ? `__GHOST__() ${expression} ${childContent}` : `${expression} ${childContent}`;
            } else {
                return `${expression} ${childContent}`;
            }
        } else {
            // Standalone Leaf Node (e.g. cube(10);)
            if (effectiveGhost) {
                if (hasIgnoreModifier) return `* ${expression} `;
                return hasGhostModifier ? `__GHOST__() ${expression} ` : `${expression} `;
            } else {
                // Safely disable solids for our ghost pass
                return `* ${expression} `;
            }
        }
    }
    
    let output = "";
    while (i < len) {
        output += parseComponent(false);
        skipWhitespaceAndComments();
    }
    return output;
}
