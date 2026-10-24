import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
export interface FirmInvitation { id: string; email: string; role: 'member'|'admin'|'viewer'; status: string; created_at: string; token?: string; }
export interface FirmMember { id: string; user_id: string; name: string; email: string; role: string; created_at: string; }
@Injectable({providedIn:'root'}) export class FirmService {
  private api = `${environment.apiUrl}/firm`;
  constructor(private http: HttpClient) {}
  list(): Observable<FirmInvitation[]> { return this.http.get<FirmInvitation[]>(`${this.api}/invitations`); }
  invite(email: string, role: string) { return this.http.post<FirmInvitation>(`${this.api}/invitations`, { email, role }); }
  cancel(id: string) { return this.http.delete(`${this.api}/invitations/${id}`); }
  members(): Observable<FirmMember[]> { return this.http.get<FirmMember[]>(`${this.api}/members`); }
  removeMember(id: string) { return this.http.delete(`${this.api}/members/${id}`); }
  accept(token: string) { return this.http.post<FirmMember>(`${this.api}/invitations/${encodeURIComponent(token)}/accept`, {}); }
}
