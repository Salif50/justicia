import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DiffItem {
  theme:          string;
  text_a_extract: string;
  text_b_extract: string;
  impact:         string;
  severity:       'critique' | 'majeur' | 'mineur';
  favors:         'A' | 'B' | 'neutre';
}

export interface ArticleCheck {
  article:      string;
  requirement:  string;
  text_extract: string;
  status:       'conforme' | 'partiel' | 'manquant' | 'violation';
  note:         string;
}

export interface CompareTextsResponse {
  summary:           string;
  similarity_score:  number;
  key_differences:   DiffItem[];
  text_a_strengths:  string[];
  text_b_strengths:  string[];
  text_a_weaknesses: string[];
  text_b_weaknesses: string[];
  recommendation:    string;
  risk_a:            number;
  risk_b:            number;
}

export interface LegalCompareResponse {
  domain:            string;
  summary:           string;
  conformity_score:  number;
  articles_compared: ArticleCheck[];
  missing_clauses:   string[];
  violations:        string[];
  recommendation:    string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ComparisonService {
  private readonly api = `${environment.apiUrl}/comparison`;

  constructor(private http: HttpClient) {}

  compareTexts(
    textA: string, textB: string,
    labelA: string, labelB: string,
    fileA?: File | null, fileB?: File | null,
  ): Observable<CompareTextsResponse> {
    const fd = new FormData();
    if (fileA) fd.append('file_a', fileA, fileA.name); else fd.append('text_a', textA);
    if (fileB) fd.append('file_b', fileB, fileB.name); else fd.append('text_b', textB);
    fd.append('label_a', labelA);
    fd.append('label_b', labelB);
    return this.http.post<CompareTextsResponse>(`${this.api}/compare`, fd);
  }

  compareLegal(
    text: string,
    domain: string,
    label: string,
    file?: File | null,
  ): Observable<LegalCompareResponse> {
    const fd = new FormData();
    if (file) fd.append('file', file, file.name); else fd.append('text', text);
    fd.append('domain', domain);
    fd.append('label', label);
    return this.http.post<LegalCompareResponse>(`${this.api}/legal`, fd);
  }
}
