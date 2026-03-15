/**
 * Lightweight TOML parser — enough for pyproject.toml.
 * Not a full TOML spec implementation.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TOMLArray extends Array<TOMLValue> {}
type TOMLValue = string | number | boolean | TOMLArray | Record<string, TOMLValue>;

export function parseTOML(text: string): Record<string, TOMLValue> {
  const result: Record<string, TOMLValue> = {};
  let current: Record<string, TOMLValue> = result;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Array of tables [[section.name]]
    let m = line.match(/^\[\[([^\]]+)\]\]/);
    if (m) {
      const path = m[1].split('.');
      let obj: Record<string, TOMLValue> = result;
      for (let p = 0; p < path.length; p++) {
        const key = path[p].trim().replace(/^"|"$/g, '');
        if (p === path.length - 1) {
          if (!obj[key]) obj[key] = [];
          const entry: Record<string, TOMLValue> = {};
          (obj[key] as TOMLValue[]).push(entry);
          current = entry;
        } else {
          if (!obj[key]) obj[key] = {};
          obj = obj[key] as Record<string, TOMLValue>;
        }
      }
      continue;
    }

    // Table header [section.name]
    m = line.match(/^\[([^\]]+)\]/);
    if (m) {
      const path = m[1].split('.');
      current = result;
      for (const key of path) {
        const k = key.trim().replace(/^"|"$/g, '');
        if (!current[k]) current[k] = {};
        current = current[k] as Record<string, TOMLValue>;
      }
      continue;
    }

    // Key = value
    m = line.match(/^([^=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim().replace(/^"|"$/g, '');
      let val = m[2].trim();

      // Multi-line array
      if (val.startsWith('[') && !val.includes(']')) {
        let arr = val;
        while (i + 1 < lines.length && !arr.includes(']')) {
          i++;
          arr += ' ' + lines[i].trim();
        }
        val = arr;
      }

      current[key] = parseTOMLValue(val);
    }
  }
  return result;
}

export function parseTOMLValue(val: string): TOMLValue {
  val = val.trim();
  // Remove trailing inline comment
  const commentMatch = val.match(/^("[^"]*"|'[^']*'|\[[^\]]*\]|\{[^}]*\}|[^#]*)#/);
  if (commentMatch) val = commentMatch[1].trim();

  // String
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  // Boolean
  if (val === 'true') return true;
  if (val === 'false') return false;
  // Number
  if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
  // Array
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    const items: TOMLValue[] = [];
    let buf = '';
    let inQuote = false;
    let quoteChar = '';
    let braces = 0;
    for (let c = 0; c < inner.length; c++) {
      const ch = inner[c];
      if (inQuote) {
        buf += ch;
        if (ch === quoteChar) inQuote = false;
      } else if (ch === '{') {
        braces++;
        buf += ch;
      } else if (ch === '}') {
        braces--;
        buf += ch;
      } else if (ch === ',' && braces === 0) {
        const trimmed = buf.trim();
        if (trimmed) items.push(parseTOMLValue(trimmed));
        buf = '';
      } else {
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; }
        buf += ch;
      }
    }
    const last = buf.trim();
    if (last) items.push(parseTOMLValue(last));
    return items;
  }
  // Inline table { key = val, ... }
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1).trim();
    const obj: Record<string, TOMLValue> = {};
    if (!inner) return obj;
    const parts = inner.split(',');
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq !== -1) {
        const k = part.slice(0, eq).trim().replace(/^"|"$/g, '');
        obj[k] = parseTOMLValue(part.slice(eq + 1).trim());
      }
    }
    return obj;
  }
  return val;
}
