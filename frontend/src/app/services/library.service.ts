import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Bibliothèque : textes et articles (corpus réel, model/corpus) ────────────

export type TexteStatut = 'en_vigueur' | 'abroge' | 'projet' | 'historique' | 'doublon';

export interface LibraryDoc {
  doc_id:          string;
  nom:             string;
  type:            string;
  numero:          string;
  annee:           number | null;
  date:            string;
  domaine:         string;
  categorie:       string;
  articles:        number;
  statut:          TexteStatut;
  statut_label:    string;
  statut_source:   string;
  remplace_par:    { doc_id: string; nom: string } | null;
  source:          string;
  source_url:      string;
  note:            string;
  decisions_citant: number;
}

export interface LibraryCatalog {
  documents:       LibraryDoc[];
  total_articles:  number;
  total_documents: number;
  total_decisions: number;
  categories:      string[];
}

export interface TocEntry { titre: string; niveau: number; index: number; article_ref: string; }

export interface LibraryDocDetail extends LibraryDoc { sommaire: TocEntry[]; }

export interface LibraryArticle {
  index:       number;
  article_ref: string;
  rubrique:    string;
  texte:       string;
  note:        string;
  source_url:  string;
  decisions:   number;
}

export interface ArticlePage { total: number; offset: number; limit: number; articles: LibraryArticle[]; }

export interface ArticleHit {
  doc_id: string; nom: string; index: number; article_ref: string;
  rubrique: string; extrait: string; source_url: string;
}

export interface ArticleSearch { query: string; total: number; results: ArticleHit[]; }

// ── Jurisprudence ────────────────────────────────────────────────────────────

export interface DecisionSummary {
  id:          string;
  titre:       string;
  type:        string;
  juridiction: string;
  chambre:     string;
  date:        string;
  annee:       number | null;
  numero:      string;
  matiere:     string;
  objet:       string;
  parties:     { demandeur: string; defendeur: string };
  source_url:  string;
  extrait:     string;
  nb_articles_cites: number;
  longueur:    number;
}

export interface CitedArticle {
  article: string; texte: string; doc_id: string | null; doc_nom: string; statut: string;
}

export interface DecisionDetail extends DecisionSummary {
  cid:              string;
  sommaire:         string;
  dispositif:       string;
  texte:            string;
  articles_cites:   CitedArticle[];
  source_originale: string;
  collecte_le:      string;
  anonymisation:    string;
  similaires:       DecisionSummary[];
}

export interface DecisionSearch {
  total: number; offset: number; limit: number; total_corpus: number;
  decisions: DecisionSummary[];
  facets: { juridictions: [string, number][]; matieres: [string, number][]; annees: number[] };
}

export interface DecisionQuery {
  q?: string; juridiction?: string; matiere?: string; annee?: number | null;
  sort?: 'recent' | 'ancien' | 'pertinence'; doc_id?: string; article?: string;
  offset?: number; limit?: number;
}

// ── Guide création d'entreprise ──────────────────────────────────────────────

export interface CompanyGuide {
  titre: string;
  mise_a_jour_source: string;
  sources: string;
  source_url: string;
  collecte_le: string;
  formes: { forme: string; frais_guichet: string; precision: string; notaire: string; resume: string; capital_minimum?: string }[];
  delai: string;
  etapes: { num: number; titre: string; description: string }[];
  organismes: { nom: string; role: string }[];
  textes: { nom: string; slug: string; doc_id: string }[];
  questions_frequentes: string[];
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;
  private catalog$?: Observable<LibraryCatalog>;

  catalog(): Observable<LibraryCatalog> {
    // Le catalogue change seulement à la réindexation : une requête par session suffit.
    this.catalog$ ??= this.http.get<LibraryCatalog>(`${this.api}/library`).pipe(shareReplay(1));
    return this.catalog$;
  }

  document(docId: string): Observable<LibraryDocDetail> {
    return this.http.get<LibraryDocDetail>(`${this.api}/library/${docId}`);
  }

  articles(docId: string, offset = 0, limit = 40, q = ''): Observable<ArticlePage> {
    const params = new HttpParams().set('offset', offset).set('limit', limit).set('q', q);
    return this.http.get<ArticlePage>(`${this.api}/library/${docId}/articles`, { params });
  }

  search(q: string, docId = ''): Observable<ArticleSearch> {
    const params = new HttpParams().set('q', q).set('doc_id', docId);
    return this.http.get<ArticleSearch>(`${this.api}/library/search`, { params });
  }

  decisions(query: DecisionQuery): Observable<DecisionSearch> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return this.http.get<DecisionSearch>(`${this.api}/jurisprudence`, { params });
  }

  decision(id: string): Observable<DecisionDetail> {
    return this.http.get<DecisionDetail>(`${this.api}/jurisprudence/${encodeURIComponent(id)}`);
  }

  companyGuide(): Observable<CompanyGuide> {
    return this.http.get<CompanyGuide>(`${this.api}/guides/creation-entreprise`);
  }
}

/** « 2021-12-02 » → « 2 décembre 2021 » */
export function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                'septembre', 'octobre', 'novembre', 'décembre'];
  return `${+m[3]} ${mois[+m[2] - 1]} ${m[1]}`;
}
