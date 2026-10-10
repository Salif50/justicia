import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface CaseOut {
  id: string;
  name: string;
  description: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface CaseDocumentOut {
  id: string;
  name: string;
  doc_type: string;
  author: string | null;
  doc_date: string | null;
  original_name: string;
  file_size: number;
  page_count: number;
  has_text: boolean;
  created_at: string;
}

export interface CaseNote {
  id: string;
  author: string;
  note_type: string;
  content: string;
  declared_at: string;
  created_at: string;
  updated_at: string;
}

export interface CaseDetail extends CaseOut {
  documents: CaseDocumentOut[];
  notes: CaseNote[];
}

export interface CaseMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class CaseService {
  private readonly api = `${environment.apiUrl}/cases`;

  constructor(private http: HttpClient) {}

  // ── CRUD Procès ─────────────────────────────────────────────────────────────
  list(): Observable<CaseOut[]> {
    return this.http.get<CaseOut[]>(`${this.api}/`).pipe(catchError(() => of([])));
  }

  get(id: string): Observable<CaseDetail | null> {
    return this.http.get<CaseDetail>(`${this.api}/${id}`).pipe(catchError(() => of(null)));
  }

  create(name: string, description: string): Observable<CaseOut> {
    return this.http.post<CaseOut>(`${this.api}/`, { name, description });
  }

  update(id: string, data: { name?: string; description?: string }): Observable<CaseOut> {
    return this.http.put<CaseOut>(`${this.api}/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.api}/${id}`).pipe(catchError(() => of(null)));
  }

  // ── Documents ────────────────────────────────────────────────────────────────
  uploadDocument(
    caseId: string,
    file: File,
    name: string,
    docType: string,
    author?: string,
    docDate?: string,
  ): Observable<CaseDocumentOut> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('doc_type', docType);
    if (author) form.append('author', author);
    if (docDate) form.append('doc_date', docDate);
    return this.http.post<CaseDocumentOut>(`${this.api}/${caseId}/documents`, form);
  }

  deleteDocument(caseId: string, docId: string): Observable<any> {
    return this.http.delete(`${this.api}/${caseId}/documents/${docId}`).pipe(catchError(() => of(null)));
  }

  // ── Chat IA ──────────────────────────────────────────────────────────────────
  getMessages(caseId: string): Observable<CaseMessage[]> {
    return this.http.get<CaseMessage[]>(`${this.api}/${caseId}/messages`).pipe(catchError(() => of([])));
  }

  sendMessage(
    caseId: string,
    message: string,
    source: 'all' | 'documents' | 'notes' = 'all',
  ): Observable<{ id: string; content: string; created_at: string }> {
    return this.http.post<{ id: string; content: string; created_at: string }>(
      `${this.api}/${caseId}/chat`,
      { message, source },
    );
  }

  // ── Notes / Déclarations ────────────────────────────────────────────────────
  getNotes(caseId: string): Observable<CaseNote[]> {
    return this.http.get<CaseNote[]>(`${this.api}/${caseId}/notes`).pipe(catchError(() => of([])));
  }

  addNote(caseId: string, data: {
    author: string;
    note_type: string;
    content: string;
    declared_at?: string;
  }): Observable<CaseNote> {
    return this.http.post<CaseNote>(`${this.api}/${caseId}/notes`, data);
  }

  updateNote(caseId: string, noteId: string, data: {
    author?: string;
    note_type?: string;
    content?: string;
    declared_at?: string;
  }): Observable<CaseNote> {
    return this.http.put<CaseNote>(`${this.api}/${caseId}/notes/${noteId}`, data);
  }

  deleteNote(caseId: string, noteId: string): Observable<any> {
    return this.http.delete(`${this.api}/${caseId}/notes/${noteId}`).pipe(catchError(() => of(null)));
  }

  // ── Fichier PDF ──────────────────────────────────────────────────────────────
  getDocumentFileUrl(caseId: string, docId: string): string {
    return `${this.api}/${caseId}/documents/${docId}/file`;
  }

  getDocumentBlob(caseId: string, docId: string): Observable<Blob> {
    return this.http.get(`${this.api}/${caseId}/documents/${docId}/file`, {
      responseType: 'blob',
    });
  }

  // ── Utilitaires ──────────────────────────────────────────────────────────────
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }
}
