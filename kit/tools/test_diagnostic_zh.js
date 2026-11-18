'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const stage = path.resolve(process.argv[2] || 'dist/dtc_scanner/source/javascript');
const { diagnosticText } = require(path.join(stage, 'diagnostic-text'));
const { fitText } = require(path.join(stage, 'kit/text-layout'));
const { Canvas } = require(path.join(stage, 'kit/canvas'));
const { Recorder, play, atlasById } = require(path.join(stage, 'kit/record'));
const fonts = require(path.join(stage, 'kit/fonts'));
const i18n = require(path.join(stage, 'kit/i18n'));
const language = i18n.getLanguage();
assert.strictEqual(i18n.setLanguage, undefined, 'No runtime language switching');
if (language === 'ru') {
    console.log('SKIP ru: Chinese diagnostic checks do not apply to a fixed Russian package');
    process.exit(0); // Test process only; never installed as application code.
}
if (language === 'en') {
    const complete = require('../localization/diagnostic-full.zh-CN.json');
    for (const source of Object.keys(complete)) assert.strictEqual(diagnosticText(source),source);
    assert.strictEqual(diagnosticText('5 possible texts (depends on unit type)'), '5 possible texts (depends on unit type)');
    assert(!fs.existsSync(path.join(stage,'diagnostic_i18n.pack')));
    console.log('PASS en: every corpus description is unchanged; no diagnostic translation pack shipped');
    process.exit(0); // Test process only; never installed as application code.
}
const pair = (cn, tw) => language === 'zh-TW' ? tw : cn;
// Regression: owner scan descriptions and HU Ethernet signal-quality wording.
const overrides = require('../localization/diagnostic-overrides.zh-CN.json');
for (const [source, expected] of Object.entries(overrides)) {
    const translated = diagnosticText(source);
    assert.notStrictEqual(translated, source, 'Untranslated diagnostic override: ' + source);
    if (language === 'zh-CN') assert.strictEqual(translated, expected);
}
assert.strictEqual(diagnosticText('GM: General module 5: Processor internal fault'), pair('GM：通用模块 5，处理器内部故障', 'GM：通用模組 5，處理器內部故障'));
const power = diagnosticText("Power-window motor, driver's side, rear: thermal fuse, window motor or wiring");
assert(power.includes(pair('电动车窗电机','電動車窗電機')) && !power.includes('功率'));
const acc = diagnosticText('Message absent (KAFAS object data status, 0x23F), receiver ACC, transmitter KAFAS');
assert(acc.includes('ACC') && acc.includes('KAFAS') && acc.includes('0x23F') && !acc.includes('加速'));
assert.strictEqual(diagnosticText('Uncatalogued ACC circuit 0xABCDEF'), 'Uncatalogued ACC circuit 0xABCDEF');
assert(diagnosticText('5 possible texts (depends on unit type)').includes(pair('候选说明','候選說明')));
const unknown = 'ACC receiver: uncatalogued power software fault';
const opt = { literal: true };
for (const cv of [new Canvas(1600,520), new Recorder(1600,520)]) {
    const f = fonts.get('label',22,unknown);
    const width = fonts.measure(f,unknown)*22/f.size;
    assert(Math.abs(cv.textWidth(unknown,22,opt)-width)<0.001);
    assert.strictEqual(fitText(cv,unknown,22,1500,opt), unknown);
    const cut = fitText(cv,acc,22,450,opt);
    assert(cv.textWidth(cut,22,opt)<=450 && cut.endsWith('...'));
    assert(Math.abs(cv.text(unknown,0,30,22,'#ffffff',opt)-width)<0.001);
}
// Every generated translation must have all of its Chinese glyphs in the shipped atlas.
const db = require(path.join(stage,'kit/pack')).open(path.join(stage,'diagnostic_i18n'));
const translations = db.json(language+'.json');
const completeFile = path.resolve(__dirname,'../localization/diagnostic-full.zh-CN.json');
if (fs.existsSync(completeFile)) {
    const complete = JSON.parse(fs.readFileSync(completeFile,'utf8'));
    assert.strictEqual(Object.keys(complete).length,86735);
    for (const source of Object.keys(complete)) {
        assert(Object.prototype.hasOwnProperty.call(translations,source),'Missing corpus entry: '+source);
        assert.strictEqual(diagnosticText(source),translations[source]);
        const normalized=source.replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue').replace(/ß/g,'ss').replace(/[\x00-\x1f\x7f]/g,'');
        assert(Object.prototype.hasOwnProperty.call(translations,normalized),'Missing normalized display entry: '+normalized);
    }
    assert(diagnosticText('Head unit: I level faulty').includes('I-Level'));
    assert(!diagnosticText('Head unit: I level faulty').includes(pair('液位','液位')));
    assert(diagnosticText('KFS: Fault in control unit (motor driver)').includes(pair('电机驱动器','電機驅動器')));
    assert(!diagnosticText('DME2: Valvetronic bank 2, servomotor: activation of').includes(pair('银行','銀行')));
    const composite='Invalid signal (0x1506_0x0001, additional information, energy management), sender BDC-ZGM / BCP';
    assert(diagnosticText(composite).includes('0x1506_0x0001'));
}
const atlas = JSON.parse(fs.readFileSync(path.join(stage,'kit/fonts/cjk.json'),'utf8')).sizes[0];
assert(atlas.atlasH<=2048);
for(const text of Object.values(translations)) for(const ch of text) {
    if(/[\u3000-\u9fff\uff00-\uffef]/.test(ch)) assert(atlas.glyphs[ch.codePointAt(0)],'Missing glyph '+ch);
}
// A renderer used by other apps can have enough total space but no shelf tall
// enough for the complete diagnostic atlas. Its GPU pages must fit those gaps.
const diagnosticFont = fonts.get('label', 32, '故障检测');
assert.strictEqual(diagnosticFont.gpuPageHeight, 256);
const pageSamples = new Map();
for (const [code, glyph] of Object.entries(diagnosticFont.glyphs)) {
    if (!glyph[2] || !glyph[3]) continue;
    const page = fonts.gpuPage(diagnosticFont, glyph);
    assert(page && page.atlasH <= 256, 'A whole diagnostic glyph must fit its GPU page');
    assert(glyph[1] >= page.sourceY && glyph[1] + glyph[3] <= page.sourceY + page.atlasH);
    assert(page.alpha.equals(diagnosticFont.alpha.slice(
        page.sourceY * page.atlasW, (page.sourceY + page.atlasH) * page.atlasW)));
    if (!pageSamples.has(page)) pageSamples.set(page, String.fromCodePoint(Number(code)));
}
const shelves = [2919, 3106]; // Captured after opening thirteen previously shipped apps.
assert(Math.min(...shelves) + diagnosticFont.atlasH > 4096, 'The old one-piece upload must reproduce the failure');
function checkUploadOrders(remaining, occupied) {
    remaining.forEach((page, index) => {
        const next = occupied.slice(), column = next[0] <= next[1] ? 0 : 1;
        assert(next[column] + page.atlasH <= 4096, 'Diagnostic pages must fit regardless of text/upload order');
        next[column] += page.atlasH + 1;
        checkUploadOrders(remaining.filter((_, other) => other !== index), next);
    });
}
checkUploadOrders([...pageSamples.keys()], shelves);
const sample = '故障检测 ' + [...pageSamples.values()].join('') + ' ACC 0x23F';
function recordedText(paged) {
    const saved = diagnosticFont.gpuPageHeight;
    diagnosticFont.gpuPageHeight = paged ? saved : 0;
    try {
        const recording = new Recorder(900, 180);
        ['left', 'center', 'right'].forEach((align, row) => {
            recording.text(sample, [15, 450, 880][row], 45 + row * 55, 28, '#ffffff',
                { literal: true, align, spacing: row });
        });
        return recording;
    } finally {
        diagnosticFont.gpuPageHeight = saved;
    }
}
const pagedText = recordedText(true);
assert(pagedText.atlases.size > 1, 'A text run must support more than one GPU page');
for (const id of pagedText.atlases) assert(atlasById(id).atlasH <= 256);
const pagedPixels = new Canvas(900, 180), originalPixels = new Canvas(900, 180);
play(pagedText.words(), pagedPixels);
play(recordedText(false).words(), originalPixels);
assert.deepStrictEqual(Buffer.from(pagedPixels.d), Buffer.from(originalPixels.d),
    'GPU paging must preserve glyph pixels, spacing and alignment');
let ids=0;
for(const [src,dst] of Object.entries(translations)) {
    for(const hex of src.match(/0x[0-9A-Fa-f]+/g)||[]) { assert(dst.includes(hex),'Hex ID lost: '+src); ids++; }
}
console.log('PASS '+language+': diagnostic terms, ACC/hex preservation, unknown fallback, software/GPU literal rendering, truncation, '+Object.keys(translations).length+' entries, '+ids+' ID checks, glyph budget '+atlas.atlasW+'x'+atlas.atlasH);
