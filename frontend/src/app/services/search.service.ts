import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SearchResultConversation {
  id: string; title: string; agent_id: string; updated_at: string; link: string;
}
export interface SearchResultCase {
  id: string; name: string; description: string; status: string; created_at: string; link: string;
}
export interface SearchResultDocument {
  id: string; name: string; doc_type: string; author: string; case_id: string; uploaded_at: string; link: string;
}
export interface SearchResultNote {
  id: string; author: string; note_type: string; excerpt: string; case_id: string; declared_at: string; link: string;
}
export interface SearchResults {
  query: string;
  conversations: SearchResultConversation[];
  cases: SearchResultCase[];
  documents: SearchResultDocument[];
  notes: SearchResultNote[];
}

const EMPTY: SearchResults = { query: '', conversations: [], cases: [], documents: [], notes: [] };

@Injectable({ providedIn: 'root' })
export class SearchService {
  private api = environment.apiUrl;

  isOpen   = signal(false);
  results  = signal<SearchResults>(EMPTY);
  loading  = signal(false);
  query    = signal('');

  private querySubject = new Subject<string>();

  constructor(private http: HttpClient) {
    this.querySubject.pipe(
      debounceTime(280),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q || q.trim().length < 2) { this.results.set(EMPTY); this.loading.set(false); return of(null); }
        this.loading.set(true);
        return this.http.get<SearchResults>(`${this.api}/search`, { params: { q } }).pipe(
          catchError(() => of(EMPTY))
        );
      })
    ).subscribe(r => {
      this.loading.set(false);
      if (r) this.results.set(r);
    });
  }

  open()  { this.isOpen.set(true); }
  close() { this.isOpen.set(false); this.query.set(''); this.results.set(EMPTY); }
  toggle(){ this.isOpen() ? this.close() : this.open(); }

  search(q: string) {
    this.query.set(q);
    if (q.length >= 2) this.loading.set(true);
    this.querySubject.next(q);
  }

  get totalResults() {
    const r = this.results();
    return r.conversations.length + r.cases.length + r.documents.length + r.notes.length;
  }
}
