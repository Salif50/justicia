import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ArticleResult {
  article_ref: string;
  nom_doc:     string;
  numero:      string;
  domaine:     string;
  texte:       string;
  score:       number;
}

export interface SearchResponse {
  query:      string;
  ai_summary: string;
  results:    ArticleResult[];
  total:      number;
}

export interface AskCodeResponse {
  answer:     string;
  code_titre: string;
  sources:    ArticleResult[];
}

@Injectable({ providedIn: 'root' })
export class EncyclopediaService {
  private readonly api = `${environment.apiUrl}/encyclopedia`;

  constructor(private http: HttpClient) {}

  search(query: string, topK = 10): Observable<SearchResponse> {
    const fd = new FormData();
    fd.append('query', query);
    fd.append('top_k', String(topK));
    return this.http.post<SearchResponse>(`${this.api}/search`, fd);
  }

  askCode(question: string, codeTitre: string, topK = 8): Observable<AskCodeResponse> {
    const fd = new FormData();
    fd.append('question', question);
    fd.append('code_titre', codeTitre);
    fd.append('top_k', String(topK));
    return this.http.post<AskCodeResponse>(`${this.api}/ask`, fd);
  }
}
