import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

export interface ClientRecord { id: string; name: string; email: string | null; phone: string | null; organization: string | null; status: string; notes: string | null; created_at: string; updated_at: string; }
export type ClientPayload = Pick<ClientRecord, 'name' | 'email' | 'phone' | 'organization' | 'status' | 'notes'>;

@Injectable({ providedIn: 'root' })
export class ClientService {
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}
  list(q = ''): Observable<ClientRecord[]> { const params = q ? new HttpParams().set('q', q) : undefined; return this.http.get<ClientRecord[]>(`${this.api}/clients`, { params }); }
  create(body: ClientPayload) { return this.http.post<ClientRecord>(`${this.api}/clients`, body); }
  update(id: string, body: Partial<ClientPayload>) { return this.http.put<ClientRecord>(`${this.api}/clients/${id}`, body); }
  delete(id: string) { return this.http.delete(`${this.api}/clients/${id}`); }
}
