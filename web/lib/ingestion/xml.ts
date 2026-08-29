export interface XmlNode {
  name: string;
  localName: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export interface XmlParseOptions {
  maxCharacters?: number;
  maxDepth?: number;
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (full, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITY_MAP[entity.toLowerCase()] ?? full;
  });
}

function localName(name: string): string {
  const separator = name.lastIndexOf(':');
  return (separator >= 0 ? name.slice(separator + 1) : name).toLowerCase();
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/g;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1]] = decodeEntities(match[2].slice(1, -1));
  }
  return attributes;
}

export function parseXmlDocument(xml: string, options: XmlParseOptions = {}): XmlNode {
  const maxCharacters = options.maxCharacters ?? 25 * 1024 * 1024;
  const maxDepth = options.maxDepth ?? 128;
  if (xml.length > maxCharacters) throw new Error(`XML exceeds ${maxCharacters} character limit`);
  const root: XmlNode = { name: '#document', localName: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<[^>]+>|[^<]+/gi;
  for (const match of xml.matchAll(tokens)) {
    const token = match[0];
    if (token.startsWith('<!--') || token.startsWith('<?') || /^<!DOCTYPE/i.test(token)) continue;
    if (token.startsWith('<![CDATA[')) {
      stack[stack.length - 1].text += token.slice(9, -3);
      continue;
    }
    if (!token.startsWith('<')) {
      stack[stack.length - 1].text += decodeEntities(token);
      continue;
    }
    if (/^<\//.test(token)) {
      if (stack.length === 1) throw new Error('Unexpected XML closing tag');
      const closing = token.slice(2, -1).trim();
      const current = stack.pop()!;
      if (localName(closing) !== current.localName) throw new Error(`Mismatched XML closing tag: ${closing}`);
      continue;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const inside = token.slice(1, selfClosing ? -2 : -1).trim();
    const nameMatch = /^([^\s/>]+)/.exec(inside);
    if (!nameMatch) throw new Error('Malformed XML opening tag');
    if (stack.length >= maxDepth) throw new Error(`XML exceeds depth limit of ${maxDepth}`);
    const node: XmlNode = {
      name: nameMatch[1],
      localName: localName(nameMatch[1]),
      attributes: parseAttributes(inside.slice(nameMatch[0].length)),
      children: [],
      text: '',
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error(`Unclosed XML tag: ${stack[stack.length - 1].name}`);
  if (root.children.length !== 1) throw new Error('XML must contain exactly one root element');
  return root.children[0];
}

export function decodeXmlBytes(bytes: Uint8Array, encoding = 'utf-8'): string {
  try { return new TextDecoder(encoding).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

export function elementText(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  const value = node.text.replace(/\s+/g, ' ').trim();
  return value || undefined;
}

export function findXmlNodes(root: XmlNode, names: readonly string[]): XmlNode[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const result: XmlNode[] = [];
  function visit(node: XmlNode) {
    if (wanted.has(node.localName)) result.push(node);
    for (const child of node.children) visit(child);
  }
  visit(root);
  return result;
}

export function findXmlNode(root: XmlNode, names: readonly string[]): XmlNode | undefined {
  return findXmlNodes(root, names)[0];
}

export function xmlChild(node: XmlNode, names: readonly string[]): XmlNode | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return node.children.find((child) => wanted.has(child.localName));
}

export function xmlText(node: XmlNode, names: readonly string[]): string | undefined {
  return elementText(xmlChild(node, names));
}

export function xmlDescendantText(node: XmlNode, names: readonly string[]): string | undefined {
  return elementText(findXmlNode(node, names));
}

export function xmlAttribute(node: XmlNode, names: readonly string[]): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const match = Object.entries(node.attributes).find(([name]) => wanted.has(localName(name)));
  return match?.[1]?.trim() || undefined;
}

export function xmlNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const compact = value.replace(/[^\d,.-]/g, '');
  if (!compact) return undefined;
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');
  const normalized = lastComma > lastDot
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function xmlDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
