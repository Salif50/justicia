import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface TemplateField {
  key:      string;
  label:    string;
  required: boolean;
  type:     'text' | 'textarea' | 'date' | 'number' | 'select';
  options?: string[];
}

export interface ContractTemplate {
  id:          string;
  label:       string;
  description: string;
  icon:        string;
  category:    string;
  domain:      string;
  fields:      TemplateField[];
}

export interface GenerateRequest {
  contract_type:   string;
  form_data:       Record<string, string>;
  user_directives: string;
}

export interface GenerateResponse {
  id:         string;
  title:      string;
  content:    string;
  sources:    any[];
  created_at: string;
}

export interface AnalyzeIssue {
  severity:      string;
  clause:        string;
  article_viole: string;
  article:       string;
  description:   string;
  suggestion:    string;
}

export interface AnalyzeResponse {
  id:               string;
  title:            string;
  issues:           AnalyzeIssue[];
  suggestions:      string[];
  missing_clauses:  string[];
  strong_points:    string[];
  conformity_score: number;
  risk_level:       string;
  verdict:          string;
  detected_type:    string;
  sources:          any[];
  created_at:       string;
}

export interface DocumentArchiveOut {
  id:            string;
  title:         string;
  mode:          string;
  contract_type: string;
  created_at:    string;
}

export interface DocumentArchiveDetail extends DocumentArchiveOut {
  content:   string;
  analysis:  string | null;
  sources:   string;
  form_data: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GenerationService {
  private readonly api = `${environment.apiUrl}/generation`;

  constructor(private http: HttpClient) {}

  getTemplates(): Observable<ContractTemplate[]> {
    return this.http.get<ContractTemplate[]>(`${this.api}/templates`)
      .pipe(catchError(() => of([])));
  }

  generateContract(req: GenerateRequest): Observable<GenerateResponse> {
    return this.http.post<GenerateResponse>(`${this.api}/generate`, req);
  }

  analyzeContract(file: File, contractType: string): Observable<AnalyzeResponse> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('contract_type', contractType);
    return this.http.post<AnalyzeResponse>(`${this.api}/analyze`, fd);
  }

  getArchives(): Observable<DocumentArchiveOut[]> {
    return this.http.get<DocumentArchiveOut[]>(`${this.api}/archives`)
      .pipe(catchError(() => of([])));
  }

  getArchive(id: string): Observable<DocumentArchiveDetail | null> {
    return this.http.get<DocumentArchiveDetail>(`${this.api}/archives/${id}`)
      .pipe(catchError(() => of(null)));
  }

  deleteArchive(id: string): Observable<any> {
    return this.http.delete(`${this.api}/archives/${id}`)
      .pipe(catchError(() => of(null)));
  }
}
