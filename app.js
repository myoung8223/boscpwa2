// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "74"; // <-- Incremented for Compiler Error Line Highlighting Engine

// 🍯 Import standalone, offline-ready CodeJar framework
import { CodeJar } from './libs/codejar.min.js';

// Dom Elements
const editorElement = document.getElementById('editor'); // Pointing to the new CodeJar div
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

/*
// 🍯 INITIALIZE CODEJAR INSTANCE
const jar = CodeJar(
    editorElement, 
    (el) => {
        if (typeof Prism !== 'undefined') Prism.highlightElement(el);
        try { applyInlineBracketMatching(el); } catch (e) { console.error("Bracket match error:", e); }
    },
    { tab: '\t', history: true, indentOn: /[(\[{]$/, addClosing: false } 
);
*/

// 🍯 INITIALIZE CODEJAR INSTANCE
const jar = CodeJar(
    editorElement, 
    (el) => {
        // 1. MANUAL PRISM INVOCATION: Bypasses Prism's auto-trimming bug!
        if (typeof Prism !== 'undefined') {
            const code = el.textContent;
            
            // Dynamically grab the best available language grammar for OpenSCAD
            const grammar = Prism.languages.openscad || Prism.languages.clike || Prism.languages.javascript;
            const langName = Prism.languages.openscad ? 'openscad' : (Prism.languages.clike ? 'clike' : 'javascript');
            
            if (grammar) {
                // Highlight without trimming newlines, then inject safely
                el.innerHTML = Prism.highlight(code, grammar, langName);
            } else {
                Prism.highlightElement(el); // Fallback if grammars fail to load
            }
        }
        
        // 2. Run Bracket Matcher
        try { applyInlineBracketMatching(el); } catch (e) { console.error("Bracket match error:", e); }
    },
    // 🔥 Preserve the indent regex fix!
    { tab: '\t', history: true, indentOn: /[(\[{]$/, addClosing: false } 
);

// 🖱️ Passive navigation listeners
if (editorElement) {
    editorElement.addEventListener('click', () => applyInlineBracketMatching(editorElement));
    editorElement.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
            applyInlineBracketMatching(editorElement);
        }
    });
}

