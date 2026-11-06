// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * State Management Core Configuration
 */
const AppState = {
    questions: [],
    fullQuestions: [],
    shuffledQuestions: [], 
    currentIndex: 0,
    userAnswers: {}, 
    bookmarks: [],
    startTime: null,
    timerInterval: null,
    elapsedSeconds: 0,
    mode: 'exam',
    randomize: true,
    smartRandomize: false, // New Feature State
    storageKey: 'EduQuizPro_SessionData',

    // Verification Logging Metrics
    totalPagesScanned: 0,
    totalQuestionsFound: 0,
    questionsProcessed: 0,
    questionsFailed: 0
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadPreferences();
    setupEventListeners();
    checkActiveSession();
});

function initTheme() {
    const savedTheme = localStorage.getItem('eduquiz-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

function loadPreferences() {
    const savedSmart = localStorage.getItem('eduquiz-smart-random') || 'no';
    document.getElementById('smart-randomize').value = savedSmart;
}

function setupEventListeners() {
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('eduquiz-theme', newTheme);
        document.getElementById('theme-toggle').innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

    document.getElementById('smart-randomize').addEventListener('change', (e) => {
        localStorage.setItem('eduquiz-smart-random', e.target.value);
    });

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('pdf-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handlePDFFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePDFFile(e.target.files[0]);
        }
    });

    document.getElementById('prev-btn').addEventListener('click', navigatePrevious);
    document.getElementById('next-btn').addEventListener('click', navigateNext);
    document.getElementById('skip-btn').addEventListener('click', navigateNext);
    document.getElementById('bookmark-btn').addEventListener('click', toggleBookmark);
    document.getElementById('submit-quiz-btn').addEventListener('click', submitQuiz);
    document.getElementById('restart-btn').addEventListener('click', resetToUploadScreen);
    document.getElementById('retry-btn').addEventListener('click', () => retryQuiz(false));
    document.getElementById('retry-incorrect-btn').addEventListener('click', () => retryQuiz(true));

    document.getElementById('start-quiz-confirmed-btn').addEventListener('click', () => {
        initializeQuizSession();
    });

    document.getElementById('search-questions').addEventListener('input', (e) => {
        filterNavigationGrid(e.target.value.trim());
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderReviewMode(e.target.getAttribute('data-filter'));
        });
    });

    document.getElementById('export-pdf').addEventListener('click', exportResultsToPDF);
    document.getElementById('export-excel').addEventListener('click', exportResultsToExcel);
}

function switchView(viewId) {
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');
}

/**
 * PDF Parse Management & Data Mining Logic
 */
async function handlePDFFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Invalid format error. Please upload a structured PDF layout file.');
        return;
    }
    
    AppState.totalPagesScanned = 0;
    AppState.totalQuestionsFound = 0;
    AppState.questionsProcessed = 0;
    AppState.questionsFailed = 0;
    
    document.getElementById('loading-spinner-wrapper').classList.remove('hidden');
    document.getElementById('validation-summary-block').classList.add('hidden');
    switchView('loading-screen');
    updateLoadingProgress(5, 'Initializing PDF parser layout matrix...');

    try {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                
                AppState.totalPagesScanned = pdf.numPages;
                updateLoadingProgress(20, `Processing text layer over ${pdf.numPages} pages...`);
                
                let parsedQuestions = await extractQuizData(pdf);
                
                if (!parsedQuestions || parsedQuestions.length === 0) {
                    updateLoadingProgress(40, 'No plain text found. Running OCR analysis layer (This might take a while)...');
                    parsedQuestions = await processOCRAlternative(pdf);
                }
                
                if (!parsedQuestions || parsedQuestions.length === 0) {
                    throw new Error("Could not parse or identify valid multiple-choice patterns containing clear yellow highlighted options, an 'Answer: X' key, or an 'A: (b) ...' key inside this document.");
                }
                
                AppState.questions = parsedQuestions;
                AppState.fullQuestions = parsedQuestions;
                AppState.mode = document.getElementById('quiz-mode').value;
                AppState.randomize = document.getElementById('randomize-questions').value === 'yes';
                AppState.smartRandomize = document.getElementById('smart-randomize').value === 'yes';
                
                showValidationSummaryReport();
            } catch (err) {
                console.error(err);
                alert(`Processing Failed: ${err.message}`);
                resetToUploadScreen();
            }
        };
        fileReader.readAsArrayBuffer(file);
    } catch (error) {
        console.error(error);
        alert('Error parsing document pipeline framework.');
        resetToUploadScreen();
    }
}

function updateLoadingProgress(percent, label, sublabel = 'Analyzing structural node grids') {
    document.getElementById('loading-progress').style.width = `${percent}%`;
    document.getElementById('loading-status').innerText = label;
    document.getElementById('loading-substatus').innerText = sublabel;
}

function showValidationSummaryReport() {
    document.getElementById('loading-spinner-wrapper').classList.add('hidden');
    document.getElementById('validation-summary-block').classList.remove('hidden');
    document.getElementById('val-pages-scanned').innerText = AppState.totalPagesScanned;
    document.getElementById('val-questions-found').innerText = AppState.totalQuestionsFound;
    document.getElementById('val-questions-processed').innerText = AppState.questionsProcessed;
    document.getElementById('val-questions-failed').innerText = AppState.questionsFailed;
}


