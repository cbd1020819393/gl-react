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

/**
 * GL 命令操作码 — JS 侧 WebGL 代理与 C++ 执行器的共享契约。
 * JS 侧镜像定义见 @react-native-ohos/gl-react 的 WebGLRenderingContextOHOS.ts。
 */
#pragma once

namespace glreact {
namespace op {

enum Opcode : int {
  // shader / program
  CREATE_SHADER = 1,
  DELETE_SHADER = 2,
  SHADER_SOURCE = 3,
  COMPILE_SHADER = 4,
  ATTACH_SHADER = 5,
  DETACH_SHADER = 6,
  BIND_ATTRIB_LOCATION = 7,
  LINK_PROGRAM = 8,
  CREATE_PROGRAM = 9,
  USE_PROGRAM = 10,
  DELETE_PROGRAM = 11,
  // buffer
  CREATE_BUFFER = 12,
  DELETE_BUFFER = 13,
  BIND_BUFFER = 14,
  BUFFER_DATA = 15,
  BUFFER_SUB_DATA = 16,
  BUFFER_DATA_SIZE = 17,
  // texture
  CREATE_TEXTURE = 18,
  DELETE_TEXTURE = 19,
  BIND_TEXTURE = 20,
  ACTIVE_TEXTURE = 21,
  PIXEL_STOREI = 22,
  TEX_IMAGE_2D = 23,
  TEX_SUB_IMAGE_2D = 24,
  TEX_PARAMETERI = 25,
  TEX_PARAMETERF = 26,
  GENERATE_MIPMAP = 27,
  // fbo / rbo
  CREATE_FRAMEBUFFER = 28,
  DELETE_FRAMEBUFFER = 29,
  BIND_FRAMEBUFFER = 30,
  FRAMEBUFFER_TEXTURE_2D = 31,
  CHECK_FRAMEBUFFER_STATUS = 32,
  CREATE_RENDERBUFFER = 33,
  DELETE_RENDERBUFFER = 34,
  BIND_RENDERBUFFER = 35,
  FRAMEBUFFER_RENDERBUFFER = 36,
  // state & draw
  VIEWPORT = 40,
  ENABLE = 41,
  DISABLE = 42,
  CLEAR_COLOR = 43,
  CLEAR = 44,
  BLEND_FUNC = 45,
  BLEND_COLOR = 46,
  BLEND_EQUATION = 47,
  DRAW_ARRAYS = 48,
  FLUSH = 49,
  FINISH = 50,
  END_FRAME = 51, // blit 到快照 FBO + eglSwapBuffers
  // vertex attribs
  VERTEX_ATTRIB_POINTER = 60,
  ENABLE_VERTEX_ATTRIB_ARRAY = 61,
  DISABLE_VERTEX_ATTRIB_ARRAY = 62,
  VERTEX_ATTRIB_1F = 63,
  VERTEX_ATTRIB_2F = 64,
  VERTEX_ATTRIB_3F = 65,
  VERTEX_ATTRIB_4F = 66,
  VERTEX_ATTRIB_1FV = 67,
  VERTEX_ATTRIB_2FV = 68,
  VERTEX_ATTRIB_3FV = 69,
  VERTEX_ATTRIB_4FV = 70,
  // uniforms（loc 为 JS 侧 location id，>0）
  UNIFORM_1I = 80,
  UNIFORM_2I = 81,
  UNIFORM_3I = 82,
  UNIFORM_4I = 83,
  UNIFORM_1F = 84,
  UNIFORM_2F = 85,
  UNIFORM_3F = 86,
  UNIFORM_4F = 87,
  UNIFORM_1IV = 88,
  UNIFORM_2IV = 89,
  UNIFORM_3IV = 90,
  UNIFORM_4IV = 91,
  UNIFORM_1FV = 92,
  UNIFORM_2FV = 93,
  UNIFORM_3FV = 94,
  UNIFORM_4FV = 95,
  UNIFORM_MATRIX_2FV = 96,
  UNIFORM_MATRIX_3FV = 97,
  UNIFORM_MATRIX_4FV = 98,
};

// WebGL 常量（不在 GLES 枚举内的）
constexpr GLenum UNPACK_FLIP_Y_WEBGL = 0x9240;
constexpr GLenum UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
constexpr GLenum UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9242;

// token 编码约定（flush 的 ops 数字流）：
//   t >= 0        → 数值参数
//   -1 - 2*k      → 字符串参数 strs[k]
//   -1000000      → null
//   -(1000000 + kind*100000 + idx) → 类型化数组 datas[idx]
// datas 元素运行时恒为 ArrayBuffer（原始字节）；kind 为保留字段，
// 当前 C++ 侧一律按 DATA_UINT8 原始字节处理、不校验 kind
enum DataKind : int {
  DATA_NULL = 0,
  DATA_UINT8 = 1,
  DATA_UINT8_CLAMPED = 2,
  DATA_INT16 = 3,
  DATA_UINT16 = 4,
  DATA_INT32 = 5,
  DATA_UINT32 = 6,
  DATA_FLOAT32 = 7,
  DATA_FLOAT64 = 8,
};

constexpr int kStringSentinelBase = -1000000; // kStringSentinelBase - 1 - 2*k... 实际用 -1-2*k 编码字符串
constexpr int kNullToken = -1000000;
constexpr int kDataSentinelBase = -1000000;
constexpr int kDataKindStride = 100000;

} // namespace op
} // namespace glreact
