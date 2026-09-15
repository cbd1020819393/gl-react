/**
 * MIT License
 *
 * Copyright (C) 2026 Huawei Device Co., Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

#include "png_encoder.h"
#include <zlib.h>

namespace glreact {

namespace {

uint32_t crc32Png(uint32_t crc, const uint8_t *data, size_t len) {
  return static_cast<uint32_t>(::crc32(crc, data, static_cast<uInt>(len)));
}

void putU32(std::vector<uint8_t> &out, uint32_t v) {
  out.push_back(static_cast<uint8_t>((v >> 24) & 0xFF));
  out.push_back(static_cast<uint8_t>((v >> 16) & 0xFF));
  out.push_back(static_cast<uint8_t>((v >> 8) & 0xFF));
  out.push_back(static_cast<uint8_t>(v & 0xFF));
}

void writeChunk(std::vector<uint8_t> &out, const char type[4],
                const std::vector<uint8_t> &payload) {
  putU32(out, static_cast<uint32_t>(payload.size()));
  size_t typeStart = out.size();
  for (int i = 0; i < 4; i++)
    out.push_back(static_cast<uint8_t>(type[i]));
  out.insert(out.end(), payload.begin(), payload.end());
  uint32_t crc = crc32Png(0, out.data() + typeStart, 4 + payload.size());
  putU32(out, crc);
}

} // namespace

std::vector<uint8_t> encodePngRgba8(const uint8_t *rgba, int width, int height,
                                    int stride) {
  std::vector<uint8_t> png;
  // PNG signature
  const uint8_t sig[8] = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
  png.insert(png.end(), sig, sig + 8);

  // IHDR
  std::vector<uint8_t> ihdr;
  putU32(ihdr, static_cast<uint32_t>(width));
  putU32(ihdr, static_cast<uint32_t>(height));
  ihdr.push_back(8);  // bit depth
  ihdr.push_back(6);  // color type RGBA
  ihdr.push_back(0);  // compression
  ihdr.push_back(0);  // filter
  ihdr.push_back(0);  // interlace
  writeChunk(png, "IHDR", ihdr);

  // 原始扫描线数据（filter 0 + 行数据），GL 原点在左下 → 翻转为图像左上
  size_t rowBytes = static_cast<size_t>(width) * 4;
  std::vector<uint8_t> raw;
  raw.reserve((rowBytes + 1) * height);
  for (int y = height - 1; y >= 0; y--) {
    raw.push_back(0); // filter: none
    const uint8_t *row = rgba + static_cast<size_t>(y) * stride;
    raw.insert(raw.end(), row, row + rowBytes);
  }

  // IDAT（zlib deflate）
  uLongf compressedSize = ::compressBound(static_cast<uLong>(raw.size()));
  std::vector<uint8_t> idat(compressedSize);
  if (::compress2(idat.data(), &compressedSize, raw.data(),
                  static_cast<uLong>(raw.size()), Z_BEST_SPEED) != Z_OK) {
    return {};
  }
  idat.resize(compressedSize);
  writeChunk(png, "IDAT", idat);

  // IEND
  writeChunk(png, "IEND", {});
  return png;
}

std::string base64Encode(const uint8_t *data, size_t len) {
  static const char kTable[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve(((len + 2) / 3) * 4);
  size_t i = 0;
  for (; i + 2 < len; i += 3) {
    uint32_t v = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8) |
                 data[i + 2];
    out.push_back(kTable[(v >> 18) & 63]);
    out.push_back(kTable[(v >> 12) & 63]);
    out.push_back(kTable[(v >> 6) & 63]);
    out.push_back(kTable[v & 63]);
  }
  size_t rem = len - i;
  if (rem == 1) {
    uint32_t v = uint32_t(data[i]) << 16;
    out.push_back(kTable[(v >> 18) & 63]);
    out.push_back(kTable[(v >> 12) & 63]);
    out.push_back('=');
    out.push_back('=');
  } else if (rem == 2) {
    uint32_t v = (uint32_t(data[i]) << 16) | (uint32_t(data[i + 1]) << 8);
    out.push_back(kTable[(v >> 18) & 63]);
    out.push_back(kTable[(v >> 12) & 63]);
    out.push_back(kTable[(v >> 6) & 63]);
    out.push_back('=');
  }
  return out;
}

} // namespace glreact
