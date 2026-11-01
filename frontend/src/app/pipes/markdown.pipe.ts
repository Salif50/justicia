import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

// Configuration marked pour un rendu juridique propre
const renderer = new marked.Renderer();

// Liens ouverts dans un nouvel onglet
renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }) => {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" ${title ? `title="${title}"` : ''}>${text}</a>`;
};

// Blockquote = citation d'article de loi
renderer.blockquote = ({ text }: { text: string }) => {
  return `<blockquote class="legal-quote">${text}</blockquote>`;
};

// Le HTML brut éventuellement produit par le modèle est affiché tel quel, jamais interprété
renderer.html = ({ text }: { text: string }) => escapeHtml(text);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** « Article 431.3 » → « art. 431.3 » (libellé court des renvois). */
export function shortRef(ref: string | undefined | null): string {
  const r = (ref || '').trim();
  return r.replace(/^article\s*/i, 'art. ') || 'source';
}

/** Titres de documents en capitales remis en casse normale. */
export function docLabel(name: string | undefined | null): string {
  const n = (name || '').replace(/\s+/g, ' ').trim();
  const letters = n.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters && letters.replace(/[^A-ZÀ-Ý]/g, '').length / letters.length > 0.7) {
    const lower = n.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return n;
}

marked.setOptions({
  renderer,
  breaks: true,     // Retours à la ligne simples = <br>
  gfm: true,        // GitHub Flavored Markdown
});

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  /**
   * `sources` (facultatif) : renvois [n] de la réponse → boutons cliquables
   * portant la référence courte de l'article (« art. 431.3 »).
   */
  transform(value: string | null | undefined, sources?: any[] | null): SafeHtml {
    if (!value) return '';
    // Certains fournisseurs renvoient des astérisques échappés ou des
    // séparateurs décoratifs (`***`) au lieu d'un Markdown propre. On les
    // normalise avant marked pour éviter l'affichage brut des `*` dans le chat.
    const normalized = value
      .replace(/\\([*_])/g, '$1')
      .replace(/^\s*\*{3,}\s*$/gm, '---')
      .replace(/^\s*\*\s+/gm, '- ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    let html = marked.parse(normalized) as string;
    const cited = new Map<number, any>();
    const decisions = new Map<number, any>();
    for (const s of sources || []) {
      if (!s?.cite_no) continue;
      (s.kind === 'decision' ? decisions : cited).set(Number(s.cite_no), s);
    }
    // Décisions de justice : [J1] → bouton « J1 · Cour suprême 2021 »
    if (decisions.size) {
      html = html.replace(/\[J(\d{1,2})\]/g, (match, n) => {
        const d = decisions.get(Number(n));
        if (!d) return '';
        const year = String(d.date || '').slice(0, 4);
        const court = String(d.juridiction || '').replace(/\s*\(OHADA\)/, '').replace(/^Tribunal de première instance/, 'TPI');
        const title = escapeHtml(d.article_ref || court);
        return `<button type="button" class="cite-ref cite-ref--juris" data-juris="${n}" title="${title}">`
          + `<span class="cite-no">J${n}</span>${escapeHtml(court)}${year ? ' ' + year : ''}</button>`;
      });
    } else {
      html = html.replace(/\s?\[J\d{1,2}\]/g, '');
    }
    if (cited.size) {
      html = html.replace(/\[(\d{1,2})\]/g, (match, n) => {
        const src = cited.get(Number(n));
        if (!src) return match;
        const title = escapeHtml(`${docLabel(src.nom_doc)} — ${src.article_ref || ''}`);
        return `<button type="button" class="cite-ref" data-cite="${n}" title="${title}">`
          + `<span class="cite-no">${n}</span>${escapeHtml(shortRef(src.article_ref))}</button>`;
      });
    }
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
