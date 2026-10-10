import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Etape {
  num:         number;
  titre:       string;
  description: string;
  duree?:      string;
  cout?:       string;
  lieu?:       string;
  optionnel?:  boolean;
}

export interface ProcedureDto {
  id:           number;
  slug:         string;
  titre:        string;
  categorie:    string;
  icon:         string;
  description:  string;
  duree_totale: string;
  cout_estime:  string;
  difficulte:   'Facile' | 'Moyen' | 'Complexe';
  urgence:      boolean;
  docs_requis:  string[];
  etapes:       Etape[];
  conseil:      string;
  base_legale:  string;
  questions_ia: string[];
  ordre:        number;
  actif:        boolean;
  created_at:   string;
  updated_at:   string;
}

export type ProcedureCreate = Omit<ProcedureDto, 'id' | 'created_at' | 'updated_at'>;
export type ProcedureUpdate = Partial<ProcedureCreate>;

@Injectable({ providedIn: 'root' })
export class ProcedureService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/procedures`;

  getPublic(): Observable<ProcedureDto[]> {
    return this.http.get<ProcedureDto[]>(this.base);
  }

  adminGetAll(): Observable<ProcedureDto[]> {
    return this.http.get<ProcedureDto[]>(`${this.base}/admin/all`);
  }

  adminCreate(body: ProcedureCreate): Observable<ProcedureDto> {
    return this.http.post<ProcedureDto>(`${this.base}/admin`, body);
  }

  adminUpdate(id: number, body: ProcedureUpdate): Observable<ProcedureDto> {
    return this.http.put<ProcedureDto>(`${this.base}/admin/${id}`, body);
  }

  adminToggle(id: number): Observable<ProcedureDto> {
    return this.http.patch<ProcedureDto>(`${this.base}/admin/${id}/toggle`, {});
  }

  adminDelete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/${id}`);
  }

  adminReorder(ids: number[]): Observable<{ ok: boolean }> {
    return this.http.patch<{ ok: boolean }>(`${this.base}/admin/reorder`, ids);
  }
}
