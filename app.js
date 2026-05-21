// Dom Elements
const editor = document.getElementById('editor');
const consoleBox = document.getElementById('console');
const btnSave = document.getElementById('btn-save');
const fileLoad = document.getElementById('file-load');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const viewer3d = document.getElementById('3d-viewer');
const placeholderText = document.getElementById('placeholder-text');

// OpenSCAD WASM Instance variable
let openSCADInstance = null;
let currentStlBlob = null; // Stores the rendered STL for exporting

// Helper to log to our UI console
function logToConsole(message) {
    consoleBox.textContent += `\n${message}`;
    consoleBox.scrollTop = consoleBox.scrollHeight; // Auto scroll to bottom
}

// ---- FILE OPERATIONS (.scad) ----

// Save local .scad file
btnSave.addEventListener('click', () => {
    const code = editor.value;
    const blob = new Blob([code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'model.scad';
    link.click();
    logToConsole('Saved model.scad successfully.');
});

// Load local .scad file
fileLoad.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        editor.value = e.target.result;
        logToConsole(`Loaded file: ${file.name}`);
    };
    reader.readAsText(file);
});


// ---- OPENSCAD WASM INITIALIZATION ----

async function initOpenSCAD() {
    logToConsole('Downloading OpenSCAD WASM engine from CDN...');
    try {
        const OpenSCADModule = await import('https://unpkg.com/@openscad/openscad-wasm@2024.1.25/dist/openscad.js');
        
        openSCADInstance = await OpenSCADModule.default({
            locateFile: (path) => `https://unpkg.com/@openscad/openscad-wasm@2024.1.25/dist/${path}`,
            print: (text) => logToConsole(`[OpenSCAD]: ${text}`),
            printErr: (text) => logToConsole(`[ERROR]: ${text}`)
        });

        logToConsole('OpenSCAD WASM Engine fully loaded and ready!');
        btnPreview.disabled = false;
    } catch (err) {
        logToConsole(`Failed to initialize OpenSCAD: ${err.message}`);
        console.error(err);
    }
}


// ---- THE PREVIEW TRIGGER (F5 Style) ----

btnPreview.addEventListener('click', async () => {
    if (!openSCADInstance) {
        logToConsole('Error: OpenSCAD engine is not ready yet.');
        return;
    }

    logToConsole('--- Generating Preview ---');
    const scriptCode = editor.value;

    try {
        // 1. Write the text from our editor into the WASM virtual file system
        openSCADInstance.FS.writeFile('input.scad', scriptCode);

        // 2. Execute OpenSCAD to compile into an STL in virtual memory
        openSCADInstance.callMain(['input.scad', '-o', 'output.stl']);
        
        // 3. Verify if the file was created successfully
        if (openSCADInstance.FS.analyzePath('output.stl').exists) {
            logToConsole('SUCCESS: Mesh generated.');

            // 4. Read the raw binary data out of the WASM file system
            const stlData = openSCADInstance.FS.readFile('output.stl');

            // 5. Turn that raw data into a usable object browser URL
            currentStlBlob = new Blob([stlData], { type: 'model/stl' });
            const blobUrl = URL.createObjectURL(currentStlBlob);

            // 6. Feed the URL to our 3D viewer and hide placeholder text
            viewer3d.src = blobUrl;
            placeholderText.style.display = 'none';
            
            logToConsole('3D View updated successfully.');
            btnExport.disabled = false; // Enable export now that we have a solid mesh
        } else {
            logToConsole('ERROR: output.stl was not created. Check syntax errors.');
        }

    } catch (error) {
        logToConsole(`Execution error: ${error.message}`);
    }
});


// ---- THE EXPORT TRIGGER (Save STL) ----

btnExport.addEventListener('click', () => {
    if (!currentStlBlob) {
        logToConsole('Nothing to export. Run Preview first.');
        return;
    }
    
    // Download the already generated blob
    const link = document.createElement('a');
    link.href = URL.createObjectURL(currentStlBlob);
    link.download = 'openscad_model.stl';
    link.click();
    logToConsole('Exported openscad_model.stl successfully.');
});


// Start initializing the engine immediately when the page loads
btnPreview.disabled = true;
btnExport.disabled = true;
initOpenSCAD();
