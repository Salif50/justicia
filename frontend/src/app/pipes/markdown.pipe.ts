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

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const html = marked.parse(value) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
