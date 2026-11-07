#!/usr/bin/env python3
"""Prepare a dashboard background and logo for the shared runtime (requires Pillow)."""

import argparse
import base64
import json
from pathlib import Path

from PIL import Image, ImageOps


DEFAULT_OUT = Path(__file__).resolve().parents[1] / 'runtime' / 'branding-assets.json'
BACKGROUND_SIZE = (320, 104)
LOGO_SIZE = (96, 30)
FULL_LOGO_SIZE = (96, 48)
RESAMPLE = getattr(Image, 'Resampling', Image).LANCZOS


def load(path):
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert('RGBA')


def prepare_background(image, strength):
    fitted = ImageOps.fit(image, BACKGROUND_SIZE, method=RESAMPLE)
    base = Image.new('RGBA', BACKGROUND_SIZE, (4, 6, 10, 255))
    return Image.blend(base, Image.alpha_composite(base, fitted), strength)


def crop_logo(image):
    bounds = image.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('the logo is fully transparent')
    return image.crop(bounds)


def fit_logo(image, size):
    fitted = image.copy()
    fitted.thumbnail(size, resample=RESAMPLE)
    return fitted


def encode(image):
    return {
        'width': image.width,
        'height': image.height,
        'rgba': base64.b64encode(image.tobytes()).decode('ascii'),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--background', type=Path, required=True, help='background image (PNG, JPEG or WebP)')
    parser.add_argument('--logo', type=Path, required=True, help='logo image (transparent PNG recommended)')
    parser.add_argument('--background-strength', type=float, default=0.26, help='image strength, 0 to 1 (default: 0.26)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help='output JSON (default: kit/runtime/branding-assets.json)')
    args = parser.parse_args()
    if not 0 <= args.background_strength <= 1:
        parser.error('--background-strength must be between 0 and 1')
    if args.out.resolve() in (args.background.resolve(), args.logo.resolve()):
        parser.error('--out must differ from the input images')

    try:
        logo = crop_logo(load(args.logo))
        assets = {
            'background': encode(prepare_background(load(args.background), args.background_strength)),
            'logo': encode(fit_logo(logo, LOGO_SIZE)),
            'logoFull': encode(fit_logo(logo, FULL_LOGO_SIZE)),
        }
        args.out.write_text(json.dumps(assets, separators=(',', ':')) + '\n', encoding='utf-8')
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(args.out)


if __name__ == '__main__':
    main()
