/**
 * Get image information from a TGA-formatted buffer
 * @param {ArrayBuffer} buffer
 */
function TGAInfo(buffer) {
    var header = new DataView(buffer.slice(0, 18));
    tgaCompatibilityCheck(header);

    this.usesRLE = header.getUint8(2) == 10;
    //this.x = header.getUint16(8, true);
    //this.y = header.getUint16(10, true);
    this.width = header.getUint16(12, true);
    this.height = header.getUint16(14, true);
}

/**
 * Write ArrayBuffer data into an ImageData object
 * @param {ImageData} img
 * @param {ArrayBuffer} buffer
 * @param {TGAInfo} info
 */
function tgaImageDataSet(img, buffer, info) {
    var byteArray = new Uint8Array(buffer);
    var dst_index = 0;
    var src_index = 18; //default to end of header
    var src_x, src_y;

    if (info.usesRLE) {
        var pixelCount = 0;
        var repeat = false;
        var readNextPixel = true;
        var R, G, B;

        for (src_y = info.height - 1; src_y > 0; --src_y) {
            for (src_x = 0; src_x < info.width; ++src_x) {
                dst_index = (src_y * info.width + src_x) * 4;

                if (pixelCount == 0) {
                    var cmd = byteArray[src_index++];
                    pixelCount = 1 + (cmd & 0x7f);
                    repeat = (cmd & 0x80) != 0;
                    readNextPixel = true;
                } else if (!repeat) {
                    readNextPixel = true;
                }

                if (readNextPixel) {
                    B = byteArray[src_index++];
                    G = byteArray[src_index++];
                    R = byteArray[src_index++];
                    readNextPixel = false;
                }

                img.data[dst_index] = R;
                img.data[dst_index + 1] = G;
                img.data[dst_index + 2] = B;
                img.data[dst_index + 3] = 255;

                --pixelCount;
            }
        }
    } else {
        for (src_y = info.height - 1; src_y >= 0; --src_y) {
            for (src_x = 0; src_x < info.width; ++src_x) {
                dst_index = (src_y * info.width + src_x) * 4;

                img.data[dst_index + 2] = byteArray[src_index++];
                img.data[dst_index + 1] = byteArray[src_index++];
                img.data[dst_index + 0] = byteArray[src_index++];
                img.data[dst_index + 3] = 255;
            }
        }
    }

    return img;
}

/**
 * Check the image header for compatibility with the decoder. Throws if the
 * image is not compatible.
 * @param {DataView} header
 */
function tgaCompatibilityCheck(header) {
    var issue = 'TGA compatibility issue: ';

    // Check for a non-empty image ID area
    if (header.getUint8(0) != 0) {
        throw issue + 'image ID must be empty';
    }

    // Check color map type (0 indicates no color map)
    if (header.getUint8(1) != 0) {
        throw issue + 'color map not supported';
    }

    // Check image type
    switch (header.getUint8(2)) {
        case 2: // true-color uncompressed
        case 10: // true-color RLE compressed
            break;
        default:
            throw issue + 'RLE and uncompressed true-color images only';
    }

    // Check color depth
    if (header.getUint8(16) != 24) {
        throw issue + 'color depth must be 24-bit';
    }
}