/**
 * Arabic / RTL support
 * PDFs generated for Arabic are often stored in visual order, and different PDF readers
 * return the text as: (A) correct logical order, (B) every character reversed, or
 * (C) correct letters but reversed word order. We detect which one we got for the whole
 * document and repair it so the quiz parser always sees clean logical text.
 */
const ARABIC_RE = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const BIDI_CTRL_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g;
const AR_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

function isRtlText(t) { return ARABIC_RE.test(t || ''); }

function arLetterIndex(ch) {
    if ('أاإآ'.includes(ch)) return 0;
    if (ch === 'ب') return 1;
    if (ch === 'ج') return 2;
    if (ch === 'د') return 3;
    return 4; // ه / هـ
}

function reverseArabicChars(s) {
    const mirror = { '(': ')', ')': '(', '[': ']', ']': '[', '«': '»', '»': '«' };
    return [...s].reverse().map(c => mirror[c] || c).join('')
        .replace(/[0-9A-Za-z\u0660-\u0669]+/g, m => [...m].reverse().join(''));
}

function reverseArabicWords(s) {
    let r = s.split(/\s+/).reverse().join(' ');
    // punctuation that ended up in front of a word goes back behind it
    return r.replace(/(^|\s)([:：،؛؟?]+)(\S+)/g, '$1$3$2');
}

function detectArabicMode(rows) {
    let startsAL = 0, endsLA = 0, ansStart = 0, ansEnd = 0;
    rows.forEach(r => {
        if (!ARABIC_RE.test(r.line)) return;
        const t = r.line.normalize('NFKC').replace(BIDI_CTRL_RE, '');
        t.split(/\s+/).forEach(w => {
            const word = w.replace(/[^\u0621-\u064A]/g, '');
            if (word.length >= 4) {
                if (word.startsWith('ال')) startsAL++;
                if (word.endsWith('لا')) endsLA++;
            }
        });
        if (/^(?:الإجابة|الاجابة)\s*[:：]\s*\S/.test(t)) ansStart++;
        if (/(?:الإجابة|الاجابة)\s*[:：]?\s*$/.test(t)) ansEnd++;
    });
    if (endsLA > startsAL) return 'chars';      // case B
    if (ansEnd > ansStart) return 'words';      // case C
    return 'logical';                           // case A
}

function fixArabicDocument(rows) {
    const mode = detectArabicMode(rows);
    console.log('[EduQuiz] Arabic text mode detected:', mode);
    return rows.map(r => {
        let t = r.line.replace(BIDI_CTRL_RE, '');
        if (ARABIC_RE.test(t)) {
            if (mode === 'chars') t = reverseArabicChars(t);
            else if (mode === 'words') t = reverseArabicWords(t);
            t = t.normalize('NFKC');
        }
        return { line: t.replace(/\s+/g, ' ').trim(), highlighted: r.highlighted };
    });
}

function buildArabicRows(items, highlightBoxes, canvasHighlights) {
    const rows = [];
    let cur = null;
    items.forEach(it => {
        if (typeof it.str !== 'string') return;
        const y = it.transform[5];
        if (!cur || Math.abs(y - cur.y) > 3) {
            cur = { y, text: '', highlighted: false };
            rows.push(cur);
        }
        if (cur.text && it.str && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += ' ';
        if (it.str.trim() && checkCoordinateHighlightMatch(it, highlightBoxes, canvasHighlights)) cur.highlighted = true;
        cur.text += it.str;
    });
    return rows.filter(r => r.text.trim()).map(r => ({ line: r.text, highlighted: r.highlighted, arabic: true }));
}

async function extractQuizData(pdf) {
    let completeTextLog = [];
    let arabicDocFound = false;
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let visualEst = Math.floor(20 + ((pageNum / pdf.numPages) * 30));
        updateLoadingProgress(visualEst, `Reading text frames on page ${pageNum} / ${pdf.numPages}...`, 'Processing deep page layout grids elements.');
        
        const annotations = await page.getAnnotations();
        let highlightBoxes = [];
        
        annotations.forEach(anno => {
            if (anno.subtype === 'Highlight') {
                highlightBoxes.push(anno.rect); 
            }
        });
        
        let canvasHighlights = [];
        if (highlightBoxes.length === 0) {
            canvasHighlights = await scanCanvasForYellowHighlights(page);
        }
        
        // Arabic pages use their own line builder (keeps the PDF's own item order)
        if (textContent.items.some(it => ARABIC_RE.test(it.str || ''))) {
            arabicDocFound = true;
            completeTextLog = completeTextLog.concat(buildArabicRows(textContent.items, highlightBoxes, canvasHighlights));
            continue;
        }

        let lastY = null;
        let pageStrings = [];
        
        textContent.items.forEach(item => {
            let itemText = item.str;
            if (!itemText.trim()) return;
            
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageStrings.push("\n");
            }
            
            let isHighlighted = checkCoordinateHighlightMatch(item, highlightBoxes, canvasHighlights);
            pageStrings.push({ text: itemText, highlighted: isHighlighted, transform: item.transform });
            lastY = item.transform[5];
        });
        
        completeTextLog = completeTextLog.concat(groupTokensIntoLines(pageStrings));
    }
    if (arabicDocFound) completeTextLog = fixArabicDocument(completeTextLog);
    return compileMCQStructure(completeTextLog);
}

