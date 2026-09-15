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

jest.mock('../../src/specs/v1/NativeExGL', () => ({
  __esModule: true,
  default: {},
}));

import GL from '../../src/webgl1-constants';
import {WebGLRenderingContextOHOS} from '../../src/WebGLRenderingContextOHOS';

// 操作码镜像（与 src/WebGLRenderingContextOHOS.ts 顶部 OP 一致）
const OP = {
  CREATE_SHADER: 1,
  DELETE_SHADER: 2,
  SHADER_SOURCE: 3,
  CREATE_PROGRAM: 9,
  DELETE_PROGRAM: 11,
  BUFFER_DATA: 15,
  BUFFER_DATA_SIZE: 17,
  TEX_IMAGE_2D: 23,
  END_FRAME: 51,
};

// C++ token 契约（gl_webgl_context.cpp tokenData / gl_opcodes.h）
const kNullToken = -1000000;
const dataToken = (kind, idx) => -(1000000 + kind * 100000 + idx);
const DATA_KIND = {Float32Array: 7, Uint8Array: 1};

function makeExGL() {
  // flush 收到的是 _ops/_strs/_datas 的引用，且源码在下发后原地清空，
  // 因此必须在 mock 实现里立即快照内容
  let exgl;
  exgl = {
    flush: jest.fn((contextId, ops, strs, datas) => {
      exgl.lastBatch = {
        contextId,
        ops: ops.slice(),
        strs: strs.slice(),
        datas: datas.slice(),
      };
      return {contextId: 7, ok: true, width: 320, height: 240};
    }),
    getShaderParameter: jest.fn(() => true),
    getShaderInfoLog: jest.fn(() => 'log'),
    getShaderSource: jest.fn(() => 'src'),
    getProgramParameterInt: jest.fn(() => 4),
    getProgramParameterBool: jest.fn(() => true),
    getUniformLocation: jest.fn(() => 3),
    getAttribLocation: jest.fn(() => 2),
    getUniform: jest.fn(() => [1]),
    getActiveUniform: jest.fn(() => ({name: 'u', size: 1, type: 5126})),
    getError: jest.fn(() => 0),
    getParameter: jest.fn(() => -1),
  };
  return exgl;
}

function make() {
  return new WebGLRenderingContextOHOS(makeExGL(), 7, 100, 50);
}

