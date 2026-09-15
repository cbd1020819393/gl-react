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

import Visitor from '../../src/Visitor';

describe('Visitor', () => {
  it('provides no-op lifecycle hooks', () => {
    const v = new Visitor();
    const surface = {};
    const node = {};
    expect(v.onSurfaceMount(surface)).toBeUndefined();
    expect(v.onSurfaceUnmount(surface)).toBeUndefined();
    expect(v.onSurfaceGLContextChange(surface, null)).toBeUndefined();
    expect(v.onSurfaceDrawSkipped(surface)).toBeUndefined();
    expect(v.onSurfaceDrawStart(surface)).toBeUndefined();
    expect(v.onSurfaceDrawEnd(surface)).toBeUndefined();
    expect(v.onNodeDrawSkipped(node)).toBeUndefined();
    expect(v.onNodeDrawStart(node)).toBeUndefined();
    expect(v.onNodeSyncDeps(node, [], [])).toBeUndefined();
    expect(v.onNodeDraw(node, [])).toBeUndefined();
    expect(v.onNodeDrawEnd(node)).toBeUndefined();
  });

  it('onSurfaceDrawError returns false by default (error is re-thrown)', () => {
    const v = new Visitor();
    expect(v.onSurfaceDrawError(new Error('boom'))).toBe(false);
  });
});
