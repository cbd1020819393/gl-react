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

import Visitors from '../../src/Visitors';

describe('Visitors', () => {
  it('add() registers a visitor in the global list', () => {
    const visitor = {name: 'v1'};
    const before = Visitors.get().length;
    Visitors.add(visitor);
    expect(Visitors.get().length).toBe(before + 1);
    expect(Visitors.get()).toContain(visitor);
    Visitors.remove(visitor);
  });

  it('remove() unregisters a registered visitor', () => {
    const visitor = {name: 'v2'};
    Visitors.add(visitor);
    Visitors.remove(visitor);
    expect(Visitors.get()).not.toContain(visitor);
  });

  it('remove() is a no-op for an unknown visitor', () => {
    const before = Visitors.get().slice();
    Visitors.remove({name: 'unknown'});
    expect(Visitors.get()).toEqual(before);
  });
});