// ==========================================================================
// 📐 SMART MULTI-LINE BLOCK INDENTATION ENGINE (CAPTURE-PHASE INTERCEPTOR)
// ==========================================================================
if (editorElement) {
    editorElement.addEventListener('keydown', (event) => {
        // Only run our deep interception calculations if the user is pressing Tab
        if (event.key === 'Tab') {
            
            event.preventDefault();
            event.stopImmediatePropagation();

            let { start, end } = getSelectionCharacterOffsetWithin(editorElement);
            const value = jar.toString();
            
            const selectedText = value.substring(start, end);
            const isMultiLineSelection = selectedText.includes('\n');

            // SCENARIO 1: Single-Line Tab Replacement
            if (!isMultiLineSelection && !event.shiftKey) {
                const newCode = value.substring(0, start) + '\t' + value.substring(end);
                jar.updateCode(newCode);
                setSelectionCharacterOffsetWithin(editorElement, start + 1, start + 1);
                return;
            }

            // SCENARIO 2: Multi-line Block Indent OR Shift+Tab Outdent
            let adjustedEnd = end;
            if (adjustedEnd > start && value[adjustedEnd - 1] === '\n') {
                adjustedEnd--;
            }

            const selectStartLineStart = value.lastIndexOf('\n', start - 1) + 1;
            const selectEndLineEnd = value.indexOf('\n', adjustedEnd);
            const finalEndPos = selectEndLineEnd === -1 ? value.length : selectEndLineEnd;

            const targetBlock = value.substring(selectStartLineStart, finalEndPos);
            let modifiedBlock = "";
            let newStart = start;
            let newEnd = end;

            if (!event.shiftKey) {
                modifiedBlock = targetBlock.split('\n').map(line => '\t' + line).join('\n');
                
                const linesBeforeStart = value.substring(selectStartLineStart, start).split('\n').length - 1;
                const linesBeforeEnd = value.substring(selectStartLineStart, end).split('\n').length - 1;
                
                newStart = start + linesBeforeStart + 1;
                newEnd = end + linesBeforeEnd + 1;
            } else {
                let removedBeforeStart = 0;
                let removedBeforeEnd = 0;
                
                const lines = targetBlock.split('\n');
                let currentPosInBlock = 0;
                
                modifiedBlock = lines.map(line => {
                    let reduction = 0;
                    let newLine = line;
                    
                    if (line.startsWith('\t')) {
                        reduction = 1;
                        newLine = line.substring(1);
                    } else if (line.startsWith('    ')) {
                        reduction = 4;
                        newLine = line.substring(4);
                    } else if (line.match(/^ +/)) {
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
    
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    
    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        
        if (!startNode && currentOffset + nodeLength >= start) {
            startNode = currentNode;
            startOffset = start - currentOffset;
        }
        if (!endNode && currentOffset + nodeLength >= end) {
            endNode = currentNode;
            endOffset = end - currentOffset;
            break;
        }
        
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
    } catch (e) {
        console.error("Selection recovery matrix execution failure:", e);
    }
}

// ==========================================================================
// 💡 BI-DIRECTIONAL CODEJAR BRACKET MATCHING ENGINE (LEXICAL-AWARE)
// ==========================================================================
function applyInlineBracketMatching(editorDiv) {
    const oldHighlights = editorDiv.querySelectorAll('.bracket-match-glow, .bracket-mismatch-glow');
    oldHighlights.forEach(span => {
        span.classList.remove('bracket-match-glow', 'bracket-mismatch-glow');
    });

    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const textContent = editorDiv.textContent;
    
    let cursorIndex = 0;
    const treeWalker = document.createTreeWalker(editorDiv, NodeFilter.SHOW_TEXT);
    let currentNode = treeWalker.nextNode();
    
    while (currentNode) {
        if (currentNode === range.startContainer) {
            cursorIndex += range.startOffset;
            break;
        }
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
    let inSingleComment = false;
    let inMultiComment = false;
    let inString = false;

    for (let i = 0; i < textContent.length; i++) {
        if (inSingleComment) {
            ignoredMap[i] = true;
            if (textContent[i] === '\n') inSingleComment = false;
        } else if (inMultiComment) {
            ignoredMap[i] = true;
            if (textContent[i] === '*' && textContent[i + 1] === '/') {
                ignoredMap[i + 1] = true;
                i++; 
                inMultiComment = false;
            }
        } else if (inString) {
            ignoredMap[i] = true;
            if (textContent[i] === '\\' && textContent[i + 1] === '"') {
                ignoredMap[i + 1] = true;
                i++;
            } else if (textContent[i] === '"') {
                inString = false;
            }
        } else {
            if (textContent[i] === '/' && textContent[i + 1] === '/') {
                ignoredMap[i] = true;
                ignoredMap[i + 1] = true;
                i++;
                inSingleComment = true;
            } else if (textContent[i] === '/' && textContent[i + 1] === '*') {
                ignoredMap[i] = true;
                ignoredMap[i + 1] = true;
                i++;
                inMultiComment = true;
            } else if (textContent[i] === '"') {
                ignoredMap[i] = true;
                inString = true;
            }
        }
    }

    if (ignoredMap[targetIndex]) return;
    
    const partnerChar = partners[charToMatch];
    const isForwardScan = ['{', '[', '('].includes(charToMatch);
    
    let matchIndex = -1;
    let balanceCounter = 0;

    if (isForwardScan) {
        for (let i = targetIndex; i < textContent.length; i++) {
            if (ignoredMap[i]) continue; 
            
            if (textContent[i] === charToMatch) balanceCounter++;
            if (textContent[i] === partnerChar) balanceCounter--;
            if (balanceCounter === 0) {
                matchIndex = i;
                break;
            }
        }
    } else {
        for (let i = targetIndex; i >= 0; i--) {
            if (ignoredMap[i]) continue; 
            
            if (textContent[i] === charToMatch) balanceCounter++;
            if (textContent[i] === partnerChar) balanceCounter--;
            if (balanceCounter === 0) {
                matchIndex = i;
                break;
            }
        }
    }

    let absoluteOffset = 0;
    let targetSpanNode = null;
    let matchSpanNode = null;

    const walker = document.createTreeWalker(editorDiv, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
        const nodeLength = textNode.textContent.length;
        
        if (targetIndex >= absoluteOffset && targetIndex < absoluteOffset + nodeLength) {
            targetSpanNode = textNode.parentNode;
        }
        if (matchIndex !== -1 && matchIndex >= absoluteOffset && matchIndex < absoluteOffset + nodeLength) {
            matchSpanNode = textNode.parentNode;
        }
        
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
// 🛠️ COMPILER COMPILATION ERROR LINE HIGHLIGHTING ENGINE
// ==========================================================================
function highlightErrorLine(lineNumber) {
    // 1. Wipe out any existing error highlights from the gutter and editor viewport
    clearErrorHighlights();

    if (!lineNumber || lineNumber < 1) return;

    // 2. Add an indicator flare to the matching index item inside the line gutter panel
    const lineGutter = document.getElementById('line-numbers');
    if (lineGutter) {
        // Line tokens are separated by <br>, split them and overlay the warning class
        const lines = lineGutter.innerHTML.split('<br>');
        if (lineNumber <= lines.length) {
            lines[lineNumber - 1] = `<span class="gutter-error-flare">${lineNumber}</span>`;
            lineGutter.innerHTML = lines.join('<br>');
        }
    }

    // 3. Track character offsets to find the start and end indices of the physical line text string
    const codeText = jar.toString();
    const textLines = codeText.split('\n');
    
    if (lineNumber > textLines.length) return;

    let targetStartCharIndex = 0;
    for (let i = 0; i < lineNumber - 1; i++) {
        targetStartCharIndex += textLines[i].length + 1; // +1 includes the hidden newline character sequence
    }
    let targetEndCharIndex = targetStartCharIndex + textLines[lineNumber - 1].length;

    // Handle empty code strings or edge selections elegantly
    if (targetStartCharIndex === targetEndCharIndex) {
        targetEndCharIndex++;
    }

    // 4. Trace the DOM structural elements inside the contenteditable element to map visual spans
    let currentAbsoluteOffset = 0;
    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();

    while (currentNode) {
        const nodeLength = currentNode.textContent.length;
        const startOfThisNode = currentAbsoluteOffset;
        const endOfThisNode = currentAbsoluteOffset + nodeLength;

        // Determine if this text node overlaps with our target line parameter
        if (endOfThisNode > targetStartCharIndex && startOfThisNode < targetEndCharIndex) {
            let parentElement = currentNode.parentNode;
            
            // If the text is nested or naked inside the root div container, step carefully
            if (parentElement === editorElement) {
                // Wrap raw text node elements safely inside a temporary markup span block
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
    // Sweep the editor text element nodes and clean off compilation error layout modifications
    const activeLineGlows = editorElement.querySelectorAll('.editor-error-line-glow');
    activeLineGlows.forEach(el => el.classList.remove('editor-error-line-glow'));

    // Re-render standard line numbers to instantly reset highlighted sidebar markers
    if (typeof triggerLineUpdate === 'function') {
        triggerLineUpdate();
    }
}

// ==========================================================================
// 🖥️ PERSISTENT CONSOLE VISIBILITY TOGGLE
// ==========================================================================
const toggleConsoleBtn = document.getElementById('btn-toggle-console');

if (consoleBox && toggleConsoleBtn) {
    let isConsoleVisible = localStorage.getItem('openscad_console_visible') !== 'hidden';

    const applyConsoleLayout = (visible) => {
        if (visible) {
            consoleBox.style.display = 'block';
            toggleConsoleBtn.textContent = 'Visible';
            toggleConsoleBtn.style.backgroundColor = '#28a745'; 
            isConsoleVisible = true;
            localStorage.setItem('openscad_console_visible', 'visible');
        } else {
            consoleBox.style.display = 'none';
            toggleConsoleBtn.textContent = 'Hidden';
            toggleConsoleBtn.style.backgroundColor = '#dc3545'; 
            isConsoleVisible = false;
            localStorage.setItem('openscad_console_visible', 'hidden');
        }
    };

    applyConsoleLayout(isConsoleVisible);

    toggleConsoleBtn.addEventListener('click', () => {
        applyConsoleLayout(!isConsoleVisible);
        if (isConsoleVisible && typeof logToConsole === 'function') {
            logToConsole("🖥️ Console tracking workspace restored.");
        }
    });
}

// ==========================================================================
// 🔣 LINE NUMBERS & PERSISTENT TOGGLE CONTROLLER
// ==========================================================================
const toggleLinesBtn = document.getElementById('btn-toggle-lines');
const lineNumbersDiv = document.getElementById('line-numbers');

let triggerLineUpdate = null;

if (editorElement && lineNumbersDiv && toggleLinesBtn) {

    /*
    const updateLineNumbers = (codeText) => {
        const currentCode = (typeof codeText === 'string') ? codeText : jar.toString();
        const linesCount = currentCode.split('\n').length;
        const linesArray = Array.from({ length: linesCount }, (_, i) => i + 1);
        lineNumbersDiv.innerHTML = linesArray.join('<br>');
    };
    */

    const updateLineNumbers = (codeText) => {
        let currentCode = (typeof codeText === 'string') ? codeText : jar.toString();
        
        // 🔥 FIXED: If the code ends with a single trailing newline, strip it out 
        // so `.split('\n')` doesn't generate a phantom empty line at the end.
        if (currentCode.endsWith('\n')) {
            currentCode = currentCode.slice(0, -1);
        }

        const linesCount = currentCode.split('\n').length;
        const linesArray = Array.from({ length: linesCount }, (_, i) => i + 1);
        lineNumbersDiv.innerHTML = linesArray.join('<br>');
    };
    
    triggerLineUpdate = updateLineNumbers;

    jar.onUpdate((code) => {
        // 🔥 WIPE ERROR FLARES INSTANTLY AS SOON AS THE USER RESUMES WORK/TYPING!
        const errorLineActive = editorElement.querySelectorAll('.editor-error-line-glow').length > 0;
        if (errorLineActive) {
            const currentGutterHtml = lineNumbersDiv.innerHTML;
            if (currentGutterHtml.includes('gutter-error-flare')) {
                // If text bounds change, wash all active background classes away safely
                const activeLineGlows = editorElement.querySelectorAll('.editor-error-line-glow');
                activeLineGlows.forEach(el => el.classList.remove('editor-error-line-glow'));
            }
        }

        updateLineNumbers(code);
        localStorage.setItem('openscad_editor_cache', code);
    });

    editorElement.addEventListener('scroll', () => {
        lineNumbersDiv.scrollTop = editorElement.scrollTop;
    });

    let isLinesEnabled = localStorage.getItem('openscad_lines_visible') !== 'disabled';

    const applyLinesLayout = (enabled) => {
        if (enabled) {
            lineNumbersDiv.style.display = 'block';
            toggleLinesBtn.textContent = 'Enabled';
            toggleLinesBtn.style.backgroundColor = '#28a745'; 
            isLinesEnabled = true;
            localStorage.setItem('openscad_lines_visible', 'enabled');
            updateLineNumbers();
            lineNumbersDiv.scrollTop = editorElement.scrollTop;
        } else {
            lineNumbersDiv.style.display = 'none';
            toggleLinesBtn.textContent = 'Disabled';
            toggleLinesBtn.style.backgroundColor = '#dc3545'; 
            isLinesEnabled = false;
            localStorage.setItem('openscad_lines_visible', 'disabled');
        }
    };

    updateLineNumbers();
    applyLinesLayout(isLinesEnabled);

    toggleLinesBtn.addEventListener('click', () => {
        applyLinesLayout(!isLinesEnabled);
    });
}

// ---- PERSISTENT PROJECT NAME INITIALIZATION ----
let activeProjectName = localStorage.getItem('openscad_project_name') || 'untitled';

if (projectNameInput) {
    projectNameInput.value = activeProjectName;
}

function updateWindowTitle() {
    document.title = `${activeProjectName}.scad`;
}
updateWindowTitle();

// ---- PERSISTENT FONT SIZE INITIALIZATION ----
const savedFontSizeStr = localStorage.getItem('openscad_editor_font_size') || '14px';

if (editorElement && editorFontSizeSelect) {
    editorElement.style.fontSize = savedFontSizeStr;
    if (lineNumbersDiv) lineNumbersDiv.style.fontSize = savedFontSizeStr; 
    editorFontSizeSelect.value = savedFontSizeStr;
}

// ---- PERSISTENT COLOR PREFERENCE INITIALIZATION ----
const savedColorHexStr = localStorage.getItem('openscad_model_color') || '#3b82f6';

if (modelColorInput) {
    modelColorInput.value = savedColorHexStr;
}
if (btnColorTrigger) {
    btnColorTrigger.style.background = savedColorHexStr;
}

let activeModelColor = parseInt(savedColorHexStr.replace('#', '0x'), 16);

let openSCADFactory = null;
let currentStlBlob = null; 
const fontCache = {}; 

function logToConsole(message) {
    let cleanMessage = message.replace(/^\[ERROR\]:\s*/gm, '');

    if (cleanMessage.includes("Could not initialize localization") || 
        cleanMessage.includes("Fontconfig error")) {
        return; 
    }

    consoleBox.textContent += `\n${cleanMessage}`;
    consoleBox.scrollTop = consoleBox.scrollHeight; 
}

// ---- FILE OPERATIONS (.scad) ----
btnSave.addEventListener('click', () => {
    const code = jar.toString(); 
    const blob = new Blob([code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    let safeFilename = activeProjectName.trim().replace(/\.scad$/i, '');
    if (!safeFilename) safeFilename = "untitled"; 
    
    link.download = `${safeFilename}.scad`;
    link.click();
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

        let nameFromDisk = file.name.replace(/\.scad$/i, '');
        activeProjectName = nameFromDisk;
        localStorage.setItem('openscad_project_name', activeProjectName);
        if (projectNameInput) projectNameInput.value = activeProjectName;
        updateWindowTitle();

        if (typeof btnPreview !== 'undefined' && !btnPreview.disabled) {
            logToConsole('Running automatic preview for loaded file...');
            btnPreview.click();
        }
    };
    reader.readAsText(file);
});

let wireframeMode = false;
btnWireframe.addEventListener('click', () => {
    wireframeMode = !wireframeMode; 
    
    if (wireframeMode) {
        btnWireframe.textContent = 'Wireframe';
        btnWireframe.style.background = '#444';     
    } else {
        btnWireframe.textContent = 'Solid';
        btnWireframe.style.background = '#007acc';  
    }

    if (currentMesh && currentMesh.material) {
        currentMesh.material.wireframe = wireframeMode;
    }
});

/*
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault(); 
        
        if (!btnPreview.disabled) {
            logToConsole('⌨️ Hotkey Triggered: [Ctrl + Enter]');
            btnPreview.click(); 
        }
    }
});
*/

// ==========================================================================
// ⌨️ GLOBAL APPLICATION HOTKEY COMMAND MAPPINGS
// ==========================================================================
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
        
        // 🛑 Intercept the keystroke so CodeJar doesn't inject a random newline!
        event.preventDefault(); 
        event.stopImmediatePropagation(); 
        
        if (!btnPreview.disabled) {
            logToConsole('⌨️ Hotkey Triggered: [Ctrl + Enter]');
            btnPreview.click(); 
        }
    }
}, true); // <--- CRITICAL FIX: 'true' executes this in the DOM Capture Phase!

btnColorTrigger.addEventListener('click', () => {
    modelColorInput.click();
});

modelColorInput.addEventListener('input', (event) => {
    const selectedHex = event.target.value;
    
    localStorage.setItem('openscad_model_color', selectedHex);
    btnColorTrigger.style.background = selectedHex;
    activeModelColor = parseInt(selectedHex.replace('#', '0x'), 16);
    
    if (currentMesh && currentMesh.material) {
        currentMesh.material.color.setHex(activeModelColor);
    }
});

async function initOpenSCAD() {
    logToConsole(`Build ${BUILD_NUMBER} - May 24, 2026`);
    logToConsole('System ready. Instantiating WASM...');
    
    const savedCode = localStorage.getItem('openscad_editor_cache');
    if (savedCode && savedCode.trim() !== "") {
        jar.updateCode(savedCode); 
        logToConsole('Restored draft layout from your last active session.');
    } else {
        const defaultCode = `linear_extrude(height = 4) {\n\ttext(\n\t\ttext = "Hello, world!", \n\t\tsize = 14, \n\t\tfont = "Liberation Sans:style=Bold", \n\t\thalign = "center", \n\t\tvalign = "center"\n\t);\n}`;
        jar.updateCode(defaultCode); 
        logToConsole('Seeded editor workspace with default starter geometry.');
    }

    if (typeof triggerLineUpdate === 'function') {
        triggerLineUpdate();
    }
    
    logToConsole('Loading browser-optimized OpenSCAD module...');
    try {
        const OpenSCADModule = await import('./libs/openscad.js');
        
        openSCADFactory = OpenSCADModule.default || OpenSCADModule.createOpenSCAD || OpenSCADModule;
        if (typeof openSCADFactory !== 'function') {
            throw new Error("OpenSCAD factory interface could not be resolved.");
        }

        await openSCADFactory();
        
        logToConsole('Loading typography packages from local repository...');
        
        const fontFiles = [
            'LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf',
            'LiberationMono-Regular.ttf', 'LiberationMono-Bold.ttf', 'LiberationMono-Italic.ttf', 'LiberationMono-BoldItalic.ttf',
            'LiberationSerif-Regular.ttf', 'LiberationSerif-Bold.ttf', 'LiberationSerif-Italic.ttf', 'LiberationSerif-BoldItalic.ttf'
        ];

        for (const fontName of fontFiles) {
            try {
                const fontUrl = `./fonts/${fontName}`;
                const response = await fetch(fontUrl);
                
                if (!response.ok) {
                    logToConsole(`⚠️ Skipping font: Could not pull ${fontName} from host.`);
                    continue;
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const fontData = new Uint8Array(arrayBuffer);
                
                fontCache[fontName] = fontData;
                logToConsole(`✔ Cached ${fontName} in memory (${fontData.byteLength} bytes)`);
            } catch (fontErr) {
                console.error(`Error processing font asset "${fontName}":`, fontErr);
            }
        }
        
        logToConsole('✅ Typography suite successfully cached in global memory!');
        logToConsole('OpenSCAD Engine ready! Alter code and click Preview freely.');

        btnPreview.disabled = false;
        
        logToConsole('Running initial boot preview...');
        btnPreview.click();
        
    } catch (err) {
        logToConsole(`Failed to initialize OpenSCAD: ${err.message}`);
        console.error(err);
    }
}

// ---- THE PREVIEW TRIGGER (F5 Style) ----
btnPreview.addEventListener('click', async () => {
    if (!openSCADFactory) {
        logToConsole('Error: OpenSCAD engine factory is not loaded yet.');
        return;
    }

    // 🔄 Clean off old visual error banners before running a fresh test build
    clearErrorHighlights();

    logToConsole('--- Generating Preview ---');
    const scriptCode = jar.toString(); 
    const errorLogs = [];

    try {
        logToConsole('Spawning fresh WASM runtime sandbox...');
        
        const instance = await new Promise((resolve, reject) => {
            try {
                const inst = openSCADFactory({
                    noInitialRun: true,
                    print: (text) => logToConsole(`[OpenSCAD]: ${text}`),
                    printErr: (text) => {
                        logToConsole(`[ERROR]: ${text}`);
                        errorLogs.push(text);
                    },
                    onRuntimeInitialized: () => resolve(inst)
                });

                if (inst && typeof inst.then === 'function') {
                    inst.then(resolve).catch(reject);
                }
            } catch (initError) {
                reject(initError);
            }
        });

        if (!instance || !instance.FS) {
            throw new Error("Failed to initialize virtual filesystem mapping on runtime spawn.");
        }

        try { instance.FS.mkdir('/fonts'); } catch(e) { /* ignore */ }
        
        for (const [fontName, fontData] of Object.entries(fontCache)) {
            instance.FS.writeFile(`/${fontName}`, fontData);
            instance.FS.writeFile(`/fonts/${fontName}`, fontData);
            
            if (instance.fonts && typeof instance.fonts.registerFont === 'function') {
                instance.fonts.registerFont(`/${fontName}`);
                instance.fonts.registerFont(`/fonts/${fontName}`);
            }
        }
        
        if (instance.ENV) {
            instance.ENV.OPENSCAD_FONTDIR = '/fonts';
        }
        logToConsole('Typography injected into fresh compilation sandbox.');

        instance.FS.writeFile('/input.scad', scriptCode);
        logToConsole('Code loaded into virtual memory.');

        logToConsole('Compiling geometry via WASM...');
        instance.callMain(['/input.scad', '-o', '/output.stl']);
        
        if (instance.FS.analyzePath('/output.stl').exists) {
            logToConsole('SUCCESS: 3D Mesh computed.');

            const stlData = instance.FS.readFile('/output.stl');

            currentStlBlob = new Blob([stlData], { type: 'application/sla' });
            const blobUrl = URL.createObjectURL(currentStlBlob);
            
            update3DModelViewer(blobUrl);
            placeholderText.style.display = 'none';
            
            logToConsole('3D View updated successfully.');
            btnExport.disabled = false;
        } else {
            logToConsole('ERROR: output.stl was not created. Check error stack above.');
            
            let detectedErrorLine = null;
            for (const logLine of errorLogs) {
                const lineMatch = logLine.match(/line\s+(\d+)/i);
                if (lineMatch) {
                    detectedErrorLine = parseInt(lineMatch[1], 10);
                    break;
                }
            }

            if (detectedErrorLine) {
                logToConsole(`👉 Suspected syntax break near Line ${detectedErrorLine}.`);
                // 🔥 TRIGGER HIGHLIGHT HOOK ON CRASH MATCH!
                highlightErrorLine(detectedErrorLine);
            }
        }

    } catch (error) {
        logToConsole(`Execution error: ${error.message || error}`);
        console.error(error);
    }
});

btnExport.addEventListener('click', () => {
    if (!currentStlBlob) {
        logToConsole('Nothing to export. Run Preview first.');
        return;
    }
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(currentStlBlob);
    link.download = 'openscad_model.stl';
    link.click();
    logToConsole('Exported openscad_model.stl successfully.');
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully!', reg.scope))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

let scene, camera, renderer, controls, currentMesh = null;
let workspaceInitialized = false;

function init3DWorkspace() {
    if (workspaceInitialized) return; 
    workspaceInitialized = true;

    const container = document.getElementById('viewer-3d');
    if (!container) return;

    const w = container.clientWidth || 500;
    const h = container.clientHeight || 500;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
    camera.position.set(40, 40, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio); 
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);

    /*
    const gridHelper = new THREE.GridHelper(400, 40, 0x007acc, 0x444444);
    gridHelper.position.y = -0.05; 
    scene.add(gridHelper);
    */


    // 1. Uniform gray grid sitting squarely at 0
    const gridHelper = new THREE.GridHelper(400, 40, 0x444444, 0x444444);
    gridHelper.position.y = 0;  
    scene.add(gridHelper);

    const gridHalfSize = 200;

    // A shared configuration that forces lines to stay crisp and overlay the grid
    const overlayConfig = (colorHex) => ({
        color: colorHex,
        depthTest: false, // Prevents lines from cutting into the grid structure
        transparent: true // Required in Three.js for depthTest overrides to cooperate cleanly
    });

    // --- Red X-Axis Line ---
    const xGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-gridHalfSize, 0, 0),
        new THREE.Vector3(gridHalfSize, 0, 0)
    ]);
    const xAxisLine = new THREE.Line(xGeometry, new THREE.LineBasicMaterial(overlayConfig(0xcc5252)));
    xAxisLine.renderOrder = 1; // Higher renderOrder draws it AFTER the grid helper
    scene.add(xAxisLine);

    // --- Green Y-Axis Line ---
    const yGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -gridHalfSize),
        new THREE.Vector3(0, 0, gridHalfSize)
    ]);
    const yAxisLine = new THREE.Line(yGeometry, new THREE.LineBasicMaterial(overlayConfig(0x52cc7a)));
    yAxisLine.renderOrder = 1;
    scene.add(yAxisLine);

    // --- Blue Z-Axis Line ---
    const zGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, gridHalfSize, 0)
    ]);
    const zAxisLine = new THREE.Line(zGeometry, new THREE.LineBasicMaterial(overlayConfig(0x007acc)));
    zAxisLine.renderOrder = 1;
    scene.add(zAxisLine);
    

    //const axesHelper = new THREE.AxesHelper(50);
    //axesHelper.rotation.x = -Math.PI / 2;    
    //scene.add(axesHelper);
    
    const compassContainer = document.createElement('div');
    compassContainer.style.position = 'absolute';
    compassContainer.style.top = '10px';
    compassContainer.style.right = '10px';
    compassContainer.style.width = '80px';
    compassContainer.style.height = '80px';
    compassContainer.style.zIndex = '100';
    compassContainer.style.pointerEvents = 'none'; 
    container.appendChild(compassContainer);

    const compassScene = new THREE.Scene();
    const compassCamera = new THREE.PerspectiveCamera(50, 1, 1, 100);
    
    const compassRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); 
    compassRenderer.setSize(80, 80);
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassContainer.appendChild(compassRenderer.domElement);

    const compassAxes = new THREE.AxesHelper(20);
    compassAxes.rotation.x = -Math.PI / 2;
    compassScene.add(compassAxes);

    // 🏷️ Create 2D HTML overlay labels with strict unique DOM IDs
    const create2DLabel = (id, text, color) => {
        // Clear old ones if setup re-runs to avoid stacking duplicates
        const oldEl = document.getElementById(id);
        if (oldEl) oldEl.remove();

        const el = document.createElement('div');
        el.id = id;
        el.innerText = text;
        el.style.position = 'absolute';
        el.style.color = color;
        el.style.fontFamily = 'Arial, sans-serif';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '10px'; 
        el.style.pointerEvents = 'none';
        el.style.transform = 'translate(-50%, -50%)'; // Perfect centering alignment
        compassContainer.appendChild(el);
        return el;
    };

    create2DLabel('compass-lbl-x', 'X', '#888888');
    create2DLabel('compass-lbl-y', 'Y', '#888888');
    create2DLabel('compass-lbl-z', 'Z', '#888888');

    // Define the local 3D endpoints of your 25-unit axes lines
    const endpointX = new THREE.Vector3(15, 0, 0);   // was 25
    const endpointY = new THREE.Vector3(0, 15, 0);   // was 25
    const endpointZ = new THREE.Vector3(0, 0, 15);   // was 25

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55); 
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.5); 
    keyLight.position.set(150, 200, 100);
    scene.add(keyLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.15); 
    topLight.position.set(0, 250, 0);
    scene.add(topLight);

    const headlight = new THREE.DirectionalLight(0xffffff, 0.45);
    headlight.position.set(0, 0, 1); 
    camera.add(headlight); 
    scene.add(camera); 
    
function animate() {
    requestAnimationFrame(animate);
    
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    
    const currentSize = new THREE.Vector2();
    renderer.getSize(currentSize);
    
    if (cw > 0 && ch > 0 && (currentSize.x !== cw || currentSize.y !== ch)) {
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
        renderer.setSize(cw, ch, true);
    }

    controls.update();
    renderer.render(scene, camera);

    if (compassCamera && compassRenderer) {
        compassCamera.position.copy(camera.position);
        compassCamera.position.sub(controls.target); 
        compassCamera.position.setLength(60); 
        compassCamera.lookAt(0, 0, 0);
        
        compassRenderer.render(compassScene, compassCamera);

        // 🔄 Safe, isolated 2D Label Updates
        // By checking if the actual DOM element exists, your engine will never crash.
        const xEl = document.getElementById('compass-lbl-x');
        const yEl = document.getElementById('compass-lbl-y');
        const zEl = document.getElementById('compass-lbl-z');

        if (xEl && yEl && zEl && compassAxes) {
            const width = 80;
            const height = 80;
            const tempV = new THREE.Vector3();

            compassScene.updateMatrixWorld(true);

            const updateLabelPosition = (element, x3d, y3d, z3d) => {
                // Set coordinate, apply world transform, project to screen
                tempV.set(x3d, y3d, z3d).applyMatrix4(compassAxes.matrixWorld);
                tempV.project(compassCamera);
                
                // Map to 80x80px bounding DIV pixels
                const pixelX = (tempV.x * 0.5 + 0.5) * width;
                const pixelY = (-tempV.y * 0.5 + 0.5) * height;
                
                element.style.left = `${pixelX}px`;
                element.style.top = `${pixelY}px`;
            };

            // Calculate endpoints natively on the fly
            updateLabelPosition(xEl, 25, 0, 0);
            updateLabelPosition(yEl, 0, 25, 0);
            updateLabelPosition(zEl, 0, 0, 25);
        }
    }
}
    animate();
}

