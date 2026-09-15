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

import GL, {GL as namedGL} from '../../src/webgl1-constants';

describe('webgl1-constants', () => {
  it('exports the same table as default and named', () => {
    expect(namedGL).toBe(GL);
  });

  it('matches the WebGL 1.0 / GLES2 enum values', () => {
    expect(GL.COLOR_BUFFER_BIT).toBe(0x00004000);
    expect(GL.TEXTURE_2D).toBe(0x0de1);
    expect(GL.FRAGMENT_SHADER).toBe(0x8b30);
    expect(GL.COMPILE_STATUS).toBe(0x8b81);
    expect(GL.LINK_STATUS).toBe(0x8b82);
    expect(GL.ACTIVE_UNIFORMS).toBe(0x8b86);
    expect(GL.ACTIVE_ATTRIBUTES).toBe(0x8b8d);
    expect(GL.ARRAY_BUFFER).toBe(0x8892);
    expect(GL.FLOAT).toBe(0x1406);
    expect(GL.TRIANGLES).toBe(0x0004);
    expect(GL.MAX_TEXTURE_SIZE).toBe(0x0d33);
  });

  it('exposes blendFunc aliases used by name-based lookup', () => {
    expect(GL.ZERO).toBe(0);
    expect(GL.ONE).toBe(1);
    expect(GL.SRC_COLOR).toBe(0x0300);
    expect('SRC_COLOR' in GL).toBe(true);
  });

  it('covers the WebGL1 constant surface', () => {
    expect(Object.keys(GL).length).toBeGreaterThanOrEqual(200);
  });
});