async function scanCanvasForYellowHighlights(page) {
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    
    let yellowZones = [];
    const skip = 4;
    for (let y = 0; y < canvas.height; y += skip) {
        for (let x = 0; x < canvas.width; x += skip) {
            let idx = (y * canvas.width + x) * 4;
            let r = pixels[idx];
            let g = pixels[idx + 1];
            let b = pixels[idx + 2];
            
            if (r > 210 && g > 210 && b < 120) {
                yellowZones.push({ x: x / 1.5, y: (canvas.height - y) / 1.5 });
            }
        }
    }
    return yellowZones;
}

function checkCoordinateHighlightMatch(item, highlightBoxes, canvasHighlights) {
    const tx = item.transform;
    const x = tx[4];
    const y = tx[5];
    const w = item.width || 0;
    const h = item.height || Math.abs(tx[3]) || 10;
    // Probe points: start, middle and end of the text, at mid x-height
    const cy = y + h * 0.3;
    const probes = [x + 1, x + w / 2, x + Math.max(w - 1, 1)];
    const tol = 1.5;

    for (let box of highlightBoxes) {
        const x0 = Math.min(box[0], box[2]), x1 = Math.max(box[0], box[2]);
        const y0 = Math.min(box[1], box[3]), y1 = Math.max(box[1], box[3]);
        if (cy >= y0 - tol && cy <= y1 + tol && probes.some(px => px >= x0 - tol && px <= x1 + tol)) {
            return true;
        }
    }

    if (canvasHighlights && canvasHighlights.length > 0) {
        const matchRadius = 8;
        return canvasHighlights.some(pt => Math.abs(pt.x - x) < matchRadius && Math.abs(pt.y - y) < matchRadius);
    }
    return false;
}

function tidyMathSpacing(t) {
    // Remove stray spaces PDF text extraction puts around subscripts/superscripts (e.g. "x ₜ ₋₁" -> "xₜ₋₁")
    return t.replace(/\s+(?=[\u2080-\u209F\u00B2\u00B3\u00B9\u2070-\u2079\u207A-\u207F\u1D62\u2C7C])/g, '')
            .replace(/([\u2080-\u209F\u2070-\u207F\u1D62\u2C7C])\s+(?=[\u2080-\u209F\u2070-\u207F])/g, '$1');
}

function groupTokensIntoLines(pageStrings) {
    let lines = [];
    let currentLineText = "";
    let currentLineHighlighted = false;
    
    pageStrings.forEach(token => {
        if (token === "\n") {
            if (currentLineText.trim().length > 0) {
                lines.push({ line: tidyMathSpacing(currentLineText.trim()), highlighted: currentLineHighlighted });
            }
            currentLineText = "";
            currentLineHighlighted = false;
        } else {
            currentLineText += " " + token.text;
            if (token.highlighted) currentLineHighlighted = true;
        }
    });
    if (currentLineText.trim().length > 0) {
        lines.push({ line: tidyMathSpacing(currentLineText.trim()), highlighted: currentLineHighlighted });
    }
    return lines;
}

