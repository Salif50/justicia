import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompanyGuideCard } from '../procedures/company-guide/company-guide';
import { ArticleHit, LibraryService } from '../../services/library.service';

/** Créer une entreprise en Guinée : guide du guichet unique + articles clés de l'AUSCGIE / AUDCG. */
@Component({
  selector: 'app-company',
  standalone: true,
  imports: [RouterLink, CompanyGuideCard],
  templateUrl: './company.html',
  styleUrl: './company.scss',
})
export class Company implements OnInit {
  private lib = inject(LibraryService);

  /** Questions clés → recherche dans le texte réel de l'Acte uniforme (aucun résumé rédigé). */
  readonly topics = [
    { label: 'Capital de la SARL', q: 'capital social société à responsabilité limitée', doc: 'doc_059' },
    { label: 'Statuts : mentions obligatoires', q: 'statuts mentions', doc: 'doc_059' },
    { label: 'Gérant de SARL', q: 'gérant nommé', doc: 'doc_059' },
    { label: 'Capital minimum de la SA', q: 'capital social minimum société anonyme', doc: 'doc_059' },
    { label: 'Immatriculation au RCCM', q: 'immatriculation registre du commerce', doc: 'doc_060' },
    { label: 'Entreprise individuelle', q: 'entreprenant', doc: 'doc_060' },
  ];
  active = signal(0);
  hits = signal<ArticleHit[]>([]);
  loading = signal(false);

  ngOnInit(): void { this.show(0); }

  show(i: number): void {
    this.active.set(i);
    this.loading.set(true);
    const t = this.topics[i];
    this.lib.search(t.q, t.doc).subscribe({
      next: r => { this.hits.set(r.results.slice(0, 5)); this.loading.set(false); },
      error: () => { this.hits.set([]); this.loading.set(false); },
    });
  }
}
