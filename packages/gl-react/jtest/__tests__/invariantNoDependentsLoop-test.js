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

jest.mock('../../src/Node', () => {
  class Node {
    constructor() {
      this.dependents = [];
    }
  }
  return {__esModule: true, default: Node};
});

import Node from '../../src/Node';
import invariantNoDependentsLoop from '../../src/helpers/invariantNoDependentsLoop';

describe('invariantNoDependentsLoop', () => {
  it('throws when base is the node itself', () => {
    const node = new Node();
    expect(() => invariantNoDependentsLoop(node, node)).toThrow(
      /Found a loop in the rendering graph/
    );
  });

  it('throws when base is reachable through the dependents graph', () => {
    const base = new Node();
    const mid = new Node();
    const leaf = new Node();
    mid.dependents.push(base);
    leaf.dependents.push(mid);
    expect(() => invariantNoDependentsLoop(base, leaf)).toThrow(
      /Found a loop in the rendering graph/
    );
  });

  it('passes for an unrelated graph', () => {
    const base = new Node();
    const other = new Node();
    other.dependents.push(new Node());
    expect(() => invariantNoDependentsLoop(base, other)).not.toThrow();
  });

  it('does not recurse into plain objects (non-Node dependents)', () => {
    const base = new Node();
    // 故意传入非 Node 实例：instanceof 守卫应跳过 dependents 递归
    const plain = {dependents: [base]};
    expect(() => invariantNoDependentsLoop(base, plain)).not.toThrow();
  });
});