function compileMCQStructure(rawLines) {
    let questions = [];
    let currentQuestion = null;
    let lastNum = 0;
    let answerSeen = false;
    // Options on their own line: "A.", "a)", "(a)", optionally preceded by a bullet
    const optionPattern = /^[^\w(]*\(?([A-Fa-f])[\.\)]\s*(.*)/;
    // Several options on ONE line, e.g. "(a) True (b) False"
    const inlineOptionsPattern = /^\(([A-Fa-f])\)\s*\S.*\(([A-Fa-f])\)\s*\S/;
    const questionPattern = /^(Q?)(\d+)[\.\)]\s+(.*)/i;
    // Answer keys: "Answer: B", "✔ Answer: B", "A: (b) False. Correct version: ..."
    const answerPattern = /^.{0,8}?Answer\s*:\s*\(?([A-Fa-f])\b/i;
    const shortAnswerPattern = /^A\s*:\s*\(?([A-Fa-f])\)?(?=[\s\.\):,;]|$)\s*(.*)/;
    const noisePattern = /^\d{1,3}$/;
    const headingPattern = /^(Lecture|Chapter|Part|Section|Unit|Sheet)\b/i;
    // Arabic patterns
    const arLetter = '[أإآابجدهـ]';
    const arQuestionPattern = /^\.?\s*(\d{1,3})\s*[\.\)\-]?\s+(\S.*)/;
    const arOptionPattern = new RegExp('^\\.?\\s*\\(?(' + arLetter + ')\\s*[\\.\\)\\-]\\s*(\\S.*)');
    const arOptionPattern2 = new RegExp('^\\.\\s*(' + arLetter + ')\\s+(\\S.*)');
    const arAnswerPattern = new RegExp('^(?:الإجابة|الاجابة|الجواب|الإجابة الصحيحة|الاجابة الصحيحة)\\s*[:：]\\s*\\(?(' + arLetter + ')\\)?(?=[\\s\\.\\):,;،]|$)\\s*(.*)');
    const arLectureHeading = /^(المحاضرة|الفصل|الباب|الوحدة|الجزء)\s+\S+\s*[:：]/;
    const arSectionHeading = /^(أسئلة|اسئلة)\s+(الاختيار|اختيار|صح|الصح|المقال|مقالية|التوصيل)/;

    // PDF text extraction sometimes glues the next question onto the previous line
    // ("...stage.Q12. [L1] ..." or "A: (a) TrueQ24. [L2] ..."), so split those apart.
    let compiledLines = [];
    rawLines.forEach(item => {
        const parts = item.line.split(/\s*(?=Q\d{1,3}\.\s+\[L\d\])|(?<=\S)(?=Q\d{1,3}\.\s)/);
        parts.forEach(p => { if (p.trim()) compiledLines.push({ line: p.trim(), highlighted: item.highlighted }); });
    });

    function finalize() {
        if (!currentQuestion) return;
        AppState.totalQuestionsFound++;
        if (currentQuestion.options.length > 0) {
            if (currentQuestion.correctIdx === -1 || currentQuestion.correctIdx >= currentQuestion.options.length) {
                AppState.questionsFailed++;
                currentQuestion.correctIdx = 0;
            }
            currentQuestion.correctAnswer = currentQuestion.options[currentQuestion.correctIdx];
            currentQuestion.explanation = (currentQuestion.explanation || '').trim();
            delete currentQuestion.correctIdx;
            delete currentQuestion.explicitAnswer;
            questions.push(currentQuestion);
            AppState.questionsProcessed++;
        } else {
            AppState.questionsFailed++;
        }
        currentQuestion = null;
        answerSeen = false;
    }

    compiledLines.forEach(item => {
        let text = item.line.trim();
        if (!text || noisePattern.test(text)) return;

        const isAr = ARABIC_RE.test(text);
        if (isAr) {
            // Section / lecture headings
            if (arLectureHeading.test(text) || arSectionHeading.test(text)) {
                finalize();
                if (arLectureHeading.test(text)) lastNum = 0;
                return;
            }
            // Arabic answer key: "الإجابة: أ" (optionally followed by a note)
            const arAns = text.match(arAnswerPattern);
            if (arAns && currentQuestion && currentQuestion.options.length > 0 && !answerSeen) {
                currentQuestion.correctIdx = arLetterIndex(arAns[1]);
                currentQuestion.explicitAnswer = true;
                answerSeen = true;
                currentQuestion.explanation = (arAns[2] || '').replace(/^[\s()\-–:،]+/, '').replace(/[\s()]+$/, '');
                return;
            }
        }

        // Explicit answer key line (takes priority over highlight detection)
        let aMatch = text.match(answerPattern);
        let sMatch = !aMatch && text.match(shortAnswerPattern);
        if ((aMatch || sMatch) && currentQuestion && currentQuestion.options.length > 0 && !answerSeen) {
            currentQuestion.correctIdx = (aMatch || sMatch)[1].toUpperCase().charCodeAt(0) - 65;
            currentQuestion.explicitAnswer = true;
            answerSeen = true;
            if (sMatch) {
                // keep any "Correct version: ..." note as the explanation
                let note = sMatch[2].replace(/^(True|False)\.?\s*/i, '').replace(/^Correct version:\s*/i, '');
                currentQuestion.explanation = note;
            }
            return;
        }

        let qMatch, oMatch;
        if (isAr) {
            const am = text.match(arQuestionPattern);
            qMatch = am ? [null, '', am[1], am[2]] : null;
            const om = text.match(arOptionPattern) || text.match(arOptionPattern2);
            oMatch = om ? [null, om[1], om[2]] : null;
        } else {
            qMatch = text.match(questionPattern);
            oMatch = text.match(optionPattern);
        }
        const isNewQuestion = qMatch && !oMatch &&
            (qMatch[1] !== '' || parseInt(qMatch[2], 10) === 1 || parseInt(qMatch[2], 10) === lastNum + 1);

        if (!isNewQuestion && !answerSeen && headingPattern.test(text) && (!currentQuestion || currentQuestion.options.length > 0)) {
            finalize();
            lastNum = 0;
            return;
        }

        if (isNewQuestion) {
            finalize();
            lastNum = parseInt(qMatch[2], 10);
            let qText = qMatch[3];
            let level = null;
            const lv = qText.match(/^\[(L\d+)\]\s*/);
            if (lv) { level = lv[1]; qText = qText.slice(lv[0].length); }
            currentQuestion = {
                id: questions.length,
                questionText: qText,
                level: level,
                options: [],
                correctAnswer: null,
                explanation: '',
                correctIdx: -1
            };
        } else if (answerSeen) {
            // wrapped lines of the explanation
            if (currentQuestion) currentQuestion.explanation += ' ' + text;
        } else if (currentQuestion && !isAr && inlineOptionsPattern.test(text)) {
            const re = /\(([A-Fa-f])\)\s*([^()]*?)(?=\s*\([A-Fa-f]\)|\s*$)/g;
            let m;
            while ((m = re.exec(text)) !== null) {
                currentQuestion.options.push(m[2].trim());
                if (item.highlighted && currentQuestion.correctIdx === -1 && false) { /* line-level highlight can't pick one option */ }
            }
        } else if (oMatch && currentQuestion) {
            currentQuestion.options.push(oMatch[2].trim());
            if (item.highlighted && currentQuestion.correctIdx === -1) {
                currentQuestion.correctIdx = currentQuestion.options.length - 1;
            }
        } else if (currentQuestion) {
            if (currentQuestion.options.length === 0) {
                currentQuestion.questionText += " " + text;
            } else {
                let lastIdx = currentQuestion.options.length - 1;
                currentQuestion.options[lastIdx] += " " + text;
                if (item.highlighted && currentQuestion.correctIdx === -1) {
                    currentQuestion.correctIdx = lastIdx;
                }
            }
        }
    });

    finalize();
    return questions;
}