function update3DModelViewer(blobUrl) {
    if (!workspaceInitialized) init3DWorkspace(); 

    let savedPosition = null;
    let savedTarget = null;
    
    if (currentMesh && camera && controls) {
        savedPosition = camera.position.clone();
        savedTarget = controls.target.clone();
    }

    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
        currentMesh = null;
    }

    const loader = new THREE.STLLoader();
    loader.load(blobUrl, (geometry) => {
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({ 
            color: activeModelColor, 
            roughness: 0.85,     
            metalness: 0.05,     
            wireframe: wireframeMode 
        });

        material.onBeforeCompile = (shader) => {
            const noiseGLSL = `
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                float proceduralNoise(vec3 p) {
                    return hash(p.xy + p.z);
                }
            `;

            shader.fragmentShader = noiseGLSL + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <opaque_fragment>`,
                `
                float noiseGrit = proceduralNoise(vViewPosition * 4.0) * 0.12;
                outgoingLight.rgb += vec3(noiseGrit - 0.06);
                #include <opaque_fragment>
                `
            );
        };
        
        currentMesh = new THREE.Mesh(geometry, material);
        
        currentMesh.position.set(0, 0, 0);
        currentMesh.rotation.x = -Math.PI / 2;

        scene.add(currentMesh);
        
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        if (savedPosition && savedTarget) {
            camera.position.copy(savedPosition);
            controls.target.copy(savedTarget);
        } else {
            const radius = geometry.boundingSphere.radius;
            const targetDistance = radius > 0 ? radius * 3.5 : 50; 

            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            controls.target.set(0, 0, 0); 
            camera.lookAt(0, 0, 0);
        }
        
        controls.update();
        
    }, undefined, (err) => console.error('[Viewer Error]:', err));
}

// ---- BOOTSTRAP APPLICATION ----
btnPreview.disabled = true;
btnExport.disabled = true;

initOpenSCAD();
init3DWorkspace();

btnWireframe.style.background = '#007acc'; 

// ==========================================================================
// ⚙️ SETTINGS OVERLAY CONTROLLER LOGIC
// ==========================================================================
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsOverlay = document.getElementById('settings-overlay');

function openSettingsMenu() {
    if (settingsOverlay) {
        settingsOverlay.classList.remove('hidden');
    }
}

function closeSettingsMenu() {
    if (settingsOverlay) {
        settingsOverlay.classList.add('hidden');
    }
}

if (btnSettings) {
    btnSettings.addEventListener('click', openSettingsMenu);
}

if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', closeSettingsMenu);
}

window.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) {
        closeSettingsMenu();
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
        logToConsole('⌨️ Hotkey Triggered: [Escape] - Closing Settings');
        closeSettingsMenu();
    }
});

if (projectNameInput) {
    projectNameInput.addEventListener('input', (event) => {
        let cleanedName = event.target.value.replace(/[/\\?%*:|"<>. ]/g, '_');
        activeProjectName = cleanedName || 'untitled';
        localStorage.setItem('openscad_project_name', activeProjectName);
        updateWindowTitle();
    });
    
    projectNameInput.addEventListener('blur', (event) => {
        if (!event.target.value.trim()) {
            event.target.value = 'untitled';
            activeProjectName = 'untitled';
            localStorage.setItem('openscad_project_name', 'untitled');
            updateWindowTitle();
        }
    });
}

if (editorFontSizeSelect) {
    editorFontSizeSelect.addEventListener('change', (event) => {
        const selectedSize = event.target.value;
        localStorage.setItem('openscad_editor_font_size', selectedSize);
        if (editorElement) editorElement.style.fontSize = selectedSize;
        if (lineNumbersDiv) lineNumbersDiv.style.fontSize = selectedSize; 
        logToConsole(`🔎 Editor text scaled to: ${selectedSize}`);
    });
}

if (btnCameraReset) {
    btnCameraReset.addEventListener('click', () => {
        if (currentMesh && currentMesh.geometry && camera && controls) {
            const geometry = currentMesh.geometry;
            const radius = geometry.boundingSphere.radius;
            const targetDistance = radius > 0 ? radius * 3.5 : 50;
            
            logToConsole('🎥 Resetting camera matrix to factory default frame parameters...');
            
            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            controls.target.set(0, 0, 0); 
            camera.lookAt(0, 0, 0);
            
            controls.update();
            closeSettingsMenu();
        }
    });
}

// ==========================================================================
// 📐 PERSISTENT DRAGGABLE SPLIT-PANE CONTROLLER
// ==========================================================================
const leftPaneContainer = document.getElementById('left-pane-container');
const panelSplitGutter = document.getElementById('panel-split-gutter');

if (leftPaneContainer && panelSplitGutter) {
    const cachedSplitValue = localStorage.getItem('openscad_layout_split') || '50';
    leftPaneContainer.style.width = `${cachedSplitValue}%`;

    panelSplitGutter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMouseMove(moveEvent) {
            let calculatedWidthPercent = (moveEvent.clientX / window.innerWidth) * 100;

            if (calculatedWidthPercent < 15) calculatedWidthPercent = 15;
            if (calculatedWidthPercent > 85) calculatedWidthPercent = 85;

            leftPaneContainer.style.width = `${calculatedWidthPercent}%`;
            
            localStorage.setItem('openscad_layout_split', Math.round(calculatedWidthPercent).toString());
            
            if (typeof renderer !== 'undefined' && renderer && typeof camera !== 'undefined' && camera) {
                const container3d = document.getElementById('viewer-3d');
                if (container3d) {
                    const currentWidth = container3d.clientWidth;
                    const currentHeight = container3d.clientHeight;
                    if (currentWidth > 0 && currentHeight > 0) {
                        camera.aspect = currentWidth / currentHeight;
                        camera.updateProjectionMatrix();
                        renderer.setSize(currentWidth, currentHeight, true);
                    }
                }
            }
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'text';
            
            logToConsole(`📐 Split layout updated and cached to: ${localStorage.getItem('openscad_layout_split')}%`);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function createCompassLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Render bold, clean letters
    ctx.font = 'Bold 90px Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture, 
        transparent: true,
        depthTest: false // Ensures letters sit proudly on top of the thin lines
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4.5, 4.5, 1); // Perfect scaling size for a length-25 helper
    return sprite;
}