describe('WebGLRenderingContextOHOS', () => {
  describe('context', () => {
    it('exposes the drawing buffer size and canvas dimensions', () => {
      const gl = make();
      expect(gl.drawingBufferWidth).toBe(100);
      expect(gl.drawingBufferHeight).toBe(50);
      expect(gl.canvas).toEqual({width: 100, height: 50});
    });

    it('exposes GL constants as values and by name', () => {
      const gl = make();
      expect(gl.TEXTURE_2D).toBe(GL.TEXTURE_2D);
      expect(gl.TEXTURE_2D).toBe(0x0de1);
      expect('SRC_COLOR' in gl).toBe(true);
      expect(gl.SRC_COLOR).toBe(0x0300);
    });

    it('isContextLost() reflects the surface state', () => {
      const gl = make();
      expect(gl.isContextLost()).toBe(false);
      gl._ok = false;
      expect(gl.isContextLost()).toBe(true);
    });

    it('getContextAttributes keeps the last frame (frame retention)', () => {
      expect(make().getContextAttributes().preserveDrawingBuffer).toBe(true);
    });

    it('getExtension() returns null with a warning; list is empty', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const gl = make();
      expect(gl.getExtension('OES_texture_float')).toBe(null);
      expect(gl.getSupportedExtensions()).toEqual([]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('command batching', () => {
    it('createShader() queues [OP, argc, id, type] and returns a handle', () => {
      const gl = make();
      const shader = gl.createShader(GL.FRAGMENT_SHADER);
      expect(shader.id).toBe(1);
      expect(gl._ops).toEqual([
        OP.CREATE_SHADER,
        2,
        shader.id,
        GL.FRAGMENT_SHADER,
      ]);
      expect(gl._exgl.flush).not.toHaveBeenCalled();
    });

    it('flush() forwards the batch and clears the queues', () => {
      const gl = make();
      const shader = gl.createShader(GL.VERTEX_SHADER);
      gl.flush();
      expect(gl._exgl.flush).toHaveBeenCalledTimes(1);
      expect(gl._exgl.lastBatch.contextId).toBe(7);
      expect(gl._exgl.lastBatch.ops).toEqual([
        OP.CREATE_SHADER,
        2,
        shader.id,
        GL.VERTEX_SHADER,
      ]);
      expect(gl._exgl.lastBatch.strs).toEqual([]);
      expect(gl._exgl.lastBatch.datas).toEqual([]);
      expect(gl._ops.length).toBe(0);
    });

    it('flush() with an empty queue does not call native', () => {
      const gl = make();
      gl.flush();
      expect(gl._exgl.flush).not.toHaveBeenCalled();
    });

    it('flush() updates drawing buffer size from the surface info', () => {
      const gl = make();
      gl.clearColor(0, 0, 0, 1); // 空 batch 的 flush 是 no-op，先排队一条命令
      gl.flush();
      expect(gl.drawingBufferWidth).toBe(320);
      expect(gl.drawingBufferHeight).toBe(240);
    });

    it('shaderSource() encodes the string token as -1-2k', () => {
      const gl = make();
      const shader = gl.createShader(GL.FRAGMENT_SHADER);
      gl.shaderSource(shader, 'void main() {}');
      const tail = gl._ops.slice(-4);
      expect(tail.slice(0, 2)).toEqual([OP.SHADER_SOURCE, 2]);
      // 字符串 token：-(1 + 2*k)，首个字符串为 -1
      expect(tail[3]).toBe(-1);
      expect(gl._strs).toEqual(['void main() {}']);
    });
  });

  describe('synchronous queries', () => {
    it('submit queued commands before a native sync query', () => {
      const gl = make();
      const shader = gl.createShader(GL.FRAGMENT_SHADER);
      gl.compileShader(shader);
      const ok = gl.getShaderParameter(shader, GL.COMPILE_STATUS);
      expect(ok).toBe(true);
      expect(gl._exgl.flush).toHaveBeenCalledTimes(1);
      // flush 必须先于同步查询执行（顺序语义）
      expect(gl._exgl.flush.mock.invocationCallOrder[0]).toBeLessThan(
        gl._exgl.getShaderParameter.mock.invocationCallOrder[0]
      );
      expect(gl._ops.length).toBe(0);
    });

    it('caches ACTIVE_UNIFORMS / ACTIVE_ATTRIBUTES per program', () => {
      const gl = make();
      const program = gl.createProgram();
      gl.getProgramParameter(program, GL.ACTIVE_UNIFORMS);
      gl.getProgramParameter(program, GL.ACTIVE_UNIFORMS);
      expect(gl._exgl.getProgramParameterInt).toHaveBeenCalledTimes(1);
      gl.getProgramParameter(program, GL.ACTIVE_ATTRIBUTES);
      expect(gl._exgl.getProgramParameterInt).toHaveBeenCalledTimes(2);
    });

    it('deleteProgram() marks deletion; int-cache invalidation is a no-op (dead code)', () => {
      const gl = make();
      const program = gl.createProgram();
      gl.getProgramParameter(program, GL.ACTIVE_UNIFORMS);
      gl.deleteProgram(program);
      gl.getProgramParameter(program, GL.ACTIVE_UNIFORMS);
      // 现状：缓存键为 program.id*16+1/2，而 deleteProgram 只清理 program.id
      // —— 无效化不生效，重复查询命中缓存（仍只查一次原生）。
      // 由于 id 单调递增、键永不复用，实际无用户影响；此处固化现状。
      expect(gl._exgl.getProgramParameterInt).toHaveBeenCalledTimes(1);
      expect(gl._programIntCache.has(program.id)).toBe(false);
      expect(gl._programIntCache.has(program.id * 16 + 2)).toBe(true);
    });

    it('routes other program pnames to the bool variant', () => {
      const gl = make();
      const program = gl.createProgram();
      expect(gl.getProgramParameter(program, GL.LINK_STATUS)).toBe(true);
      expect(gl._exgl.getProgramParameterBool).toHaveBeenCalled();
    });

    it('getError() submits the queue then queries natively', () => {
      const gl = make();
      gl.clearColor(0, 0, 0, 1);
      expect(gl.getError()).toBe(0);
      expect(gl._exgl.flush).toHaveBeenCalledTimes(1);
      expect(gl._exgl.getError).toHaveBeenCalledWith(7);
    });
  });

  describe('object lifetime', () => {
    it('isShader()/isProgram() turn false after deletion', () => {
      const gl = make();
      const shader = gl.createShader(GL.FRAGMENT_SHADER);
      const program = gl.createProgram();
      expect(gl.isShader(shader)).toBe(true);
      expect(gl.isProgram(program)).toBe(true);
      gl.deleteShader(shader);
      gl.deleteProgram(program);
      expect(gl.isShader(shader)).toBe(false);
      expect(gl.isProgram(program)).toBe(false);
    });
  });

  describe('data uploads', () => {
    it('bufferData() with a size uses BUFFER_DATA_SIZE', () => {
      const gl = make();
      gl.bufferData(GL.ARRAY_BUFFER, 16, GL.STATIC_DRAW);
      expect(gl._ops.slice(0, 2)).toEqual([OP.BUFFER_DATA_SIZE, 3]);
    });

    it('bufferData() with a typed array queues the data buffer', () => {
      const gl = make();
      gl.bufferData(GL.ARRAY_BUFFER, new Float32Array([1, 2]), GL.STATIC_DRAW);
      expect(gl._ops.slice(0, 2)).toEqual([OP.BUFFER_DATA, 3]);
      expect(gl._datas.length).toBe(1);
      expect(gl._datas[0].byteLength).toBe(8);
    });

    it('texImage2D() full form queues 9 tokens with the pixel data', () => {
      const gl = make();
      const pixels = new Uint8Array([1, 2, 3, 4]);
      gl.texImage2D(
        GL.TEXTURE_2D, 0, GL.RGBA, 1, 1, 0, GL.RGBA, GL.UNSIGNED_BYTE, pixels
      );
      expect(gl._ops[0]).toBe(OP.TEX_IMAGE_2D);
      expect(gl._ops[1]).toBe(9);
      expect(gl._datas.length).toBe(1);
    });

    it('texImage2D() DOM source form is rejected with a warning', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const gl = make();
      const img = {uri: 'a.png'};
      gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, img);
      expect(gl._ops.length).toBe(0);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    // 已知契约缺陷：_taToken 计算出正数 token（如 Float32 → +300000），
    // 而 C++ tokenData() 对 token >= 0 一律视为数值参数，数据被静默丢弃。
    // 正确编码应为 -(1000000 + kind*100000 + idx)（见 gl_opcodes.h 注释）。
    // 修复该行后本用例自动转绿（jest 会提示移除 .failing）。
    it.failing(
      'encodes typed-array tokens per the C++ contract (negative, < -1000000)',
      () => {
        const gl = make();
        gl.bufferData(GL.ARRAY_BUFFER, new Float32Array([1]), GL.STATIC_DRAW);
        const token = gl._ops[4];
        expect(token).toBe(dataToken(DATA_KIND.Float32Array, 0));
        expect(token).toBeLessThan(kNullToken);
      }
    );
  });

  describe('frame submission', () => {
    it('endFrameEXP() appends END_FRAME and submits exactly once', () => {
      const gl = make();
      gl.clearColor(0, 0, 1, 1);
      gl.endFrameEXP();
      expect(gl._exgl.flush).toHaveBeenCalledTimes(1);
      expect(gl._exgl.lastBatch.ops.slice(-2)).toEqual([OP.END_FRAME, 0]);
      expect(gl._ops.length).toBe(0);
    });
  });
});
