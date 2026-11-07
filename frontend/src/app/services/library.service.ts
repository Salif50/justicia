import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Bibliothèque : textes et articles (corpus réel, model/corpus) ────────────

export type TexteStatut = 'en_vigueur' | 'abroge' | 'projet' | 'historique' | 'doublon';

export type Famille = 'code' | 'loi' | 'constitution' | 'traite' | 'convention'
  | 'reglementaire' | 'organisation' | 'individuel' | 'ratification' | 'promulgation';

export interface JoRef { jo: string; numero: string; date: string; page: number; intitule: string; }

export interface LibraryDoc {
  doc_id:          string;
  nom:             string;
  type:            string;
  famille:         Famille;
  famille_label:   string;
  emetteur:        string;
  indexe:          boolean;
  qualite:         string[];
  journal_officiel: JoRef[];
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
  total_textes:    number;
  total_decisions: number;
  familles:        { famille: Famille; label: string; count: number }[];
  categories:      string[];
}

export interface Relation {
  doc_id: string; type: 'modifie' | 'abroge' | 'applique' | 'cite'; article: string;
  nom: string; nature: string; date: string; numero: string;
}

export interface ActsPage {
  total: number; offset: number; limit: number; items: LibraryDoc[];
  facets: { familles: { famille: Famille; label: string; count: number }[]; annees: number[]; emetteurs: [string, number][] };
}

export interface JoIssueSummary {
  id: string; numero: string; special: boolean; date: string; titre: string; theme: string; source_url: string;
  nb_textes: number; nb_relies: number; natures: [string, number][]; apercu: string[];
}

export interface JoEntry {
  nature: string; intitule: string; page: number; cle: string; doc_id: string | null;
  famille: string; famille_label: string; indexe: boolean;
}

export interface JoIssue extends Omit<JoIssueSummary, 'nb_textes' | 'nb_relies' | 'natures' | 'apercu'> { entrees: JoEntry[]; }

export interface JoList { total: number; offset: number; limit: number; annees: number[]; numeros: JoIssueSummary[]; }

export interface OhadaHub {
  actes: LibraryDoc[]; textes: LibraryDoc[]; decisions_ccja: DecisionSummary[];
  total_ccja: number; total_articles: number;
}

export interface LibraryStats {
  textes_en_vigueur: number; articles: number; textes_total: number; codes_et_lois: number;
  actes_uniformes: number; decisions: number; numeros_jo: number;
  derniers_textes: LibraryDoc[]; dernieres_decisions: DecisionSummary[];
  derniers_jo: { id: string; numero: string; special: boolean; date: string; titre: string; theme: string; nb_textes: number }[];
}

export interface QuickResults {
  textes: { doc_id: string; nom: string; type: string; numero: string; annee: number | null; famille_label: string }[];
  articles: ArticleHit[];
  decisions: DecisionSummary[];
}

export type PublicFigures = Pick<LibraryStats, 'textes_en_vigueur' | 'articles' | 'textes_total' | 'codes_et_lois'
  | 'actes_uniformes' | 'decisions' | 'numeros_jo'> & {
  principaux_textes: { titre: string; annee: number | null; articles: number }[];
};

export interface TocEntry { titre: string; niveau: number; index: number; article_ref: string; }

export interface LibraryDocDetail extends LibraryDoc {
  sommaire: TocEntry[];
  relations: { cite: Relation[]; cite_par: Relation[] };
}

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

  acts(query: { q?: string; famille?: string; annee?: number | null; emetteur?: string; sort?: string; offset?: number; limit?: number }): Observable<ActsPage> {
    return this.http.get<ActsPage>(`${this.api}/library/actes`, { params: this.params(query) });
  }

  ohada(): Observable<OhadaHub> {
    return this.http.get<OhadaHub>(`${this.api}/library/ohada`);
  }

  stats(): Observable<LibraryStats> {
    return this.http.get<LibraryStats>(`${this.api}/library/stats`);
  }

  quick(q: string): Observable<QuickResults> {
    return this.http.get<QuickResults>(`${this.api}/library/quick`, { params: { q } });
  }

  journal(query: { annee?: number | null; q?: string; offset?: number; limit?: number }): Observable<JoList> {
    return this.http.get<JoList>(`${this.api}/journal-officiel`, { params: this.params(query) });
  }

  journalIssue(id: string): Observable<JoIssue> {
    return this.http.get<JoIssue>(`${this.api}/journal-officiel/${encodeURIComponent(id)}`);
  }

  publicFigures(): Observable<PublicFigures> {
    return this.http.get<PublicFigures>(`${this.api}/public/corpus-figures`);
  }

  private params(query: object): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return p;
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
