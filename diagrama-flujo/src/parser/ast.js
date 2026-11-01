export function createNodeFactory() {
  let nextId = 1;

  return function createNode(type, startToken, endToken = startToken, data = {}, functionName = null, fields = {}) {
    const start = startToken?.start ?? 0;
    const end = endToken?.end ?? start;
    return {
      id: `node-${nextId++}`,
      type,
      data,
      startLine: startToken?.line ?? 1,
      endLine: endToken?.endLine ?? endToken?.line ?? startToken?.line ?? 1,
      start,
      end,
      comments: [],
      functionName,
      ...fields,
    };
  };
}
