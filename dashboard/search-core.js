// The search core (Ctrl K palette): no accents, no capitals, every word in any
// order. Pure: tested in Node and used in the browser.
(function (root) {
  'use strict';

  function normalize(value) {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function words(query) {
    return normalize(query).split(/\s+/).filter(Boolean);
  }

  function score(item, toks) {
    const label = normalize(item.label);
    const rest = normalize(`${item.hint || ''} ${item.keywords || ''}`);
    let total = 0;
    for (const t of toks) {
      if (label.startsWith(t)) total += 6;
      else if (new RegExp(`(^|\\W)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label)) total += 4;
      else if (label.includes(t)) total += 3;
      else if (rest.includes(t)) total += 1;
      else return -1;
    }
    return total;
  }

  /* Sorts by group (in the order each group appears) and, within the group, by
     score. `limitPerGroup` trims long groups (videos…). */
  function rank(items, query, { limitPerGroup = {} } = {}) {
    const toks = words(query);
    if (!toks.length) return items.slice();
    const order = [];
    const groups = new Map();
    items.forEach((item, index) => {
      const s = score(item, toks);
      if (s < 0) return;
      const g = item.group || '';
      if (!groups.has(g)) { groups.set(g, []); order.push(g); }
      groups.get(g).push({ item, s, index });
    });
    return order.flatMap(g => groups.get(g)
      .sort((a, b) => b.s - a.s || a.index - b.index)
      .slice(0, limitPerGroup[g] ?? Infinity)
      .map(x => x.item));
  }

  /* ALWAYS escapes the text and then wraps what matches in <mark>. It
     compares letter by letter without accents, so "oracion" highlights
     "Oración". */
  function highlight(text, query, escape) {
    const original = String(text ?? '');
    const toks = words(query);
    const chars = [...original];
    if (!toks.length) return escape(original);
    // Plain text + a plain-position → original-letter map. A letter can give 0
    // plain characters (an emoji variation selector) or several.
    let flat = '';
    const origen = [];
    chars.forEach((c, i) => {
      const n = normalize(c);
      flat += n;
      for (let k = 0; k < n.length; k += 1) origen.push(i); // per UTF-16 unit, like indexOf
    });
    const marca = new Array(chars.length).fill(false);
    for (const t of toks) {
      let from = 0;
      let at;
      while ((at = flat.indexOf(t, from)) !== -1) {
        for (let j = at; j < at + t.length; j += 1) marca[origen[j]] = true;
        from = at + t.length;
      }
    }
    let out = '';
    let open = false;
    chars.forEach((c, i) => {
      if (marca[i] && !open) { out += '<mark>'; open = true; }
      if (!marca[i] && open) { out += '</mark>'; open = false; }
      out += escape(c);
    });
    return open ? `${out}</mark>` : out;
  }

  const api = { normalize, words, rank, highlight };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.searchCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