async function processOCRAlternative(pdf) {
    updateLoadingProgress(50, 'Running OCR Engine Core...', 'Decoding image canvas layout grids.');
    let compiledOCRText = [];
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); 
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        let canvasHighlights = await scanCanvasForYellowHighlights(page);
        const response = await Tesseract.recognize(canvas, 'eng');
        const lines = response.data.lines || [];
        
        lines.forEach(lineObj => {
            let lineText = lineObj.text.trim();
            if (!lineText) return;
            let isHighlighted = false;
            if (canvasHighlights.length > 0 && lineObj.bbox) {
                let box = lineObj.bbox; 
                isHighlighted = canvasHighlights.some(pt =>
                    pt.x * 2.0 >= box.x0 && pt.x * 2.0 <= box.x1 && 
                    (canvas.height - (pt.y * 2.0)) >= box.y0 && (canvas.height - (pt.y * 2.0)) <= box.y1
                );
            }
            compiledOCRText.push({ line: lineText, highlighted: isHighlighted });
        });
        
        let percentComplete = Math.floor(50 + ((pageNum / pdf.numPages) * 45));
        updateLoadingProgress(percentComplete, `OCR extraction running on page ${pageNum}...`, 'Parsing pixel matrices text tracks.');
    }
    return compileMCQStructure(compiledOCRText);
}

/**
 * Helper to Handle Option Shuffling & Smart Positioning Logic
 */
function generateShuffledOptions(options, smartMode, correctAnswer) {
    if (options.length <= 1) return [...options];
    
    let originalIdx = options.indexOf(correctAnswer);
    let newOpts = [...options];
    let attempts = 0;
    
    do {
        // Standard Fisher-Yates shuffle
        for (let i = newOpts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newOpts[i], newOpts[j]] = [newOpts[j], newOpts[i]];
        }
        attempts++;
        if (!smartMode) break; // Standard shuffle completed
        
        // Smart Mode: Keep shuffling if correct answer is in original spot (max 20 attempts for safety)
    } while (smartMode && newOpts.indexOf(correctAnswer) === originalIdx && attempts < 20);
    
    return newOpts;
}

/**
 * Quiz Runtime Engine Workspace Implementation
 */
