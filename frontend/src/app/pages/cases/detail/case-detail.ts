import { Component, ElementRef, OnInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { CaseService, CaseDetail, CaseDocumentOut, CaseMessage, CaseNote } from '../../../services/case.service';

const DOC_TYPES = [
  'Procès-verbal (PV)', 'Ordonnance de renvoi', 'Jugement', 'Arrêt',
  'Assignation', 'Citation directe', 'Mémoire', 'Conclusions',
  'Pièce à conviction', 'Témoignage écrit', 'Contrat', 'Acte notarié',
  'Rapport d\'expertise', 'Acte de naissance', 'Autre',
];

const NOTE_TYPES = [
  'Déclaration', 'Témoignage', 'Aveux', 'Déposition',
  'Objection', 'Observation', 'Réquisitoire', 'Plaidoirie', 'Délibération', 'Autre',
];

// Couleurs par type de note
const NOTE_TYPE_COLORS: Record<string, string> = {
  'Déclaration':  '#3b82f6',
  'Témoignage':   '#8b5cf6',
  'Aveux':        '#dc2626',
  'Déposition':   '#FF8A00',
  'Objection':    '#f59e0b',
  'Observation':  '#64748b',
  'Réquisitoire': '#b45309',
  'Plaidoirie':   '#059669',
  'Délibération': '#7c3aed',
  'Autre':        '#94a3b8',
};

@Component({
  selector: 'app-case-detail',
  imports: [CommonModule, FormsModule],
  templateUrl: './case-detail.html',
  styleUrl: './case-detail.scss',
})
export class CaseDetailPage implements OnInit {
  @ViewChild('chatEnd') chatEnd!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  caseId = '';
  case_  = signal<CaseDetail | null>(null);
  messages = signal<CaseMessage[]>([]);

  isLoading    = signal(true);
  isLoadingMsgs = signal(false);
  isSending    = signal(false);
  isUploading  = signal(false);
  activeTab    = signal<'documents' | 'notes' | 'chat'>('documents');

  // Upload document
  showUploadModal = signal(false);
  uploadFile      = signal<File | null>(null);
  uploadName      = signal('');
  uploadDocType   = signal('Autre');
  uploadAuthor    = signal('');
  uploadDate      = signal('');
  uploadError     = signal('');
  uploadProgress  = signal(false);

  // Chat
  chatMessage  = signal('');
  chatError    = signal('');
  chatSource   = signal<'all' | 'documents' | 'notes'>('all');

  // Suppression
  deletingDocId = signal<string | null>(null);

  // Viewer PDF
  viewerDoc     = signal<CaseDocumentOut | null>(null);
  viewerUrl     = signal<SafeResourceUrl | null>(null);
  viewerLoading = signal(false);

  // Notes
  notes          = signal<CaseNote[]>([]);
  showNoteForm   = signal(false);
  noteAuthor     = signal('');
  noteType       = signal('Déclaration');
  noteContent    = signal('');
  noteDatetime   = signal('');   // datetime-local string
  noteError      = signal('');
  isSavingNote   = signal(false);
  editingNote    = signal<CaseNote | null>(null);
  deletingNoteId = signal<string | null>(null);

  readonly docTypes  = DOC_TYPES;
  readonly noteTypes = NOTE_TYPES;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: CaseService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.caseId = this.route.snapshot.paramMap.get('id') || '';
    this.loadCase();
  }

  loadCase() {
    this.isLoading.set(true);
    this.svc.get(this.caseId).subscribe(c => {
      this.case_.set(c);
      this.isLoading.set(false);
      if (c) {
        this.notes.set(c.notes || []);
        this.loadMessages();
      }
    });
  }

  loadMessages() {
    this.isLoadingMsgs.set(true);
    this.svc.getMessages(this.caseId).subscribe(msgs => {
      this.messages.set(msgs);
      this.isLoadingMsgs.set(false);
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.uploadFile.set(f);
    if (!this.uploadName().trim()) {
      this.uploadName.set(f.name.replace(/\.pdf$/i, ''));
    }
  }

  openUploadModal() {
    this.uploadFile.set(null);
    this.uploadName.set('');
    this.uploadDocType.set('Autre');
    this.uploadAuthor.set('');
    this.uploadDate.set('');
    this.uploadError.set('');
    this.showUploadModal.set(true);
  }

  closeUploadModal() {
    this.showUploadModal.set(false);
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  uploadDocument() {
    const file = this.uploadFile();
    if (!file) { this.uploadError.set('Sélectionnez un fichier PDF.'); return; }
    if (!this.uploadName().trim()) { this.uploadError.set('Le nom du document est obligatoire.'); return; }
    this.uploadProgress.set(true);
    this.uploadError.set('');
    this.svc.uploadDocument(
      this.caseId, file,
      this.uploadName().trim(),
      this.uploadDocType(),
      this.uploadAuthor().trim() || undefined,
      this.uploadDate().trim() || undefined,
    ).subscribe({
      next: (doc) => {
        this.uploadProgress.set(false);
        this.closeUploadModal();
        const c = this.case_();
        if (c) {
          this.case_.set({ ...c, documents: [...c.documents, doc], document_count: c.document_count + 1 });
        }
      },
      error: (err) => {
        this.uploadProgress.set(false);
        this.uploadError.set(err.error?.detail || 'Erreur lors du téléversement.');
      },
    });
  }

  deleteDoc(docId: string) {
    this.deletingDocId.set(docId);
    this.svc.deleteDocument(this.caseId, docId).subscribe({
      next: () => {
        this.deletingDocId.set(null);
        const c = this.case_();
        if (c) {
          const docs = c.documents.filter(d => d.id !== docId);
          this.case_.set({ ...c, documents: docs, document_count: docs.length });
        }
      },
      error: () => this.deletingDocId.set(null),
    });
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  sendMessage() {
    const msg = this.chatMessage().trim();
    if (!msg || this.isSending()) return;
    this.chatError.set('');
    this.isSending.set(true);

    const userMsg: CaseMessage = {
      id: 'tmp-' + Date.now(),
      role: 'user',
      content: msg,
      created_at: new Date().toISOString(),
    };
    this.messages.update(m => [...m, userMsg]);
    this.chatMessage.set('');
    setTimeout(() => this.scrollToBottom(), 30);

    this.svc.sendMessage(this.caseId, msg, this.chatSource()).subscribe({
      next: (res) => {
        this.isSending.set(false);
        const aiMsg: CaseMessage = { id: res.id, role: 'assistant', content: res.content, created_at: res.created_at };
        this.messages.update(m => [...m, aiMsg]);
        setTimeout(() => this.scrollToBottom(), 50);
      },
      error: (err) => {
        this.isSending.set(false);
        this.chatError.set(err.error?.detail || 'Erreur lors de l\'analyse.');
        this.messages.update(m => m.filter(x => x.id !== userMsg.id));
      },
    });
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  scrollToBottom() {
    try { this.chatEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  nowLocalString(): string {
    const d = new Date();
    return d.toISOString().slice(0, 16);
  }

  openNoteForm(note?: CaseNote) {
    if (note) {
      this.editingNote.set(note);
      this.noteAuthor.set(note.author);
      this.noteType.set(note.note_type);
      this.noteContent.set(note.content);
      this.noteDatetime.set(new Date(note.declared_at).toISOString().slice(0, 16));
    } else {
      this.editingNote.set(null);
      this.noteAuthor.set('');
      this.noteType.set('Déclaration');
      this.noteContent.set('');
      this.noteDatetime.set(this.nowLocalString());
    }
    this.noteError.set('');
    this.showNoteForm.set(true);
  }

  closeNoteForm() {
    this.showNoteForm.set(false);
    this.editingNote.set(null);
  }

  saveNote() {
    const author  = this.noteAuthor().trim();
    const content = this.noteContent().trim();
    if (!author)  { this.noteError.set('L\'auteur est obligatoire.'); return; }
    if (!content) { this.noteError.set('Le contenu est obligatoire.'); return; }

    this.isSavingNote.set(true);
    this.noteError.set('');

    const payload = {
      author,
      note_type: this.noteType(),
      content,
      declared_at: this.noteDatetime()
        ? new Date(this.noteDatetime()).toISOString()
        : undefined,
    };

    const editing = this.editingNote();
    const obs = editing
      ? this.svc.updateNote(this.caseId, editing.id, payload)
      : this.svc.addNote(this.caseId, payload);

    obs.subscribe({
      next: (saved) => {
        this.isSavingNote.set(false);
        this.closeNoteForm();
        if (editing) {
          this.notes.update(list => list.map(n => n.id === saved.id ? saved : n));
        } else {
          this.notes.update(list =>
            [...list, saved].sort((a, b) =>
              new Date(a.declared_at).getTime() - new Date(b.declared_at).getTime()
            )
          );
        }
      },
      error: (err) => {
        this.isSavingNote.set(false);
        this.noteError.set(err.error?.detail || 'Erreur lors de l\'enregistrement.');
      },
    });
  }

  deleteNote(noteId: string) {
    this.deletingNoteId.set(noteId);
    this.svc.deleteNote(this.caseId, noteId).subscribe({
      next: () => {
        this.deletingNoteId.set(null);
        this.notes.update(list => list.filter(n => n.id !== noteId));
      },
      error: () => this.deletingNoteId.set(null),
    });
  }

  noteTypeColor(type: string): string {
    return NOTE_TYPE_COLORS[type] || '#94a3b8';
  }

  formatDeclaredAt(d: string): string {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // ── PDF Viewer ────────────────────────────────────────────────────────────
  openViewer(doc: CaseDocumentOut) {
    this.viewerDoc.set(doc);
    this.viewerUrl.set(null);
    this.viewerLoading.set(true);
    this.svc.getDocumentBlob(this.caseId, doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.viewerUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        this.viewerLoading.set(false);
      },
      error: () => {
        this.viewerLoading.set(false);
      },
    });
  }

  closeViewer() {
    // Révoquer l'URL blob pour libérer la mémoire
    const url = this.viewerUrl();
    if (url) {
      try { URL.revokeObjectURL(url as string); } catch {}
    }
    this.viewerDoc.set(null);
    this.viewerUrl.set(null);
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  formatSize(bytes: number): string { return this.svc.formatFileSize(bytes); }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatTime(d: string): string {
    return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  goBack() { this.router.navigate(['/dashboard/cases']); }

  getDocTypeColor(type: string): string {
    const map: Record<string, string> = {
      'Procès-verbal (PV)': '#3b82f6',
      'Ordonnance de renvoi': '#8b5cf6',
      'Jugement': '#059669',
      'Arrêt': '#d97706',
      'Assignation': '#dc2626',
      'Conclusions': '#FF8A00',
      'Mémoire': '#7c3aed',
      'Rapport d\'expertise': '#b45309',
    };
    return map[type] || '#64748b';
  }

  parseContent(content: string): string {
    // Rendu basique markdown : gras, italique, listes
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gm, (m) => m.startsWith('<') ? m : m);
  }
}
