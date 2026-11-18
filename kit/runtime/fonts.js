'use strict';
/**
 * fonts.js - loads the pre-baked glyph atlases (kit/runtime/fonts/*.json,
 * made by kit/tools/bake_fonts.py) and picks the best size for a request.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, 'fonts');
const families = Object.create(null);

function family(name) {
    if (families[name] !== undefined) return families[name];
    let fam = null;
    try {
        const j = JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
        fam = j.sizes.map((s) => ({
            size: s.size, ascent: s.ascent, descent: s.descent, atlasW: s.atlasW, atlasH: s.atlasH,
            glyphs: s.glyphs, _alpha: s.alpha, alpha: null, family: name, cacheKey: j.cacheKey || '',
            gpuPageHeight: j.gpuPageHeight,
        }));
    } catch (e) { fam = null; }
    families[name] = fam;
    return fam;
}

/** Smallest baked size >= requested (downscaling looks better), else largest. */
function get(name, size, text) {
    // Shared supplemental atlases avoid duplicating glyphs in every numeric size.
    if (text && /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7ff]/.test(text)) name = 'korean';
    else if (text && /[\u3000-\u9fff\uff00-\uffef]/.test(text)) name = 'cjk';
    else if (text && /[\u0400-\u04ff]/.test(text)) name = 'cyrillic';
    const fam = family(name) || family('label');
    if (!fam) return null;
    let best = null;
    for (const f of fam) if (f.size >= size && (!best || f.size < best.size)) best = f;
    if (!best) best = fam[fam.length - 1];
    if (!best.alpha) best.alpha = zlib.inflateSync(Buffer.from(best._alpha, 'base64'));
    return best;
}

/** Whether a family's atlas is there (get() falls back to 'label' for one that isn't). */
function has(name) { return !!family(name); }

/** A glyph's GPU page. The source font stays whole for measuring and software drawing. */
function gpuPage(f, glyph) {
    const height = f.gpuPageHeight;
    if (!Number.isInteger(height) || height <= 0 || f.atlasH <= height) return f;
    if (!f.gpuPages) {
        // A cut may pass between glyph rows, never through a glyph's pixels.
        const cuts = new Array(f.atlasH + 1).fill(true);
        Object.keys(f.glyphs).forEach((key) => {
            const g = f.glyphs[key];
            if (g[2]) for (let y = g[1] + 1; y < g[1] + g[3]; y++) cuts[y] = false;
        });
        f.gpuPages = [];
        let top = 0;
        while (top < f.atlasH) {
            let bottom = Math.min(top + height, f.atlasH);
            while (bottom > top && !cuts[bottom]) bottom--;
            // An unusually tall glyph needs a taller page to keep it intact.
            if (bottom === top) {
                bottom = Math.min(top + height, f.atlasH);
                while (bottom < f.atlasH && !cuts[bottom]) bottom++;
            }
            f.gpuPages.push({
                size: f.size, family: f.family, atlasW: f.atlasW, atlasH: bottom - top,
                alpha: f.alpha.slice(top * f.atlasW, bottom * f.atlasW), sourceY: top,
                cacheKey: f.cacheKey + '/gpu-page-v1/' + top + '-' + bottom,
            });
            top = bottom;
        }
    }
    return f.gpuPages.find((page) => glyph[1] >= page.sourceY && glyph[1] + glyph[3] <= page.sourceY + page.atlasH);
}

function measure(f, s) {
    let w = 0;
    for (const ch of s) { const g = f.glyphs[ch.codePointAt(0)] || f.glyphs[63]; if (g) w += g[6]; }
    return w;
}

module.exports = { get, has, gpuPage, measure };
