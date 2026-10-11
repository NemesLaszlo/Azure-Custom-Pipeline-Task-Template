// Generates placeholder PNG icons without any dependency so that
// `tfx extension create` works out of the box. Replace them with real artwork:
//   images/extension-icon.png   128x128, shown in the extension gallery
//   buildandreleasetask/icon.png 32x32,  shown next to the task in the pipeline editor
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');

function crc32(buf) {
    let crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        let c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([length, typeAndData, crc]);
}

function png(size, [r, g, b]) {
    const stride = size * 3 + 1;
    const raw = Buffer.alloc(stride * size);
    const border = Math.floor(size / 8);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0; // filter type: none
        for (let x = 0; x < size; x++) {
            const i = y * stride + 1 + x * 3;
            const edge = x < border || y < border || x >= size - border || y >= size - border;
            raw[i] = edge ? r >> 1 : r;
            raw[i + 1] = edge ? g >> 1 : g;
            raw[i + 2] = edge ? b >> 1 : b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const azureBlue = [0, 120, 212];
fs.writeFileSync(path.join(root, 'images', 'extension-icon.png'), png(128, azureBlue));
fs.writeFileSync(path.join(root, 'buildandreleasetask', 'icon.png'), png(32, azureBlue));
console.log('placeholder icons written');
