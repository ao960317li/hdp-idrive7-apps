'use strict';

const fs = require('fs');
const path = require('path');
const { Canvas } = require('./canvas');
const { makeLayer, play } = require('./record');

const assetPath = path.join(__dirname, 'branding-assets.json');
const assets = fs.existsSync(assetPath) ? require(assetPath) : {};

// Cached RECT layers work in both renderer dialects and the PNG fallback.
function rasterLayer(asset, w, h) {
    const { width, height, rgba } = asset;
    const pixels = Buffer.from(rgba, 'base64');
    const sx = w / width, sy = h / height;
    return makeLayer(w, h, (cv) => {
        for (let y = 0; y < height; y++) {
            const row = y * width * 4;
            let start = 0;
            while (start < width) {
                const colour = pixels.readUInt32BE(row + start * 4);
                let end = start + 1;
                while (end < width && pixels.readUInt32BE(row + end * 4) === colour) end++;
                if (colour & 255) cv.fillRect(start * sx, y * sy, (end - start) * sx, sy, colour);
                start = end;
            }
        }
    });
}

let backgroundLayer;

function background(w, h) {
    if (!assets.background || w !== 1600 || h !== 520) return null;
    if (!backgroundLayer) backgroundLayer = rasterLayer(assets.background, w, h);
    return backgroundLayer;
}

function loadLogo(asset) {
    if (!asset) return null;
    const { width, height } = asset;
    let layer;
    return {
        width, height,
        draw(cv, x, y) {
            if (!layer) layer = rasterLayer(asset, width, height);
            if (cv.recording) cv.blit(layer, x, y);
            else {
                if (!layer.soft) {
                    layer.soft = new Canvas(width, height);
                    play(layer.words, layer.soft);
                }
                cv.blit(layer.soft, x, y);
            }
        },
    };
}

const logo = loadLogo(assets.logo);
const fullLogo = loadLogo(assets.logoFull) || logo;

module.exports = { background, logo, fullLogo };
