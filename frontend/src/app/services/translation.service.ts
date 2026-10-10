import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GlossaryEntry {
  original:   string;
  translated: string;
  note:       string;
}

export interface TranslateResponse {
  translated_text:       string;
  source_language:       string;
  target_language:       string;
  glossary:              GlossaryEntry[];
  translation_notes:     string;
  preservation_warnings: string[];
}

export interface KeyTerm {
  term:       string;
  definition: string;
  article:    string;
}

export interface SimplifyResponse {
  simplified_text:  string;
  level:            string;
  key_terms:        KeyTerm[];
  important_points: string[];
  summary:          string;
}

export const LANGUAGES = [
  { code: 'fr',      label: 'Français',           flag: '🇫🇷' },
  { code: 'en',      label: 'English',             flag: '🇬🇧' },
  { code: 'ar',      label: 'Arabe (عربية)',        flag: '🇸🇦' },
  { code: 'pular',   label: 'Pular (Fulfulde)',     flag: '🇬🇳', local: true },
  { code: 'malinke', label: 'Malinké (Mandingue)', flag: '🇬🇳', local: true },
  { code: 'soussou', label: 'Soussou',              flag: '🇬🇳', local: true },
];

export const SIMPLIFY_LEVELS = [
  { value: 'public',        label: 'Grand public',         desc: 'Langage du quotidien, zéro jargon' },
  { value: 'professionnel', label: 'Non-juriste averti',   desc: 'Chef d\'entreprise, fonctionnaire' },
  { value: 'etudiant',      label: 'Étudiant en droit',    desc: 'Termes conservés mais expliqués' },
];

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly api = `${environment.apiUrl}/translation`;

  constructor(private http: HttpClient) {}

  translate(
    text: string,
    sourceLang: string,
    targetLang: string,
    mode: string,
    file?: File | null,
  ): Observable<TranslateResponse> {
    const fd = new FormData();
    if (file) fd.append('file', file, file.name); else fd.append('text', text);
    fd.append('source_lang', sourceLang);
    fd.append('target_lang', targetLang);
    fd.append('mode', mode);
    return this.http.post<TranslateResponse>(`${this.api}/translate`, fd);
  }

  simplify(
    text: string,
    level: string,
    file?: File | null,
  ): Observable<SimplifyResponse> {
    const fd = new FormData();
    if (file) fd.append('file', file, file.name); else fd.append('text', text);
    fd.append('level', level);
    return this.http.post<SimplifyResponse>(`${this.api}/simplify`, fd);
  }
}
