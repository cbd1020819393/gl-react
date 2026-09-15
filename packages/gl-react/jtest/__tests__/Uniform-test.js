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

import Uniform from '../../src/Uniform';

describe('Uniform', () => {
  it('exposes the Backbuffer sentinel', () => {
    expect(Uniform.Backbuffer).toBe('_Backbuffer_');
  });

  it('exposes the Resolution sentinel', () => {
    expect(Uniform.Resolution).toBe('_Resolution_');
  });

  it('backbufferFrom wraps a node reference', () => {
    const node = {id: 1};
    expect(Uniform.backbufferFrom(node)).toEqual({
      type: 'BackbufferFrom',
      node,
    });
  });

  it('textureSize wraps an object', () => {
    const obj = {uri: 'a.png'};
    expect(Uniform.textureSize(obj)).toEqual({type: 'TextureSize', obj});
  });

  it('textureSizeRatio sets the ratio flag', () => {
    const obj = {uri: 'a.png'};
    expect(Uniform.textureSizeRatio(obj)).toEqual({
      type: 'TextureSize',
      obj,
      ratio: true,
    });
  });
});