function initializeQuizSession() {
    AppState.currentIndex = 0;
    AppState.userAnswers = {};
    AppState.bookmarks = [];
    AppState.elapsedSeconds = 0;
    AppState.smartRandomize = document.getElementById('smart-randomize').value === 'yes';

    // Map questions and inject shuffled display options
    let processedQuestions = AppState.questions.map((q, idx) => {
        return {
            ...q,
            originalIndex: idx,
            displayOptions: generateShuffledOptions(q.options, AppState.smartRandomize, q.correctAnswer)
        };
    });
    
    if (AppState.randomize) {
        AppState.shuffledQuestions = processedQuestions;
        for (let i = AppState.shuffledQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [AppState.shuffledQuestions[i], AppState.shuffledQuestions[j]] = 
            [AppState.shuffledQuestions[j], AppState.shuffledQuestions[i]];
        }
    } else {
        AppState.shuffledQuestions = processedQuestions;
    }
    
    switchView('quiz-screen');
    document.getElementById('badge-mode').innerText = AppState.mode === 'exam' ? 'Exam Mode' : 'Practice Mode';
    
    if (AppState.mode === 'exam') {
        startExamTimer();
    } else {
        document.getElementById('quiz-timer').innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Practice Track`;
    }
    
    renderCurrentQuestion();
    buildNavigationGrid();
    saveStateToLocalStorage();
}

function startExamTimer() {
    if (AppState.timerInterval) clearInterval(AppState.timerInterval);
    AppState.startTime = Date.now();
    AppState.timerInterval = setInterval(() => {
        AppState.elapsedSeconds++;
        let hrs = String(Math.floor(AppState.elapsedSeconds / 3600)).padStart(2, '0');
        let mins = String(Math.floor((AppState.elapsedSeconds % 3600) / 60)).padStart(2, '0');
        let secs = String(AppState.elapsedSeconds % 60).padStart(2, '0');
        document.getElementById('quiz-timer').innerHTML = `<i class="fa-regular fa-clock"></i> ${hrs}:${mins}:${secs}`;
    }, 1000);
}

function renderCurrentQuestion() {
    if (AppState.shuffledQuestions.length === 0) return;
    const q = AppState.shuffledQuestions[AppState.currentIndex];
    
    const rtl = isRtlText(q.questionText);
    const qEl = document.getElementById('question-text');
    qEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    qEl.style.textAlign = rtl ? 'right' : 'left';
    qEl.innerText = rtl
        ? `${AppState.currentIndex + 1}. ${q.questionText}`
        : `Q${AppState.currentIndex + 1}${q.level ? ' [' + q.level + ']' : ''}: ${q.questionText}`;
    
    const container = document.getElementById('options-container');
    container.innerHTML = "";
    
    const feedbackBox = document.getElementById('instant-feedback');
    feedbackBox.classList.add('hidden');
    
    const prefixes = rtl ? AR_LETTERS : ['A', 'B', 'C', 'D', 'E', 'F'];
    const savedAnswer = AppState.userAnswers[q.originalIndex];
    
    // Iterating over displayOptions rather than original options
    q.displayOptions.forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = `option-item ${savedAnswer === opt ? 'selected' : ''}`;
        item.setAttribute('dir', rtl ? 'rtl' : 'ltr');
        item.innerHTML = `<span class="option-prefix">${prefixes[idx] || idx}</span> <span class="option-body-text"></span>`;
        item.querySelector('.option-body-text').innerText = opt;
        
        item.addEventListener('click', () => selectOption(opt, q));
        container.appendChild(item);
    });
    
    if (AppState.mode === 'practice' && savedAnswer) {
        revealPracticeFeedback(savedAnswer, q);
    }
    
    const progressPercent = Math.floor(((AppState.currentIndex + 1) / AppState.shuffledQuestions.length) * 100);
    document.getElementById('quiz-progress').style.width = `${progressPercent}%`;
    document.getElementById('progress-percentage').innerText = `${progressPercent}% Completed`;
    
    document.getElementById('submit-quiz-btn').classList.toggle('hidden', AppState.currentIndex !== AppState.shuffledQuestions.length - 1);
    document.getElementById('next-btn').classList.toggle('hidden', AppState.currentIndex === AppState.shuffledQuestions.length - 1);
    
    const bkmkBtn = document.getElementById('bookmark-btn');
    bkmkBtn.classList.toggle('active', AppState.bookmarks.includes(q.originalIndex));
}

function selectOption(selectedOpt, questionObj) {
    AppState.userAnswers[questionObj.originalIndex] = selectedOpt;
    document.querySelectorAll('.option-item').forEach(el => {
        const txt = el.querySelector('.option-body-text').innerText;
        el.classList.toggle('selected', txt === selectedOpt);
    });
    
    if (AppState.mode === 'practice') {
        revealPracticeFeedback(selectedOpt, questionObj);
    }
    
    buildNavigationGrid();
    saveStateToLocalStorage();
}

function revealPracticeFeedback(selectedOpt, questionObj) {
    const box = document.getElementById('instant-feedback');
    box.classList.remove('hidden', 'correct', 'incorrect');
    box.setAttribute('dir', isRtlText(questionObj.questionText) ? 'rtl' : 'ltr');
    if (selectedOpt === questionObj.correctAnswer) {
        box.classList.add('correct');
        box.innerText = isRtlText(questionObj.questionText)
            ? "إجابة صحيحة! أحسنت." + (questionObj.explanation ? "\n" + questionObj.explanation : "")
            : "Correct Choice! Outstanding work." + (questionObj.explanation ? "\n" + questionObj.explanation : "");
    } else {
        box.classList.add('incorrect');
        box.setAttribute('dir', isRtlText(questionObj.questionText) ? 'rtl' : 'ltr');
        box.innerText = isRtlText(questionObj.questionText)
            ? `إجابة خاطئة. الإجابة الصحيحة هي: ${questionObj.correctAnswer}` + (questionObj.explanation ? "\nملاحظة: " + questionObj.explanation : "")
            : `Incorrect choice. The exact correct option is: ${questionObj.correctAnswer}` + (questionObj.explanation ? "\nCorrect version: " + questionObj.explanation : "");
    }
}

function buildNavigationGrid() {
    const grid = document.getElementById('navigator-grid');
    grid.innerHTML = "";
    
    document.getElementById('navigator-count').innerText = `${Object.keys(AppState.userAnswers).length}/${AppState.shuffledQuestions.length}`;
    
    AppState.shuffledQuestions.forEach((q, idx) => {
        const block = document.createElement('div');
        block.className = "nav-block";
        block.innerText = idx + 1;
        
        if (idx === AppState.currentIndex) block.classList.add('current');
        if (AppState.userAnswers[q.originalIndex] !== undefined) block.classList.add('answered');
        if (AppState.bookmarks.includes(q.originalIndex)) block.classList.add('bookmarked');
        
        block.addEventListener('click', () => {
            AppState.currentIndex = idx;
            renderCurrentQuestion();
            buildNavigationGrid();
        });
        grid.appendChild(block);
    });
}

function filterNavigationGrid(query) {
    if (!query) {
        buildNavigationGrid();
        return;
    }
    const matchIndices = AppState.shuffledQuestions
        .map((q, idx) => q.questionText.toLowerCase().includes(query.toLowerCase()) ? idx : null)
        .filter(v => v !== null);
        
    document.querySelectorAll('.nav-block').forEach((el, idx) => {
        el.style.opacity = matchIndices.includes(idx) ? "1" : "0.25";
    });
}

function navigatePrevious() {
    if (AppState.currentIndex > 0) {
        AppState.currentIndex--;
        renderCurrentQuestion();
        buildNavigationGrid();
    }
}

function navigateNext() {
    if (AppState.currentIndex < AppState.shuffledQuestions.length - 1) {
        AppState.currentIndex++;
        renderCurrentQuestion();
        buildNavigationGrid();
    }
}

function toggleBookmark() {
    const originalIdx = AppState.shuffledQuestions[AppState.currentIndex].originalIndex;
    const position = AppState.bookmarks.indexOf(originalIdx);
    if (position === -1) {
        AppState.bookmarks.push(originalIdx);
    } else {
        AppState.bookmarks.splice(position, 1);
    }
    renderCurrentQuestion();
    buildNavigationGrid();
    saveStateToLocalStorage();
}

/**
 * Scoring and Assessment Analytics Generation Engine
 */
function submitQuiz() {
    if (AppState.timerInterval) clearInterval(AppState.timerInterval);
    localStorage.removeItem(AppState.storageKey);
    
    let scoreCount = 0;
    AppState.questions.forEach(q => {
        if (AppState.userAnswers[q.id] === q.correctAnswer) scoreCount++;
    });
    
    const ratio = AppState.questions.length > 0 ? (scoreCount / AppState.questions.length) : 0;
    const percentScore = Math.round(ratio * 100);
    
    document.getElementById('results-score-percent').innerText = `${percentScore}%`;
    const statusEl = document.getElementById('results-status');
    statusEl.innerText = percentScore >= 60 ? "Examination Passed" : "Examination Failed";
    statusEl.style.color = percentScore >= 60 ? "var(--success)" : "var(--danger)";
    
    document.getElementById('meta-total').innerText = AppState.questions.length;
    document.getElementById('meta-correct').innerText = scoreCount;
    document.getElementById('meta-incorrect').innerText = AppState.questions.length - scoreCount;
    
    let hrs = String(Math.floor(AppState.elapsedSeconds / 3600)).padStart(2, '0');
    let mins = String(Math.floor((AppState.elapsedSeconds % 3600) / 60)).padStart(2, '0');
    let secs = String(AppState.elapsedSeconds % 60).padStart(2, '0');
    document.getElementById('meta-time').innerText = `${hrs}:${mins}:${secs}`;
    
    switchView('results-screen');
    renderReviewMode('all');
}

/**
 * Detailed Post-Exam Question Filter Engine Review Tracker
 */
function renderReviewMode(filterType) {
    const targetList = document.getElementById('review-list');
    targetList.innerHTML = "";
    
    AppState.questions.forEach((q, idx) => {
        const userPick = AppState.userAnswers[q.id];
        const isCorrect = userPick === q.correctAnswer;
        const isUnanswered = userPick === undefined;
        
        if (filterType === 'correct' && (!isCorrect || isUnanswered)) return;
        if (filterType === 'incorrect' && (isCorrect || isUnanswered)) return;
        if (filterType === 'unanswered' && !isUnanswered) return;
        
        let stateClass = isUnanswered ? 'unanswered-card' : (isCorrect ? 'correct-card' : 'incorrect-card');
        const card = document.createElement('div');
        card.className = `review-card ${stateClass}`;
        const rtl = isRtlText(q.questionText);
        card.setAttribute('dir', rtl ? 'rtl' : 'ltr');
        
        let innerHTML = `<div class="review-question-text">${rtl ? (idx + 1) + '.' : 'Q' + (idx + 1) + ':'} ${escapeHtml(q.questionText)}</div><div class="review-options">`;
        
        // Review mode shows the original option order
        q.options.forEach(opt => {
            let optClass = "";
            let label = "";
            
            if (opt === q.correctAnswer) {
                optClass = "correct-picked";
                label = `<span class="review-badge" style="color:var(--success)">${rtl ? '[الإجابة الصحيحة]' : '[Correct Choice]'}</span>`;
            } else if (opt === userPick) {
                optClass = "user-picked";
                label = `<span class="review-badge" style="color:var(--danger)">${rtl ? '[اختيارك]' : '[Your Pick]'}</span>`;
            }
            
            innerHTML += `<div class="review-option ${optClass}"><span>${escapeHtml(opt)}</span> ${label}</div>`;
        });
        
        innerHTML += `</div>`;
        if (q.explanation) innerHTML += `<div class="review-explanation"><strong>${rtl ? 'ملاحظة:' : 'Note:'}</strong> ${escapeHtml(q.explanation)}</div>`;
        card.innerHTML = innerHTML;
        targetList.appendChild(card);
    });
}

function saveStateToLocalStorage() {
    const payload = {
        questions: AppState.questions,
        shuffledQuestions: AppState.shuffledQuestions,
        currentIndex: AppState.currentIndex,
        userAnswers: AppState.userAnswers,
        bookmarks: AppState.bookmarks,
        elapsedSeconds: AppState.elapsedSeconds,
        mode: AppState.mode,
        randomize: AppState.randomize,
        smartRandomize: AppState.smartRandomize
    };
    localStorage.setItem(AppState.storageKey, JSON.stringify(payload));
}

function checkActiveSession() {
    const data = localStorage.getItem(AppState.storageKey);
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.questions && parsed.questions.length > 0 && confirm("An unfinished assessment session was detected. Restore progress?")) {
                AppState.questions = parsed.questions;
                AppState.shuffledQuestions = parsed.shuffledQuestions;
                AppState.currentIndex = parsed.currentIndex;
                AppState.userAnswers = parsed.userAnswers;
                AppState.bookmarks = parsed.bookmarks || [];
                AppState.elapsedSeconds = parsed.elapsedSeconds || 0;
                AppState.mode = parsed.mode || 'exam';
                AppState.randomize = parsed.randomize;
                AppState.smartRandomize = parsed.smartRandomize || false;
                
                switchView('quiz-screen');
                if (AppState.mode === 'exam') startExamTimer();
                renderCurrentQuestion();
                buildNavigationGrid();
            } else {
                localStorage.removeItem(AppState.storageKey);
            }
        } catch(e) {
            console.error(e);
        }
    }
}

/**
 * Retry the same quiz without re-uploading the PDF.
 * onlyIncorrect = true -> retry only wrong/unanswered questions.
 */
function retryQuiz(onlyIncorrect) {
    const base = (AppState.fullQuestions && AppState.fullQuestions.length) ? AppState.fullQuestions : AppState.questions;
    let pool = base;
    if (onlyIncorrect) {
        pool = AppState.questions.filter(q => AppState.userAnswers[q.id] !== q.correctAnswer);
        if (pool.length === 0) {
            alert('Perfect score! There are no incorrect questions to retry.');
            return;
        }
    }
    // Re-index so ids match positions
    AppState.questions = pool.map((q, i) => ({ ...q, id: i }));
    if (AppState.timerInterval) clearInterval(AppState.timerInterval);
    localStorage.removeItem(AppState.storageKey);
    document.getElementById('search-questions').value = '';
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
    initializeQuizSession();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetToUploadScreen() {
    if (AppState.timerInterval) clearInterval(AppState.timerInterval);
    localStorage.removeItem(AppState.storageKey);
    AppState.fullQuestions = [];
    switchView('upload-screen');
    document.getElementById('pdf-input').value = "";
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function exportResultsToExcel() {
    let rows = [["Question Number", "Question Content", "Your Response", "Correct Answer Result", "Evaluation Status"]];
    AppState.questions.forEach((q, idx) => {
        let status = AppState.userAnswers[q.id] === undefined ? "Skipped/Unanswered" : (AppState.userAnswers[q.id] === q.correctAnswer ? "Correct" : "Incorrect");
        rows.push([idx + 1, q.questionText, AppState.userAnswers[q.id] || "N/A", q.correctAnswer, status]);
    });
    
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Performance Assessment");
    XLSX.writeFile(workbook, "EduQuizPro_PerformanceReport.xlsx");
}

function exportArabicReportViaPrint() {
    const rows = AppState.questions.map((q, idx) => {
        const user = AppState.userAnswers[q.id];
        const ok = user === q.correctAnswer;
        const status = user === undefined ? 'بدون إجابة' : (ok ? 'صحيحة' : 'خاطئة');
        const color = user === undefined ? '#64748b' : (ok ? '#059669' : '#dc2626');
        return `<div class="q"><div class="qt">${idx + 1}. ${escapeHtml(q.questionText)}</div>
            <div>اختيارك: ${escapeHtml(user || '—')}</div>
            <div>الإجابة الصحيحة: ${escapeHtml(q.correctAnswer)}</div>
            <div style="color:${color};font-weight:700">${status}</div></div>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to export the PDF report.'); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير الأداء</title>
        <style>body{font-family:'Cairo','Segoe UI',Tahoma,Arial,sans-serif;padding:24px;line-height:1.7}
        h1{font-size:22px}.q{border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}
        .qt{font-weight:700;margin-bottom:4px}</style></head><body>
        <h1>EduQuiz Pro — تقرير الأداء</h1>
        <p>عدد الأسئلة: ${AppState.questions.length} — النتيجة: ${document.getElementById('results-score-percent').innerText} — الوقت: ${document.getElementById('meta-time').innerText}</p>
        ${rows}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
}

function exportResultsToPDF() {
    if (AppState.questions.some(q => isRtlText(q.questionText))) {
        exportArabicReportViaPrint();
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.text("EduQuiz Pro - Detailed Performance Evaluation Report", 14, 20);
    
    doc.setFontSize(12);
    doc.setFont("Helvetica", "normal");
    doc.text(`Total Questions parsed: ${AppState.questions.length}`, 14, 32);
    doc.text(`Completed Time frame tracker text: ${document.getElementById('meta-time').innerText}`, 14, 40);
    
    let offset = 54;
    AppState.questions.forEach((q, idx) => {
        if (offset > 270) {
            doc.addPage();
            offset = 20;
        }
        doc.setFont("Helvetica", "bold");
        doc.text(`Qidx ${idx + 1}: ${q.questionText.substring(0, 75)}...`, 14, offset);
        offset += 8;
        doc.setFont("Helvetica", "normal");
        doc.text(`Your Choice: ${AppState.userAnswers[q.id] || "No Selection"}`, 18, offset);
        offset += 6;
        doc.text(`Correct Variant: ${q.correctAnswer}`, 18, offset);
        offset += 12;
    });
    
    doc.save("EduQuizPro_PerformanceReport.pdf");
}